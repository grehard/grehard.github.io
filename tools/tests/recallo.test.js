// Feature tests for Recallo. Everything drives the real UI. Time is controlled with
// page.clock, starting at a fixed 09:00 so learning steps and day boundaries are exact.
const START = new Date('2026-03-02T09:00:00');
const DAY = '24:00:00';

async function startClock(page) {
  await page.evaluate(() => localStorage.clear());
  await page.clock.install({ time: START });
  await page.reload({ waitUntil: 'load' });
}

async function newDeck(page, name, { parent, newPerDay, reviewsPerDay } = {}) {
  await page.goto(page.url().split('#')[0] + '#/decks');
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.fill('#deck-name', name);
  if (parent) await page.selectOption('#deck-parent', { label: parent });
  if (newPerDay !== undefined) await page.fill('#deck-new', String(newPerDay));
  if (reviewsPerDay !== undefined) await page.fill('#deck-reviews', String(reviewsPerDay));
  await page.getByRole('button', { name: 'Create deck' }).click();
}

// Adds a note to whichever deck is selected on the deck page.
async function addNote(page, { type = 'Basic', front, back = '', tags = '' }) {
  await page.locator('.page-head').getByRole('button', { name: 'Add card' }).click();
  await page.getByRole('radio', { name: type, exact: true }).click();
  await page.fill('#note-front', front);
  await page.fill('#note-back', back);
  if (tags) await page.fill('#note-tags', tags);
  await page.getByRole('button', { name: 'Save card' }).click();
  await page.locator('.modal').waitFor({ state: 'detached' });
}

async function studySelected(page) {
  await page.locator('.deck-panel').getByRole('link', { name: 'Study now' }).click();
  await page.locator('.study').waitFor();
}

const gradeLabels = (page) => page.locator('.grade-next').allTextContents();
const question = (page) => page.getByTestId('question').innerText();

async function leaveStudy(page) {
  await page.keyboard.press('Escape');
  await page.locator('.decks-page').waitFor();
}

// One whole day later, back on the deck page with the given deck selected.
async function nextDay(page) {
  await page.clock.fastForward(DAY);
  await page.reload({ waitUntil: 'load' });
}

async function browseRow(page, text) {
  await page.goto(page.url().split('#')[0] + '#/browse');
  await page.fill('#browse-search', text);
  return page.locator('.browse-table tbody tr').first();
}

// Reads Interval and Ease for the first row matching the search.
async function schedule(page, text) {
  const row = await browseRow(page, text);
  const cells = row.locator('td');
  return { due: await cells.nth(4).innerText(), interval: await cells.nth(5).innerText(), ease: await cells.nth(6).innerText(), lapses: await cells.nth(7).innerText() };
}

// Clicks a main tab and waits for the route to change, since hashchange fires asynchronously.
async function goTo(page, name) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
  await page.locator('.tab.is-active', { hasText: name }).waitFor();
}

async function openDeck(page, name) {
  await page.goto(page.url().split('#')[0] + '#/decks');
  await page.locator(`tr[data-deck="${name}"] .deck-name`).click();
}

