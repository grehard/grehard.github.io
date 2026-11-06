// Scripted demo for Rhythm: a day of real use, then the long view.
// Targets are picked by state rather than by name where the seed depends on the weekday, so it works on any date.
module.exports = {
  name: 'Rhythm',
  tagline: 'A habit tracker for routines, without guilt-driven gimmicks',
  scope: ['Flexible schedules and measurable targets', 'Streaks that respect skip days', 'Year heatmaps and completion statistics'],
  accent: '#E8A317',
  run: async (d) => {
    const { page } = d;
    const nav = (name) => page.locator(`#nav a[data-nav="${name}"]`);
    const modal = page.locator('.modal');

    await d.caption('Today groups what is due by morning, afternoon and evening.', 1400);
    await d.click(page.locator('.tick-due').first(), { hold: 200 });
    await d.caption('One tap completes a habit, and the counts update right away.', 1200);

    await d.click(page.getByRole('button', { name: 'Log more Drink water' }), { hold: 200 });
    await d.caption('Measurable targets get a quick log: 4 of 8 glasses so far.', 1300);

    await d.click(page.locator('.habit-row.is-due .row-skip').last(), { hold: 200 });
    await d.caption('Not today? Skip it. The day is set aside and the streak stays intact.', 1300);
    await d.type(page.getByLabel('Daily note'), 'Early start tomorrow, so no reading tonight.', { delay: 18, hold: 200 });

    await d.caption('Any schedule: daily, set weekdays, N a week or every N days.', 100);
    await d.click(page.getByRole('button', { name: 'Add habit' }).first(), { hold: 150 });
    await d.type(modal.getByLabel('Name'), 'Practice guitar', { delay: 30, hold: 100 });
    await d.click(modal.locator('.segment', { hasText: 'Every N days' }), { hold: 300 });
    await d.click(modal.getByRole('button', { name: 'Add habit' }), { hold: 300 });

    await d.click(nav('week'), { hold: 150 });
    await d.click(page.getByRole('button', { name: 'Previous week' }), { hold: 200 });
    await d.caption('The week grid shows it all, and past days can be filled in later.', 1200);

    const stretchCell = page.locator('tr[data-habit="seed-stretch"] button.cell').nth(2);
    await d.click(stretchCell, { hold: 200 });
    await d.caption('Mark a past day as skipped and the streak carries on past it.', 1300);
    await d.click(stretchCell, { hold: 200 });
    await d.caption('Clear it instead and the streak recalculates from that gap.', 1300);
    await d.click(stretchCell, { hold: 200 });

    await d.click(nav('stats'), { hold: 300 });
    await d.caption('Statistics: completion rate, a 12-week trend and best weekday.', 1700);
    await d.poster();
    await d.scroll(280);
    await d.caption('A full year at a glance. Skipped days are left out of every rate.', 900);
    await d.move(page.locator('.heatmap rect.hm-3').nth(40));

    await d.click(page.locator('.data-table a', { hasText: 'Drink water' }), { hold: 300 });
    await d.caption('Every habit gets its own streaks, heatmap and trend.', 2100);

    await d.click(nav('habits'), { hold: 150 });
    await d.caption('Reorder by drag or arrows. Archive keeps the history, with undo.', 200);
    await d.drag(page.getByRole('button', { name: 'Drag to reorder Run' }), page.getByRole('button', { name: 'Drag to reorder Drink water' }), { ms: 500 });
    await d.click(page.getByRole('button', { name: 'Archive Read before bed' }), { hold: 300 });
    await d.click(page.locator('.toast').getByRole('button', { name: 'Undo' }).first(), { hold: 200 });

    await d.click(nav('settings'), { hold: 150 });
    await d.caption('Your data stays in your browser. Export JSON or CSV any time.', 700);
    await d.click(page.getByRole('button', { name: 'Export CSV' }), { hold: 700 });
    await d.click(nav('today'), { hold: 300 });
  },
};
