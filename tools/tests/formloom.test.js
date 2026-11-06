// Feature tests for Formloom. Each test drives the real UI in Chrome on fresh seed data.
const fs = require('fs');

const field = (id, type, label, extra) => Object.assign({ id, type, label }, extra);
const when = (fieldId, op, value) => ({ match: 'all', rules: [{ fieldId, op, value: value === undefined ? '' : String(value) }] });

function formFile(title, pages, responses) {
  return {
    format: 'formloom-form',
    version: 1,
    form: { id: 'fixture', title, pages: pages.map((fields, i) => ({ id: `pg${i}`, title: `Step ${i + 1}`, fields })) },
    responses: responses || [],
  };
}

async function importFile(page, payload) {
  await page.goto(`${page.url().split('#')[0]}#/forms`);
  await page.click('#import-form');
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  await page.setInputFiles('#import-file', { name: 'form.json', mimeType: 'application/json', buffer: Buffer.from(text) });
}

async function importAndOpen(page, payload) {
  await importFile(page, payload);
  await page.waitForSelector('.builder');
}

/** Opens the current form through its real share link, in this tab. */
async function openAsRespondent(page) {
  await page.click('#share');
  await page.click('#share-open');
  await page.waitForSelector('.f-sheet');
}

const shownQuestions = (page) => page.$$eval('.f-body .f-field, .f-body .f-section', (els) => els
  .filter((el) => !el.hidden)
  .map((el) => (el.querySelector('.f-label-text, h3') || el).textContent));

const shownErrors = (page) => page.$$eval('.f-body .f-error', (els) => els.filter((el) => !el.hidden).map((el) => el.textContent));

const inputFor = (page, label) => page.locator('.f-field', { has: page.locator('.f-label-text', { hasText: new RegExp(`^${label}$`) }) }).locator('input, textarea, select').first();

const cardLabels = (page) => page.$$eval('.field-card', (cards) => cards.map((card) => (card.querySelector('.f-label-text, h3') || {}).textContent));

async function dragBetween(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 12);
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.waitForTimeout(60);
  await page.mouse.up();
}

async function center(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, top: box.y, bottom: box.y + box.height };
}

async function downloadText(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const file = await download.path();
  return { name: download.suggestedFilename(), text: fs.readFileSync(file, 'utf8') };
}

const CHAIN_FORM = formFile('Chain', [[
  field('a', 'single_choice', 'A', { options: ['Yes', 'No'] }),
  field('b', 'short_text', 'B', { logic: when('a', 'equals', 'Yes') }),
  field('c', 'short_text', 'C', { logic: when('b', 'answered') }),
  field('d', 'number', 'D'),
  field('e', 'short_text', 'E', { logic: when('d', 'gte', 10) }),
  field('f', 'short_text', 'F', { logic: { match: 'any', rules: [{ fieldId: 'a', op: 'equals', value: 'No' }, { fieldId: 'd', op: 'lt', value: '0' }] } }),
  field('g', 'short_text', 'G', { logic: when('c', 'not_answered') }),
]]);

const TABLE_RESPONSES = (() => {
  const now = Date.now();
  const day = 86400000;
  return [
    { id: 'r1', submittedAt: now - 5 * day, answers: { who: 'Bea', score: 2, plan: 'Basic', tags: ['x'], qty: 100 } },
    { id: 'r2', submittedAt: now - 4 * day, answers: { who: 'alan', score: 5, plan: 'Pro', tags: ['x', 'y'], qty: 7 } },
    { id: 'r3', submittedAt: now - 3 * day, answers: { who: 'Cy', score: 4, plan: 'Pro', tags: ['y'] } },
    { id: 'r4', submittedAt: now - 2 * day, answers: { who: 'Dee', score: 5, plan: 'Basic', qty: 0 } },
    { id: 'r5', submittedAt: now - 1 * day, answers: { who: 'Eve', score: 1, plan: 'Team', tags: ['x', 'y'], qty: 20 } },
  ];
})();

const TABLE_FORM = formFile('Table fixture', [[
  field('who', 'short_text', 'Who'),
  field('score', 'rating', 'Score'),
  field('plan', 'dropdown', 'Plan', { options: ['Basic', 'Pro', 'Team'] }),
  field('tags', 'multi_choice', 'Tags', { options: ['x', 'y'] }),
  field('qty', 'number', 'Qty'),
]], TABLE_RESPONSES);

const columnValues = (page, index) => page.$$eval(`.responses-table tbody tr`, (rows, i) => rows.map((row) => row.children[i].textContent), index);

