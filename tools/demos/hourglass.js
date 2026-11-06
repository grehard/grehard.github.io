// One-minute story: a consultant tracks a task, fixes up the day and the week, then bills it.
const NAME = 'Hourglass';
const TAGLINE = 'Time tracking and timesheets for freelancers and consultants';
const SCOPE = ['Timer that survives reloads, plus focus sessions', 'Day timeline and editable week timesheet', 'Rates, budgets, reports and printable timesheets'];

/** Today's first ordinary entry, whatever time of day the demo runs. */
async function firstEntryToday(page) {
  return page.evaluate(() => {
    const today = HG.time.today();
    const dayStart = HG.time.dayStart(today);
    const items = HG.store.state.entries.filter((e) => e.start >= dayStart && HG.time.dayKey(e.start) === today && e.end - e.start >= 40 * 60000);
    items.sort((a, b) => a.start - b.start);
    const first = items[0];
    return { id: first.id, name: first.description, from: HG.time.timeOfDay(first.start + 10 * 60000), to: HG.time.timeOfDay(first.start + 40 * 60000) };
  });
}

async function quickFill(d, selector, value) {
  await d.move(selector, 200);
  await d.page.locator(selector).fill(value);
  await d.wait(80);
}

async function run(d) {
  const { page } = d;
  await d.caption("Hourglass opens on today's timeline, with budget alerts and recent tasks on top", 1100);
  await d.type('#timer-description', 'Refund flow accessibility fixes', { delay: 15, hold: 100 });
  await d.select('#timer-project', 'p-audit', { hold: 80 });

  await d.caption('The timer is stored as a start timestamp, and it counts in the tab title', 400);
  await d.click('#timer-toggle', { hold: 1050 });

  await page.reload({ waitUntil: 'load' });
  await d.caption('After a reload it carries on from the same start time, because nothing was counting', 1800);
  await d.click('#timer-toggle', { hold: 200 });

  const target = await firstEntryToday(page);
  await d.click('#add-entry', { hold: 150 });
  await quickFill(d, '#entry-start', target.from);
  await quickFill(d, '#entry-end', target.to);
  await d.caption('Overlaps are caught as you type, naming the entry and by how long', 1700);

  await quickFill(d, '#entry-start', '23:30');
  await quickFill(d, '#entry-end', '00:45');
  await d.caption('An end before the start means next day, and each day gets its own share of the time', 3600);
  await d.press('Escape', 150);

  await d.caption('Split an entry at an exact minute. Both parts keep the project and tags', 200);
  await d.click(`#entry-list .entry-row[data-entry="${target.id}"] .entry-actions button:nth-child(2)`, { hold: 200 });
  await d.move('#split-slider', 300);
  await page.locator('#split-slider').focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  await d.wait(350);
  await d.click('#split-save', { hold: 300 });

  await d.caption('The week grid is a real timesheet: type 3:15, 1.5 or 90m into any cell', 200);
  await d.click('#nav-week', { hold: 150 });
  await d.click('#week-prev', { hold: 250 });
  await d.type('.ts-cell[data-row="1"][data-col="2"]', '3:15', { delay: 60, hold: 100 });
  await d.press('Tab', 700);

  await d.caption('Focus sessions run work and break intervals, with a chime built in Web Audio', 200);
  await d.click('#nav-focus', { hold: 150 });
  await d.type('#timer-description', 'Audit findings write-up', { delay: 12, hold: 80 });
  await d.click('#focus-start', { hold: 900 });
  await d.click('#focus-skip', { hold: 700 });

  await d.caption('Choose none, 6 or 15 minute rounding. It applies once per entry, and timers stay exact', 200);
  await d.click('#nav-settings', { hold: 250 });
  await d.select('#setting-rounding', '15', { hold: 1100 });

  await d.caption('Budgets track rounded hours, and warn before and after a project goes over', 200);
  await d.click('#nav-projects', { hold: 1200 });

  await d.click('#nav-reports', { hold: 500 });
  await d.poster();
  await d.caption('Reports total billable time at each project rate, with hand-built SVG charts', 2150);

  await d.caption('Filter by client, project, tag or billable, and group by project or day', 200);
  await d.select('#filter-client', 'c-kestrel', { hold: 400 });
  await d.click('#group-day', { hold: 900 });

  await d.caption('Ready to send: a printable timesheet with billable hours and the amount due', 200);
  await d.click('#report-print', { hold: 600 });
  await d.scroll(4000, null, 500);
  await d.wait(900);
}

module.exports = { name: NAME, tagline: TAGLINE, scope: SCOPE, accent: '#C2470A', run };
