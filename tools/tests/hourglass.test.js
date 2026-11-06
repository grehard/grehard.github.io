// Feature tests for Hourglass. Time-sensitive tests freeze the page clock at a fixed local time,
// and most load their data through the real JSON import so the expected numbers can be worked out by hand.
const fs = require('fs');

const NOW = new Date(2026, 2, 11, 16, 0, 0); // Wednesday 11 March 2026, 16:00 local
const DAY = '2026-03-11';
const NEXT_DAY = '2026-03-12';
const local = (day, h, m = 0, s = 0) => {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, s).toISOString();
};
const entry = (id, projectId, start, end, extra = {}) => ({ id, description: id, projectId, tagIds: [], billable: true, start, end, ...extra });

/** Two clients with different rates, projects that inherit or override them, and a default rate of 40. */
function fixture(entries, settings = {}, extra = {}) {
  return {
    app: 'hourglass', version: 1,
    settings: { name: 'Test Person', defaultRate: 40, ...settings },
    clients: [
      { id: 'c1', name: 'Client One', rate: 135, budgetHours: null, color: '#2F6DB5' },
      { id: 'c2', name: 'Client Two', rate: 85, budgetHours: null, color: '#0A9A8C' },
    ],
    projects: [
      { id: 'inherit', name: 'Inherits 135', clientId: 'c1', rate: null, budgetHours: null, color: '#2F6DB5', billable: true },
      { id: 'override', name: 'Overrides 150', clientId: 'c1', rate: 150, budgetHours: null, color: '#D9661F', billable: true },
      { id: 'two', name: 'Client two work', clientId: 'c2', rate: null, budgetHours: null, color: '#0A9A8C', billable: true },
      { id: 'flat', name: 'Flat 120', clientId: null, rate: 120, budgetHours: null, color: '#7C5CD6', billable: true },
      { id: 'hundred', name: 'Hundred', clientId: null, rate: 100, budgetHours: null, color: '#A63D9A', billable: true },
      { id: 'ninety-five', name: 'Ninety-five', clientId: null, rate: 95, budgetHours: null, color: '#7E9A12', billable: true },
      { id: 'capped', name: 'Capped', clientId: null, rate: 100, budgetHours: 2, color: '#CE3A5C', billable: true },
      ...(extra.projects || []),
    ],
    tags: [{ id: 'meet', name: 'Meeting' }, { id: 'dev', name: 'Development' }],
    entries,
  };
}

/** Freezes the clock at NOW, starting from a clean slate. Time only moves when a test moves it. */
async function freeze(page, reload) {
  await page.clock.install({ time: new Date(NOW.getTime() - 60000) });
  await page.evaluate(() => localStorage.clear());
  await reload();
  await page.clock.pauseAt(NOW);
}

