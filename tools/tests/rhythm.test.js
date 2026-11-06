// Feature tests for Rhythm. Date logic runs against a mocked clock in a fixed time zone, so every
// expected value below is exact. Fixtures load through the real Import button.
const fs = require('fs');

const TZ = 'America/New_York';

const sessions = new WeakMap();

/** Fixes the page's clock and time zone, then reloads so the app starts on that date. */
async function freeze(page, context, localIso, timezoneId = TZ) {
  if (!sessions.has(page)) sessions.set(page, await context.newCDPSession(page));
  await sessions.get(page).send('Emulation.setTimezoneOverride', { timezoneId });
  await page.clock.setFixedTime(new Date(localIso));
  await page.reload({ waitUntil: 'load' });
}

const habit = (id, name, schedule, extra = {}) => ({
  id, name, schedule, target: { type: 'check' }, timeOfDay: 'morning', startDate: '2026-03-01', archivedOn: null, reminder: null, ...extra,
});

async function importState(page, { habits, logs = {}, notes = {}, settings = {} }) {
  await page.goto(page.url().split('#')[0] + '#/settings');
  const file = { app: 'rhythm', version: 1, habits, logs, notes, settings };
  await page.setInputFiles('#import-file', { name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByText(/^Imported /).waitFor();
}

const open = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
const toDates = (list, entry = { value: 1 }) => Object.fromEntries(list.map((d) => [d, entry]));
const row = (page, name) => page.locator('.habit-row', { hasText: name });

/** Reads the streak tiles from the habit page, which is what the user sees. */
async function streaksShown(page, id) {
  await open(page, `#/habit/${id}`);
  await page.locator('[data-testid="current-streak"]').waitFor();
  const value = (t) => page.locator(`[data-testid="${t}"] .tile-value`).innerText();
  return { current: await value('current-streak'), best: await value('best-streak') };
}

module.exports = {
  'one-tap completion on Today updates progress and survives reload': async ({ page, assert, reload }) => {
    const progress = page.locator('[data-testid="today-progress"]');
    const before = parseInt(await progress.innerText(), 10);
    await page.getByRole('button', { name: 'Complete Read before bed' }).click();
    assert.strictEqual(parseInt(await progress.innerText(), 10), before + 1);
    assert.strictEqual(await page.getByRole('button', { name: 'Undo Read before bed' }).getAttribute('aria-pressed'), 'true');
    await reload();
    assert.strictEqual(parseInt(await progress.innerText(), 10), before + 1);
    await page.getByRole('button', { name: 'Undo Read before bed' }).click();
    assert.strictEqual(parseInt(await progress.innerText(), 10), before);
  },

  'Today groups habits by morning, afternoon and evening': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, { habits: [
      habit('a', 'Dawn habit', { type: 'daily' }, { timeOfDay: 'morning' }),
      habit('b', 'Noon habit', { type: 'daily' }, { timeOfDay: 'afternoon' }),
      habit('c', 'Dusk habit', { type: 'daily' }, { timeOfDay: 'evening' }),
    ] });
    await open(page, '#/today');
    for (const [group, name] of [['Morning', 'Dawn habit'], ['Afternoon', 'Noon habit'], ['Evening', 'Dusk habit']]) {
      assert.strictEqual(await page.getByRole('region', { name: group }).locator('.row-name').innerText(), name);
    }
  },

  'quick log adds to a measurable target until it completes': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, { habits: [
      habit('w', 'Water', { type: 'daily' }, { target: { type: 'count', amount: 3, unit: 'glasses', step: 1 } }),
    ] });
    await open(page, '#/today');
    await page.getByRole('button', { name: 'Log more Water' }).click();
    await page.getByRole('button', { name: 'Log more Water' }).click();
    assert.match(await row(page, 'Water').locator('.quick-value').innerText(), /^2 \/ 3 glasses/);
    assert.ok(await row(page, 'Water').evaluate((el) => el.classList.contains('is-partial')));
    await page.getByRole('button', { name: 'Log more Water' }).click();
    assert.ok(await row(page, 'Water').evaluate((el) => el.classList.contains('is-done')));
    assert.strictEqual(await row(page, 'Water').locator('.row-streak').innerText(), '1 day');
    await page.getByRole('button', { name: 'Log less Water' }).click();
    assert.ok(await row(page, 'Water').evaluate((el) => el.classList.contains('is-partial')));

    // An exact amount through the dialog, including a rejected value.
    await row(page, 'Water').locator('.quick-value').click();
    const amount = page.getByLabel('Amount (glasses)');
    await amount.fill('-4');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByText('Enter a number from 0 to 1,000,000.').waitFor();
    await amount.fill('12.5');
    await page.getByRole('button', { name: 'Save' }).click();
    assert.match(await row(page, 'Water').locator('.quick-value').innerText(), /^12\.5 \/ 3 glasses/);
  },

  'the habit form validates and creates each schedule type': async ({ page, assert, context, reload }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, { habits: [] });
    await open(page, '#/today');
    await page.getByText('No habits yet').waitFor();

    await page.getByRole('button', { name: 'Add habit' }).first().click();
    await page.locator('.modal').getByRole('button', { name: 'Add habit' }).click();
    await page.getByText('Give the habit a name.').waitFor();

    const save = () => page.locator('.modal').getByRole('button', { name: 'Add habit' }).click();
    const chooseSchedule = (label) => page.getByRole('radio', { name: label }).check();

    await page.getByLabel('Name').fill('Yoga');
    await chooseSchedule('Certain days');
    // Clear the three default days to reach the empty-selection error.
    for (const day of ['Mon', 'Wed', 'Fri']) await page.locator('.modal .day-chip', { hasText: day }).click();
    await save();
    await page.getByText('Pick at least one day.').waitFor();
    await page.locator('.modal .day-chip', { hasText: 'Wed' }).click();
    await save();

    await page.getByRole('button', { name: 'Add habit' }).first().click();
    await page.getByLabel('Name').fill('Swim');
    await chooseSchedule('Times a week');
    await page.getByLabel('Times per week').fill('9');
    await save();
    await page.getByText('Enter a whole number from 1 to 7.').waitFor();
    await page.getByLabel('Times per week').fill('2');
    await save();

    await page.getByRole('button', { name: 'Add habit' }).first().click();
    await page.getByLabel('Name').fill('Change the sheets');
    await chooseSchedule('Every N days');
    await page.getByLabel('Repeat every (days)').fill('1');
    await save();
    await page.getByText('Enter a whole number from 2 to 365.').waitFor();
    await page.getByLabel('Repeat every (days)').fill('7');
    await save();

    await page.getByRole('button', { name: 'Add habit' }).first().click();
    await page.getByLabel('Name').fill('Meditate');
    await page.getByRole('radio', { name: 'Measurable' }).check();
    await page.getByLabel('Daily target').fill('0');
    await save();
    await page.getByText(/Enter a target above 0/).waitFor();
    await page.getByLabel('Daily target').fill('20');
    await page.getByLabel('Unit').fill('minutes');
    await page.getByRole('radio', { name: 'Evening' }).check();
    await save();

    await reload();
    await open(page, '#/habits');
    const meta = await page.locator('.manage-row .row-meta').allInnerTexts();
    assert.deepStrictEqual(meta, [
      'Morning · Wed · Yes or no',
      'Morning · 2 times a week · Yes or no',
      'Morning · Every 7 days · Yes or no',
      'Evening · Every day · 20 minutes',
    ]);
  },

  'editing a habit keeps its history and escapes user text': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, {
      habits: [habit('d', 'Daily', { type: 'daily' })],
      logs: { d: toDates(['2026-03-16', '2026-03-17']) },
    });
    await open(page, '#/habits');
    await page.getByRole('button', { name: 'Edit Daily' }).click();
    const nasty = '<img src=x onerror="window.__pwned=1">Tea';
    await page.getByLabel('Name').fill(nasty);
    await page.locator('.modal').getByRole('button', { name: 'Save changes' }).click();
    assert.strictEqual(await page.locator('.manage-row .row-name').innerText(), nasty);
    assert.strictEqual(await page.locator('.manage-row img').count(), 0);
    assert.strictEqual(await page.evaluate(() => window.__pwned), undefined);
    assert.strictEqual((await streaksShown(page, 'd')).current, '2 days');
  },

  'delete, archive and reset all offer a working undo': async ({ page, assert, reload }) => {
    await open(page, '#/habits');
    const names = () => page.locator('.manage-row .row-name').allInnerTexts();
    const original = await names();
    assert.ok(original.includes('Run'));

    await page.getByRole('button', { name: 'Delete Run' }).click();
    assert.ok(!(await names()).includes('Run'));
    await page.locator('.toast', { hasText: 'Deleted Run' }).getByRole('button', { name: 'Undo' }).click();
    assert.deepStrictEqual(await names(), original);

    await page.getByRole('button', { name: 'Archive Run' }).click();
    assert.ok(!(await names()).includes('Run'));
    await page.locator('.segment', { hasText: 'Archived' }).click();
    assert.ok((await names()).includes('Run'));
    await page.getByRole('button', { name: 'Restore Run' }).click();
    await page.locator('.segment', { hasText: 'Active' }).click();
    assert.ok((await names()).includes('Run'));

    // Delete for real, reload, and bring it back through Reset demo data.
    await page.getByRole('button', { name: 'Delete Run' }).click();
    await reload();
    assert.ok(!(await names()).includes('Run'));
    await open(page, '#/settings');
    await page.getByRole('button', { name: 'Reset demo data' }).click();
    await open(page, '#/habits');
    assert.ok((await names()).includes('Run'));
    await page.locator('.toast', { hasText: 'Demo data restored' }).getByRole('button', { name: 'Undo' }).click();
    assert.ok(!(await names()).includes('Run'));
  },

  'habits reorder with buttons and with a pointer drag, and the order persists': async ({ page, assert, reload }) => {
    await open(page, '#/habits');
    const names = () => page.locator('.manage-row .row-name').allInnerTexts();
    const start = await names();
    await page.getByRole('button', { name: `Move ${start[0]} down` }).click();
    assert.deepStrictEqual((await names()).slice(0, 2), [start[1], start[0]]);
    assert.ok(await page.getByRole('button', { name: `Move ${start[0]} down` }).evaluate((el) => document.activeElement === el), 'focus stays on the button');

    const handle = page.getByRole('button', { name: `Drag to reorder ${start[1]}` });
    const from = await handle.boundingBox();
    const target = await page.locator('.manage-row').nth(3).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, target.y + target.height - 4, { steps: 8 });
    await page.mouse.up();
    const after = await names();
    assert.strictEqual(after[3], start[1]);
    await reload();
    assert.deepStrictEqual(await names(), after);
    // The order reaches Today as well.
    await open(page, '#/today');
    const today = await page.locator('.row-name').allInnerTexts();
    assert.ok(today.indexOf(start[0]) < today.indexOf(after[2]));
  },

  'daily streaks: skips bridge, misses reset, today stays open': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, {
      habits: [habit('d', 'Daily', { type: 'daily' }, { startDate: '2026-03-02' })],
      logs: { d: {
        ...toDates(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']), // best: 5
        // 03-07 missed
        ...toDates(['2026-03-08', '2026-03-09', '2026-03-10']),
        '2026-03-11': { skipped: true },
        ...toDates(['2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15', '2026-03-16', '2026-03-17']),
      } },
    });
    // 3 + 6 either side of the skip, and today (03-18) isn't done yet.
    assert.deepStrictEqual(await streaksShown(page, 'd'), { current: '9 days', best: '9 days' });
    await open(page, '#/today');
    await page.getByRole('button', { name: 'Skip Daily today' }).click();
    assert.match(await row(page, 'Daily').locator('.row-meta').innerText(), /Your streak is safe/);
    assert.deepStrictEqual(await streaksShown(page, 'd'), { current: '9 days', best: '9 days' });
  },

  'daily streak resets after a missed yesterday': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, {
      habits: [habit('d', 'Daily', { type: 'daily' }, { startDate: '2026-03-10' })],
      logs: { d: toDates(['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15', '2026-03-16']) },
    });
    assert.deepStrictEqual(await streaksShown(page, 'd'), { current: '0 days', best: '7 days' });
  },

  'weekday streaks count scheduled days only': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00'); // a Wednesday
    await importState(page, {
      habits: [habit('m', 'MWF', { type: 'weekdays', days: [1, 3, 5] }, { startDate: '2026-03-02' })],
      logs: { m: {
        ...toDates(['2026-03-02', '2026-03-04']), // Mon, Wed
        '2026-03-06': { skipped: true }, // Fri skipped
        ...toDates(['2026-03-09', '2026-03-11', '2026-03-13', '2026-03-16']), // Mon, Wed, Fri, Mon
        '2026-03-14': { value: 1 }, // Sat: extra, not scheduled, doesn't count
      } },
    });
    // Mon 2, Wed 4, (Fri 6 skipped), Mon 9, Wed 11, Fri 13, Mon 16 = 6. Wed 18 is still open.
    assert.deepStrictEqual(await streaksShown(page, 'm'), { current: '6 days', best: '6 days' });
    await open(page, '#/today');
    await page.getByRole('button', { name: 'Complete MWF' }).click();
    assert.strictEqual((await streaksShown(page, 'm')).current, '7 days');
  },

  'N-per-week streaks use calendar windows, and the week start changes them': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00'); // Wed; week of Mon 03-16
    await importState(page, {
      habits: [habit('t', 'Three a week', { type: 'weekly', times: 3 }, { startDate: '2026-02-23' })],
      logs: { t: toDates([
        '2026-02-23', '2026-02-25', '2026-02-27', // week of 02-23: met
        '2026-03-02', '2026-03-03', // week of 03-02: only 2, missed
        '2026-03-09', '2026-03-10', '2026-03-15', // week of 03-09: met (Sunday counts)
        '2026-03-16', // current week: 1 so far, still open
      ]) },
    });
    assert.deepStrictEqual(await streaksShown(page, 't'), { current: '1 week', best: '1 week' });
    await open(page, '#/week');
    await page.locator('[data-testid="week-progress"]').waitFor();
    assert.strictEqual(await page.locator('[data-testid="week-progress"]').innerText(), '1 of 3');

    // With Sunday-first weeks, 03-15 moves into the current window: 03-08 week has 2, and the current has 2.
    await open(page, '#/settings');
    await page.locator('.segment', { hasText: 'Sunday' }).click();
    assert.deepStrictEqual(await streaksShown(page, 't'), { current: '0 weeks', best: '1 week' });
    await open(page, '#/week');
    await page.locator('[data-testid="week-progress"]').waitFor();
    assert.strictEqual(await page.locator('[data-testid="week-progress"]').innerText(), '2 of 3');
  },

  'N-per-week skips lower the target, and a partial first week requires less': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, {
      habits: [
        habit('s', 'Skips', { type: 'weekly', times: 3 }, { startDate: '2026-03-02' }),
        habit('p', 'Partial', { type: 'weekly', times: 5 }, { startDate: '2026-03-07' }), // Saturday: 2 days left that week
      ],
      logs: {
        s: {
          ...toDates(['2026-03-02', '2026-03-03']), '2026-03-04': { skipped: true }, // 2 done + 1 skip = met
          '2026-03-09': { skipped: true }, '2026-03-10': { skipped: true }, '2026-03-11': { skipped: true }, // fully excused
        },
        p: toDates(['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13']),
      },
    });
    // Week of 03-02 met, 03-09 excused, 03-16 open.
    assert.deepStrictEqual(await streaksShown(page, 's'), { current: '1 week', best: '1 week' });
    // Partial first week (2 of 2) then a full week (5 of 5).
    assert.deepStrictEqual(await streaksShown(page, 'p'), { current: '2 weeks', best: '2 weeks' });
  },

  'every-N-days streaks count cycles from the start date': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, {
      habits: [habit('c', 'Every 3', { type: 'interval', every: 3, anchor: '2026-03-01' }, { startDate: '2026-03-01' })],
      logs: { c: {
        '2026-03-01': { value: 1 }, // cycle 03-01..03: met on day one
        '2026-03-06': { value: 1 }, // cycle 03-04..06: met on the last day
        // cycle 03-07..09: missed
        '2026-03-11': { value: 1 }, // cycle 03-10..12: met
        '2026-03-13': { skipped: true }, // cycle 03-13..15: excused
        // cycle 03-16..18: today is its last day, still open
      } },
    });
    assert.deepStrictEqual(await streaksShown(page, 'c'), { current: '1 cycle', best: '2 cycles' });
    await open(page, '#/today');
    assert.match(await row(page, 'Every 3').locator('.row-meta').innerText(), /Every 3 days, due today/);
    await page.getByRole('button', { name: 'Complete Every 3' }).click();
    assert.deepStrictEqual(await streaksShown(page, 'c'), { current: '2 cycles', best: '2 cycles' });
  },

  'pure logic: exact values for periods, streaks and windows': async ({ page, assert }) => {
    const results = await page.evaluate(() => {
      const { Streaks: S, Schedule: Sch, Stats: St, Dates: D } = window.Rhythm;
      const mk = (schedule, startDate, target = { type: 'check' }) => ({ schedule, startDate, target, archivedOn: null });
      const week = mk({ type: 'weekly', times: 2 }, '2026-03-04'); // A Wednesday
      const met = (dates) => Object.fromEntries(dates.map((d) => [d, { value: 1 }]));
      const count = mk({ type: 'daily' }, '2026-03-01', { type: 'count', amount: 8, unit: 'glasses', step: 1 });
      const archived = { ...mk({ type: 'daily' }, '2026-03-01'), archivedOn: '2026-03-03' };
      return {
        monday: Sch.periods(week, '2026-03-16', 1).map((p) => `${p.start}/${p.required}`),
        sunday: Sch.periods(week, '2026-03-16', 0).map((p) => `${p.start}/${p.required}`),
        lateCycle: Sch.periods(mk({ type: 'interval', every: 5, anchor: '2026-03-01' }, '2026-03-08'), '2026-03-18', 1).map((p) => `${p.start}..${p.end}`),
        partialIsNotDone: S.compute(count, { '2026-03-01': { value: 8 }, '2026-03-02': { value: 7.5 }, '2026-03-03': { value: 9 } }, '2026-03-04', 1),
        archivedFrozen: S.compute(archived, met(['2026-03-01', '2026-03-02', '2026-03-03']), '2026-06-01', 1),
        notStarted: S.compute(mk({ type: 'daily' }, '2026-04-01'), {}, '2026-03-18', 1),
        leap: [D.addDays('2024-02-28', 1), D.addDays('2024-02-29', 1), D.addDays('2025-02-28', 1), D.addDays('2026-12-31', 1)],
        weekdayOf: [D.weekday('2026-03-08'), D.weekday('1999-12-31'), D.startOfWeek('2026-03-01', 1), D.startOfWeek('2026-03-01', 0)],
        shades: [0, 0.1, 0.34, 0.67, 1].map(St.shade),
      };
    });
    assert.deepStrictEqual(results.monday, ['2026-03-02/2', '2026-03-09/2', '2026-03-16/2']);
    assert.deepStrictEqual(results.sunday, ['2026-03-01/2', '2026-03-08/2', '2026-03-15/2']);
    assert.deepStrictEqual(results.lateCycle, ['2026-03-06..2026-03-10', '2026-03-11..2026-03-15', '2026-03-16..2026-03-20']);
    assert.deepStrictEqual(results.partialIsNotDone, { current: 1, best: 1 });
    assert.deepStrictEqual(results.archivedFrozen, { current: 3, best: 3 });
    assert.deepStrictEqual(results.notStarted, { current: 0, best: 0 });
    assert.deepStrictEqual(results.leap, ['2024-02-29', '2024-03-01', '2025-03-01', '2027-01-01']);
    assert.deepStrictEqual(results.weekdayOf, [0, 5, '2026-02-23', '2026-03-01']);
    assert.deepStrictEqual(results.shades, [0, 1, 2, 3, 4]);
  },

  'dates stay correct across both DST changes': async ({ page, assert, context }) => {
    // 8 March 2026 has 23 hours in New York.
    await freeze(page, context, '2026-03-08T23:30:00-04:00');
    assert.strictEqual(await page.locator('h1').innerText(), 'Sunday, March 8');
    const daily = habit('d', 'Daily', { type: 'daily' }, { startDate: '2026-03-02' });
    const spring = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'];
    await importState(page, { habits: [daily], logs: { d: toDates(spring.slice(0, 7)) } });
    assert.deepStrictEqual(await streaksShown(page, 'd'), { current: '7 days', best: '7 days' });

    await page.clock.setFixedTime(new Date('2026-03-09T00:30:00-04:00'));
    await page.reload({ waitUntil: 'load' });
    await open(page, '#/today');
    assert.strictEqual(await page.locator('h1').innerText(), 'Monday, March 9');
    assert.deepStrictEqual(await streaksShown(page, 'd'), { current: '7 days', best: '7 days' });

    // 1 November 2026 has 25 hours: 23:30 that night is still the 1st, though 24.5 hours have passed since midnight.
    await page.clock.setFixedTime(new Date('2026-11-01T23:30:00-05:00'));
    const fall = ['2026-10-30', '2026-10-31', '2026-11-01'];
    await importState(page, { habits: [habit('f', 'Fall', { type: 'daily' }, { startDate: '2026-10-30' })], logs: { f: toDates(fall) } });
    assert.deepStrictEqual(await streaksShown(page, 'f'), { current: '3 days', best: '3 days' });
    await open(page, '#/today');
    assert.strictEqual(await page.locator('h1').innerText(), 'Sunday, November 1');

    // The same instant is a different local date on the far side of the date line.
    await freeze(page, context, '2026-11-01T23:30:00-05:00', 'Pacific/Auckland');
    await open(page, '#/today');
    assert.strictEqual(await page.locator('h1').innerText(), 'Monday, November 2');
  },

  'statistics: exact completion rate, trend and best weekday': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00'); // Wed. 30-day window starts 02-17.
    await importState(page, {
      habits: [habit('d', 'Daily', { type: 'daily' }, { startDate: '2026-03-09' })],
      logs: { d: {
        // Mon 03-09 .. Tue 03-17: 9 elapsed days, 6 done, 1 skipped, 2 missed. Today unfinished.
        ...toDates(['2026-03-09', '2026-03-10', '2026-03-11', '2026-03-13', '2026-03-16', '2026-03-17']),
        '2026-03-12': { skipped: true },
      } },
    });
    await open(page, '#/stats');
    const tile = (id) => page.locator(`[data-testid="${id}"]`);
    await tile('stat-rate').waitFor();
    assert.strictEqual(await tile('stat-rate').locator('.tile-value').innerText(), '75%'); // 6 of 8
    assert.strictEqual(await tile('stat-rate').locator('.tile-note').innerText(), '6 of 8');
    assert.strictEqual(await tile('stat-week').locator('.tile-value').innerText(), '100%'); // 2 of 2, today open
    // Mon 2/2, Tue 2/2, Wed 1/1 (today excluded): Monday comes first on a tie.
    assert.strictEqual(await tile('stat-weekday').locator('.tile-value').innerText(), 'Monday');
    assert.strictEqual(await tile('stat-streak').locator('.tile-value').innerText(), '2 days');

    const trendRows = await page.locator('[data-testid="trend-table"] tbody tr').allInnerTexts();
    assert.strictEqual(trendRows.length, 12);
    const clean = (text) => text.replace(/\s+/g, ' ').trim();
    assert.strictEqual(clean(trendRows[9]), 'Mar 2 0 0 -');
    assert.strictEqual(clean(trendRows[10]), 'Mar 9 4 6 67%'); // Mon-Sun: 4 done, 1 skip, 2 missed
    assert.strictEqual(clean(trendRows[11]), 'Mar 16 2 2 100%');

    // Completing today adds to both the rate and the current week.
    await open(page, '#/today');
    await page.getByRole('button', { name: 'Complete Daily' }).click();
    await open(page, '#/stats');
    await tile('stat-rate').waitFor();
    assert.strictEqual(await tile('stat-rate').locator('.tile-note').innerText(), '7 of 9');
    assert.strictEqual(await tile('stat-rate').locator('.tile-value').innerText(), '78%');
  },

  'N-per-week rates give partial credit, and open weeks only count what is done': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, {
      habits: [habit('t', 'Three', { type: 'weekly', times: 3 }, { startDate: '2026-03-02' })],
      logs: { t: toDates(['2026-03-02', '2026-03-03', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-16']) },
    });
    await open(page, '#/stats');
    const rate = page.locator('[data-testid="stat-rate"]');
    await rate.waitFor();
    // 2 of 3, then 3 of 3 (a fourth doesn't over-credit), then 1 done so far.
    assert.strictEqual(await rate.locator('.tile-note').innerText(), '6 of 7');
    assert.strictEqual(await rate.locator('.tile-value').innerText(), '86%');
  },

  'backfilling from the week grid updates streaks, with keyboard control': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, {
      habits: [
        habit('d', 'Daily', { type: 'daily' }, { startDate: '2026-03-16' }),
        habit('w', 'Water', { type: 'daily' }, { startDate: '2026-03-16', target: { type: 'count', amount: 8, unit: 'glasses', step: 1 } }),
      ],
      logs: { d: toDates(['2026-03-17']) },
    });
    await open(page, '#/week');
    const dailyRow = page.locator('tr[data-habit="d"]');
    const streak = dailyRow.locator('[data-testid="week-streak"]');
    assert.strictEqual(await streak.innerText(), '1 day');

    // A future day can't be logged.
    assert.strictEqual(await dailyRow.locator('button[data-date="2026-03-19"]').count(), 0);

    // Click cycles empty, done, skipped, empty.
    const monday = dailyRow.locator('button[data-date="2026-03-16"]');
    await monday.click();
    assert.strictEqual(await streak.innerText(), '2 days');
    await dailyRow.locator('button[data-date="2026-03-16"]').click();
    assert.match(await dailyRow.locator('button[data-date="2026-03-16"]').getAttribute('aria-label'), /skipped/);
    assert.strictEqual(await streak.innerText(), '1 day');
    await dailyRow.locator('button[data-date="2026-03-16"]').click();
    assert.match(await dailyRow.locator('button[data-date="2026-03-16"]').getAttribute('aria-label'), /not logged/);

    // Last week, before the start date: backfilling moves the start back and joins the run.
    await page.getByRole('button', { name: 'Previous week' }).click();
    await page.getByRole('heading', { name: 'Mar 9 to 15, 2026' }).waitFor();
    await page.locator('tr[data-habit="d"] button[data-date="2026-03-15"]').click();
    await open(page, '#/week');
    await page.locator('tr[data-habit="d"]').waitFor();
    await page.locator('tr[data-habit="d"] button[data-date="2026-03-16"]').click();
    assert.strictEqual(await page.locator('tr[data-habit="d"] [data-testid="week-streak"]').innerText(), '3 days');

    // Arrow keys move through the grid and Enter acts on the focused cell.
    await page.locator('tr[data-habit="d"] button[data-date="2026-03-17"]').focus();
    await page.keyboard.press('ArrowLeft');
    assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.date), '2026-03-16');
    await page.keyboard.press('ArrowDown');
    assert.strictEqual(await page.evaluate(() => document.activeElement.closest('tr').dataset.habit), 'w');

    // A measurable cell opens the exact-value dialog.
    await page.keyboard.press('Enter');
    await page.getByLabel('Amount (glasses)').fill('6');
    await page.getByRole('button', { name: 'Save' }).click();
    assert.strictEqual(await page.locator('tr[data-habit="w"] button[data-date="2026-03-16"]').innerText(), '6');
    assert.match(await page.locator('tr[data-habit="w"] button[data-date="2026-03-16"]').getAttribute('aria-label'), /partly done, 6 of 8 glasses/);
  },

  'year heatmaps show each day per habit and overall': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, {
      habits: [
        habit('w', 'Water', { type: 'daily' }, { startDate: '2025-06-01', target: { type: 'count', amount: 8, unit: 'glasses', step: 1 } }),
        habit('d', 'Daily', { type: 'daily' }, { startDate: '2026-03-01' }),
      ],
      logs: {
        w: { '2026-03-10': { value: 8 }, '2026-03-11': { value: 2 }, '2026-03-12': { skipped: true }, '2025-07-04': { value: 8 } },
        d: { '2026-03-10': { value: 1 } },
      },
    });
    await open(page, '#/habit/w');
    const cell = (date) => page.locator(`rect[data-date="${date}"]`);
    await cell('2026-03-10').waitFor();
    assert.match(await cell('2026-03-10').getAttribute('class'), /hm-4/);
    assert.match(await cell('2026-03-11').getAttribute('class'), /hm-1/); // 2 of 8 is a quarter
    assert.match(await cell('2026-03-12').getAttribute('class'), /hm-skip/);
    assert.match(await cell('2026-03-13').getAttribute('class'), /hm-0/);
    await cell('2026-03-11').hover();
    assert.strictEqual(await page.locator('.heatmap-readout').innerText(), 'Wed, Mar 11, 2026: 2 of 8 glasses');

    // Year picker: 2025 shows only that calendar year and marks no future days.
    await page.getByLabel('Heatmap range').selectOption('2025');
    assert.match(await cell('2025-07-04').getAttribute('class'), /hm-4/);
    assert.strictEqual(await page.locator('rect[data-date]').count(), 365);
    assert.strictEqual(await cell('2024-12-31').count(), 0);
    await page.getByLabel('Heatmap range').selectOption('past');

    // Clicking a day opens its log, and the change shows immediately.
    await cell('2026-03-13').click();
    await page.getByLabel('Amount (glasses)').fill('8');
    await page.getByRole('button', { name: 'Save' }).click();
    assert.match(await cell('2026-03-13').getAttribute('class'), /hm-4/);

    await open(page, '#/stats');
    await cell('2026-03-10').waitFor();
    assert.match(await cell('2026-03-10').getAttribute('class'), /hm-4/); // both done
    assert.match(await cell('2026-03-11').getAttribute('class'), /hm-0/); // nothing done, 2 due
    await cell('2026-03-10').hover();
    assert.strictEqual(await page.locator('.heatmap-readout').innerText(), 'Tue, Mar 10, 2026: 2 of 2 done');
    await cell('2026-03-10').click();
    await page.getByRole('heading', { name: 'Mar 9 to 15, 2026' }).waitFor();
  },

  'journal notes save, search, delete with undo and persist': async ({ page, assert, context, reload }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, { habits: [habit('d', 'Daily', { type: 'daily' })], logs: { d: toDates(['2026-03-14']) }, notes: { '2026-03-14': 'A quiet Saturday.' } });
    await open(page, '#/today');
    await page.getByLabel('Daily note').fill('Slept well, long walk with a podcast.');
    await reload();
    await open(page, '#/journal');
    await page.locator('.note-list a', { hasText: 'A quiet Saturday.' }).waitFor();
    assert.strictEqual(await page.getByLabel('Note', { exact: true }).inputValue(), 'Slept well, long walk with a podcast.');
    assert.strictEqual(await page.locator('.note-list li').count(), 2);

    await page.getByLabel('Search notes').fill('podcast');
    assert.strictEqual(await page.locator('.note-list li').count(), 1);
    await page.getByLabel('Search notes').fill('no such words');
    await page.getByText('No notes contain "no such words".').waitFor();
    await page.getByLabel('Search notes').fill('');

    await page.locator('.note-list a', { hasText: 'A quiet Saturday.' }).click();
    await page.getByRole('heading', { name: 'Saturday, March 14, 2026' }).waitFor();
    assert.match(await page.locator('.day-summary').innerText(), /Done: Daily/);
    await page.getByRole('button', { name: 'Delete note' }).click();
    assert.strictEqual(await page.locator('.note-list li').count(), 1);
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await page.locator('.note-list li').count(), 2);
    assert.strictEqual(await page.getByLabel('Note', { exact: true }).inputValue(), 'A quiet Saturday.');
  },

  'export JSON and CSV, then import restores the data exactly': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    await importState(page, {
      habits: [
        habit('d', 'Say "hi", daily', { type: 'daily' }),
        habit('w', '=Water', { type: 'daily', }, { target: { type: 'count', amount: 8, unit: 'glasses', step: 1 } }),
      ],
      logs: { d: { '2026-03-16': { value: 1 }, '2026-03-17': { skipped: true } }, w: { '2026-03-16': { value: 5 } } },
      notes: { '2026-03-16': 'Line one, with comma', '2026-03-10': 'Only a note' },
    });

    const download = async (name) => {
      const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
      return { filename: file.suggestedFilename(), text: fs.readFileSync(await file.path(), 'utf8') };
    };

    const csv = await download('Export CSV');
    assert.strictEqual(csv.filename, 'rhythm-2026-03-18.csv');
    assert.deepStrictEqual(csv.text.trim().split('\r\n'), [
      'date,habit,status,value,target,unit,daily_note',
      '2026-03-10,,,,,,Only a note',
      '2026-03-16,"Say ""hi"", daily",done,1,1,,"Line one, with comma"',
      "2026-03-16,'=Water,partial,5,8,glasses,",
      '2026-03-17,"Say ""hi"", daily",skipped,,1,,',
    ]);

    const json = await download('Export JSON');
    assert.strictEqual(json.filename, 'rhythm-2026-03-18.json');
    const parsed = JSON.parse(json.text);
    assert.strictEqual(parsed.app, 'rhythm');
    assert.strictEqual(parsed.habits.length, 2);

    // Wipe, then import the export, then undo the import.
    await page.setInputFiles('#import-file', { name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'rhythm', version: 1, habits: [] })) });
    await page.getByText('Stored in this browser: 0 habits, 0 notes.').waitFor();
    await page.setInputFiles('#import-file', { name: 'back.json', mimeType: 'application/json', buffer: Buffer.from(json.text) });
    await page.getByText('Stored in this browser: 2 habits, 2 notes.').waitFor();
    const again = await download('Export JSON');
    const { exportedAt: a, ...first } = parsed;
    const { exportedAt: b, ...second } = JSON.parse(again.text);
    assert.deepStrictEqual(second, first);
  },

  'import rejects bad files with a clear message and changes nothing': async ({ page, assert }) => {
    await page.goto(page.url().split('#')[0] + '#/settings');
    const summary = await page.getByText(/^Stored in this browser/).innerText();
    const attempt = async (content, expected) => {
      await page.setInputFiles('#import-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(content) });
      await page.getByRole('alert').getByText(expected).waitFor();
    };
    await attempt('{ not json', 'This file is not valid JSON.');
    await attempt('{"foo":1}', 'This file is not a Rhythm export.');
    await attempt('{"app":"rhythm","version":99,"habits":[]}', /newer version/);
    await attempt('{"app":"rhythm","version":1,"habits":"none"}', 'The file has no list of habits.');
    await attempt(JSON.stringify({ app: 'rhythm', version: 1, habits: [{ id: 'x', name: 'Bad', schedule: { type: 'weekly', times: 40 }, target: { type: 'check' } }] }), 'Habit 1: has an invalid schedule.');
    await attempt(JSON.stringify({ app: 'rhythm', version: 1, habits: [{ id: 'x', name: 'Bad', schedule: { type: 'daily' }, target: { type: 'check' } }], logs: { x: { 'not-a-date': { value: 1 } } } }), /is not a valid log/);
    assert.strictEqual(await page.getByText(/^Stored in this browser/).innerText(), summary);
  },

  'corrupt or blocked storage cannot crash the app': async ({ page, assert, reload }) => {
    await page.evaluate(() => localStorage.setItem('rhythm:data', '{{{ not json'));
    await reload();
    await page.getByText('Saved data could not be read').waitFor();
    assert.ok(await page.locator('.habit-row').count() > 0);

    // Well-formed JSON with one bad habit keeps the good one.
    await page.evaluate(() => localStorage.setItem('rhythm:data', JSON.stringify({ habits: [
      { id: 'ok', name: 'Survivor', schedule: { type: 'daily' }, target: { type: 'check' }, startDate: 'garbage' },
      { id: 'bad', name: 'Broken', schedule: { type: 'nope' }, target: { type: 'check' } },
      'not even an object',
    ], logs: { ok: { 'bad-date': { value: 1 }, '2026-01-01': { value: -5 } } }, notes: 7 })));
    await reload();
    assert.deepStrictEqual(await page.locator('.row-name').allInnerTexts(), ['Survivor']);

    // Storage that throws on every call: the app still runs in memory.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    await reload();
    await page.locator('.row-name').first().waitFor();
    await page.getByRole('button', { name: /^Complete/ }).first().click();
    await page.getByRole('button', { name: /^Undo/ }).first().waitFor();
    await page.evaluate(() => { location.hash = '#/settings'; });
    await page.getByText('Browser storage is unavailable').waitFor();
  },

  'reminders fire once as notifications when permission is granted': async ({ page, assert, context }) => {
    await page.addInitScript(() => {
      window.__sent = [];
      class FakeNotification {
        constructor(title, options) { window.__sent.push(options.body); }
        static requestPermission() { FakeNotification.permission = 'granted'; return Promise.resolve('granted'); }
      }
      FakeNotification.permission = 'default';
      window.Notification = FakeNotification;
    });
    await freeze(page, context, '2026-03-18T08:10:00-04:00');
    await importState(page, { habits: [
      habit('a', 'Due now', { type: 'daily' }, { reminder: '08:00' }),
      habit('b', 'Later', { type: 'daily' }, { reminder: '09:00' }),
      habit('c', 'Long past', { type: 'daily' }, { reminder: '07:00' }),
      habit('d', 'Done already', { type: 'daily' }, { reminder: '08:05' }),
    ], logs: { d: { '2026-03-18': { value: 1 } } } });
    assert.match(await page.locator('[data-testid="permission-text"]').innerText(), /will ask for permission/);
    await page.getByLabel('Remind me while this tab is open').check();
    await page.getByText(/Notifications are allowed/).waitFor();
    assert.deepStrictEqual(await page.evaluate(() => window.__sent), ['Reminder: Due now']);
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() => window.Rhythm.Reminders.check());
    assert.deepStrictEqual(await page.evaluate(() => window.__sent), [], 'not repeated after a reload');
  },

  'denied notifications and iframes fall back to in-app reminders': async ({ page, assert, context }) => {
    await page.addInitScript(() => {
      window.Notification = class { constructor() { throw new Error('should not be constructed'); } static requestPermission() { return Promise.resolve('denied'); } };
      window.Notification.permission = 'denied';
    });
    await freeze(page, context, '2026-03-18T08:10:00-04:00');
    await importState(page, { habits: [habit('a', 'Stretch', { type: 'daily' }, { reminder: '08:00' })] });
    assert.match(await page.locator('[data-testid="permission-text"]').innerText(), /blocked for this site/);
    await page.getByLabel('Remind me while this tab is open').check();
    const toast = page.locator('.toast', { hasText: 'Reminder: Stretch' });
    await toast.waitFor();
    await toast.getByRole('button', { name: 'Mark done' }).click();
    await open(page, '#/today');
    await page.getByRole('button', { name: 'Undo Stretch' }).waitFor();

    // Inside an iframe, no prompt is attempted and the page says why.
    const url = page.url().split('#')[0];
    const embedded = await context.newPage();
    await embedded.goto(url);
    await embedded.evaluate((src) => {
      document.body.innerHTML = '';
      const frame = document.createElement('iframe');
      frame.id = 'f';
      frame.src = `${src}#/settings`;
      document.body.appendChild(frame);
    }, url);
    const frame = await (await embedded.waitForSelector('#f')).contentFrame();
    const text = frame.locator('[data-testid="permission-text"]');
    await text.waitFor();
    const nativeState = await frame.evaluate(() => Notification.permission);
    if (nativeState !== 'granted') assert.match(await text.innerText(), /embedded pages/);
    await frame.getByRole('button', { name: 'Send a test reminder' }).click();
    await frame.locator('.toast', { hasText: 'Test reminder' }).waitFor();
    await embedded.close();
  },

  'theme toggle is remembered, and Escape closes modals': async ({ page, assert, reload }) => {
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await background();
    await page.locator('#theme-toggle').click();
    const dark = await background();
    assert.notStrictEqual(light, dark);
    await reload();
    assert.strictEqual(await background(), dark);

    await page.getByRole('button', { name: 'Add habit' }).first().click();
    await page.getByLabel('Name').waitFor();
    assert.strictEqual(await page.evaluate(() => document.activeElement.tagName), 'INPUT');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.modal').count(), 0);
    assert.strictEqual(await page.evaluate(() => document.activeElement.textContent), 'Add habit', 'focus returns to the opener');
  },

  'search filters habits, archived habits leave Today, and long or huge values stay contained': async ({ page, assert, context }) => {
    await freeze(page, context, '2026-03-18T12:00:00-04:00');
    const long = 'A very long habit name that keeps going well past any reasonable length here';
    await importState(page, { habits: [
      habit('l', long, { type: 'daily' }, { target: { type: 'count', amount: 1000000, unit: 'steps', step: 500 } }),
      habit('r', 'Read', { type: 'daily' }),
      habit('g', 'Gone', { type: 'daily' }, { archivedOn: '2026-03-10' }),
    ], logs: { l: { '2026-03-18': { value: 999999.5 } } } });

    await open(page, '#/today');
    assert.deepStrictEqual(await page.locator('.row-name').allInnerTexts(), [long, 'Read']);
    await page.getByRole('link', { name: 'Stats' }).click();
    await page.getByLabel('Show statistics for').waitFor();

    await open(page, '#/habits');
    await page.getByLabel('Search habits').fill('rea');
    const shown = () => page.locator('.manage-row .row-name').allInnerTexts();
    assert.deepStrictEqual(await shown(), [long, 'Read']);
    await page.getByLabel('Search habits').fill('zzz');
    await page.getByText('No habits match "zzz".').waitFor();
    await page.getByLabel('Search habits').fill('');

    await page.setViewportSize({ width: 390, height: 780 });
    for (const route of ['today', 'week', 'habits', 'habit/l', 'stats', 'journal', 'settings']) {
      await open(page, `#/${route}`);
      await page.waitForTimeout(80);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `${route} overflows by ${overflow}px at 390px`);
    }
  },
};