module.exports = {
  'first run shows three nested seed decks with real history': async ({ page, assert }) => {
    const names = await page.locator('.deck-name').allTextContents();
    for (const name of ['Web fundamentals', 'World capitals', 'Spanish basics', 'Vocabulary', 'Food', 'JavaScript']) {
      assert.ok(names.includes(name), `missing deck ${name}`);
    }
    await page.getByRole('button', { name: 'Expand World capitals' }).click();
    await page.locator('tr[data-deck="Europe"]').waitFor();
    await page.getByRole('button', { name: 'Expand JavaScript' }).click();
    await page.locator('tr[data-deck="Async and the event loop"]').waitFor();
    assert.strictEqual(await page.locator('.empty').count(), 0);
    await goTo(page, 'Statistics');
    const reviews = Number((await page.getByTestId('reviews-30').innerText()).replace(/,/g, ''));
    assert.ok(reviews > 100, `expected backdated reviews, saw ${reviews}`);
    const retention = parseFloat(await page.getByTestId('retention').innerText());
    assert.ok(retention > 70 && retention < 100, `retention looks wrong: ${retention}`);
    const filled = await page.locator('.heatmap rect:not(.heat-0)').count();
    assert.ok(filled > 150, `heatmap too empty: ${filled} days`);
  },

  'SM-2 gives exact intervals and ease over a graded sequence': async ({ page, assert }) => {
    await startClock(page);
    await newDeck(page, 'Sequence');
    await addNote(page, { front: 'Sequence card', back: 'Answer' });
    await studySelected(page);
    await page.keyboard.press(' ');

    // New card. Steps are 1 and 10 minutes, Hard sits halfway, Easy graduates at 4 days.
    assert.deepStrictEqual(await gradeLabels(page), ['1m', '6m', '10m', '4d']);
    await page.keyboard.press('3');
    await page.keyboard.press(' ');
    // Second step. Good now graduates at 1 day.
    assert.deepStrictEqual(await gradeLabels(page), ['1m', '10m', '1d', '4d']);
    await page.keyboard.press('3');
    await page.getByRole('heading', { name: 'Nothing left to study' }).waitFor();
    await leaveStudy(page);
    assert.deepStrictEqual(await schedule(page, 'Sequence card'), { due: 'tomorrow', interval: '1d', ease: '250%', lapses: '0' });

    // Day 1. First review: SM-2's fixed second repetition of 6 days.
    await nextDay(page);
    await openDeck(page, 'Sequence');
    await studySelected(page);
    await page.keyboard.press(' ');
    assert.deepStrictEqual(await gradeLabels(page), ['10m', '2d', '6d', '7d']);
    await page.keyboard.press('3');
    await leaveStudy(page);
    assert.deepStrictEqual(await schedule(page, 'Sequence card'), { due: 'in 6 days', interval: '6d', ease: '250%', lapses: '0' });

    // Day 7. 6 x 2.5 = 15.
    for (let i = 0; i < 6; i++) await page.clock.fastForward(DAY);
    await page.reload({ waitUntil: 'load' });
    await openDeck(page, 'Sequence');
    await studySelected(page);
    await page.keyboard.press(' ');
    assert.deepStrictEqual(await gradeLabels(page), ['10m', '7d', '15d', '20d']);
    await page.keyboard.press('3');
    await leaveStudy(page);

    // Day 22. Hard: 15 x 1.2 = 18, ease 2.5 - 0.14 = 2.36.
    for (let i = 0; i < 15; i++) await page.clock.fastForward(DAY);
    await page.reload({ waitUntil: 'load' });
    await openDeck(page, 'Sequence');
    await studySelected(page);
    await page.keyboard.press(' ');
    assert.deepStrictEqual(await gradeLabels(page), ['10m', '18d', '38d', '49d']);
    await page.keyboard.press('2');
    await leaveStudy(page);
    assert.deepStrictEqual(await schedule(page, 'Sequence card'), { due: 'in 18 days', interval: '18d', ease: '236%', lapses: '0' });

    // Day 40. Good: 18 x 2.36 = 42.48, rounds to 42. Easy: 18 x 2.36 x 1.3 = 55.2.
    for (let i = 0; i < 18; i++) await page.clock.fastForward(DAY);
    await page.reload({ waitUntil: 'load' });
    await openDeck(page, 'Sequence');
    await studySelected(page);
    await page.keyboard.press(' ');
    assert.deepStrictEqual(await gradeLabels(page), ['10m', '22d', '42d', '55d']);
    await page.keyboard.press('4');
    await leaveStudy(page);
    assert.deepStrictEqual(await schedule(page, 'Sequence card'), { due: 'in 55 days', interval: '55d', ease: '246%', lapses: '0' });
  },

  'a lapse relearns, drops ease and restarts the repetitions': async ({ page, assert }) => {
    await startClock(page);
    await newDeck(page, 'Lapses');
    await addNote(page, { front: 'Lapse card', back: 'Answer' });
    await studySelected(page);
    // Easy straight to 4 days.
    await page.keyboard.press(' ');
    await page.keyboard.press('4');
    await leaveStudy(page);

    for (let i = 0; i < 4; i++) await page.clock.fastForward(DAY);
    await page.reload({ waitUntil: 'load' });
    await openDeck(page, 'Lapses');
    await studySelected(page);
    await page.keyboard.press(' ');
    // Streak 1, interval 4: Good is max(6, 10) = 10. Easy is 4 x 2.5 x 1.3 = 13.
    assert.deepStrictEqual(await gradeLabels(page), ['10m', '5d', '10d', '13d']);
    await page.keyboard.press('1');

    // Now relearning on a single 10 minute step: Hard is 15m, Good is 1d, Easy is 2d.
    await page.keyboard.press(' ');
    assert.deepStrictEqual(await gradeLabels(page), ['10m', '15m', '1d', '2d']);
    await page.keyboard.press('3');
    await leaveStudy(page);
    assert.deepStrictEqual(await schedule(page, 'Lapse card'), { due: 'tomorrow', interval: '1d', ease: '230%', lapses: '1' });

    // Repetitions restart at SM-2's 6 days, then multiply by the lowered ease.
    await nextDay(page);
    await openDeck(page, 'Lapses');
    await studySelected(page);
    await page.keyboard.press(' ');
    assert.deepStrictEqual(await gradeLabels(page), ['10m', '2d', '6d', '7d']);
    await page.keyboard.press('3');
    await leaveStudy(page);
    for (let i = 0; i < 6; i++) await page.clock.fastForward(DAY);
    await page.reload({ waitUntil: 'load' });
    await openDeck(page, 'Lapses');
    await studySelected(page);
    await page.keyboard.press(' ');
    // 6 x 2.3 = 13.8, rounds to 14.
    assert.strictEqual((await gradeLabels(page))[2], '14d');
  },

  'the eighth lapse makes a leech: tagged, suspended and undoable': async ({ page, assert }) => {
    await page.locator('tr[data-deck="Verbs and grammar"] .deck-study').click();
    await page.locator('.study').waitFor();
    // The seed holds a card with 7 lapses, due today. Work through until it appears.
    for (let i = 0; i < 12; i++) {
      const text = await question(page);
      if (text.includes('[estar]')) break;
      if (await page.locator('.typed-input').count()) await page.keyboard.press('Enter');
      else await page.keyboard.press(' ');
      await page.keyboard.press('3');
    }
    assert.ok((await question(page)).includes('[estar]'), 'near-leech card did not appear');
    await page.keyboard.press(' ');
    await page.keyboard.press('1');
    await page.locator('.toast').getByText('now suspended').waitFor();
    assert.ok(!(await question(page).catch(() => '')).includes('[estar]'), 'leech must leave the queue');

    // The next card may be waiting for typed input, and Ctrl+Z works either way.
    await page.keyboard.press('Control+z');
    assert.ok((await question(page)).includes('[estar]'), 'undo brings the card back');
    await page.keyboard.press(' ');
    await page.keyboard.press('1');
    await page.keyboard.press('Escape');

    await page.goto(page.url().split('#')[0] + '#/browse');
    await page.selectOption('#browse-state', 'leech');
    const rows = page.locator('.browse-table tbody tr');
    assert.strictEqual(await rows.count(), 2);
    const row = rows.filter({ hasText: '[estar]' });
    assert.strictEqual(await row.locator('.chip-muted').first().innerText(), 'Leech');
    assert.strictEqual(await row.locator('td').nth(7).innerText(), '8');
    assert.ok((await row.locator('.cell-tags').innerText()).includes('leech'));
  },

  'cloze deletions render per card, with hints, and escape markup': async ({ page, assert }) => {
    await newDeck(page, 'Clozes');
    await addNote(page, { type: 'Cloze', front: 'El {{c1::gato}} bebe {{c2::leche::drink}} y <img src=x onerror=boom> {{c1::gato}}.', back: 'Extra note' });
    await addNote(page, { type: 'Basic', front: 'Plain {{c1::not a cloze}}', back: 'B' });
    await studySelected(page);

    assert.strictEqual(await question(page), 'El [...] bebe leche y <img src=x onerror=boom> [...].');
    assert.strictEqual(await page.locator('.study img').count(), 0);
    await page.keyboard.press(' ');
    assert.strictEqual(await question(page), 'El gato bebe leche y <img src=x onerror=boom> gato.');
    assert.deepStrictEqual(await page.locator('.study mark').allTextContents(), ['gato', 'gato']);
    assert.strictEqual(await page.locator('.face-extra').innerText(), 'Extra note');
    await page.keyboard.press('4');

    assert.strictEqual(await question(page), 'Plain {{c1::not a cloze}}');
    await page.keyboard.press(' ');
    await page.keyboard.press('4');

    assert.strictEqual(await question(page), 'El gato bebe [drink] y <img src=x onerror=boom> gato.');
    await page.keyboard.press(' ');
    assert.deepStrictEqual(await page.locator('.study mark').allTextContents(), ['leche']);
  },

  'typed answers compare forgivingly with exact verdicts': async ({ page, assert }) => {
    await newDeck(page, 'Typed', { newPerDay: 50 });
    const cases = [
      ['q1', 'Ljubljana', '  ljubljana ', 'Correct'],
      ['q2', 'México', 'mexico', 'Correct, apart from accents or punctuation'],
      ['q3', 'el gato', 'gato', 'Correct, apart from accents or punctuation'],
      ['q4', 'Ljubljana', 'Ljubjlana', 'Close: a small typo'],
      ['q5', 'Bratislava', 'Bratislawa', 'Close: a small typo'],
      ['q6', 'la sal', 'sol', 'Not quite'],
      ['q7', '1989', '1998', 'Not quite'],
      ['q8', 'color / colour', 'colour', 'Correct'],
      ['q9', '(to) run', 'run', 'Correct'],
      ['q10', 'Paris', 'Rome', 'Not quite'],
      ['q11', 'Paris', '', 'No answer typed'],
    ];
    for (const [front, back] of cases) await addNote(page, { type: 'Typed answer', front, back });
    await studySelected(page);
    for (const [front, , typed, verdict] of cases) {
      assert.strictEqual(await question(page), front);
      await page.fill('.typed-input', typed);
      await page.keyboard.press('Enter');
      assert.strictEqual(await page.getByTestId('verdict').innerText(), verdict, `typed "${typed}"`);
      await page.keyboard.press('4');
    }
  },

  'typed input keeps spaces and digits, and the suggested grade follows the verdict': async ({ page, assert }) => {
    await newDeck(page, 'Typing');
    await addNote(page, { type: 'Typed answer', front: 'Two words', back: 'Addis Ababa 3' });
    await studySelected(page);
    await page.locator('.typed-input').pressSequentially('addis ababa 3');
    assert.strictEqual(await page.inputValue('.typed-input'), 'addis ababa 3');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.getByTestId('verdict').innerText(), 'Correct');
    assert.strictEqual(await page.locator('.grade.is-suggested').getAttribute('data-grade'), 'Good');
  },

  'reversible notes make two cards, one each way': async ({ page, assert }) => {
    await newDeck(page, 'Reverse');
    await addNote(page, { type: 'Reversible', front: 'the dog', back: 'el perro' });
    await studySelected(page);
    assert.strictEqual(await question(page), 'the dog');
    await page.keyboard.press(' ');
    assert.strictEqual(await page.locator('.face-answer').innerText(), 'el perro');
    await page.keyboard.press('4');
    assert.strictEqual(await question(page), 'el perro');
    await page.keyboard.press(' ');
    assert.strictEqual(await page.locator('.face-answer').innerText(), 'the dog');
  },

  'keyboard study grades with 1-4 and undo restores the card and counts': async ({ page, assert }) => {
    await newDeck(page, 'Keys');
    await addNote(page, { front: 'First', back: '1' });
    await addNote(page, { front: 'Second', back: '2' });
    await studySelected(page);
    const counts = () => page.locator('.study-counts span').allTextContents();

    assert.deepStrictEqual(await counts(), ['2', '0', '0']);
    assert.strictEqual(await page.getByRole('button', { name: 'Undo' }).isDisabled(), true);
    // Grading before flipping does nothing.
    await page.keyboard.press('3');
    assert.strictEqual(await question(page), 'First');
    await page.keyboard.press(' ');
    await page.keyboard.press('4');
    assert.strictEqual(await question(page), 'Second');
    assert.deepStrictEqual(await counts(), ['1', '0', '0']);

    await page.keyboard.press('u');
    assert.strictEqual(await question(page), 'First');
    assert.deepStrictEqual(await counts(), ['2', '0', '0']);
    // Undo returns the question side, so the card can be answered differently.
    assert.strictEqual(await page.locator('.grade').count(), 0);
    await page.keyboard.press(' ');
    assert.deepStrictEqual(await gradeLabels(page), ['1m', '6m', '10m', '4d']);
    await page.keyboard.press('1');
    assert.deepStrictEqual(await counts(), ['1', '1', '0']);
  },

  'daily new limits apply per deck, cap subdecks and reset the next day': async ({ page, assert }) => {
    await startClock(page);
    await newDeck(page, 'Parent', { newPerDay: 3 });
    await newDeck(page, 'Child A', { parent: 'Parent', newPerDay: 2 });
    for (const front of ['A1', 'A2', 'A3', 'A4']) await addNote(page, { front, back: 'x' });
    await newDeck(page, 'Child B', { parent: 'Parent', newPerDay: 10 });
    for (const front of ['B1', 'B2', 'B3', 'B4']) await addNote(page, { front, back: 'x' });

    const newCount = (deck) => page.locator(`tr[data-deck="${deck}"] td.num`).first().innerText();
    assert.strictEqual(await newCount('Parent'), '3'); // 2 from A, then 1 from B, stopped by the parent
    assert.strictEqual(await newCount('Child A'), '2');
    assert.strictEqual(await newCount('Child B'), '3');

    await openDeck(page, 'Child A');
    await studySelected(page);
    const seen = [];
    for (let i = 0; i < 2; i++) {
      seen.push(await question(page));
      await page.keyboard.press(' ');
      await page.keyboard.press('4');
    }
    assert.deepStrictEqual(seen, ['A1', 'A2']);
    await page.getByRole('heading', { name: 'Nothing left to study' }).waitFor();
    await leaveStudy(page);

    assert.strictEqual(await newCount('Child A'), '0');
    assert.strictEqual(await newCount('Parent'), '1');
    assert.strictEqual(await newCount('Child B'), '1');
    await page.locator('tr[data-deck="Child A"] .deck-name').click();
    assert.ok((await page.locator('.meter').first().innerText()).includes('2 of 2'));

    // Lowering the review limit to zero hides reviews that would be due.
    await nextDay(page);
    assert.strictEqual(await newCount('Parent'), '3');
    assert.strictEqual(await newCount('Child A'), '2');
  },

  'daily review limit stops reviews and a zero limit shows none': async ({ page, assert }) => {
    await startClock(page);
    await newDeck(page, 'Rev', { reviewsPerDay: 2 });
    for (const front of ['R1', 'R2', 'R3']) await addNote(page, { front, back: 'x' });
    await studySelected(page);
    for (let i = 0; i < 3; i++) { await page.keyboard.press(' '); await page.keyboard.press('4'); }
    await leaveStudy(page);

    for (let i = 0; i < 4; i++) await page.clock.fastForward(DAY);
    await page.reload({ waitUntil: 'load' });
    const dueCount = () => page.locator('tr[data-deck="Rev"] td.num').nth(2).innerText();
    assert.strictEqual(await dueCount(), '2');
    await openDeck(page, 'Rev');
    await studySelected(page);
    await page.keyboard.press(' ');
    await page.keyboard.press('3');
    await leaveStudy(page);
    assert.strictEqual(await dueCount(), '1');

    await page.locator('.deck-panel').getByRole('button', { name: 'Options' }).click();
    await page.fill('#deck-reviews', '0');
    await page.getByRole('button', { name: 'Save changes' }).click();
    assert.strictEqual(await dueCount(), '0');
    assert.ok(await page.locator('.deck-panel').getByText('Nothing left to study here today.').isVisible());
  },

  'practice mode leaves scheduling and statistics untouched': async ({ page, assert }) => {
    await startClock(page);
    await newDeck(page, 'Drill');
    await addNote(page, { front: 'Drill one', back: 'x' });
    await addNote(page, { front: 'Drill two', back: 'x' });
    await studySelected(page);
    await page.keyboard.press(' ');
    await page.keyboard.press('4');
    await leaveStudy(page);
    const before = await page.evaluate(() => localStorage.getItem('recallo.collection.v1'));

    await page.locator('.deck-panel').getByRole('button', { name: 'Practice' }).click();
    await page.getByRole('button', { name: 'Start practice' }).click();
    await page.getByText('Practice: scheduling is not changed').waitFor();
    assert.strictEqual(await page.locator('.study-remaining').innerText(), '2 left');

    // Again sends a card back into the list, Good finishes it, undo steps back.
    await page.keyboard.press(' ');
    assert.deepStrictEqual(await gradeLabels(page), ['see soon', 'see later', 'done', 'done']);
    await page.keyboard.press('1');
    assert.strictEqual(await page.locator('.study-remaining').innerText(), '2 left');
    await page.keyboard.press(' ');
    await page.keyboard.press('3');
    assert.strictEqual(await page.locator('.study-remaining').innerText(), '1 left');
    await page.keyboard.press('u');
    assert.strictEqual(await page.locator('.study-remaining').innerText(), '2 left');
    await page.keyboard.press(' ');
    await page.keyboard.press('3');
    await page.keyboard.press(' ');
    await page.keyboard.press('3');
    await page.getByRole('heading', { name: 'Practice finished' }).waitFor();
    assert.strictEqual(await page.locator('.finished-stats dd').first().innerText(), '3');

    const after = await page.evaluate(() => localStorage.getItem('recallo.collection.v1'));
    assert.strictEqual(after, before, 'stored data changed during practice');
  },

  'browser searches, filters, bulk tags, moves and suspends': async ({ page, assert }) => {
    await goTo(page, 'Browse');
    const count = () => page.getByTestId('result-count').innerText();
    const all = parseInt(await count(), 10);
    assert.ok(all > 180, `expected over 180 cards, saw ${all}`);

    await page.fill('#browse-search', 'ljubljana');
    assert.strictEqual(await count(), '1 card');
    // Search ignores accents.
    await page.fill('#browse-search', 'buenos dias');
    assert.strictEqual(await count(), '2 cards');
    await page.fill('#browse-search', '');
    await page.selectOption('#browse-type', 'cloze');
    const clozes = parseInt(await count(), 10);
    assert.ok(clozes > 10 && clozes < all);
    await page.selectOption('#browse-type', '');
    await page.selectOption('#browse-tag', 'baltic');
    assert.strictEqual(await count(), '3 cards');
    await page.selectOption('#browse-tag', '');

    await page.fill('#browse-search', 'tag:baltic');
    assert.strictEqual(await count(), '3 cards');
    await page.getByRole('checkbox', { name: 'Select all 3 matching cards' }).check();
    await page.getByText('3 cards selected').waitFor();

    await page.locator('.bulk-bar').getByRole('button', { name: 'Tag' }).click();
    await page.fill('#bulk-tag', 'exam-week');
    await page.getByRole('button', { name: 'Add tags' }).click();
    await page.fill('#browse-search', 'tag:exam-week');
    assert.strictEqual(await count(), '3 cards');
    assert.strictEqual(await page.locator('.browse-table tbody tr').first().locator('.cell-tags .chip').last().innerText(), 'exam-week');

    await page.getByRole('button', { name: 'Clear selection' }).waitFor();
    await page.locator('.bulk-bar').getByRole('button', { name: 'Move' }).click();
    await page.selectOption('#bulk-deck', { label: 'Spanish basics › Vocabulary › Food' });
    await page.getByRole('button', { name: 'Move cards' }).click();
    assert.strictEqual(await page.locator('.browse-table tbody tr').first().locator('td').nth(3).innerText(), 'Spanish basics › Vocabulary › Food');

    await page.locator('.bulk-bar').getByRole('button', { name: 'Suspend', exact: true }).click();
    await page.locator('.toast').getByText('Suspended 3 cards').waitFor();
    assert.strictEqual(await page.locator('.browse-table tbody tr .chip-muted', { hasText: 'Suspended' }).count(), 3);
    await page.selectOption('#browse-state', 'suspended');
    assert.strictEqual(await count(), '3 cards');

    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await page.getByText('No cards match these filters.').isVisible(), true);
  },

  'statistics report exact retention, forecast and intervals for a deck': async ({ page, assert }) => {
    await startClock(page);
    await newDeck(page, 'Measured', { newPerDay: 4 });
    for (const front of ['M1', 'M2', 'M3', 'M4']) await addNote(page, { front, back: 'x' });
    await addNote(page, { front: 'M5 unseen', back: 'x', tags: 'later' });

    await studySelected(page);
    for (let i = 0; i < 4; i++) { await page.keyboard.press(' '); await page.keyboard.press('4'); }
    await leaveStudy(page);
    // Stop new cards, so the fifth note stays unseen tomorrow too.
    await page.locator('.deck-panel').getByRole('button', { name: 'Options' }).click();
    await page.fill('#deck-new', '0');
    await page.getByRole('button', { name: 'Save changes' }).click();

    // Four days later: pass three reviews and fail one.
    for (let i = 0; i < 4; i++) await page.clock.fastForward(DAY);
    await page.reload({ waitUntil: 'load' });
    await openDeck(page, 'Measured');
    await studySelected(page);
    for (const key of ['3', '3', '3', '1']) { await page.keyboard.press(' '); await page.keyboard.press(key); }
    await page.keyboard.press(' ');
    await page.keyboard.press('3');
    await leaveStudy(page);

    await goTo(page, 'Statistics');
    await page.selectOption('#stats-deck', { label: 'Measured' });
    assert.strictEqual(await page.getByTestId('retention').innerText(), '75.0%');
    assert.strictEqual(await page.getByText('3 of 4 reviews recalled').count(), 1);
    // 4 new answers + 4 reviews + 1 relearning answer.
    assert.strictEqual(await page.getByTestId('reviews-30').innerText(), '9');
    assert.strictEqual(await page.getByTestId('due-today').innerText(), '0');

    const forecast = page.locator('section[aria-label="Forecast, next 30 days"]');
    assert.strictEqual(await forecast.getAttribute('data-total'), '4');
    const bars = await forecast.locator('svg title').allTextContents();
    assert.strictEqual(bars.length, 30);
    assert.strictEqual(bars[1], 'Tomorrow: 1 card due'); // the relapsed card
    assert.ok(bars[10].endsWith('3 cards due'), bars[10]); // 4 x 2.5 = 10 days
    assert.strictEqual(bars.filter((t) => !t.includes(': 0 cards')).length, 2);

    const intervals = await page.locator('section[aria-label="Interval distribution"] svg title').allTextContents();
    assert.strictEqual(intervals[0], '1d: 1 card');
    assert.strictEqual(intervals[3], '8-14d: 3 cards');

    const states = await page.locator('.stack-legend li').allInnerTexts();
    assert.ok(states.find((s) => s.startsWith('New')).includes('1'));
    assert.ok(states.find((s) => s.startsWith('Young')).includes('4'));

    assert.strictEqual(await page.locator('.heatmap rect:not(.heat-0)').count(), 2);
  },

  'CSV import previews, maps columns, skips bad rows and can be undone': async ({ page, assert }) => {
    await newDeck(page, 'Imported');
    await goTo(page, 'Import and export');
    await page.getByRole('button', { name: 'Preview import' }).click();
    await page.getByText('There is nothing to import yet').waitFor();

    const csv = 'notes,term,definition,tags\n'
      + 'ignore me,"el perro","the dog, a pet",animals\n'
      + 'x,"multi\nline","He said ""hola""",\n'
      + 'x,no back here,,\n'
      + 'x,"El {{c1::gato}} duerme",,grammar\n'
      + 'x,"el perro",duplicate front,\n';
    await page.setInputFiles('#csv-file', { name: 'words.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿' + csv) });

    await page.locator('.map-table').waitFor();
    assert.strictEqual(await page.inputValue('#csv-delimiter'), ',');
    assert.strictEqual(await page.isChecked('#csv-header'), true);
    assert.strictEqual(await page.inputValue('#map-0'), 'ignore');
    assert.strictEqual(await page.inputValue('#map-1'), 'front');
    assert.strictEqual(await page.inputValue('#map-2'), 'back');
    assert.strictEqual(await page.inputValue('#map-3'), 'tags');
    assert.strictEqual(await page.locator('.map-table tbody tr').count(), 5);
    assert.strictEqual(await page.locator('.map-table tbody tr').first().locator('td').nth(2).innerText(), 'the dog, a pet');
    assert.strictEqual(await page.getByTestId('import-summary').innerText(), '3 notes ready, 2 rows skipped.');
    const skips = await page.locator('.skip-list li').allTextContents();
    assert.deepStrictEqual(skips, ["Row 4: Back can't be empty.", 'Row 6: Already in your collection.']);

    // Mapping front twice is refused and blocks the import.
    await page.selectOption('#map-0', 'front');
    await page.getByText('Front is mapped to more than one column.').waitFor();
    assert.strictEqual(await page.locator('.wizard .btn-primary').isDisabled(), true);
    await page.selectOption('#map-0', 'ignore');

    await page.selectOption('#csv-deck', { label: 'Imported' });
    await page.getByRole('button', { name: 'Import 3 notes' }).click();
    assert.strictEqual(await page.getByTestId('import-result').innerText(), 'Imported 3 notes as 3 new cards.');

    await page.getByRole('link', { name: 'View the new cards' }).click();
    assert.strictEqual(await page.getByTestId('result-count').innerText(), '3 cards');
    const row = page.locator('.browse-table tbody tr', { hasText: 'multi' });
    assert.ok((await row.locator('td').nth(2).innerText()).includes('He said "hola"'));
    assert.strictEqual(await page.locator('.browse-table tbody tr', { hasText: '[...] duerme' }).count(), 1);
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await page.getByText('No cards match these filters.').isVisible(), true);
  },

  'TSV pasted without a header maps first two columns by default': async ({ page, assert }) => {
    await goTo(page, 'Import and export');
    await page.fill('#csv-paste', 'la mesa\tthe table\nla silla\tthe chair');
    await page.getByRole('button', { name: 'Preview import' }).click();
    assert.strictEqual(await page.inputValue('#csv-delimiter'), '\t');
    assert.strictEqual(await page.isChecked('#csv-header'), false);
    assert.strictEqual(await page.getByTestId('import-summary').innerText(), '2 notes ready, 0 rows skipped.');
    await page.selectOption('#csv-type', 'typed');
    await page.getByRole('button', { name: 'Import 2 notes' }).click();
    await goTo(page, 'Browse');
    await page.fill('#browse-search', 'la silla');
    await page.selectOption('#browse-type', 'typed');
    assert.strictEqual(await page.getByTestId('result-count').innerText(), '1 card');
  },

  'JSON export and import round trip, with bad files rejected': async ({ page, assert }) => {
    await newDeck(page, 'Backed up');
    await addNote(page, { front: 'Keep me', back: 'safe' });
    await goTo(page, 'Import and export');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
    assert.ok(/^recallo-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const json = Buffer.concat(chunks).toString('utf8');
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.app, 'recallo');
    assert.ok(parsed.log.length > 500);

    const upload = (name, text) => page.setInputFiles('#json-file', { name, mimeType: 'application/json', buffer: Buffer.from(text) });
    await upload('broken.json', '{ nope');
    await page.getByText('This file is not valid JSON.').waitFor();
    await upload('other.json', JSON.stringify({ hello: 'world' }));
    await page.getByText('This JSON file was not exported from Recallo.').waitFor();
    await upload('hollow.json', JSON.stringify({ app: 'recallo', decks: [] }));
    await page.getByText('missing the decks, notes or cards').waitFor();

    // Empty the collection, then bring it back from the file.
    await goTo(page, 'Browse');
    await goTo(page, 'Decks');
    for (let remaining = await page.locator('.deck-row').count(); remaining > 0; remaining = await page.locator('.deck-row').count()) {
      await page.locator('.deck-name').first().click();
      await page.locator('.deck-panel').getByRole('button', { name: 'Options' }).click();
      await page.getByRole('button', { name: 'Delete deck' }).click();
    }
    await page.getByRole('heading', { name: 'No decks yet' }).waitFor();

    await goTo(page, 'Import and export');
    const damaged = JSON.parse(json);
    damaged.cards.push({ id: 'orphan', noteId: 'no-such-note' });
    await upload('backup.json', JSON.stringify(damaged));
    await page.getByTestId('json-preview').getByText('1 damaged record will be left out.').waitFor();
    await page.getByRole('button', { name: 'Replace my collection' }).click();
    assert.strictEqual(await page.getByTestId('collection-summary').innerText(), `${parsed.decks.length} decks, ${parsed.cards.length} cards, ${parsed.log.length.toLocaleString('en-US')} reviews`);

    await goTo(page, 'Browse');
    await page.fill('#browse-search', 'Keep me');
    assert.strictEqual(await page.getByTestId('result-count').innerText(), '1 card');

    // Merging the same file again adds nothing.
    await goTo(page, 'Import and export');
    await upload('backup.json', json);
    await page.getByRole('button', { name: 'Add what is new' }).click();
    assert.strictEqual(await page.getByTestId('collection-summary').innerText(), `${parsed.decks.length} decks, ${parsed.cards.length} cards, ${parsed.log.length.toLocaleString('en-US')} reviews`);
  },

  'progress persists after reload': async ({ page, assert, reload }) => {
    await newDeck(page, 'Lasting', { newPerDay: 7 });
    await addNote(page, { front: 'Persistent', back: 'Yes', tags: 'one two' });
    await studySelected(page);
    await page.keyboard.press(' ');
    await page.keyboard.press('4');
    await leaveStudy(page);
    await reload();
    assert.strictEqual(await page.locator('.deck-panel h2').innerText(), 'Lasting');
    assert.ok((await page.locator('.meter').first().innerText()).includes('1 of 7'));
    const row = await schedule(page, 'Persistent');
    assert.strictEqual(row.interval, '4d');
    assert.strictEqual(row.due, 'in 4 days');
  },

  'editing a deck and a note validates input and keeps the schedule': async ({ page, assert }) => {
    await page.getByRole('button', { name: 'New deck' }).click();
    await page.getByRole('button', { name: 'Create deck' }).click();
    await page.getByText('Give the deck a name.').waitFor();
    await page.fill('#deck-name', 'Spanish basics');
    await page.getByRole('button', { name: 'Create deck' }).click();
    await page.getByText('A deck with this name already exists here.').waitFor();
    await page.fill('#deck-name', 'Checked');
    await page.fill('#deck-new', '-1');
    await page.getByRole('button', { name: 'Create deck' }).click();
    await page.getByText('Enter a whole number from 0 to 9999.').waitFor();
    await page.fill('#deck-new', '5');
    await page.getByRole('button', { name: 'Create deck' }).click();

    await page.locator('.page-head').getByRole('button', { name: 'Add card' }).click();
    await page.getByRole('button', { name: 'Save card' }).click();
    await page.getByText("Front can't be empty.").waitFor();
    await page.getByRole('radio', { name: 'Cloze' }).click();
    await page.fill('#note-front', 'No deletions here');
    await page.getByRole('button', { name: 'Save card' }).click();
    await page.getByText('Add at least one deletion').waitFor();
    await page.fill('#note-front', 'Uno {{c1::dos}} tres');
    await page.getByText('Creates 1 card').waitFor();
    await page.getByRole('button', { name: 'Save card' }).click();

    await studySelected(page);
    await page.keyboard.press(' ');
    await page.keyboard.press('4');
    await leaveStudy(page);

    // Correcting the text and adding a deletion keeps c1's schedule and adds c2.
    const row = await browseRow(page, 'Uno');
    await row.getByRole('button').first().click();
    await page.fill('#note-front', 'Uno {{c1::dos}} {{c2::tres}}');
    await page.getByRole('button', { name: 'Save changes' }).click();
    assert.strictEqual(await page.getByTestId('result-count').innerText(), '2 cards');
    const rows = await page.locator('.browse-table tbody tr').allInnerTexts();
    assert.ok(rows.some((t) => t.includes('Uno [...] tres') && t.includes('in 4 days')), rows.join('|'));
    assert.ok(rows.some((t) => t.includes('Uno dos [...]') && t.includes('New')), rows.join('|'));
  },

  'deleting a deck and a note can be undone': async ({ page, assert }) => {
    const before = await page.locator('.deck-row').count();
    await page.locator('tr[data-deck="Spanish basics"] .deck-name').click();
    await page.locator('.deck-panel').getByRole('button', { name: 'Options' }).click();
    await page.getByRole('button', { name: 'Delete deck' }).click();
    assert.strictEqual(await page.locator('tr[data-deck="Spanish basics"]').count(), 0);
    assert.strictEqual(await page.locator('tr[data-deck="Food"]').count(), 0);
    await page.locator('.toast').getByText('Deleted Spanish basics').waitFor();
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await page.locator('.deck-row').count(), before);

    const row = await browseRow(page, 'Capital of Latvia');
    await row.getByRole('button').first().click();
    await page.getByRole('button', { name: 'Delete note' }).click();
    await page.getByText('No cards match these filters.').waitFor();
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await page.getByTestId('result-count').innerText(), '1 card');
  },

  'reset demo data restores the seed, and can be undone': async ({ page, assert }) => {
    await newDeck(page, 'Mine');
    assert.strictEqual(await page.locator('tr[data-deck="Mine"]').count(), 1);
    await goTo(page, 'Import and export');
    await page.getByRole('button', { name: 'Reset demo data' }).click();
    await page.locator('.toast').getByText('Demo data restored').waitFor();
    await goTo(page, 'Decks');
    assert.strictEqual(await page.locator('tr[data-deck="Mine"]').count(), 0);
    assert.strictEqual(await page.locator('tr[data-deck="Spanish basics"]').count(), 1);
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
    await goTo(page, 'Decks');
    assert.strictEqual(await page.locator('tr[data-deck="Mine"]').count(), 1);
  },

  'corrupt saved data falls back to the seed instead of crashing': async ({ page, assert, reload }) => {
    await page.evaluate(() => localStorage.setItem('recallo.collection.v1', '{"decks": "not an array"'));
    await reload();
    await page.locator('.toast').getByText('Saved data was damaged').waitFor();
    assert.strictEqual(await page.locator('tr[data-deck="World capitals"]').count(), 1);

    await page.evaluate(() => localStorage.setItem('recallo.collection.v1', JSON.stringify({
      decks: [{ id: 'a', name: 'Survivor', parentId: 'gone' }, { id: 'b', name: 'Loop one', parentId: 'c' }, { id: 'c', name: 'Loop two', parentId: 'b' }, { name: 'no id' }],
      notes: [{ id: 'n', type: 'basic', deckId: 'a', front: 'Still here', back: 'yes' }, { id: 'bad', type: 'nonsense', deckId: 'a', front: 'x' }],
      cards: [{ id: 'k', noteId: 'n', ord: 0, state: 'mystery', due: 'soon', ease: -4 }, { id: 'orphan', noteId: 'missing' }],
      log: 'nope',
    })));
    await reload();
    assert.strictEqual(await page.locator('tr[data-deck="Survivor"]').count(), 1);
    assert.strictEqual(await page.locator('tr[data-deck="Loop one"]').count() + await page.locator('tr[data-deck="Loop two"]').count() >= 1, true);
    await page.locator('tr[data-deck="Survivor"] .deck-name').click();
    await studySelected(page);
    assert.strictEqual(await question(page), 'Still here');
  },

  'keeps working in memory when storage is blocked': async ({ page, context, assert, reload }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    await reload();
    await page.locator('.topbar').getByText('Not saving').waitFor();
    await newDeck(page, 'In memory');
    await addNote(page, { front: 'Held in memory', back: 'x' });
    await studySelected(page);
    await page.keyboard.press(' ');
    await page.keyboard.press('4');
    await page.getByRole('heading', { name: 'Nothing left to study' }).waitFor();
    assert.strictEqual(await page.getByRole('button', { name: 'Undo' }).isEnabled(), true);
  },

  'theme toggle is remembered across reloads': async ({ page, assert, reload }) => {
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await bg();
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    assert.notStrictEqual(await bg(), light);
    await reload();
    assert.strictEqual(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.getByRole('button', { name: 'Switch to light theme' }).waitFor();
  },

  'scheduling settings are validated and change the steps': async ({ page, assert }) => {
    await page.getByRole('button', { name: 'Scheduling settings' }).click();
    await page.fill('#set-learning', 'abc');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await page.getByText('Enter one or more delays in minutes').waitFor();
    await page.fill('#set-learning', '5');
    await page.fill('#set-graduating', '3');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await page.locator('.modal').waitFor({ state: 'detached' });
    await newDeck(page, 'Custom steps');
    await addNote(page, { front: 'Stepped', back: 'x' });
    await studySelected(page);
    await page.keyboard.press(' ');
    // One 5 minute step: Hard is half as long again, Good graduates at 3 days.
    assert.deepStrictEqual(await gradeLabels(page), ['5m', '8m', '3d', '4d']);
  },

  'Escape closes modals and focus stays inside them': async ({ page, assert }) => {
    await page.getByRole('button', { name: 'New deck' }).click();
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'deck-name');
    for (let i = 0; i < 10; i++) await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => Boolean(document.activeElement.closest('.modal'))));
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.modal').count(), 0);
    assert.strictEqual(await page.evaluate(() => document.activeElement.textContent.trim()), 'New deck');
  },

  'study and browser stay usable at phone width': async ({ page, assert }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.locator('tr[data-deck="Spanish basics"] .deck-name').click();
    await page.locator('.deck-panel').getByRole('link', { name: 'Study now' }).click();
    await page.locator('.study').waitFor();
    assert.ok((await overflow()) <= 0, 'study question overflows');
    if (await page.locator('.typed-input').count()) await page.keyboard.press('Enter');
    else await page.locator('.btn-show').click();
    assert.ok((await overflow()) <= 0, 'study answer overflows');
    const boxes = await page.locator('.grade').evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().right));
    assert.ok(Math.max(...boxes) <= 390);
    await page.locator('.grade').nth(2).click();
    await page.locator('.study-top a').click();

    await goTo(page, 'Browse');
    assert.ok((await overflow()) <= 0, 'browser overflows');
    await goTo(page, 'Statistics');
    assert.ok((await overflow()) <= 0, 'statistics overflows');
    await goTo(page, 'Import and export');
    assert.ok((await overflow()) <= 0, 'data page overflows');
  },
};