async function importData(page, data) {
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.setInputFiles('#import-file', { name: 'data.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await page.getByRole('button', { name: 'Replace data' }).click();
  await page.waitForSelector('.toast');
}

async function go(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
}

const stat = (page, id) => page.locator(`#${id} .stat-value`).innerText();

async function setRounding(page, minutes, mode = 'up') {
  await go(page, '#/settings');
  await page.selectOption('#setting-rounding', String(minutes));
  await page.selectOption('#setting-rounding-mode', mode);
}

async function reportFor(page, from, to) {
  await go(page, '#/reports');
  await page.fill('#filter-from', from);
  await page.fill('#filter-to', to);
}

async function totals(page) {
  return {
    tracked: await stat(page, 'total-tracked'), rounded: await stat(page, 'total-rounded'),
    billable: await stat(page, 'total-billable'), nonBillable: await stat(page, 'total-nonbillable'), amount: await stat(page, 'total-amount'),
  };
}

async function fillEntryTimes(page, { date, start, end }) {
  await page.fill('#entry-date', date);
  await page.fill('#entry-start', start);
  await page.fill('#entry-end', end);
}

async function fetchDownload(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return { name: download.suggestedFilename(), text: fs.readFileSync(await download.path(), 'utf8') };
}

module.exports = {
  'first run shows seeded work dated today, and it persists after reload': async ({ page, assert, reload }) => {
    const rows = await page.locator('#entry-list .entry-row').count();
    assert.ok(rows >= 1, 'day view lists entries');
    assert.ok(await page.locator('.tl-block').count() >= 1, 'timeline shows blocks');
    assert.ok(await page.locator('.recent-chip').count() >= 3, 'quick resume offers recent tasks');
    await go(page, '#/reports');
    const tracked = await stat(page, 'total-tracked');
    assert.ok(parseInt(tracked, 10) > 40, `report has weeks of hours, got ${tracked}`);
    await reload();
    await go(page, '#/reports');
    assert.strictEqual(await stat(page, 'total-tracked'), tracked);
  },

  'timer stores a start time: survives reload exactly, shows in the tab title, saves the exact duration': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await page.fill('#timer-description', 'Client call');
    await page.click('#timer-toggle');
    assert.strictEqual(await page.locator('#timer-clock').innerText(), '0:00:00');

    await page.clock.fastForward('01:02:03');
    await page.clock.runFor(1000);
    assert.strictEqual(await page.locator('#timer-clock').innerText(), '1:02:04');
    assert.ok((await page.title()).startsWith('1:02:04 Client call'), `title was ${await page.title()}`);

    await reload();
    assert.strictEqual(await page.locator('#timer-clock').innerText(), '1:02:04', 'elapsed time is intact after reload');
    assert.ok((await page.title()).startsWith('1:02:04 Client call'));
    assert.strictEqual(await page.locator('#timer-description').inputValue(), 'Client call');

    await page.clock.fastForward('00:27:56');
    await reload();
    assert.strictEqual(await page.locator('#timer-clock').innerText(), '1:30:00', 'time away from the page still counts');

    await page.click('#timer-toggle');
    await go(page, `#/day/${DAY}`);
    const row = page.locator('#entry-list .entry-row', { hasText: 'Client call' });
    assert.strictEqual(await row.locator('.entry-duration').innerText(), '1:30');
    assert.strictEqual(await row.locator('.entry-range').first().innerText(), '16:00 to 17:30');
    assert.strictEqual(await page.locator('#timer-clock').innerText(), '0:00:00');
    assert.ok(!(await page.title()).includes('Client call'));
  },

  'an entry across midnight counts on each day it touches, with exact report and billing values': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([]));
    await go(page, `#/day/${DAY}`);
    await page.click('#add-entry');
    await page.fill('#entry-description', 'Late deployment');
    await page.selectOption('#entry-project', 'hundred');
    await fillEntryTimes(page, { date: DAY, start: '23:30', end: '00:45' });
    assert.strictEqual(await page.locator('#entry-end-date').inputValue(), NEXT_DAY, 'end date moves to the next day');
    assert.strictEqual(await page.locator('#entry-duration').innerText(), 'Duration 1:15 · ends 12 Mar');
    await page.click('#entry-save');

    assert.strictEqual(await stat(page, 'day-tracked'), '0:30');
    assert.strictEqual(await stat(page, 'day-amount'), '$50.00');
    await go(page, `#/day/${NEXT_DAY}`);
    assert.strictEqual(await stat(page, 'day-tracked'), '0:45');
    assert.strictEqual(await stat(page, 'day-amount'), '$75.00');
    assert.strictEqual(await page.locator('#entry-list .entry-range').first().innerText(), 'Wed 23:30 to 00:45');

    await reportFor(page, DAY, DAY);
    assert.strictEqual((await totals(page)).tracked, '0:30');
    assert.strictEqual((await totals(page)).amount, '$50.00');
    await reportFor(page, NEXT_DAY, NEXT_DAY);
    assert.strictEqual((await totals(page)).tracked, '0:45');
    await reportFor(page, DAY, NEXT_DAY);
    assert.strictEqual((await totals(page)).tracked, '1:15');
    assert.strictEqual((await totals(page)).amount, '$125.00');
  },

  'rounding applies once per entry even across midnight': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([entry('Night', 'hundred', local(DAY, 23, 50), local(NEXT_DAY, 0, 22))], { roundingMinutes: 15 }));
    // 32 minutes rounds up to 45 as a whole, not 15 + 30 as two pieces.
    await reportFor(page, DAY, NEXT_DAY);
    let t = await totals(page);
    assert.strictEqual(t.tracked, '0:32');
    assert.strictEqual(t.rounded, '0:45');
    assert.strictEqual(t.amount, '$75.00');
    // The extra time lands on the last day, so the days add up to the whole.
    await reportFor(page, DAY, DAY);
    t = await totals(page);
    assert.strictEqual(t.rounded, '0:10');
    await reportFor(page, NEXT_DAY, NEXT_DAY);
    t = await totals(page);
    assert.strictEqual(t.rounded, '0:35');
  },

  'rounding setting gives exact totals for none, 6 and 15 minutes, up and nearest': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    // 7, 16, 30 and 61 minutes at 120/h
    await importData(page, fixture([
      entry('Seven', 'flat', local(DAY, 8, 0), local(DAY, 8, 7)),
      entry('Sixteen', 'flat', local(DAY, 9, 0), local(DAY, 9, 16)),
      entry('Thirty', 'flat', local(DAY, 10, 0), local(DAY, 10, 30)),
      entry('Sixty-one', 'flat', local(DAY, 11, 0), local(DAY, 12, 1)),
    ]));
    const check = async (minutes, mode, rounded, amount) => {
      await setRounding(page, minutes, mode);
      await reportFor(page, DAY, DAY);
      const t = await totals(page);
      assert.strictEqual(t.tracked, '1:54', 'tracked time never changes');
      assert.strictEqual(t.rounded, rounded, `${minutes} ${mode}`);
      assert.strictEqual(t.amount, amount, `${minutes} ${mode}`);
    };
    await check(0, 'up', '1:54', '$228.00');
    await check(6, 'up', '2:06', '$252.00'); // 12 + 18 + 30 + 66
    await check(15, 'up', '2:30', '$300.00'); // 15 + 30 + 30 + 75
    await check(6, 'nearest', '1:54', '$228.00'); // 6 + 18 + 30 + 60
    await check(15, 'nearest', '1:45', '$210.00'); // 0 + 15 + 30 + 60

    await go(page, '#/settings');
    await page.selectOption('#setting-rounding', '15');
    await page.selectOption('#setting-rounding-mode', 'up');
    assert.ok((await page.locator('#rounding-example').innerText()).includes('0:37 bills as 0:45'));
    await reload();
    await reportFor(page, DAY, DAY);
    assert.strictEqual((await totals(page)).rounded, '2:30', 'the setting persists');
  },

  'billable totals use each project rate, inherited rates, the default rate, and skip non-billable time': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([
      entry('A', 'inherit', local(DAY, 8, 0), local(DAY, 9, 20)), // 1:20 at 135 = 180.00
      entry('B', 'override', local(DAY, 9, 30), local(DAY, 10, 20)), // 0:50 at 150 = 125.00
      entry('C', 'two', local(DAY, 10, 30), local(DAY, 12, 40)), // 2:10 at 85 = 184.17
      entry('D', null, local(DAY, 13, 0), local(DAY, 13, 30)), // 0:30 at default 40 = 20.00
      entry('E', 'flat', local(DAY, 14, 0), local(DAY, 15, 0), { billable: false }), // not billed
    ]));
    await reportFor(page, DAY, DAY);
    const t = await totals(page);
    assert.strictEqual(t.tracked, '5:50');
    assert.strictEqual(t.billable, '4:50');
    assert.strictEqual(t.nonBillable, '1:00');
    assert.strictEqual(t.amount, '$509.17');
    const row = async (name) => page.locator('#report-table tbody tr', { hasText: name }).locator('td').nth(4).innerText();
    assert.strictEqual(await row('Inherits 135'), '$180.00');
    assert.strictEqual(await row('Overrides 150'), '$125.00');
    assert.strictEqual(await row('Client two work'), '$184.17');
    assert.strictEqual(await row('No project'), '$20.00');
    assert.strictEqual(await row('Flat 120'), '$0.00');

    await page.selectOption('#filter-billable', 'yes');
    assert.strictEqual((await totals(page)).tracked, '4:50');
    await page.selectOption('#filter-billable', 'no');
    assert.strictEqual((await totals(page)).amount, '$0.00');
  },

  'small amounts add up without cent drift': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([
      entry('One', 'ninety-five', local(DAY, 8, 0), local(DAY, 8, 10)),
      entry('Two', 'ninety-five', local(DAY, 9, 0), local(DAY, 9, 10)),
      entry('Three', 'ninety-five', local(DAY, 10, 0), local(DAY, 10, 10)),
    ]));
    await reportFor(page, DAY, DAY);
    // Rounding each 15.83 first would give 47.49.
    assert.strictEqual((await totals(page)).amount, '$47.50');
  },

  'overlap detection warns live, treats touching entries as fine, and still allows saving': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([
      entry('First', 'flat', local(DAY, 9, 0), local(DAY, 10, 0)),
      entry('Second', 'flat', local(DAY, 9, 30), local(DAY, 10, 30)),
      entry('Touching', 'flat', local(DAY, 10, 30), local(DAY, 11, 0)),
    ]));
    await go(page, `#/day/${DAY}`);
    assert.strictEqual(await page.locator('#day-overlap').innerText(), '2 entries overlap on this day, for 0:30 in total.');
    assert.strictEqual(await page.locator('.entry-row .badge-warn').count(), 2, 'Touching has no overlap badge');
    assert.strictEqual(await page.locator('.entry-row', { hasText: 'Touching' }).locator('.badge-warn').count(), 0);

    await page.click('#add-entry');
    await fillEntryTimes(page, { date: DAY, start: '10:45', end: '11:15' });
    assert.strictEqual(await page.locator('#entry-overlap').innerText(), 'Overlaps "Touching" 10:30 to 11:00 by 0:15. You can still save it.');
    await fillEntryTimes(page, { date: DAY, start: '11:00', end: '11:30' });
    assert.strictEqual(await page.locator('#entry-overlap').isVisible(), false, 'starting exactly at the end is not an overlap');
    await fillEntryTimes(page, { date: DAY, start: '09:15', end: '10:15' });
    assert.ok((await page.locator('#entry-overlap').innerText()).includes('"First" 09:00 to 10:00 by 0:45, "Second" 09:30 to 10:30 by 0:45'));
    await page.click('#entry-save');
    assert.strictEqual(await page.locator('#entry-list .entry-row').count(), 4, 'overlap warns but does not block');
    assert.strictEqual(await page.locator('#day-overlap').innerText(), '3 entries overlap on this day, for 1:00 in total.');

    // A running timer occupies time up to now.
    await page.click('#timer-toggle');
    await page.clock.fastForward('00:30:00');
    await page.click('#add-entry');
    await fillEntryTimes(page, { date: DAY, start: '16:10', end: '16:20' });
    assert.ok((await page.locator('#entry-overlap').innerText()).includes('"Running timer"'));
  },

  'an entry can be edited and split, keeps seconds it was not asked to change, and the split can be undone': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([entry('Workshop', 'flat', local(DAY, 9, 0, 20), local(DAY, 12, 0, 20), { tagIds: ['dev'] })]));
    await go(page, `#/day/${DAY}`);
    const edit = page.getByRole('button', { name: 'Edit Workshop' });
    await edit.click();
    await page.fill('#entry-description', 'Workshop prep');
    await page.click('#entry-save');
    assert.strictEqual(await page.locator('.entry-row .entry-duration').innerText(), '3:00', 'seconds were kept on both ends');

    await page.getByRole('button', { name: 'Split Workshop prep' }).click();
    assert.strictEqual(await page.locator('#split-first').innerText(), '09:00 to 10:30, 1:30');
    await page.fill('#split-at', `${DAY}T08:00`);
    await page.click('#split-save');
    assert.ok(await page.locator('.field-error', { hasText: 'Pick a time between' }).isVisible(), 'split outside the entry is refused');
    await page.fill('#split-at', `${DAY}T10:15`);
    assert.strictEqual(await page.locator('#split-first').innerText(), '09:00 to 10:15, 1:15');
    assert.strictEqual(await page.locator('#split-second').innerText(), '10:15 to 12:00, 1:45');
    await page.fill('#split-second-description', 'Workshop delivery');
    await page.click('#split-save');
    const rows = page.locator('#entry-list .entry-row');
    assert.strictEqual(await rows.count(), 2);
    assert.strictEqual(await rows.nth(0).locator('.entry-name').innerText(), 'Workshop prep');
    assert.strictEqual(await rows.nth(1).locator('.entry-name').innerText(), 'Workshop delivery');
    assert.strictEqual(await stat(page, 'day-tracked'), '3:00', 'splitting preserves the total');
    assert.strictEqual(await rows.nth(1).locator('.badge', { hasText: 'Development' }).count(), 1, 'the second part keeps its tags');

    await page.getByRole('button', { name: 'Undo' }).last().click();
    assert.strictEqual(await rows.count(), 1);
    assert.strictEqual(await rows.nth(0).locator('.entry-name').innerText(), 'Workshop prep');
  },

  'entry form validates, and Escape closes it': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await go(page, `#/day/${DAY}`);
    const before = await page.locator('#entry-list .entry-row').count();
    await page.click('#add-entry');
    await page.fill('#entry-start', '');
    await page.click('#entry-save');
    assert.ok(await page.locator('.field-error', { hasText: 'Enter a date, a start time and an end time.' }).isVisible());
    await page.fill('#entry-date', DAY);
    await page.fill('#entry-start', '10:00');
    await page.fill('#entry-end', '11:00');
    await page.fill('#entry-end-date', '2026-03-10');
    await page.click('#entry-save');
    assert.ok(await page.locator('.field-error', { hasText: 'The end has to be after the start.' }).isVisible());
    await page.fill('#entry-end-date', '2026-03-30');
    await page.click('#entry-save');
    assert.ok(await page.locator('.field-error', { hasText: "can't be longer than 7 days" }).isVisible());
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.modal').count(), 0);
    assert.strictEqual(await page.locator('#entry-list .entry-row').count(), before);
  },

  'delete with undo, and user text is rendered as text': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    const hostile = '<img src=x onerror="window.__xss=1">';
    await importData(page, fixture([entry('Keep', 'flat', local(DAY, 9), local(DAY, 10)), entry(hostile, 'flat', local(DAY, 11), local(DAY, 12))]));
    await go(page, `#/day/${DAY}`);
    assert.strictEqual(await page.locator('.entry-name', { hasText: hostile }).count(), 1);
    assert.strictEqual(await page.evaluate(() => window.__xss), undefined);
    await page.getByRole('button', { name: `Delete ${hostile}` }).click();
    assert.strictEqual(await page.locator('#entry-list .entry-row').count(), 1);
    assert.strictEqual(await stat(page, 'day-tracked'), '1:00');
    await page.locator('.toast', { hasText: 'Deleted' }).getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await page.locator('#entry-list .entry-row').count(), 2);
    assert.strictEqual(await stat(page, 'day-tracked'), '2:00');
    await reload();
    assert.strictEqual(await page.locator('#entry-list .entry-row').count(), 2, 'undo persists');
  },

  'week grid cells edit real entries, reject bad input and keep totals right': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([
      entry('Morning', 'flat', local(DAY, 9), local(DAY, 10)),
      entry('Later', 'flat', local(DAY, 14), local(DAY, 15)),
      entry('Other', 'hundred', local('2026-03-10', 9), local('2026-03-10', 11)),
    ]));
    await go(page, `#/week/${DAY}`);
    const cell = (project, day) => page.locator(`.ts-cell[data-project="${project}"][data-day="${day}"]`);
    const commit = async (project, day, value) => {
      await cell(project, day).fill(value);
      await cell(project, day).press('Tab');
    };
    assert.strictEqual(await cell('flat', DAY).inputValue(), '2:00');
    assert.strictEqual(await page.locator('#week-grand-total').innerText(), '4:00');

    // Raising extends the day's last entry.
    await commit('flat', DAY, '2:30');
    assert.strictEqual(await cell('flat', DAY).inputValue(), '2:30');
    assert.strictEqual(await page.locator('#week-grand-total').innerText(), '4:30');
    assert.strictEqual(await page.locator('[data-day-total="2026-03-11"]').innerText(), '2:30');

    // An empty cell accepts decimals and makes a new entry. 1.5 hours at 100/h.
    await commit('hundred', DAY, '1.5');
    assert.strictEqual(await cell('hundred', DAY).inputValue(), '1:30');
    await commit('hundred', '2026-03-13', '90m');
    assert.strictEqual(await cell('hundred', '2026-03-13').inputValue(), '1:30');
    assert.strictEqual(await page.locator('#week-grand-total').innerText(), '7:30');
    // Flat 2:30 at 120 = 300, Hundred 2:00 + 1:30 + 1:30 = 5:00 at 100 = 500.
    assert.strictEqual(await stat(page, 'week-amount'), '$800.00');

    // Bad input is refused with a message and changes nothing.
    await commit('flat', DAY, 'soon');
    assert.ok((await page.locator('#week-message').innerText()).includes("isn't a duration"));
    assert.strictEqual(await cell('flat', DAY).getAttribute('aria-invalid'), 'true');
    assert.strictEqual(await page.locator('#week-grand-total').innerText(), '7:30');
    await commit('flat', DAY, '25:00');
    assert.ok((await page.locator('#week-message').innerText()).includes('more than 24 hours'));

    // Lowering trims from the latest entry, removing it if it reaches zero.
    await commit('flat', DAY, '0:45');
    assert.strictEqual(await page.locator('#week-grand-total').innerText(), '5:45');
    await go(page, `#/day/${DAY}`);
    const flatRows = page.locator('#entry-list .entry-row', { hasText: 'Flat 120' });
    assert.strictEqual(await flatRows.count(), 1);
    assert.strictEqual(await flatRows.locator('.entry-range').innerText(), '09:00 to 09:45');

    await reload();
    await go(page, `#/week/${DAY}`);
    assert.strictEqual(await cell('flat', DAY).inputValue(), '0:45', 'cell edits persist');
    await commit('flat', DAY, '');
    assert.strictEqual(await page.locator('#week-grand-total').innerText(), '5:00');
    await page.locator('.toast', { hasText: 'changed to 0:00' }).getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await page.locator('#week-grand-total').innerText(), '5:45');

    // A project with no time this week can get a row.
    await page.selectOption('#week-add-row', 'override');
    await commit('override', DAY, '1');
    assert.strictEqual(await cell('override', DAY).inputValue(), '1:00');
  },

  'timesheet cell handles a midnight-crossing entry on both days': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([entry('Night', 'flat', local(DAY, 23, 0), local(NEXT_DAY, 1, 0))]));
    await go(page, `#/week/${DAY}`);
    const cell = (day) => page.locator(`.ts-cell[data-project="flat"][data-day="${day}"]`);
    assert.strictEqual(await cell(DAY).inputValue(), '1:00');
    assert.strictEqual(await cell(NEXT_DAY).inputValue(), '1:00');
    // Lower the first day: the entry now starts later, and the next day is untouched.
    await cell(DAY).fill('0:30');
    await cell(DAY).press('Tab');
    assert.strictEqual(await cell(DAY).inputValue(), '0:30');
    assert.strictEqual(await cell(NEXT_DAY).inputValue(), '1:00');
    await cell(NEXT_DAY).fill('0:15');
    await cell(NEXT_DAY).press('Tab');
    assert.strictEqual(await cell(DAY).inputValue(), '0:30');
    assert.strictEqual(await cell(NEXT_DAY).inputValue(), '0:15');
  },

  'day timeline places blocks by time, and dragging on empty space opens a new entry for that range': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([entry('Block', 'flat', local(DAY, 9), local(DAY, 10, 30))]));
    await go(page, `#/day/${DAY}`);
    const block = page.locator('.tl-block[data-entry="Block"]');
    const top = await block.evaluate((el) => parseFloat(el.style.top));
    const height = await block.evaluate((el) => parseFloat(el.style.height));
    assert.strictEqual(top, 9 * 44);
    assert.strictEqual(height, 1.5 * 44 - 2);

    await page.locator('.tl-scroll').evaluate((el) => { el.scrollTop = 11 * 44; });
    const canvas = await page.locator('.tl-canvas').boundingBox();
    const y = (hours) => canvas.y + hours * 44;
    const x = canvas.x + canvas.width / 2;
    await page.mouse.move(x, y(12));
    await page.mouse.down();
    await page.mouse.move(x, y(13), { steps: 4 });
    assert.strictEqual(await page.locator('.tl-ghost').innerText(), '12:00 to 13:00');
    await page.mouse.move(x, y(13.5), { steps: 4 });
    await page.mouse.up();
    assert.strictEqual(await page.locator('#entry-start').inputValue(), '12:00');
    assert.strictEqual(await page.locator('#entry-end').inputValue(), '13:30');
    assert.strictEqual(await page.locator('#entry-duration').innerText(), 'Duration 1:30');
    await page.fill('#entry-description', 'Dragged');
    await page.click('#entry-save');
    assert.strictEqual(await page.locator('.tl-block', { hasText: 'Dragged' }).count(), 1);
  },

  'quick resume starts a recent task and saves what was running': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([
      entry('Design review', 'override', local(DAY, 9), local(DAY, 10), { tagIds: ['meet'] }),
      entry('Design review', 'override', local('2026-03-10', 9), local('2026-03-10', 10), { id: 'dup', tagIds: ['meet'] }),
      entry('Bug hunt', 'flat', local(DAY, 11), local(DAY, 12)),
    ]));
    await go(page, `#/day/${DAY}`);
    assert.strictEqual(await page.locator('.recent-chip').count(), 2, 'repeated tasks appear once');
    await page.locator('.recent-chip', { hasText: 'Design review' }).click();
    assert.strictEqual(await page.locator('#timer-description').inputValue(), 'Design review');
    assert.strictEqual(await page.locator('#timer-project').inputValue(), 'override');
    assert.strictEqual(await page.locator('#timer-tags .tag-count').innerText(), '1');
    await page.clock.fastForward('00:20:00');
    await page.locator('.recent-chip', { hasText: 'Bug hunt' }).click();
    assert.strictEqual(await page.locator('#timer-description').inputValue(), 'Bug hunt');
    const row = page.locator('#entry-list .entry-row', { hasText: '16:00 to 16:20' });
    assert.strictEqual(await row.locator('.entry-name').innerText(), 'Design review');
  },

  'focus session runs configured intervals with sound, and files work intervals exactly': async ({ page, context, assert, reload }) => {
    await context.addInitScript(() => {
      window.__tones = 0;
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...args) { window.__tones += 1; return start.apply(this, args); };
    });
    await freeze(page, reload);
    await importData(page, fixture([]));
    await page.fill('#timer-description', 'Proposal draft');
    await page.selectOption('#timer-project', 'flat');
    await go(page, '#/focus');
    await page.fill('#focus-work', '0');
    await page.click('#focus-start');
    assert.ok(await page.locator('.field-error', { hasText: 'Work length' }).isVisible(), 'bad interval is refused');
    await page.fill('#focus-work', '10');
    await page.fill('#focus-break', '2');
    await page.fill('#focus-rounds', '2');
    await page.click('#focus-start');

    assert.strictEqual(await page.locator('#focus-remaining').innerText(), '10:00');
    assert.strictEqual(await page.locator('#timer-phase').innerText(), 'Focus 1/2');
    await page.clock.runFor('04:00');
    assert.strictEqual(await page.locator('#focus-remaining').innerText(), '06:00');
    assert.ok((await page.title()).startsWith('06:00 Focus Proposal draft'), await page.title());

    await reload();
    assert.strictEqual(await page.locator('#timer-phase').innerText(), 'Focus 1/2', 'session survives a reload');
    assert.strictEqual(await page.locator('#focus-remaining').innerText(), '06:00');

    await page.clock.runFor('06:00');
    assert.strictEqual(await page.locator('#focus-phase').innerText(), 'Break');
    assert.strictEqual(await page.locator('#focus-remaining').innerText(), '02:00');
    assert.strictEqual(await page.evaluate(() => window.__tones), 2, 'break chime played');
    assert.strictEqual(await page.locator('#timer-phase').innerText(), 'Break 1/2');

    await page.clock.runFor('02:00');
    assert.strictEqual(await page.locator('#timer-phase').innerText(), 'Focus 2/2');
    assert.strictEqual(await page.evaluate(() => window.__tones), 4, 'work chime played');

    await page.clock.runFor('10:00');
    assert.strictEqual(await page.locator('#timer-phase').isVisible(), false, 'session has ended');
    assert.strictEqual(await page.evaluate(() => window.__tones), 7, 'completion chime has three notes');
    await go(page, `#/day/${DAY}`);
    const ranges = await page.locator('#entry-list .entry-range').allInnerTexts();
    assert.deepStrictEqual(ranges, ['16:00 to 16:10', '16:12 to 16:22']);
    assert.strictEqual(await stat(page, 'day-tracked'), '0:20');
    assert.strictEqual(await page.locator('#entry-list .entry-name').first().innerText(), 'Proposal draft');
    // 20 minutes at 120/h.
    assert.strictEqual(await stat(page, 'day-amount'), '$40.00');
  },

  'a focus session catches up on phases that ended while the page was away': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([]));
    await page.fill('#timer-description', 'Deep work');
    await go(page, '#/focus');
    await page.fill('#focus-work', '10');
    await page.fill('#focus-break', '5');
    await page.fill('#focus-rounds', '3');
    await page.click('#focus-start');
    // Jump past the first work, the first break and the second work: 10 + 5 + 10 = 25, then 3 into the break.
    await page.clock.fastForward('28:00');
    await reload();
    assert.strictEqual(await page.locator('#timer-phase').innerText(), 'Break 2/3');
    assert.strictEqual(await page.locator('#focus-remaining').innerText(), '02:00');
    await go(page, `#/day/${DAY}`);
    assert.deepStrictEqual(await page.locator('#entry-list .entry-range').allInnerTexts(), ['16:00 to 16:10', '16:15 to 16:25']);
    await page.click('#timer-toggle');
    assert.strictEqual(await page.locator('#timer-phase').isVisible(), false, 'Stop ends the session during a break');
  },

  'reports filter by client, project, tag and date, group by day, and draw charts from the same numbers': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([
      entry('One', 'inherit', local('2026-03-09', 9), local('2026-03-09', 10), { tagIds: ['meet'] }), // 135
      entry('Two', 'override', local('2026-03-09', 11), local('2026-03-09', 13), { tagIds: ['dev'] }), // 300
      entry('Three', 'two', local('2026-03-10', 9), local('2026-03-10', 12), { tagIds: ['dev', 'meet'] }), // 255
      entry('Four', 'flat', local('2026-03-11', 9), local('2026-03-11', 10), { billable: false }),
      entry('Outside', 'flat', local('2026-02-01', 9), local('2026-02-01', 10)),
    ]));
    await reportFor(page, '2026-03-09', '2026-03-15');
    assert.strictEqual((await totals(page)).tracked, '7:00', 'date range excludes February');
    assert.strictEqual((await totals(page)).amount, '$690.00');
    assert.strictEqual(await page.locator('#report-table tbody tr').count(), 4);

    await page.selectOption('#filter-client', 'c1');
    assert.strictEqual((await totals(page)).tracked, '3:00');
    assert.strictEqual((await totals(page)).amount, '$435.00');
    assert.strictEqual(await page.locator('#filter-project option').count(), 4, 'project filter narrows to this client');
    await page.selectOption('#filter-project', 'override');
    assert.strictEqual((await totals(page)).amount, '$300.00');
    await page.selectOption('#filter-client', 'all');
    await page.selectOption('#filter-tag', 'meet');
    assert.strictEqual((await totals(page)).tracked, '4:00');
    assert.strictEqual((await totals(page)).amount, '$390.00');
    await page.selectOption('#filter-tag', 'all');
    await page.fill('#filter-search', 'three');
    assert.strictEqual(await page.locator('#filter-search').inputValue(), 'three', 'search keeps focus through re-render');
    assert.strictEqual((await totals(page)).tracked, '3:00');
    await page.fill('#filter-search', '');

    // Charts: one bar per project in the bars chart, drawn longest first.
    await page.waitForSelector('.chart-panel svg .bar-label');
    assert.deepStrictEqual(await page.locator('.bar-label').allTextContents(), ['Client two work', 'Overrides 150', 'Flat 120', 'Inherits 135']);
    const barWidths = await page.locator('.chart-panel .chart-mark path').evaluateAll((paths) => paths.map((p) => p.getBBox().width).filter((w) => w > 20));
    assert.ok(barWidths.length >= 2);

    await page.click('#group-day');
    assert.deepStrictEqual(await page.locator('#report-table tbody tr td:first-child').allInnerTexts(),
      ['Monday, 9 March 2026', 'Tuesday, 10 March 2026', 'Wednesday, 11 March 2026']);
    assert.strictEqual(await page.locator('#report-table tbody tr').nth(0).locator('td').nth(4).innerText(), '$435.00');
    await page.waitForSelector('.chart-panel svg .crosshair', { state: 'attached' });
    assert.strictEqual(await page.locator('.chart-legend .legend-item').count(), 2, 'billable and non-billable series are labelled');

    await page.selectOption('#filter-client', 'c2');
    await page.selectOption('#filter-billable', 'no');
    assert.ok(await page.locator('.empty-title', { hasText: 'No time matches' }).isVisible(), 'empty state');
    await page.click('#report-clear');
    assert.strictEqual(await page.locator('#filter-client').inputValue(), 'all');
  },

  'budget progress updates, and crossing a budget raises an alert': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    // Capped has 2 budget hours. 1:30 used is 75%, so no alert yet.
    await importData(page, fixture([entry('Work', 'capped', local(DAY, 9), local(DAY, 10, 30))]));
    await go(page, '#/projects');
    const row = page.locator('.manage-row[data-project="Capped"]');
    assert.strictEqual(await row.locator('.budget-text').innerText(), '1.50 of 2 h');
    assert.strictEqual(await row.locator('[role=progressbar]').getAttribute('aria-valuenow'), '75');
    assert.strictEqual(await page.locator('#budget-alerts').count(), 0);

    // 1:50 is 92%, near the limit.
    await go(page, `#/day/${DAY}`);
    await page.getByRole('button', { name: 'Edit Work' }).click();
    await page.fill('#entry-end', '10:50');
    await page.click('#entry-save');
    assert.ok((await page.getByTestId('budget-strip').innerText()).includes('1 near budget'));

    // The running timer counts, and a saved entry that crosses the line raises a toast.
    await page.selectOption('#timer-project', 'capped');
    await page.click('#timer-toggle');
    await page.clock.fastForward('00:30:00');
    await page.click('#timer-toggle');
    assert.ok(await page.locator('.toast-alert', { hasText: 'Capped: 2.33 of 2 h, 0.33 h over budget' }).isVisible());
    await go(page, '#/projects');
    assert.ok((await page.locator('#budget-alerts').innerText()).includes('Over budget.'));
    assert.strictEqual(await row.locator('.badge-danger').innerText(), '0.33 h over');
    assert.strictEqual(await page.locator('#nav-projects .nav-badge').innerText(), '1');
  },

  'projects, clients and tags have a full lifecycle with validation and search': async ({ page, assert, reload }) => {
    await go(page, '#/projects');
    await page.click('#manage-add');
    await page.click('#manage-save');
    assert.ok(await page.locator('.field-error', { hasText: 'Give the project a name.' }).isVisible());
    await page.fill('#project-name', 'Harbor signage');
    await page.fill('#project-rate', '-4');
    await page.click('#manage-save');
    assert.ok(await page.locator('.field-error', { hasText: 'positive number' }).isVisible());
    await page.fill('#project-rate', '142.5');
    await page.fill('#project-budget', '40');
    await page.locator('.swatch input').nth(2).check({ force: true });
    await page.click('#manage-save');
    const row = page.locator('.manage-row[data-project="Harbor signage"]');
    assert.strictEqual(await row.locator('.manage-rate span').first().innerText(), '$142.50/h');
    assert.strictEqual(await row.locator('.dot').evaluate((el) => el.style.background), 'rgb(10, 154, 140)');

    await page.getByRole('button', { name: 'Edit Harbor signage' }).click();
    await page.fill('#project-name', 'Harbor wayfinding');
    await page.click('#manage-save');
    assert.strictEqual(await page.locator('.manage-row[data-project="Harbor wayfinding"]').count(), 1);

    await page.fill('#manage-search', 'wayfind');
    assert.strictEqual(await page.locator('#project-list .manage-row').count(), 1);
    await page.getByRole('button', { name: 'Delete Harbor wayfinding' }).click();
    assert.ok(await page.locator('.empty-title', { hasText: 'No project matches' }).isVisible());
    await page.locator('.toast', { hasText: 'Deleted Harbor wayfinding' }).getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await page.locator('#project-list .manage-row').count(), 1);
    await page.fill('#manage-search', '');

    await page.click('#tab-clients');
    await page.click('#manage-add');
    await page.fill('#client-name', 'Saltmarsh Ferries');
    await page.fill('#client-rate', '99');
    await page.click('#manage-save');
    assert.ok((await page.locator('.manage-row[data-client="Saltmarsh Ferries"]').innerText()).includes('$99.00/h'));

    await page.click('#tab-tags');
    await page.click('#manage-add');
    await page.fill('#tag-name', 'Travel');
    await page.click('#manage-save');
    await page.click('#manage-add');
    await page.fill('#tag-name', 'travel');
    await page.click('#manage-save');
    assert.ok(await page.locator('.field-error', { hasText: 'already a tag' }).isVisible(), 'duplicate name refused');
    await page.keyboard.press('Escape');
    await reload();
    await go(page, '#/projects');
    await page.click('#tab-tags');
    assert.strictEqual(await page.locator('.manage-row[data-tag="Travel"]').count(), 1, 'persists');
  },

  'CSV export has exact values and JSON export can be imported back': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([
      entry('Night, "shift"', 'hundred', local(DAY, 23, 30), local(NEXT_DAY, 0, 45), { tagIds: ['dev', 'meet'] }),
      entry('=SUM(A1)', 'two', local('2026-03-10', 9), local('2026-03-10', 10), { billable: false }),
    ], { roundingMinutes: 6 }));
    await go(page, '#/settings');
    const csv = await fetchDownload(page, () => page.click('#export-csv'));
    assert.strictEqual(csv.name, 'hourglass-entries-2026-03-11.csv');
    const lines = csv.text.trim().split('\r\n');
    assert.strictEqual(lines[0], 'date,start,end,hours,rounded_hours,description,client,project,tags,billable,rate,amount,entry_id');
    assert.deepStrictEqual(lines.slice(1), [
      `2026-03-10,09:00,10:00,1.00,1.00,'=SUM(A1),Client Two,Client two work,,no,0.00,0.00,=SUM(A1)`,
      '2026-03-11,23:30,24:00,0.50,0.50,"Night, ""shift""",,Hundred,Development; Meeting,yes,100.00,50.00,"Night, ""shift"""',
      // 1:15 rounds up to 1:18 as a whole, and the extra 3 minutes land on the last day.
      '2026-03-12,00:00,00:45,0.75,0.80,"Night, ""shift""",,Hundred,Development; Meeting,yes,100.00,80.00,"Night, ""shift"""',
    ]);

    const json = await fetchDownload(page, () => page.click('#export-json'));
    assert.strictEqual(json.name, 'hourglass-backup-2026-03-11.json');
    const parsed = JSON.parse(json.text);
    assert.strictEqual(parsed.entries.length, 2);
    assert.strictEqual(parsed.settings.roundingMinutes, 6);
    await page.click('#reset-demo');
    await page.locator('.modal').getByRole('button', { name: 'Reset demo data' }).click();
    await importData(page, parsed);
    await reportFor(page, DAY, NEXT_DAY);
    assert.strictEqual((await totals(page)).amount, '$130.00');
    await reload();
    await reportFor(page, DAY, NEXT_DAY);
    assert.strictEqual((await totals(page)).amount, '$130.00', 'imported data persists');
  },

  'bad imports are rejected with clear errors and change nothing, and a good import can be undone': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await go(page, '#/reports');
    const tracked = await stat(page, 'total-tracked');
    await go(page, '#/settings');
    const upload = (text) => page.setInputFiles('#import-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await upload('{ not json');
    assert.ok((await page.locator('#import-errors').innerText()).includes('not valid JSON'));
    await upload('{"app":"something-else"}');
    assert.ok((await page.locator('#import-errors').innerText()).includes('not exported from Hourglass'));
    const bad = fixture([
      entry('Backwards', 'flat', local(DAY, 10), local(DAY, 9)),
      entry('Lost', 'nope', local(DAY, 10), local(DAY, 11)),
      { id: 'x', start: 'yesterday-ish', end: local(DAY, 11) },
    ]);
    await upload(JSON.stringify(bad));
    const errors = await page.locator('#import-errors').innerText();
    assert.ok(errors.includes('Nothing was imported.'));
    assert.ok(errors.includes('Entry 1 ends before it starts.'));
    assert.ok(errors.includes("Entry 2 points to a project that isn't in the file."));
    assert.ok(errors.includes('Entry 3 has an invalid start time.'));
    await go(page, '#/reports');
    assert.strictEqual(await stat(page, 'total-tracked'), tracked, 'nothing changed');

    await importData(page, fixture([]));
    await go(page, '#/reports');
    assert.strictEqual(await stat(page, 'total-tracked'), '0:00');
    await page.locator('.toast', { hasText: 'Imported 0 entries' }).getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await stat(page, 'total-tracked'), tracked);
  },

  'reset demo data restores the seed, stops the timer, and can be undone': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([entry('Mine', 'flat', local(DAY, 9), local(DAY, 10))]));
    await page.click('#timer-toggle');
    await go(page, '#/settings');
    await page.click('#reset-demo');
    await page.keyboard.press('Escape');
    await go(page, '#/projects');
    assert.strictEqual(await page.locator('.manage-row[data-project="Flat 120"]').count(), 1, 'Escape cancels the reset');
    await go(page, '#/settings');
    await page.click('#reset-demo');
    await page.locator('.modal').getByRole('button', { name: 'Reset demo data' }).click();
    assert.strictEqual(await page.locator('#timer-clock').innerText(), '0:00:00');
    await go(page, '#/projects');
    assert.strictEqual(await page.locator('.manage-row[data-project="Website rebuild"]').count(), 1);
    assert.strictEqual(await page.locator('.manage-row[data-project="Flat 120"]').count(), 0);
    await page.locator('.toast', { hasText: 'Demo data restored' }).getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await page.locator('.manage-row[data-project="Flat 120"]').count(), 1);
  },

  'printable timesheet shows exact totals and prints without the app around it': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([
      entry('Alpha', 'inherit', local('2026-03-09', 9), local('2026-03-09', 10, 7)),
      entry('Beta', 'two', local('2026-03-10', 9), local('2026-03-10', 9, 30)),
    ], { roundingMinutes: 15 }));
    await go(page, `#/week/${DAY}`);
    await page.click('#week-print');
    const sheet = page.locator('#timesheet-sheet');
    assert.ok((await sheet.innerText()).includes('Test Person'));
    assert.ok((await sheet.innerText()).includes('9 Mar to 15 Mar 2026'));
    // Alpha 1:07 rounds to 1:15 at 135 = 168.75. Beta 0:30 at 85 = 42.50.
    assert.strictEqual(await page.locator('#sheet-amount').innerText(), '$211.25');
    assert.ok((await page.locator('#sheet-totals').innerText()).includes('1:45'));
    await page.selectOption('#print-client', 'c2');
    assert.strictEqual(await page.locator('#sheet-amount').innerText(), '$42.50');

    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
    await page.click('#print-now');
    assert.strictEqual(await page.evaluate(() => window.__printed), 1);
    await page.emulateMedia({ media: 'print' });
    assert.strictEqual(await page.locator('.app-header').isVisible(), false);
    assert.strictEqual(await page.locator('#timerbar').isVisible(), false);
    assert.strictEqual(await page.locator('.print-controls').isVisible(), false);
    assert.ok(await sheet.isVisible());
    await page.emulateMedia({ media: 'screen' });
  },

  'theme follows the system, and the toggle choice is remembered': async ({ page, assert, reload }) => {
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    assert.strictEqual(await theme(), 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.click('#theme-toggle');
    assert.strictEqual(await theme(), 'dark');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.strictEqual(bg, 'rgb(22, 21, 18)');
    await reload();
    assert.strictEqual(await theme(), 'dark', 'choice survives a reload');
  },

  'the timer works inside an iframe, as in the portfolio Try it panel': async ({ page, assert }) => {
    const url = page.url();
    await page.setContent(`<iframe id="f" src="${url}" style="width:1200px;height:680px"></iframe>`);
    const frame = await (await page.waitForSelector('#f')).contentFrame();
    await frame.waitForSelector('#timer-toggle');
    await frame.fill('#timer-description', 'Inside a frame');
    await frame.click('#timer-toggle');
    await frame.waitForFunction(() => document.title.includes('Inside a frame'));
    await frame.click('#nav-reports');
    await frame.waitForSelector('#total-amount');
    assert.strictEqual(await frame.evaluate(() => location.hash), '#/reports');
    assert.ok(page.url() === 'about:blank' || page.url() === url, 'navigation stays inside the frame');
  },

  'corrupt or partly invalid stored data cannot crash the app': async ({ page, assert, reload }) => {
    await page.evaluate(() => localStorage.setItem('hourglass.data.v1', '{"entries": "nope", broken'));
    await reload();
    assert.ok(await page.locator('#entry-list, .empty').first().isVisible(), 'falls back to the seed');

    await page.evaluate(() => localStorage.setItem('hourglass.data.v1', JSON.stringify({
      clients: [null, { id: 'c', name: 'Kept', rate: 'lots', color: 'javascript:alert(1)' }],
      projects: 12,
      tags: [{ id: 't', name: 'Tag' }, { id: 't', name: 'Duplicate' }],
      entries: [
        { id: 'ok', description: 'Good', start: Date.now() - 3600000, end: Date.now(), projectId: 'missing', tagIds: ['t', 'gone'] },
        { id: 'bad', description: 'Bad', start: 'x', end: 5 },
        { id: 'neg', start: 100, end: 50 },
      ],
      timerStart: 'soon', focus: { phase: 'nap', phaseStart: 'never' }, settings: { roundingMinutes: 7, focusWork: -3, currency: 'XXX' },
    })));
    await reload();
    await go(page, `#/day/${await page.evaluate(() => HG.time.today())}`);
    assert.strictEqual(await page.locator('#entry-list .entry-row').count(), 1);
    assert.strictEqual(await page.locator('#timer-clock').innerText(), '0:00:00');
    await go(page, '#/settings');
    assert.strictEqual(await page.locator('#setting-rounding').inputValue(), '0');
    await go(page, '#/reports');
    assert.ok(await page.locator('#total-amount').isVisible());
  },

  'every screen fits a 390px phone with no sideways page scroll, and the timeline opens on the work': async ({ page, assert }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    for (const route of ['day', 'week', 'focus', 'reports', 'projects', 'settings', 'print']) {
      await go(page, `#/${route}`);
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `${route} overflows by ${overflow}px`);
    }
    await page.click('#nav-reports');
    await page.click('#group-day');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await go(page, '#/day');
    await page.waitForTimeout(100);
    assert.ok(await page.locator('.tl-scroll').evaluate((el) => el.scrollTop) > 0);
  },

  'long text stays inside the layout on a phone': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    const long = 'Reconciling the unusually long warehouse manifest description '.repeat(4).trim();
    await importData(page, fixture([entry(long, 'flat', local(DAY, 9), local(DAY, 10))]));
    await page.setViewportSize({ width: 390, height: 780 });
    for (const route of [`#/day/${DAY}`, '#/reports', `#/print/${DAY}/${DAY}`]) {
      await go(page, route);
      await page.waitForTimeout(100);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `${route} overflows by ${overflow}px`);
    }
  },

  'seed data is never in the future, whatever time of day it is created': async ({ page, assert, reload }) => {
    await page.clock.install({ time: new Date(2026, 2, 11, 0, 0, 0) });
    for (const [h, m] of [[0, 10], [0, 40], [6, 30], [10, 20], [23, 50]]) {
      const at = new Date(2026, 2, 11, h, m, 0);
      await page.clock.setSystemTime(at);
      await page.evaluate(() => localStorage.clear());
      await reload();
      const data = await page.evaluate(() => JSON.parse(localStorage.getItem('hourglass.data.v1')));
      assert.ok(data.entries.length > 80, `${h}:${m} has weeks of entries`);
      assert.ok(data.entries.every((e) => e.end <= at.getTime() && e.end > e.start), `${h}:${m} has no future entries`);
      assert.ok(data.projects.some((p) => p.budgetHours !== null));
    }
  },

  'week start setting changes the grid, and the running timer start can be corrected': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await go(page, '#/week');
    assert.strictEqual(await page.locator('#week-title').innerText(), '9 Mar to 15 Mar 2026');
    await go(page, '#/settings');
    await page.selectOption('#setting-week', '0');
    await go(page, '#/week');
    assert.strictEqual(await page.locator('#week-title').innerText(), '8 Mar to 14 Mar 2026');

    await page.click('#timer-toggle');
    await page.click('#timer-started');
    await page.fill('#timer-start-time', '17:00');
    await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
    assert.ok(await page.locator('.field-error', { hasText: "can't be in the future" }).isVisible());
    await page.fill('#timer-start-time', '15:15');
    await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
    assert.strictEqual(await page.locator('#timer-clock').innerText(), '0:45:00');
    await reload();
    assert.strictEqual(await page.locator('#timer-clock').innerText(), '0:45:00');
  },

  'works by keyboard: modal focus returns, and timesheet arrow keys move between cells': async ({ page, assert, reload }) => {
    await freeze(page, reload);
    await importData(page, fixture([entry('A', 'flat', local(DAY, 9), local(DAY, 10)), entry('B', 'hundred', local(DAY, 11), local(DAY, 12))]));
    await go(page, `#/day/${DAY}`);
    await page.locator('#add-entry').focus();
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'entry-description');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'add-entry', 'focus returns to the opener');

    await go(page, `#/week/${DAY}`);
    const first = page.locator('.ts-cell[data-row="0"][data-col="2"]');
    await first.focus();
    await page.keyboard.press('ArrowDown');
    assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.row), '1');
    assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.col), '2');
  },
};
