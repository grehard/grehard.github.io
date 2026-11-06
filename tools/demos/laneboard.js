// A 50-second working session: rebalance an overloaded lane, recover from a bad drop, update a card,
// narrow the board with filters, check the schedule, then finish by keyboard.
const card = (key) => `.card:has(.card-key:text-is("${key}"))`;
const lane = (name) => `.lane:has(.lane-name:text-is("${name}"))`;

async function topOf(d, selector) {
  const box = await d.page.locator(selector).first().boundingBox();
  return { x: box.x + box.width / 2, y: box.y + 4 };
}

async function bottomOf(d, selector) {
  const box = await d.page.locator(selector).first().boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height - 12 };
}

module.exports = {
  name: 'Laneboard',
  tagline: 'Project board for small teams to plan and track work',
  accent: '#1767e5',
  scope: [
    'Lanes with limits and drag and drop',
    'Card details, checklists and activity',
    'Calendar, table and archive views',
    'Filters, undo, JSON export and import',
  ],
  run: async (d) => {
    await d.poster();
    await d.caption('In progress has 4 cards against a limit of 3.', 300);
    await d.move(`${lane('In progress')} .lane-status`, 400);
    await d.wait(1000);

    await d.caption('Dragging one back to Ready clears the over-limit state.', 200);
    await d.drag(card('HSR-11'), await bottomOf(d, `${lane('Ready')} .lane-cards`), { ms: 600 });
    await d.wait(600);

    await d.caption('Reordering within a lane: the urgent bug goes first.', 200);
    await d.drag(card('HSR-9'), await topOf(d, card('HSR-8')), { ms: 400 });
    await d.wait(600);

    await d.caption('In review is full: it warns on hover, and Undo reverses it.', 200);
    await d.move(card('HSR-10'), 300);
    await d.page.mouse.down();
    await d.wait(80);
    await d.move(await topOf(d, card('HSR-13')), 500);
    await d.wait(800);
    await d.page.mouse.up();
    await d.wait(600);
    await d.click('.toast .toast-action', { hold: 400 });

    await d.caption('Lanes drag the same way, and Ctrl+Z steps back every move.', 200);
    await d.drag(`${lane('In review')} .lane-name`, await topOf(d, lane('In progress')), { ms: 450 });
    await d.wait(500);
    await d.press('Control+z', 350);

    await d.caption('Card details: assignee, priority, labels and checklist.', 200);
    await d.click(`${card('HSR-8')} .card-open`, { hold: 300 });
    await d.select('#card-assignee', { label: 'Yuki Tanabe' }, { hold: 250 });
    await d.click('.label-option:has-text("Research")', { hold: 200 });
    await d.scroll(330, '.panel-body', 400);
    await d.click('.check-item:nth-child(4) input[type="checkbox"]', { hold: 300 });

    await d.caption('Every change lands in a timestamped activity log.', 200);
    await d.type('#note-new', 'Keyboard pass is next.', { delay: 12, hold: 100 });
    await d.press('Enter', 700);
    await d.click('.panel-close', { hold: 150 });

    await d.caption("Filters combine: one person's overdue work, at a glance.", 200);
    await d.select('#filter-assignee', { label: 'Tomas Eklund' }, { hold: 250 });
    await d.click('.filter-toggle', { hold: 700 });
    await d.click('#filter-clear', { hold: 100 });

    await d.caption('The calendar shows due dates by day, with overdue work in red.', 200);
    await d.click('.view-tab:has-text("Calendar")', { hold: 1300 });

    await d.caption('The table sorts on any column, keeping undated cards last.', 200);
    await d.click('.view-tab:has-text("Table")', { hold: 200 });
    await d.click('.sort-btn:has-text("Priority")', { hold: 900 });

    await d.caption('No mouse needed: M opens the Move to menu on a focused card.', 200);
    await d.click('.view-tab:has-text("Board")', { hold: 100 });
    await d.page.locator(`${card('HSR-12')} .card-open`).focus();
    await d.press('m', 500);
    await d.press('ArrowDown', 100);
    await d.press('ArrowDown', 100);
    await d.press('ArrowDown', 200);
    await d.press('Enter', 600);

    await d.caption('Archived cards stay out of the way and restore to their lane.', 200);
    await d.click(`${card('HSR-16')} .card-menu`, { hold: 200 });
    await d.click('.menu [role="menuitem"]:has-text("Archive")', { hold: 150 });
    await d.click('.view-tab:has-text("Archive")', { hold: 400 });
    await d.click('[aria-label="Restore HSR-16"]', { hold: 300 });

    await d.caption('Everything saves in the browser and exports as a JSON file.', 200);
    await d.click('.view-tab:has-text("Board")', { hold: 150 });
    await d.click('.rail-tool:has-text("Export JSON")', { hold: 700 });
  },
};