module.exports = {
  'opens on the builder with seed data, and a new field survives a reload': async ({ page, assert, reload }) => {
    await page.waitForSelector('.builder');
    assert.ok((await cardLabels(page)).includes('How would you rate the repair overall?'));
    assert.strictEqual(await page.textContent('.nav-badge'), '42');
    assert.strictEqual(await page.locator('.palette-item').count(), 13);
    await page.click('.field-card[data-type="date"]');
    await page.click('.palette-item[data-type="email"]');
    await page.fill('#prop-label', 'Work email for the invoice');
    await reload();
    const labels = await cardLabels(page);
    const dateIndex = labels.indexOf('When did you pick up your bike?');
    assert.strictEqual(labels[dateIndex + 1], 'Work email for the invoice');
  },

  'pointer drag adds a field at the drop point, reorders, and Escape cancels': async ({ page, assert }) => {
    await page.waitForSelector('.field-card');
    const firstCard = page.locator('.field-card').first();
    const from = await center(page.locator('.palette-item[data-type="phone"]'));
    const box = await center(firstCard);
    await dragBetween(page, from, { x: box.x, y: box.top + 4 });
    let labels = await cardLabels(page);
    assert.strictEqual(labels[0], 'Phone number');
    assert.strictEqual(labels[1], 'What did we work on?');

    const second = await center(page.locator('.field-card').nth(1).locator('.card-handle'));
    const thirdCard = await center(page.locator('.field-card').nth(2));
    await dragBetween(page, second, { x: thirdCard.x, y: thirdCard.bottom - 4 });
    labels = await cardLabels(page);
    assert.deepStrictEqual(labels.slice(0, 3), ['Phone number', 'How would you rate the repair overall?', 'What did we work on?']);

    const handle = await center(page.locator('.field-card').first().locator('.card-handle'));
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 10, handle.y + 200, { steps: 8 });
    assert.strictEqual(await page.locator('.drag-ghost').count(), 1);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.strictEqual(await page.locator('.drag-ghost').count(), 0);
    assert.strictEqual((await cardLabels(page))[0], 'Phone number');
  },

  'keyboard and buttons reorder fields, including across pages': async ({ page, assert }) => {
    await page.waitForSelector('.field-card');
    await page.locator('.card-handle').first().focus();
    await page.keyboard.press('ArrowDown');
    let labels = await cardLabels(page);
    assert.strictEqual(labels[0], 'How would you rate the repair overall?');
    assert.strictEqual(labels[1], 'What did we work on?');
    const focusedLabel = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
    assert.ok(focusedLabel.startsWith('Move What did we work on?'), 'focus stays on the moved field');

    const lastOnFirstPage = page.locator('.page-fields').first().locator('.field-card').last();
    const name = await lastOnFirstPage.locator('.f-label-text').textContent();
    await lastOnFirstPage.click();
    await lastOnFirstPage.getByRole('button', { name: 'Move down' }).click();
    const firstOfNextPage = await page.locator('.page-fields').nth(1).locator('.field-card .f-label-text').first().textContent();
    assert.strictEqual(firstOfNextPage, name);
  },

  'undo and redo step through builder edits, and typing merges into one step': async ({ page, assert }) => {
    await page.waitForSelector('.field-card');
    const before = await cardLabels(page);
    assert.strictEqual(await page.isDisabled('#undo'), true);
    await page.click('.palette-item[data-type="scale"]');
    await page.click('#prop-label');
    await page.keyboard.press('End');
    await page.locator('#prop-label').pressSequentially(' Typed fast', { delay: 5 });
    assert.ok((await cardLabels(page)).some((label) => label.endsWith('Typed fast')));
    await page.click('#undo');
    assert.ok((await cardLabels(page)).includes('How likely are you to agree?'), 'typing undone as one step');
    await page.click('#undo');
    assert.deepStrictEqual(await cardLabels(page), before);
    await page.click('#redo');
    assert.strictEqual((await cardLabels(page)).length, before.length + 1);
    await page.keyboard.press('Control+z');
    assert.deepStrictEqual(await cardLabels(page), before);
    await page.keyboard.press('Control+y');
    assert.strictEqual((await cardLabels(page)).length, before.length + 1);

    const card = page.locator('.field-card[data-type="dropdown"]').first();
    await card.click();
    await card.getByRole('button', { name: 'Delete field' }).click();
    assert.ok((await page.textContent('.toast-text')).startsWith('Deleted "What did we work on?"'));
    await page.click('.toast-action');
    assert.ok((await cardLabels(page)).includes('What did we work on?'), 'toast undo restores the field');
  },

  'validation rules give exact messages and block submission': async ({ page, assert }) => {
    await importAndOpen(page, formFile('Rules', [[
      field('req', 'short_text', 'Req', { required: true }),
      field('len', 'short_text', 'Len', { validation: { min: 3, max: 5 } }),
      field('num', 'number', 'Num', { validation: { min: 5, max: 10, integer: true } }),
      field('mail', 'email', 'Mail'),
      field('tel', 'phone', 'Tel'),
      field('code', 'short_text', 'Code', { validation: { pattern: '[A-Z]{2}-\\d{4}' } }),
      field('msg', 'short_text', 'Msg', { required: true, validation: { min: 2, message: 'Two letters, please.' } }),
      field('when', 'date', 'When', { validation: { min: '2030-01-10', max: '2030-01-20' } }),
      field('many', 'multi_choice', 'Many', { required: true, options: ['a', 'b', 'c'], validation: { min: 2, max: 2 } }),
    ]]));
    await openAsRespondent(page);
    await page.click('.f-next');
    assert.deepStrictEqual(await shownErrors(page), ['This question is required.', 'Two letters, please.', 'This question is required.']);
    assert.strictEqual(await page.textContent('.f-form-error'), '3 questions need attention.');
    assert.strictEqual(await page.evaluate(() => document.activeElement.getAttribute('aria-invalid')), 'true');

    const attempt = async (label, value) => {
      await inputFor(page, label).fill(value);
      await page.click('.f-next');
      const box = page.locator('.f-field', { has: page.locator('.f-label-text', { hasText: new RegExp(`^${label}$`) }) }).locator('.f-error');
      return (await box.isVisible()) ? box.textContent() : null;
    };
    assert.strictEqual(await attempt('Req', 'ok'), null);
    assert.strictEqual(await attempt('Len', 'ab'), 'Enter at least 3 characters.');
    assert.strictEqual(await attempt('Len', 'abcdef'), 'Enter no more than 5 characters.');
    assert.strictEqual(await attempt('Len', 'abcd'), null);
    assert.strictEqual(await attempt('Num', 'abc'), 'Enter a number.');
    assert.strictEqual(await attempt('Num', '4'), 'Enter a number of at least 5.');
    assert.strictEqual(await attempt('Num', '11'), 'Enter a number no greater than 10.');
    assert.strictEqual(await attempt('Num', '7.5'), 'Enter a whole number.');
    assert.strictEqual(await attempt('Num', '10'), null);
    assert.strictEqual(await attempt('Mail', 'nope@'), 'Enter a valid email address, like name@example.com.');
    assert.strictEqual(await attempt('Mail', 'a@b.co'), null);
    assert.strictEqual(await attempt('Tel', '12345'), 'Enter a valid phone number, with 7 to 15 digits.');
    assert.strictEqual(await attempt('Tel', '+1 (555) 010-2030'), null);
    assert.strictEqual(await attempt('Code', 'ab-1234'), "This answer doesn't match the expected format.");
    assert.strictEqual(await attempt('Code', 'xAB-1234'), "This answer doesn't match the expected format.");
    assert.strictEqual(await attempt('Code', 'AB-1234'), null);
    assert.strictEqual(await attempt('Msg', 'x'), 'Two letters, please.');
    assert.strictEqual(await attempt('Msg', 'xy'), null);
    assert.strictEqual(await attempt('When', '2030-01-09'), 'Choose a date on or after Jan 10, 2030.');
    assert.strictEqual(await attempt('When', '2030-01-21'), 'Choose a date on or before Jan 20, 2030.');
    assert.strictEqual(await attempt('When', '2030-01-15'), null);
    await page.getByLabel('a', { exact: true }).check();
    await page.click('.f-next');
    assert.deepStrictEqual(await shownErrors(page), ['Select at least 2 options.']);
    await page.getByLabel('b', { exact: true }).check();
    await page.getByLabel('c', { exact: true }).check();
    await page.click('.f-next');
    assert.deepStrictEqual(await shownErrors(page), ['Select no more than 2 options.']);
    await page.getByLabel('c', { exact: true }).uncheck();
    await page.click('.f-next');
    await page.waitForSelector('.f-confirm');
    assert.strictEqual(await page.textContent('.f-confirm h1'), 'Thank you');
  },

  'the builder refuses unsafe patterns and shows a live pattern check': async ({ page, assert }) => {
    await page.click('.palette-item[data-type="short_text"]');
    await page.fill('#val-pattern', '(a+)+$');
    assert.match(await page.locator('.prop-error:visible').first().textContent(), /can freeze the form/);
    await page.fill('#val-pattern', '[unclosed');
    assert.strictEqual(await page.locator('.prop-error:visible').first().textContent(), 'This is not a valid regular expression.');
    await page.fill('#val-pattern', '\\d{5}');
    await page.locator('#val-pattern').blur();
    await page.fill('#pattern-try', '1234');
    assert.strictEqual(await page.locator('#pattern-try ~ .prop-hint, .prop + .prop-hint[aria-live]').first().textContent(), 'Does not match the pattern.');
    await page.fill('#pattern-try', '12345');
    assert.strictEqual(await page.locator('.prop-hint[aria-live]').textContent(), 'Matches the pattern.');

    // Leaving a field by clicking the next one must land in it. A redraw on blur would swallow the click.
    await page.click('#val-pattern');
    await page.keyboard.type('x');
    await page.click('#val-message');
    await page.keyboard.type('Five digits');
    assert.strictEqual(await page.inputValue('#val-message'), 'Five digits');

    await page.click('.palette-item[data-type="dropdown"]');
    await page.click('[data-fk="opt-0"]');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('First');
    await page.click('[data-fk="opt-1"]');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Second');
    await page.keyboard.press('Tab');
    assert.strictEqual(await page.inputValue('[data-fk="opt-0"]'), 'First');
    assert.strictEqual(await page.inputValue('[data-fk="opt-1"]'), 'Second');
    await page.click('[data-fk="opt-1"]');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('First');
    await page.keyboard.press('Tab');
    assert.strictEqual(await page.textContent('.option-row .prop-error:not([hidden])'), 'Each option must be different.');
    assert.strictEqual(await page.inputValue('[data-fk="opt-1"]'), 'Second');
  },

  'conditional chains resolve to exact visible sets, and hiding collapses downstream': async ({ page, assert }) => {
    await importAndOpen(page, CHAIN_FORM);
    await openAsRespondent(page);
    assert.deepStrictEqual(await shownQuestions(page), ['A', 'D', 'G']);

    await page.getByLabel('Yes', { exact: true }).check();
    assert.deepStrictEqual(await shownQuestions(page), ['A', 'B', 'D', 'G']);

    await inputFor(page, 'B').fill('hello');
    assert.deepStrictEqual(await shownQuestions(page), ['A', 'B', 'C', 'D', 'G']);

    await inputFor(page, 'C').fill('deep answer');
    assert.deepStrictEqual(await shownQuestions(page), ['A', 'B', 'C', 'D']);

    await inputFor(page, 'D').fill('9');
    assert.deepStrictEqual(await shownQuestions(page), ['A', 'B', 'C', 'D']);
    await inputFor(page, 'D').fill('10');
    assert.deepStrictEqual(await shownQuestions(page), ['A', 'B', 'C', 'D', 'E']);
    await inputFor(page, 'D').fill('-1');
    assert.deepStrictEqual(await shownQuestions(page), ['A', 'B', 'C', 'D', 'F']);

    // A now "No": B hides, so C hides too despite its stale answer, and G (C not answered) comes back.
    await inputFor(page, 'D').fill('');
    await page.getByLabel('No', { exact: true }).check();
    assert.deepStrictEqual(await shownQuestions(page), ['A', 'D', 'F', 'G']);

    await page.click('.f-next');
    await page.waitForSelector('.f-confirm');
    const answered = await page.$$eval('.f-answers dt', (els) => els.map((el) => el.textContent));
    assert.deepStrictEqual(answered, ['A'], 'stale answers on hidden questions are not stored');

    assert.strictEqual(await page.textContent('.f-answers dd'), 'No');
  },

  'logic built in the panel works, and loops cannot be chosen': async ({ page, assert }) => {
    await importAndOpen(page, formFile('Logic UI', [[
      field('one', 'rating', 'One'),
      field('two', 'short_text', 'Two'),
      field('three', 'short_text', 'Three', { logic: when('two', 'answered') }),
    ]]));
    await page.locator('.field-card', { hasText: 'Two' }).first().click();
    await page.click('[data-fk="rule-add"]');
    const row = page.locator('[data-rule="rule-0"]');
    const sourceSelect = row.locator('select[aria-label="Question"]');
    const options = await sourceSelect.locator('option').evaluateAll((els) => els.map((el) => ({ text: el.textContent, disabled: el.disabled })));
    assert.deepStrictEqual(options, [
      { text: 'Choose a question...', disabled: false },
      { text: 'One', disabled: false },
      { text: 'Three (would create a loop)', disabled: true },
    ]);
    await sourceSelect.selectOption({ label: 'One' });
    await row.locator('select[aria-label="Condition"]').selectOption({ label: 'is at most' });
    await row.locator('select[aria-label="Value"]').selectOption('2');
    assert.strictEqual(await page.locator('.field-card', { hasText: 'Two' }).first().locator('.note').textContent(), 'Shown when "One" is at most 2');

    await openAsRespondent(page);
    assert.deepStrictEqual(await shownQuestions(page), ['One']);
    await page.locator('.f-star input').nth(1).check({ force: true });
    assert.deepStrictEqual(await shownQuestions(page), ['One', 'Two']);
    await page.locator('.f-star input').nth(2).check({ force: true });
    assert.deepStrictEqual(await shownQuestions(page), ['One']);
  },

  'an imported cycle cannot hang the form: its members stay hidden and are flagged': async ({ page, assert }) => {
    await importAndOpen(page, formFile('Cycle', [[
      field('start', 'short_text', 'Start'),
      field('x', 'short_text', 'X', { logic: when('y', 'answered') }),
      field('y', 'short_text', 'Y', { logic: when('z', 'not_answered') }),
      field('z', 'short_text', 'Z', { logic: when('x', 'not_answered') }),
      field('self', 'short_text', 'Self', { logic: when('self', 'not_answered') }),
      field('after', 'short_text', 'After', { logic: when('x', 'not_answered') }),
    ]]));
    assert.strictEqual(await page.locator('.note.is-warn').count(), 4);
    assert.match(await page.locator('.note.is-warn').first().textContent(), /Circular logic/);
    await openAsRespondent(page);
    // After reads X, which is hidden and so unanswered, so After shows. X, Y, Z and Self never do.
    assert.deepStrictEqual(await shownQuestions(page), ['Start', 'After']);
    await inputFor(page, 'Start').fill('go');
    assert.deepStrictEqual(await shownQuestions(page), ['Start', 'After']);
    await page.click('.f-next');
    await page.waitForSelector('.f-confirm');
  },

  'multi-page forms skip pages with nothing to ask, and validate before moving on': async ({ page, assert }) => {
    await importAndOpen(page, formFile('Pages', [
      [field('go', 'single_choice', 'Go deeper?', { required: true, options: ['Yes', 'No'] })],
      [field('intro', 'section', 'Only a heading'), field('why', 'short_text', 'Why?', { required: true, logic: when('go', 'equals', 'Yes') })],
      [field('last', 'short_text', 'Last question')],
    ]));
    await openAsRespondent(page);
    assert.strictEqual(await page.textContent('.f-progress-text'), 'Page 1 of 2');
    assert.strictEqual((await page.textContent('.f-next')).trim(), 'Next');
    await page.click('.f-next');
    assert.deepStrictEqual(await shownErrors(page), ['This question is required.']);
    assert.strictEqual(await page.textContent('.f-progress-text'), 'Page 1 of 2');

    await page.getByLabel('Yes', { exact: true }).check();
    assert.strictEqual(await page.textContent('.f-progress-text'), 'Page 1 of 3');
    await page.click('.f-next');
    assert.strictEqual(await page.textContent('.f-page-title'), 'Step 2');
    await page.click('.f-next');
    assert.deepStrictEqual(await shownErrors(page), ['This question is required.']);
    await inputFor(page, 'Why\\?').fill('Curious');
    await page.click('.f-next');
    assert.strictEqual(await page.textContent('.f-page-title'), 'Step 3');
    assert.strictEqual((await page.textContent('.f-next')).trim(), 'Submit');

    await page.click('.f-back');
    await page.click('.f-back');
    assert.strictEqual(await page.isChecked('input[value="Yes"]'), true, 'answers survive going back');
    await page.getByLabel('No', { exact: true }).check();
    await page.click('.f-next');
    assert.strictEqual(await page.textContent('.f-page-title'), 'Step 3', 'the emptied page is skipped');
    await page.click('.f-next');
    await page.waitForSelector('.f-confirm');
    await page.click('.f-confirm .f-btn');
    assert.strictEqual(await page.textContent('.f-page-title'), 'Step 1', 'submit another starts over');
    assert.strictEqual(await page.isChecked('input[value="No"]'), false);
  },

  'hash link round-trips the form exactly and opens straight in respondent mode': async ({ page, context, assert }) => {
    const tricky = 'Café "quoted" & <img src=x onerror=window.pwned=1> 東京 🎉, commas';
    await importAndOpen(page, formFile(`Round trip ${tricky}`, [
      [
        field('t', 'short_text', tricky, { help: 'Line one\nLine two', required: true, validation: { min: 2, max: 9, pattern: 'a+b*', message: 'No & "way"' } }),
        field('r', 'rating', 'Stars', { ratingMax: 7 }),
        field('s', 'scale', 'Scale', { scaleMin: -2, scaleMax: 3, minLabel: 'Low', maxLabel: 'High' }),
        field('c', 'dropdown', 'Pick', { options: ['One, two', 'Three "four"'], placeholder: 'Choose' }),
        field('f', 'file', 'Upload', { accept: 'pdf', maxSizeKB: 12 }),
      ],
      [field('l', 'long_text', 'Follow', { logic: { match: 'any', rules: [{ fieldId: 'r', op: 'gte', value: '5' }, { fieldId: 'c', op: 'equals', value: 'One, two' }] } })],
    ]));
    await page.click('#share');
    const link = await page.inputValue('#share-link');
    const { text } = await downloadText(page, () => page.click('#share-download'));
    const exported = JSON.parse(text).form;
    const code = link.split('#/f/')[1];
    assert.ok(/^[A-Za-z0-9_-]+$/.test(code), 'the code is URL-safe');
    assert.ok(code.length < JSON.stringify(exported).length, `link (${code.length}) should be shorter than the raw form (${JSON.stringify(exported).length})`);

    const stranger = await context.browser().newContext({ viewport: { width: 1280, height: 720 } });
    const other = await stranger.newPage();
    await other.goto(link);
    await other.waitForSelector('.f-sheet');
    assert.strictEqual(await other.locator('.topbar').count(), 0, 'no builder chrome for respondents');
    assert.strictEqual(await other.locator('.palette').count(), 0);
    assert.strictEqual(await other.textContent('.f-header h1'), `Round trip ${tricky}`);
    assert.strictEqual(await other.locator('img[src="x"]').count(), 0, 'user text is never parsed as HTML');
    assert.strictEqual(await other.evaluate(() => window.pwned), undefined);
    assert.strictEqual(await other.locator('.f-star').count(), 7);
    assert.deepStrictEqual(await other.$$eval('.f-scale-step span', (els) => els.map((el) => el.textContent)), ['-2', '-1', '0', '1', '2', '3']);
    const decoded = await other.evaluate((c) => FL.codec.decodeForm(c), code);
    assert.deepStrictEqual(decoded.pages, exported.pages);
    assert.deepStrictEqual(decoded.theme, exported.theme);
    assert.deepStrictEqual(decoded.settings, exported.settings);
    assert.strictEqual(decoded.id, exported.id);

    await other.goto(link.slice(0, -12));
    await other.reload();
    await other.waitForSelector('.link-error');
    assert.strictEqual(await other.textContent('.link-error h1'), 'This form link is incomplete');
    const flipped = link.slice(0, -3) + (link.slice(-3) === 'AAA' ? 'BBB' : 'AAA');
    await other.goto(flipped);
    await other.reload();
    await other.waitForSelector('.link-error');
    await stranger.close();
  },

  'a respondent on another device can send answers back with a reply link': async ({ page, context, assert }) => {
    await importAndOpen(page, formFile('Reply form', [[field('name', 'short_text', 'Your name', { required: true })]]));
    await page.click('#share');
    const link = await page.inputValue('#share-link');
    await page.keyboard.press('Escape');

    const stranger = await context.browser().newContext({ viewport: { width: 1280, height: 720 } });
    const other = await stranger.newPage();
    await other.goto(link);
    await inputFor(other, 'Your name').fill('Noor from afar');
    await other.click('.f-next');
    await other.waitForSelector('.f-reply');
    const reply = await other.inputValue('#reply-link');
    await stranger.close();

    await page.goto(reply);
    await page.reload();
    await page.waitForSelector('.responses-table');
    assert.deepStrictEqual(await columnValues(page, 1), ['Noor from afar']);
    await page.goto(reply);
    await page.reload();
    await page.waitForSelector('.responses-table');
    assert.strictEqual(await page.locator('.responses-table tbody tr').count(), 1, 'opening the link twice adds it once');
  },

  'CSV export escapes commas, quotes and newlines exactly': async ({ page, assert, reload }) => {
    await importAndOpen(page, formFile('CSV: test, "one"', [[
      field('note', 'long_text', 'Note, with comma'),
      field('say', 'short_text', 'Say "hi"'),
      field('picks', 'multi_choice', 'Picks', { options: ['A', 'B, or C'] }),
      field('n', 'number', 'Count'),
      field('tel', 'phone', 'Phone'),
      field('blank', 'short_text', 'Blank'),
    ]]));
    await openAsRespondent(page);
    await inputFor(page, 'Note, with comma').fill('He said "hi", then left\nSecond line');
    await inputFor(page, 'Say "hi"').fill('=SUM(A1:A9)');
    await page.getByLabel('A', { exact: true }).check();
    await page.getByLabel('B, or C', { exact: true }).check();
    await inputFor(page, 'Count').fill('-42.5');
    await inputFor(page, 'Phone').fill('+1 555 010 2030');
    await page.click('.f-next');
    await page.waitForSelector('.f-confirm');
    await page.goBack();
    await page.waitForSelector('.builder, .modal');
    await page.locator('.nav-tab', { hasText: 'Responses' }).click();
    await page.waitForSelector('.responses-table');

    const { name, text } = await downloadText(page, () => page.getByRole('button', { name: 'Export CSV' }).click());
    assert.match(name, /^csv-test-one-responses-\d{4}-\d{2}-\d{2}\.csv$/);
    const stamped = text.replace(/\r\n\d{4}-\d{2}-\d{2} \d{2}:\d{2},/, '\r\n<STAMP>,');
    assert.strictEqual(stamped, [
      '﻿Submitted,"Note, with comma","Say ""hi""",Picks,Count,Phone,Blank',
      '<STAMP>,"He said ""hi"", then left\nSecond line",\'=SUM(A1:A9),"A; B, or C",-42.5,+1 555 010 2030,',
      '',
    ].join('\r\n'));
    await reload();
    await page.waitForSelector('.responses-table');
    assert.strictEqual(await page.locator('.responses-table tbody tr').count(), 1, 'responses persist after reload');
  },

  'response table sorts, filters by question and date, and delete can be undone': async ({ page, assert, reload }) => {
    await importAndOpen(page, TABLE_FORM);
    await page.locator('.nav-tab', { hasText: 'Responses' }).click();
    await page.waitForSelector('.responses-table');
    const whoColumn = () => columnValues(page, 1);
    assert.deepStrictEqual(await whoColumn(), ['Eve', 'Dee', 'Cy', 'alan', 'Bea'], 'newest first by default');

    const sortBy = (label) => page.locator('.th-sort', { hasText: label }).click();
    await sortBy('Who');
    assert.deepStrictEqual(await whoColumn(), ['alan', 'Bea', 'Cy', 'Dee', 'Eve'], 'text sorts ignoring case');
    await sortBy('Who');
    assert.deepStrictEqual(await whoColumn(), ['Eve', 'Dee', 'Cy', 'Bea', 'alan']);
    assert.strictEqual(await page.locator('th[aria-sort="descending"]').textContent(), 'Who');
    await sortBy('Qty');
    assert.deepStrictEqual(await columnValues(page, 5), ['0', '7', '20', '100', ''], 'numbers sort numerically, blanks last');
    await sortBy('Qty');
    assert.deepStrictEqual(await columnValues(page, 5), ['100', '20', '7', '0', ''], 'blanks stay last when reversed');

    await page.fill('input[aria-label="Search answers"]', 'pro');
    assert.strictEqual(await page.textContent('.responses-count'), '2 of 5 responses');
    await page.fill('input[aria-label="Search answers"]', '');
    const filter = page.locator('.filter-rule');
    await filter.locator('select[aria-label="Question"]').selectOption({ label: 'Score' });
    await filter.locator('select[aria-label="Condition"]').selectOption({ label: 'is at least' });
    await filter.locator('select[aria-label="Value"]').selectOption('4');
    assert.strictEqual(await page.textContent('.responses-count'), '3 of 5 responses');
    await filter.locator('select[aria-label="Question"]').selectOption({ label: 'Tags' });
    await filter.locator('select[aria-label="Value"]').selectOption('y');
    assert.strictEqual(await page.textContent('.responses-count'), '3 of 5 responses');
    await filter.locator('select[aria-label="Condition"]').selectOption({ label: 'is not answered' });
    assert.strictEqual(await page.textContent('.responses-count'), '1 of 5 responses');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    assert.strictEqual(await page.textContent('.responses-count'), '5 responses');

    const yesterday = await page.evaluate(() => FL.util.isoDate(FL.util.addDays(new Date(), -2)));
    await page.locator('.filter-date input').first().fill(yesterday);
    assert.strictEqual(await page.textContent('.responses-count'), '2 of 5 responses');
    await page.getByRole('button', { name: 'Clear filters' }).click();

    await page.locator('tr', { hasText: 'alan' }).locator('.cell-date button').click();
    assert.match(await page.textContent('.modal .detail-list'), /x; y/);
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.modal').count(), 0, 'Escape closes the modal');

    await page.locator('tr', { hasText: 'alan' }).locator('.cell-actions button').click();
    assert.strictEqual(await page.textContent('.responses-count'), '4 responses');
    assert.strictEqual(await page.textContent('.nav-badge'), '4');
    await page.click('.toast-action');
    assert.strictEqual(await page.textContent('.responses-count'), '5 responses');
    await reload();
    await page.waitForSelector('.responses-table');
    assert.strictEqual(await page.textContent('.responses-count'), '5 responses');
  },

  'summary charts report exact per-question numbers and follow the filters': async ({ page, assert }) => {
    await importAndOpen(page, TABLE_FORM);
    await page.locator('.nav-tab', { hasText: 'Responses' }).click();
    await page.locator('.segment', { hasText: 'Summary' }).click();
    const card = (label) => page.locator('.summary-card', { hasText: label });
    const stats = (label) => card(label).locator('.stat').evaluateAll((els) => els.map((el) => `${el.querySelector('.stat-label').textContent}=${el.querySelector('.stat-value').textContent}`));
    assert.deepStrictEqual(await stats('2. Score'), ['Average=3.4', 'Median=4', 'Lowest=1', 'Highest=5']);
    assert.deepStrictEqual(await card('2. Score').locator('.vbars-counts span').allTextContents(), ['1', '1', '0', '1', '2']);
    assert.deepStrictEqual(await card('3. Plan').locator('.hbar-value').allTextContents(), ['2 40%', '2 40%', '1 20%']);
    assert.strictEqual(await card('4. Tags').locator('.summary-count').textContent(), '4 of 5 responses');
    assert.deepStrictEqual(await card('4. Tags').locator('.hbar-value').allTextContents(), ['3 75%', '3 75%']);
    assert.deepStrictEqual(await stats('5. Qty'), ['Average=31.75', 'Median=13.5', 'Lowest=0', 'Highest=100']);

    const barWidths = await card('3. Plan').locator('rect.chart-fill').evaluateAll((els) => els.map((el) => el.getAttribute('width')));
    assert.deepStrictEqual(barWidths, ['100', '100', '50']);
    assert.ok(await page.locator('.timeline-plot rect').count() === 30);

    await page.fill('input[aria-label="Search answers"]', 'Team');
    assert.deepStrictEqual(await stats('2. Score'), ['Average=1', 'Median=1', 'Lowest=1', 'Highest=1']);
  },

  'JSON export and import round-trip a form with responses, and bad files show errors': async ({ page, assert }) => {
    await page.goto(`${page.url().split('#')[0]}#/build/form_fair`);
    await page.waitForSelector('.builder');
    await page.click('#share');
    await page.check('#share-include');
    const { name, text } = await downloadText(page, () => page.click('#share-download'));
    assert.match(name, /\.formloom\.json$/);
    const parsed = JSON.parse(text);
    assert.strictEqual(parsed.format, 'formloom-form');
    assert.strictEqual(parsed.responses.length, 18);
    await page.keyboard.press('Escape');

    await importFile(page, text);
    await page.waitForSelector('.builder');
    assert.strictEqual(await page.textContent('.nav-badge'), '18');
    const newLabels = await cardLabels(page);
    assert.deepStrictEqual(newLabels, parsed.form.pages.flatMap((p) => p.fields.map((f) => f.label)));
    assert.match(await page.textContent('.toast-text'), /Imported .* with 18 responses/);
    await page.locator('.nav-tab', { hasText: 'Responses' }).click();
    await page.waitForSelector('.responses-table');
    const firstName = await page.locator('.responses-table tbody tr').first().locator('td').first().textContent();
    assert.ok(firstName.length > 2, 'answers followed the new field ids');

    await page.goto(`${page.url().split('#')[0]}#/forms`);
    const count = await page.locator('.form-row').count();
    assert.strictEqual(count, 4);
    const attempts = [
      ['this is not json', 'This file is not valid JSON.'],
      ['{"title":"No pages"}', 'This file is not a Formloom form: it has no "pages" list.'],
      ['{"pages":[{"fields":[{"type":"hologram"}]}]}', 'Page 1, field 1 has an unknown type: "hologram".'],
    ];
    await page.click('#import-form');
    for (const [content, message] of attempts) {
      await page.setInputFiles('#import-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(content) });
      await page.waitForSelector('.import-errors li');
      assert.strictEqual(await page.textContent('.import-errors li'), message);
    }
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.form-row').count(), 4, 'bad files add nothing');
  },

  'all five templates create working forms': async ({ page, assert }) => {
    await page.goto(`${page.url().split('#')[0]}#/forms`);
    const keys = ['customer-feedback', 'event-registration', 'job-application', 'support-request', 'volunteer-signup'];
    for (const key of keys) {
      await page.goto(`${page.url().split('#')[0]}#/forms`);
      await page.click('#new-form');
      await page.click(`.template-card[data-template="${key}"]`);
      await page.waitForSelector('.field-card');
      assert.ok(await page.locator('.field-card').count() >= 4, `${key} has fields`);
      await page.locator('.nav-tab', { hasText: 'Preview' }).click();
      await page.waitForSelector('.f-sheet');
      assert.strictEqual(await page.locator('.preview-banner').count(), 1);
    }
    await page.goto(`${page.url().split('#')[0]}#/forms`);
    assert.strictEqual(await page.locator('.form-row').count(), 8);
    await page.click('#new-form');
    await page.click('.template-card[data-template="blank"]');
    await page.waitForSelector('.page-empty');
    assert.strictEqual(await page.textContent('.page-empty'), 'Drag a field here, or choose one from the palette.');
  },

  'support template routes billing to a validated invoice question in preview, which stores nothing': async ({ page, assert }) => {
    await page.goto(`${page.url().split('#')[0]}#/forms`);
    await page.click('#new-form');
    await page.click('.template-card[data-template="support-request"]');
    await page.locator('.nav-tab', { hasText: 'Preview' }).click();
    await page.waitForSelector('.f-sheet');
    assert.ok(!(await shownQuestions(page)).includes('Invoice number'));
    await inputFor(page, 'What is this about\\?').selectOption('Billing');
    assert.ok((await shownQuestions(page)).includes('Invoice number'));
    await inputFor(page, 'Your email').fill('rider@example.com');
    await inputFor(page, 'Invoice number').fill('12');
    await inputFor(page, 'How can we help\\?').fill('Charged twice in March.');
    await page.click('.f-next');
    assert.deepStrictEqual(await shownErrors(page), ['Invoice numbers look like AB-1234.']);
    await inputFor(page, 'Invoice number').fill('AB-1234');
    await page.click('.f-next');
    await page.waitForSelector('.f-confirm');
    assert.strictEqual(await page.textContent('.f-confirm h1'), 'Request received');
    assert.strictEqual(await page.textContent('.f-note'), 'This was a preview, so nothing was recorded.');
    assert.strictEqual(await page.textContent('.nav-badge'), '0');
  },

  'file capture records metadata only and says so': async ({ page, assert }) => {
    await importAndOpen(page, formFile('Files', [[field('doc', 'file', 'Resume', { accept: 'pdf', maxSizeKB: 1 })]]));
    assert.match(await page.textContent('.field-card'), /file itself is not uploaded or stored/);
    await openAsRespondent(page);
    assert.strictEqual(await page.textContent('.f-file-note'), "Only the file's name, size and type are recorded. The file itself is not uploaded or stored.");
    const set = (name, size, mimeType) => page.setInputFiles('.f-file', { name, mimeType, buffer: Buffer.alloc(size, 65) });
    await set('photo.png', 10, 'image/png');
    await page.click('.f-next');
    assert.deepStrictEqual(await shownErrors(page), ['Choose a file of type: pdf.']);
    await set('big.pdf', 2048, 'application/pdf');
    await page.click('.f-next');
    assert.deepStrictEqual(await shownErrors(page), ['Choose a file no larger than 1 KB.']);
    await set('cv.pdf', 512, 'application/pdf');
    assert.strictEqual(await page.textContent('.f-file-recorded'), 'Recorded: cv.pdf (512 B, application/pdf)');
    await page.click('.f-next');
    await page.waitForSelector('.f-confirm');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('formloom.v1')));
    const responses = Object.values(stored.responses).flat().filter((r) => JSON.stringify(r).includes('cv.pdf'));
    assert.strictEqual(responses.length, 1);
    assert.deepStrictEqual(Object.values(responses[0].answers)[0], { name: 'cv.pdf', size: 512, type: 'application/pdf' });
  },

  'forms can be searched, duplicated, deleted with undo, and reset restores the demo data': async ({ page, assert, reload }) => {
    await page.goto(`${page.url().split('#')[0]}#/forms`);
    await page.waitForSelector('.form-row');
    assert.strictEqual(await page.locator('.form-row').count(), 3);
    await page.fill('input[aria-label="Search forms"]', 'makers');
    assert.strictEqual(await page.locator('.form-row').count(), 1);
    await page.fill('input[aria-label="Search forms"]', 'zzz');
    assert.strictEqual(await page.textContent('.empty-title'), 'No forms match your search');
    await page.fill('input[aria-label="Search forms"]', '');

    await page.getByRole('button', { name: 'Duplicate: Riverside Makers Fair: stall application', exact: true }).click();
    assert.strictEqual(await page.locator('.form-row').count(), 4);
    assert.strictEqual(await page.locator('.form-row', { hasText: '(copy)' }).locator('.form-row-count strong').textContent(), '0');

    await page.getByRole('button', { name: 'Delete: Riverside Makers Fair: stall application', exact: true }).click();
    assert.strictEqual(await page.locator('.form-row', { hasText: 'stall application' }).count(), 1);
    await page.click('.toast-action');
    assert.strictEqual(await page.locator('.form-row', { hasText: 'stall application' }).count(), 2);

    await page.locator('.form-row', { hasText: '(copy)' }).getByRole('button', { name: /^Delete/ }).click();
    await page.locator('.form-row', { hasText: 'Junior mechanic' }).getByRole('button', { name: /^Delete/ }).click();
    assert.strictEqual(await page.locator('.form-row').count(), 2);
    await reload();
    await page.waitForSelector('.form-row');
    assert.strictEqual(await page.locator('.form-row').count(), 2, 'deletion persists');

    await page.click('#reset-demo');
    assert.strictEqual(await page.locator('.form-row').count(), 3);
    assert.strictEqual(await page.locator('.form-row', { hasText: 'Junior mechanic' }).locator('.form-row-count strong').textContent(), '6');
    await page.click('.toast-action');
    assert.strictEqual(await page.locator('.form-row').count(), 2, 'reset can be undone');
    await page.click('#reset-demo');
    await reload();
    await page.waitForSelector('.form-row');
    assert.strictEqual(await page.locator('.form-row').count(), 3);
  },

  'theme settings reach the published form, and the light or dark choice is remembered': async ({ page, assert, reload }) => {
    await page.waitForSelector('.field-card');
    await page.locator('.panel-tab', { hasText: 'Form and theme' }).click();
    await page.click('.swatch[aria-label="Oxblood"]');
    await page.selectOption('#theme-header', 'band');
    await page.selectOption('#theme-font', 'serif');
    await page.selectOption('#theme-corners', 'square');
    await page.fill('#form-submit-label', 'Send it');
    await page.fill('#form-confirm-title', 'All done');
    await page.fill('#theme-accent', 'nonsense');
    await page.locator('#theme-accent').blur();
    assert.strictEqual(await page.locator('.prop-error', { hasText: 'six-digit hex' }).isVisible(), true);
    assert.strictEqual(await page.inputValue('#theme-accent'), '#8a1c2b');

    await openAsRespondent(page);
    const header = page.locator('.f-header');
    assert.strictEqual(await header.evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(138, 28, 43)');
    assert.match(await page.locator('.f-sheet').evaluate((el) => getComputedStyle(el).fontFamily), /Georgia/);
    assert.strictEqual(await page.locator('.f-sheet').evaluate((el) => getComputedStyle(el).borderTopLeftRadius), '2px');

    await page.goBack();
    await page.waitForSelector('.builder');
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), null);
    await page.click('.theme-toggle');
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(18, 21, 19)');
    await reload();
    await page.waitForSelector('.builder');
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    await page.click('.theme-toggle');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(244, 244, 240)');
  },

  'toggling the theme on a half-filled form keeps the answers': async ({ page, assert }) => {
    await page.click('#share');
    await page.click('#share-open');
    await page.waitForSelector('.f-sheet');
    await inputFor(page, 'What did we work on\\?').selectOption('Flat tire');
    await page.click('.f-foot .theme-toggle');
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    assert.strictEqual(await inputFor(page, 'What did we work on\\?').inputValue(), 'Flat tire');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.f-sheet')).backgroundColor), 'rgb(27, 31, 29)');
  },

  'corrupt or blocked storage does not break the app': async ({ page, assert, reload }) => {
    await page.evaluate(() => localStorage.setItem('formloom.v1', '{"forms":"not a list",'));
    await reload();
    await page.waitForSelector('.field-card');
    assert.strictEqual(await page.textContent('.nav-badge'), '42', 'corrupt JSON falls back to seed data');

    await page.evaluate(() => localStorage.setItem('formloom.v1', JSON.stringify({
      forms: [
        { id: 'good', title: 'Survivor', pages: [{ id: 'p', title: 'P', fields: [{ id: 'q', type: 'short_text', label: 'Kept' }, ] }] },
        { id: 'bad', title: 'Broken', pages: [{ fields: [{ type: 'nope' }] }] },
        42,
      ],
      responses: { good: [{ id: 'x', submittedAt: 'never', answers: {} }, { id: 'y', submittedAt: 5, answers: { q: 'ok', z: { evil: true } } }] },
    })));
    await page.goto(`${page.url().split('#')[0]}#/forms`);
    await reload();
    await page.waitForSelector('.form-row');
    assert.strictEqual(await page.locator('.form-row').count(), 1);
    assert.strictEqual(await page.locator('.form-row-title').textContent(), 'Survivor');
    assert.strictEqual(await page.locator('.form-row-count strong').textContent(), '1');

    await page.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new Error('blocked'); };
      Storage.prototype.getItem = () => { throw new Error('blocked'); };
    });
    await page.goto(`${page.url().split('#')[0]}#/`);
    await reload();
    await page.waitForSelector('.field-card');
    await page.click('.palette-item[data-type="number"]');
    assert.ok((await cardLabels(page)).includes('How many?'), 'editing still works in memory');
  },

  'the builder is usable at phone width with tap-to-add and move buttons': async ({ page, assert }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForSelector('.pane-switcher');
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.click('.pane-switch[data-pane="palette"]');
    await page.click('.palette-item[data-type="dropdown"]');
    assert.strictEqual(await page.locator('.pane-canvas').isVisible(), true, 'adding returns to the form');
    assert.strictEqual(await overflow(), 0);
    const card = page.locator('.field-card', { hasText: 'Select an option' }).last();
    await card.getByRole('button', { name: 'Edit properties' }).click();
    assert.strictEqual(await page.locator('.pane-panel').isVisible(), true);
    await page.fill('#prop-label', 'Favourite route');
    assert.strictEqual(await overflow(), 0);
    await page.click('.pane-switch[data-pane="canvas"]');
    assert.ok((await cardLabels(page)).includes('Favourite route'));
    for (const hash of ['#/responses/form_service', '#/preview/form_service', '#/forms']) {
      await page.goto(`${page.url().split('#')[0]}${hash}`);
      await page.waitForTimeout(100);
      assert.strictEqual(await overflow(), 0, `no sideways scroll on ${hash}`);
    }
  },
};
