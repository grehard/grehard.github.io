// Feature tests for Laneboard. Expected orders come from the seed workspace:
//   Backlog     HSR-1 2 3 4       Ready (limit 5)      HSR-5 6 7
//   In progress HSR-8 9 10 11 (limit 3, one over)      In review (limit 2) HSR-12 13
//   Done        HSR-14 15 16      Archive              HSR-17 18
const fs = require('fs');

const card = (page, key) => page.locator(`.card:has(.card-key:text-is("${key}"))`);
const lane = (page, name) => page.locator(`.lane:has(.lane-name:text-is("${name}"))`);

const laneKeys = (page, name) => lane(page, name).locator('.card .card-key').allTextContents();
const laneNames = (page) => page.locator('.lane .lane-name').allTextContents();
const visibleKeys = (page) => page.locator('.lane .card .card-key').allTextContents();

async function wipOf(page, name) {
  const target = lane(page, name);
  const className = await target.getAttribute('class');
  return {
    level: /wip-(\w+)/.exec(className)[1],
    count: (await target.locator('.lane-count').textContent()).trim(),
    status: (await target.locator('.lane-status-text').textContent()).trim(),
  };
}

async function centerOf(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

// A real mouse drag: press, move in steps, release. `drop` picks the point inside the target.
async function mouseDrag(page, from, to) {
  const start = await centerOf(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.waitForTimeout(40);
  await page.mouse.move(to.x + 1, to.y, { steps: 1 }); // Settles after the slot has shifted the layout.
  await page.mouse.up();
}

async function dragBefore(page, key, targetKey) {
  const { box } = await centerOf(card(page, targetKey));
  await mouseDrag(page, card(page, key), { x: box.x + box.width / 2, y: box.y + 4 });
}

async function dragToEnd(page, key, laneName) {
  const list = lane(page, laneName).locator('.lane-cards');
  const { box } = await centerOf(list);
  await mouseDrag(page, card(page, key), { x: box.x + box.width / 2, y: box.y + box.height - 8 });
}

async function openMenu(page, key) {
  await card(page, key).hover();
  await card(page, key).locator('.card-menu').click();
}

const menuItem = (page, name) => page.locator('.menu [role="menuitem"]', { hasText: new RegExp(`^${name}$`) });

async function chooseFromMenu(page, key, name) {
  await openMenu(page, key);
  await menuItem(page, name).click();
}

const undoFromToast = (page) => page.locator('.toast .toast-action').click();
const openTab = (page, name) => page.locator('.view-tab', { hasText: name }).click();

function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = {
  'first run shows seeded lanes with exact limit states': async ({ page, assert }) => {
    assert.deepStrictEqual(await laneNames(page), ['Backlog', 'Ready', 'In progress', 'In review', 'Done']);
    assert.deepStrictEqual(await laneKeys(page, 'In progress'), ['HSR-8', 'HSR-9', 'HSR-10', 'HSR-11']);
    assert.deepStrictEqual(await wipOf(page, 'Backlog'), { level: 'none', count: '4', status: 'No limit' });
    assert.deepStrictEqual(await wipOf(page, 'Ready'), { level: 'under', count: '3 / 5', status: '2 free' });
    assert.deepStrictEqual(await wipOf(page, 'In progress'), { level: 'over', count: '4 / 3', status: '1 over limit' });
    assert.deepStrictEqual(await wipOf(page, 'In review'), { level: 'at', count: '2 / 2', status: 'At limit' });
    const line = lane(page, 'In progress').locator('.lane-cards > li');
    assert.strictEqual((await line.nth(3).textContent()).trim(), 'Limit 3', 'limit line sits after the third card');
    assert.strictEqual(await lane(page, 'In progress').locator('.gauge .tick.is-over').count(), 1);
  },

  'mouse drag across lanes sets exact order and limit states, and survives reload': async ({ page, assert, reload }) => {
    await dragBefore(page, 'HSR-8', 'HSR-13');
    assert.deepStrictEqual(await laneKeys(page, 'In progress'), ['HSR-9', 'HSR-10', 'HSR-11']);
    assert.deepStrictEqual(await laneKeys(page, 'In review'), ['HSR-12', 'HSR-8', 'HSR-13']);
    assert.deepStrictEqual(await wipOf(page, 'In progress'), { level: 'at', count: '3 / 3', status: 'At limit' });
    assert.deepStrictEqual(await wipOf(page, 'In review'), { level: 'over', count: '3 / 2', status: '1 over limit' });
    await page.locator('.toast', { hasText: 'In review is now 1 over its limit of 2' }).waitFor();
    await reload();
    assert.deepStrictEqual(await laneKeys(page, 'In review'), ['HSR-12', 'HSR-8', 'HSR-13']);
    assert.deepStrictEqual(await wipOf(page, 'In review'), { level: 'over', count: '3 / 2', status: '1 over limit' });
    await card(page, 'HSR-8').locator('.card-open').click();
    await page.locator('.activity-text', { hasText: 'Moved from In progress to In review' }).waitFor();
  },

  'mouse drag within a lane reorders exactly and a drop in place changes nothing': async ({ page, assert }) => {
    await dragBefore(page, 'HSR-7', 'HSR-5');
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-7', 'HSR-5', 'HSR-6']);
    await dragToEnd(page, 'HSR-5', 'Ready');
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-7', 'HSR-6', 'HSR-5']);
    // Dragging away and back to the same gap is not a move.
    const undoTitle = await page.locator('#undo-btn').getAttribute('aria-label');
    const start = await centerOf(card(page, 'HSR-6'));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 3, start.y + 40, { steps: 3 });
    await page.mouse.move(start.x, start.y, { steps: 3 });
    await page.mouse.up();
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-7', 'HSR-6', 'HSR-5']);
    assert.strictEqual(await page.locator('#undo-btn').getAttribute('aria-label'), undoTitle);
    assert.strictEqual(await page.locator('.panel').isVisible(), false, 'a drag must not open the card');
  },

  'mouse drag reorders lanes, Escape cancels a drag': async ({ page, assert }) => {
    const head = lane(page, 'Done').locator('.lane-name');
    const ready = await centerOf(lane(page, 'Ready'));
    await mouseDrag(page, head, { x: ready.box.x + 20, y: ready.box.y + 40 });
    assert.deepStrictEqual(await laneNames(page), ['Backlog', 'Done', 'Ready', 'In progress', 'In review']);
    assert.deepStrictEqual(await laneKeys(page, 'Done'), ['HSR-14', 'HSR-15', 'HSR-16']);
    await undoFromToast(page);
    assert.deepStrictEqual(await laneNames(page), ['Backlog', 'Ready', 'In progress', 'In review', 'Done']);

    const start = await centerOf(card(page, 'HSR-1'));
    const target = await centerOf(card(page, 'HSR-5'));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.locator('.drag-ghost').waitFor();
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.strictEqual(await page.locator('.drag-ghost').count(), 0);
    assert.deepStrictEqual(await laneKeys(page, 'Backlog'), ['HSR-1', 'HSR-2', 'HSR-3', 'HSR-4']);
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7']);
  },

  'touch: a long press drags a card, a swipe does not': async ({ page, assert }) => {
    const touchContext = await page.context().browser().newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
    const touchPage = await touchContext.newPage();
    await touchPage.goto(page.url());
    const cdp = await touchContext.newCDPSession(touchPage);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

    const start = await centerOf(card(touchPage, 'HSR-1'));
    const target = await centerOf(card(touchPage, 'HSR-6'));
    await touch('touchStart', start.x, start.y);
    await touchPage.waitForTimeout(300);
    for (let i = 1; i <= 8; i++) {
      await touch('touchMove', start.x + ((target.x - start.x) * i) / 8, start.y + ((target.box.y + 4 - start.y) * i) / 8);
      await touchPage.waitForTimeout(16);
    }
    await touch('touchEnd');
    assert.deepStrictEqual(await laneKeys(touchPage, 'Backlog'), ['HSR-2', 'HSR-3', 'HSR-4']);
    assert.deepStrictEqual(await laneKeys(touchPage, 'Ready'), ['HSR-5', 'HSR-1', 'HSR-6', 'HSR-7']);

    // Moving straight away is a scroll gesture, not a drag.
    const swipe = await centerOf(card(touchPage, 'HSR-2'));
    await touch('touchStart', swipe.x, swipe.y);
    for (let i = 1; i <= 5; i++) await touch('touchMove', swipe.x + i * 30, swipe.y);
    await touch('touchEnd');
    assert.deepStrictEqual(await laneKeys(touchPage, 'Backlog'), ['HSR-2', 'HSR-3', 'HSR-4']);
    assert.strictEqual(await touchPage.locator('.drag-ghost').count(), 0);
    await touchContext.close();
  },

  'keyboard: M opens Move to, arrows choose, focus stays on the card': async ({ page, assert }) => {
    await card(page, 'HSR-8').locator('.card-open').focus();
    await page.keyboard.press('m');
    assert.strictEqual(await page.locator('.menu .menu-heading').first().textContent(), 'Move to');
    assert.strictEqual(await page.evaluate(() => document.activeElement.textContent), 'Backlog');
    await page.keyboard.press('ArrowDown');
    assert.strictEqual(await page.evaluate(() => document.activeElement.textContent), 'Ready');
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7', 'HSR-8']);
    assert.deepStrictEqual(await wipOf(page, 'In progress'), { level: 'at', count: '3 / 3', status: 'At limit' });
    const focusedKey = await page.evaluate(() => document.activeElement.closest('.card').querySelector('.card-key').textContent);
    assert.strictEqual(focusedKey, 'HSR-8');

    await page.keyboard.press('Enter'); // Focus is on the card's menu button, so this reopens the menu.
    await menuItem(page, 'Move to top').focus();
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-8', 'HSR-5', 'HSR-6', 'HSR-7']);
    await page.keyboard.press('Enter');
    await menuItem(page, 'Move down').focus();
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-8', 'HSR-6', 'HSR-7']);
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.locator('.menu').count(), 1);
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.menu').count(), 0);
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-8', 'HSR-6', 'HSR-7']);

    // Lanes have the same keyboard path.
    await lane(page, 'Ready').locator('[aria-label="Lane actions for Ready"]').focus();
    await page.keyboard.press('Enter');
    await menuItem(page, 'Move lane left').focus();
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await laneNames(page), ['Ready', 'Backlog', 'In progress', 'In review', 'Done']);
  },

  'undo walks back moves, deletes and archives in exact reverse order': async ({ page, assert }) => {
    await dragToEnd(page, 'HSR-8', 'Ready');
    await dragBefore(page, 'HSR-1', 'HSR-3');
    await chooseFromMenu(page, 'HSR-5', 'Delete');
    await chooseFromMenu(page, 'HSR-10', 'Archive');
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-6', 'HSR-7', 'HSR-8']);
    assert.deepStrictEqual(await laneKeys(page, 'Backlog'), ['HSR-2', 'HSR-1', 'HSR-3', 'HSR-4']);
    assert.deepStrictEqual(await laneKeys(page, 'In progress'), ['HSR-9', 'HSR-11']);

    await undoFromToast(page); // Archive
    assert.deepStrictEqual(await laneKeys(page, 'In progress'), ['HSR-9', 'HSR-10', 'HSR-11']);
    await page.locator('#undo-btn').click(); // Delete
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7', 'HSR-8']);
    await page.locator('.topbar-title h1').click(); // Moves focus off the toolbar button.
    await page.keyboard.press('Control+z'); // Reorder
    assert.deepStrictEqual(await laneKeys(page, 'Backlog'), ['HSR-1', 'HSR-2', 'HSR-3', 'HSR-4']);
    await page.keyboard.press('Control+z'); // First move
    assert.deepStrictEqual(await laneKeys(page, 'In progress'), ['HSR-8', 'HSR-9', 'HSR-10', 'HSR-11']);
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7']);
    assert.deepStrictEqual(await wipOf(page, 'In progress'), { level: 'over', count: '4 / 3', status: '1 over limit' });
    assert.strictEqual(await page.locator('#undo-btn').isDisabled(), true);
  },

  'undoing a move keeps edits made after the move': async ({ page, assert }) => {
    await dragToEnd(page, 'HSR-5', 'Backlog');
    await card(page, 'HSR-5').locator('.card-open').click();
    await page.fill('#card-title', 'Design the nav drawer');
    await page.locator('#card-priority').selectOption('urgent');
    await page.locator('#undo-btn').click();
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7']);
    assert.strictEqual(await card(page, 'HSR-5').locator('.card-open').textContent(), 'Design the nav drawer');
    assert.strictEqual(await page.locator('#card-priority').inputValue(), 'urgent');
  },

  'filter combinations give exact card sets': async ({ page, assert }) => {
    const pick = (id, value) => page.locator(id).selectOption(value);
    const count = () => page.locator('#filter-count').textContent();

    await pick('#filter-assignee', { label: 'Tomas Eklund' });
    assert.deepStrictEqual(await visibleKeys(page), ['HSR-3', 'HSR-7', 'HSR-8', 'HSR-9']);
    assert.strictEqual(await count(), '4 of 16 cards');

    await pick('#filter-label', { label: 'Bug' });
    assert.deepStrictEqual(await visibleKeys(page), ['HSR-9']);

    await pick('#filter-label', '');
    await page.locator('.filter-toggle').click();
    assert.deepStrictEqual(await visibleKeys(page), ['HSR-8', 'HSR-9']);

    await page.fill('#filter-text', 'footer');
    assert.deepStrictEqual(await visibleKeys(page), ['HSR-9']);
    assert.strictEqual(await count(), '1 of 16 cards');

    await page.locator('#filter-clear').click();
    assert.strictEqual((await visibleKeys(page)).length, 16);
    assert.strictEqual(await page.locator('#filter-clear').isVisible(), false);

    await page.locator('.filter-toggle').click();
    assert.deepStrictEqual(await visibleKeys(page), ['HSR-8', 'HSR-9', 'HSR-13'], 'overdue ignores past dates in the finished lane');
    await pick('#filter-label', { label: 'Bug' });
    assert.deepStrictEqual(await visibleKeys(page), ['HSR-9', 'HSR-13']);
    await pick('#filter-assignee', { label: 'Ines Varga' });
    assert.deepStrictEqual(await visibleKeys(page), []);
    assert.strictEqual(await page.locator('.lane-empty', { hasText: 'No matching cards' }).count(), 5);
    assert.deepStrictEqual(await wipOf(page, 'In progress'), { level: 'over', count: '4 / 3', status: '1 over limit' }, 'limits count hidden cards');
    assert.strictEqual(await page.locator('.limit-line').count(), 0);

    await page.locator('#filter-clear').click();
    await page.fill('#filter-text', 'structure url');
    assert.deepStrictEqual(await visibleKeys(page), ['HSR-2'], 'every word must match, in any order');
    await page.fill('#filter-text', 'hsr-12');
    assert.deepStrictEqual(await visibleKeys(page), ['HSR-12'], 'card keys are searchable');
    await page.fill('#filter-text', 'sandbox keys');
    assert.deepStrictEqual(await visibleKeys(page), ['HSR-10'], 'descriptions are searchable');
    await page.fill('#filter-text', '');

    await page.locator('.rail-member', { hasText: 'Noor Haddad' }).click();
    assert.deepStrictEqual(await visibleKeys(page), ['HSR-1', 'HSR-6', 'HSR-16']);
    assert.strictEqual(await page.locator('#filter-assignee option:checked').textContent(), 'Noor Haddad');
  },

  'moves under a filter leave hidden cards in place': async ({ page, assert }) => {
    const realOrder = async (name) => {
      await page.locator('#filter-assignee').selectOption('');
      const keys = await laneKeys(page, name);
      await page.locator('#filter-assignee').selectOption({ label: 'Tomas Eklund' });
      return keys;
    };
    await page.locator('#filter-assignee').selectOption({ label: 'Tomas Eklund' });
    await dragBefore(page, 'HSR-9', 'HSR-8');
    assert.deepStrictEqual(await realOrder('In progress'), ['HSR-9', 'HSR-8', 'HSR-10', 'HSR-11']);
    // HSR-7 is the only visible card in Ready; dropping above it lands above it, not at index 0.
    await dragBefore(page, 'HSR-8', 'HSR-7');
    assert.deepStrictEqual(await realOrder('Ready'), ['HSR-5', 'HSR-6', 'HSR-8', 'HSR-7']);
    await dragToEnd(page, 'HSR-8', 'Ready');
    assert.deepStrictEqual(await realOrder('Ready'), ['HSR-5', 'HSR-6', 'HSR-7', 'HSR-8']);

    await chooseFromMenu(page, 'HSR-7', 'Move down');
    assert.deepStrictEqual(await realOrder('Ready'), ['HSR-5', 'HSR-6', 'HSR-8', 'HSR-7']);
    await chooseFromMenu(page, 'HSR-7', 'Move up');
    assert.deepStrictEqual(await realOrder('Ready'), ['HSR-5', 'HSR-6', 'HSR-7', 'HSR-8']);
  },

  'card details: every field saves, logs activity and persists': async ({ page, assert, reload }) => {
    await card(page, 'HSR-3').locator('.card-open').click();
    await page.fill('#card-title', 'Add event structured data');
    await page.fill('#card-description', 'Covers listing and detail pages.');
    await page.locator('#card-assignee').selectOption({ label: 'Yuki Tanabe' });
    await page.locator('#card-priority').selectOption('high');
    await page.fill('#card-due', isoOffset(3));
    await page.locator('.label-option', { hasText: 'Research' }).click();
    await page.fill('#check-new', 'Event schema');
    await page.keyboard.press('Enter');
    await page.fill('#check-new', 'Validate in the testing tool');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.locator('.check-summary').textContent(), '0 of 2 (0%)');
    await page.locator('.check-item input[type="checkbox"]').first().check();
    assert.strictEqual(await page.locator('.check-summary').textContent(), '1 of 2 (50%)');
    assert.strictEqual(await page.locator('.progress').getAttribute('aria-valuenow'), '50');
    await page.fill('#note-new', 'Checked with the search team.');
    await page.keyboard.press('Enter');

    await reload();
    assert.strictEqual(await card(page, 'HSR-3').locator('.card-open').textContent(), 'Add event structured data');
    assert.strictEqual(await card(page, 'HSR-3').locator('.check-badge').textContent(), '1/2');
    assert.strictEqual(await card(page, 'HSR-3').locator('.avatar').getAttribute('aria-label'), 'Yuki Tanabe');
    await card(page, 'HSR-3').locator('.card-open').click();
    assert.strictEqual(await page.inputValue('#card-title'), 'Add event structured data');
    assert.strictEqual(await page.inputValue('#card-description'), 'Covers listing and detail pages.');
    assert.strictEqual(await page.inputValue('#card-priority'), 'high');
    assert.strictEqual(await page.inputValue('#card-due'), isoOffset(3));
    assert.strictEqual(await page.locator('.label-option.is-on', { hasText: 'Research' }).count(), 1);
    assert.strictEqual(await page.locator('.check-summary').textContent(), '1 of 2 (50%)');
    const log = await page.locator('.activity-text').allTextContents();
    assert.strictEqual(log[0], 'Note: Checked with the search team.');
    for (const text of ['Renamed to "Add event structured data"', 'Edited the description', 'Assigned to Yuki Tanabe', 'Priority set to High', 'Added label Research', 'Checked "Event schema"']) {
      assert.ok(log.includes(text), `activity log should include: ${text}`);
    }
    assert.ok(/\d{4}, \d+:\d\d (AM|PM)/.test(await page.locator('.activity-entry time').first().textContent()), 'entries are timestamped');

    await page.fill('#card-title', '   ');
    await page.locator('.panel-head').click();
    await page.locator('.panel .field-error', { hasText: 'A card needs a title' }).waitFor();
    assert.strictEqual(await page.inputValue('#card-title'), 'Add event structured data');

    await page.locator('.check-item').first().hover();
    await page.locator('.check-item .icon-btn').first().click();
    assert.strictEqual(await page.locator('.check-summary').textContent(), '0 of 1 (0%)');
    await undoFromToast(page);
    assert.strictEqual(await page.locator('.check-summary').textContent(), '1 of 2 (50%)');

    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.panel').isVisible(), false);
  },

  'team list edits flow to cards, with validation and undo': async ({ page, assert }) => {
    await page.locator('.rail-edit').first().click();
    await page.fill('#add-team', 'Tomas Eklund');
    await page.keyboard.press('Enter');
    await page.locator('.editor-add .field-error', { hasText: 'already' }).waitFor();
    await page.fill('#add-team', '  ');
    await page.keyboard.press('Enter');
    await page.locator('.editor-add .field-error', { hasText: 'Enter a member name' }).waitFor();
    await page.fill('#add-team', 'Dana Reyes');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.locator('.editor-row').count(), 6);

    await page.locator('.editor-row input').nth(1).fill('Tomas E.');
    await page.locator('.modal-head h2').click();
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.modal').count(), 0);
    assert.strictEqual(await card(page, 'HSR-8').locator('.avatar').getAttribute('aria-label'), 'Tomas E.');

    await card(page, 'HSR-1').locator('.card-open').click();
    await page.locator('#card-assignee').selectOption({ label: 'Dana Reyes' });
    assert.strictEqual(await card(page, 'HSR-1').locator('.avatar').textContent(), 'DR');
    await page.keyboard.press('Escape');

    await page.locator('.rail-edit').first().click();
    await page.locator('[aria-label="Remove Tomas E."]').click();
    assert.strictEqual(await page.locator('.editor-row').count(), 5);
    await page.keyboard.press('Escape');
    assert.strictEqual(await card(page, 'HSR-8').locator('.avatar').getAttribute('aria-label'), 'Unassigned');
    await page.locator('#undo-btn').click();
    assert.strictEqual(await card(page, 'HSR-8').locator('.avatar').getAttribute('aria-label'), 'Tomas E.');
  },

  'calendar places cards on their due dates and navigates months': async ({ page, assert }) => {
    await openTab(page, 'Calendar');
    const inCell = (date) => page.locator(`td[data-date="${date}"] .cal-chip-title`).allTextContents();
    assert.deepStrictEqual(await inCell(isoOffset(0)), ['Homepage layout, second round']);
    assert.deepStrictEqual(await inCell(isoOffset(-1)), ['Fix footer overlap on small screens']);
    assert.strictEqual(await page.locator(`td[data-date="${isoOffset(-1)}"] .cal-chip.is-overdue`).count(), 1);
    assert.strictEqual(await page.locator(`td[data-date="${isoOffset(0)}"]`).getAttribute('class'), 'cal-day is-today');

    const monthName = (offset) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + offset, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };
    assert.strictEqual(await page.locator('.cal-month').textContent(), monthName(0));
    await page.locator('[aria-label="Next month"]').click();
    assert.strictEqual(await page.locator('.cal-month').textContent(), monthName(1));
    await page.locator('[aria-label="Previous month"]').click();
    await page.locator('[aria-label="Previous month"]').click();
    assert.strictEqual(await page.locator('.cal-month').textContent(), monthName(-1));
    await page.locator('.cal-head .btn', { hasText: 'Today' }).click();
    assert.strictEqual(await page.locator('.cal-month').textContent(), monthName(0));

    // Filters apply here too, and a chip opens the card.
    await page.locator('#filter-assignee').selectOption({ label: 'Tomas Eklund' });
    assert.deepStrictEqual(await inCell(isoOffset(0)), []);
    await page.locator(`td[data-date="${isoOffset(-1)}"] .cal-chip`).click();
    assert.strictEqual(await page.inputValue('#card-title'), 'Fix footer overlap on small screens');
    await page.keyboard.press('Escape');

    // Adding from a day presets its date.
    await page.locator('#filter-clear').click();
    await page.locator(`td[data-date="${isoOffset(0)}"]`).hover();
    await page.locator(`td[data-date="${isoOffset(0)}"] .cal-add`).click();
    assert.strictEqual(await page.inputValue('#new-card-due'), isoOffset(0));
    await page.fill('#new-card-title', 'Print proofs');
    await page.keyboard.press('Enter');
    assert.deepStrictEqual((await inCell(isoOffset(0))).sort(), ['Homepage layout, second round', 'Print proofs']);
  },

  'table sorts on each column with exact orders': async ({ page, assert }) => {
    await openTab(page, 'Table');
    const keys = () => page.locator('.data-table tbody .cell-key').allTextContents();
    const sortBy = (label) => page.locator('.sort-btn', { hasText: label }).click();
    const n = (list) => list.map((x) => `HSR-${x}`);

    assert.deepStrictEqual(await keys(), n([16, 14, 15, 13, 8, 9, 12, 10, 7, 5, 11, 6, 2, 4, 1, 3]), 'default is due date ascending');
    assert.strictEqual(await page.locator('th[data-sort-key="due"]').getAttribute('aria-sort'), 'ascending');
    await sortBy('Due');
    assert.deepStrictEqual(await keys(), n([1, 4, 2, 6, 11, 5, 7, 10, 12, 9, 8, 13, 15, 14, 16, 3]), 'descending keeps the undated card last');
    assert.strictEqual(await page.locator('th[data-sort-key="due"]').getAttribute('aria-sort'), 'descending');
    await sortBy('Priority');
    assert.deepStrictEqual(await keys(), n([9, 5, 8, 10, 12, 13, 2, 4, 6, 7, 11, 14, 15, 1, 3, 16]));
    assert.strictEqual(await page.locator('th[data-sort-key="due"]').getAttribute('aria-sort'), 'none');
    await sortBy('Card');
    assert.deepStrictEqual(await keys(), n([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]));
    await sortBy('Lane');
    assert.deepStrictEqual(await keys(), n([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]));
    await sortBy('Lane');
    assert.deepStrictEqual(await keys(), n([14, 15, 16, 12, 13, 8, 9, 10, 11, 5, 6, 7, 1, 2, 3, 4]));
    await sortBy('Checklist');
    assert.deepStrictEqual(await keys(), n([1, 4, 12, 8, 10, 13, 14, 2, 3, 5, 6, 7, 9, 11, 15, 16]), 'percent ascending, cards without a checklist last');
    await sortBy('Title');
    assert.strictEqual((await keys())[0], 'HSR-13');
    await sortBy('Assignee');
    assert.deepStrictEqual((await keys()).slice(0, 3), n([4, 13, 5]));

    await page.locator('#filter-assignee').selectOption({ label: 'Noor Haddad' });
    assert.deepStrictEqual(await keys(), n([1, 6, 16]));
    await page.locator('.cell-title .link-btn').first().click();
    assert.strictEqual(await page.inputValue('#card-title'), 'Migrate press archive from the old site');
  },

  'archive and restore, delete from archive with undo': async ({ page, assert }) => {
    await chooseFromMenu(page, 'HSR-5', 'Archive');
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-6', 'HSR-7']);
    await openTab(page, 'Archive');
    const rows = () => page.locator('.archive-row .card-key').allTextContents();
    assert.deepStrictEqual(await rows(), ['HSR-5', 'HSR-17', 'HSR-18']);
    assert.strictEqual(await page.locator('.view-tab .tab-count').textContent(), '3');
    await page.locator('.archive-detail', { hasText: 'from Ready' }).first().waitFor();

    await page.locator('[aria-label="Delete HSR-17"]').click();
    assert.deepStrictEqual(await rows(), ['HSR-5', 'HSR-18']);
    await undoFromToast(page);
    assert.deepStrictEqual(await rows(), ['HSR-5', 'HSR-17', 'HSR-18']);

    await page.locator('[aria-label="Restore HSR-5"]').click();
    assert.deepStrictEqual(await rows(), ['HSR-17', 'HSR-18']);
    await openTab(page, 'Board');
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-6', 'HSR-7', 'HSR-5'], 'restored to the bottom of its old lane');
    await card(page, 'HSR-5').locator('.card-open').click();
    await page.locator('.activity-text', { hasText: 'Restored to Ready' }).waitFor();
    await page.keyboard.press('Escape');

    await page.locator('#undo-btn').click();
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-6', 'HSR-7']);
    await page.locator('#undo-btn').click();
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7'], 'undoing the archive returns it to its exact position');
  },

  'lane editing validates limits, and deleting a lane moves its cards with undo': async ({ page, assert }) => {
    const actions = (name) => lane(page, name).locator(`[aria-label="Lane actions for ${name}"]`);
    await actions('In progress').click();
    await menuItem(page, 'Edit lane and limit').click();
    const limitError = page.locator('.field-error', { hasText: 'whole number from 1 to 999' });
    for (const bad of ['0', 'abc', '2.5', '1000', '-1']) {
      await page.fill('#lane-limit', bad);
      await page.keyboard.press('Enter');
      await limitError.waitFor();
      assert.strictEqual(await page.locator('.modal').count(), 1, `limit "${bad}" must be rejected`);
    }
    await page.fill('#lane-name', '');
    await page.fill('#lane-limit', '4');
    await page.keyboard.press('Enter');
    await page.locator('.field-error', { hasText: 'Enter a name for the lane' }).waitFor();
    await page.fill('#lane-name', 'Doing now');
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await wipOf(page, 'Doing now'), { level: 'at', count: '4 / 4', status: 'At limit' });

    await actions('Doing now').click();
    await menuItem(page, 'Edit lane and limit').click();
    await page.fill('#lane-limit', '');
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await wipOf(page, 'Doing now'), { level: 'none', count: '4', status: 'No limit' });

    await actions('Doing now').click();
    await menuItem(page, 'Edit lane and limit').click();
    await page.fill('#lane-limit', '20');
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await wipOf(page, 'Doing now'), { level: 'under', count: '4 / 20', status: '16 free' });

    await page.locator('.add-lane').click();
    await page.fill('#lane-name', 'Blocked');
    await page.fill('#lane-limit', '1');
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await laneNames(page), ['Backlog', 'Ready', 'Doing now', 'In review', 'Done', 'Blocked']);

    await actions('Doing now').click();
    await menuItem(page, 'Delete lane').click();
    await page.locator('#lane-delete-destination').selectOption({ label: 'Move to Ready' });
    await page.locator('.modal .btn-primary').click();
    assert.deepStrictEqual(await laneNames(page), ['Backlog', 'Ready', 'In review', 'Done', 'Blocked']);
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7', 'HSR-8', 'HSR-9', 'HSR-10', 'HSR-11']);
    await undoFromToast(page);
    assert.deepStrictEqual(await laneNames(page), ['Backlog', 'Ready', 'Doing now', 'In review', 'Done', 'Blocked']);
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7']);
    assert.deepStrictEqual(await laneKeys(page, 'Doing now'), ['HSR-8', 'HSR-9', 'HSR-10', 'HSR-11']);

    await actions('Blocked').click();
    await menuItem(page, 'Delete lane').click();
    assert.strictEqual(await lane(page, 'Blocked').count(), 0, 'an empty lane deletes without asking');
  },

  'adding a card validates and renders user text as text': async ({ page, assert, reload }) => {
    await page.locator('#add-card').click();
    await page.keyboard.press('Enter');
    await page.locator('.field-error', { hasText: 'Enter a title' }).waitFor();
    assert.strictEqual(await page.locator('.modal').count(), 1);
    const nasty = '<img src=x onerror="window.__pwned=1"> & <b>bold</b>';
    await page.fill('#new-card-title', nasty);
    await page.locator('#new-card-lane').selectOption({ label: 'Ready' });
    await page.locator('#new-card-assignee').selectOption({ label: 'Ines Varga' });
    await page.locator('#new-card-priority').selectOption('urgent');
    await page.fill('#new-card-due', isoOffset(1));
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7', 'HSR-19'], 'new cards take the next number');
    assert.deepStrictEqual(await wipOf(page, 'Ready'), { level: 'under', count: '4 / 5', status: '1 free' });
    assert.strictEqual(await card(page, 'HSR-19').locator('.card-open').textContent(), nasty);
    assert.strictEqual(await page.locator('.card img').count(), 0);
    assert.strictEqual(await page.evaluate(() => window.__pwned), undefined);

    const long = 'Reconcile '.repeat(25).trim();
    await page.locator('#add-card').click();
    await page.fill('#new-card-title', long);
    await page.keyboard.press('Enter');
    const box = await card(page, 'HSR-20').boundingBox();
    const laneBox = await lane(page, 'Backlog').boundingBox();
    assert.ok(box.x + box.width <= laneBox.x + laneBox.width, 'long titles wrap inside the lane');

    await reload();
    assert.strictEqual(await card(page, 'HSR-19').locator('.card-open').textContent(), nasty);
  },

  'export and import round trip, with bad files rejected in the UI': async ({ page, assert }) => {
    await dragBefore(page, 'HSR-7', 'HSR-5');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.rail-tool', { hasText: 'Export JSON' }).click()]);
    assert.ok(/^laneboard-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()));
    const file = await download.path();
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(exported.format, 'laneboard');
    assert.strictEqual(exported.projects.length, 3);
    assert.strictEqual(exported.team.length, 5);
    assert.deepStrictEqual(exported.projects[0].columns[1].cardIds.map((id) => exported.projects[0].cards[id].number), [7, 5, 6]);

    await page.locator('.rail-tool', { hasText: 'Reset demo data' }).click();
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7']);

    await page.locator('.rail-tool', { hasText: 'Import JSON' }).click();
    const importText = async (name, text) => {
      await page.setInputFiles('#import-file', { name, mimeType: 'application/json', buffer: Buffer.from(text) });
    };
    const errors = page.locator('#import-errors');
    await importText('broken.json', '{ not json');
    await errors.locator('li', { hasText: 'not valid JSON' }).waitFor();
    await importText('other.json', '{"hello":"world"}');
    await errors.locator('li', { hasText: 'not a Laneboard export' }).waitFor();
    const noTitle = JSON.parse(JSON.stringify(exported));
    noTitle.projects[0].cards[noTitle.projects[0].columns[0].cardIds[0]].title = '';
    await importText('notitle.json', JSON.stringify(noTitle));
    await errors.locator('li', { hasText: 'has no title' }).waitFor();
    const noLanes = JSON.parse(JSON.stringify(exported));
    noLanes.projects[1].columns = [];
    await importText('nolanes.json', JSON.stringify(noLanes));
    await errors.locator('li', { hasText: 'needs at least one lane' }).waitFor();
    assert.strictEqual(await page.locator('.modal').count(), 1, 'a failed import keeps the dialog open');
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7'], 'board unchanged by bad files');

    await page.setInputFiles('#import-file', file);
    await page.locator('.toast', { hasText: 'Imported 3 projects' }).waitFor();
    assert.strictEqual(await page.locator('.modal').count(), 0);
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-7', 'HSR-5', 'HSR-6']);
    await undoFromToast(page);
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7']);
  },

  'reset demo data restores the seed, and can be undone': async ({ page, assert, reload }) => {
    await chooseFromMenu(page, 'HSR-1', 'Delete');
    await dragToEnd(page, 'HSR-8', 'Done');
    await reload();
    assert.deepStrictEqual(await laneKeys(page, 'Backlog'), ['HSR-2', 'HSR-3', 'HSR-4']);
    await page.locator('.rail-tool', { hasText: 'Reset demo data' }).click();
    assert.deepStrictEqual(await laneKeys(page, 'Backlog'), ['HSR-1', 'HSR-2', 'HSR-3', 'HSR-4']);
    assert.deepStrictEqual(await laneKeys(page, 'In progress'), ['HSR-8', 'HSR-9', 'HSR-10', 'HSR-11']);
    await undoFromToast(page);
    assert.deepStrictEqual(await laneKeys(page, 'Backlog'), ['HSR-2', 'HSR-3', 'HSR-4']);
    await page.locator('.rail-tool', { hasText: 'Reset demo data' }).click();
    await reload();
    assert.deepStrictEqual(await laneKeys(page, 'Backlog'), ['HSR-1', 'HSR-2', 'HSR-3', 'HSR-4']);
  },

  'projects: create, switch, rename, delete with undo, each with its own board': async ({ page, assert, reload }) => {
    await page.locator('[aria-label="New project"]').click();
    await page.keyboard.press('Enter');
    await page.locator('.field-error', { hasText: 'Enter a name' }).waitFor();
    await page.fill('#project-name', 'harbor street SITE');
    await page.keyboard.press('Enter');
    await page.locator('.field-error', { hasText: 'already has this name' }).waitFor();
    await page.fill('#project-name', 'Spring fair');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.locator('.topbar-title h1').textContent(), 'Spring fair');
    assert.deepStrictEqual(await laneNames(page), ['To do', 'Doing', 'Done']);
    assert.deepStrictEqual(await wipOf(page, 'Doing'), { level: 'under', count: '0 / 3', status: '3 free' });
    assert.strictEqual(await page.locator('.lane-empty', { hasText: 'No cards yet' }).count(), 3);

    await page.locator('#add-card').click();
    await page.fill('#new-card-title', 'Book the stage');
    await page.keyboard.press('Enter');
    assert.deepStrictEqual(await laneKeys(page, 'To do'), ['SF-1']);

    await page.locator('.rail-item', { hasText: 'Field app 2.4 release' }).click();
    assert.deepStrictEqual(await laneNames(page), ['Planned', 'Building', 'Testing', 'Shipped']);
    assert.deepStrictEqual(await laneKeys(page, 'Building'), ['FLD-4', 'FLD-5']);

    await reload();
    assert.strictEqual(await page.locator('.topbar-title h1').textContent(), 'Field app 2.4 release', 'the open project survives a reload');

    await page.locator('.rail-item', { hasText: 'Spring fair' }).click();
    await page.locator('[aria-label="Project actions for Spring fair"]').click();
    await menuItem(page, 'Rename project').click();
    await page.fill('#project-name', 'Spring street fair');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.locator('.topbar-title h1').textContent(), 'Spring street fair');

    await page.locator('[aria-label="Project actions for Spring street fair"]').click();
    await menuItem(page, 'Delete project').click();
    assert.strictEqual(await page.locator('.rail-item', { hasText: 'Spring street fair' }).count(), 0);
    assert.strictEqual(await page.locator('.topbar-title h1').textContent(), 'Customer onboarding');
    await undoFromToast(page);
    assert.strictEqual(await page.locator('.topbar-title h1').textContent(), 'Spring street fair');
    assert.deepStrictEqual(await laneKeys(page, 'To do'), ['SF-1']);
  },

  'corrupt or blocked storage cannot break the app': async ({ page, assert, reload }) => {
    await page.evaluate(() => localStorage.setItem('laneboard.state', '{"format":"laneboard","projects":[{"id":1}]}'));
    await reload();
    await page.locator('.toast', { hasText: 'could not be read' }).waitFor();
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7']);

    await page.evaluate(() => localStorage.setItem('laneboard.state', 'not json at all'));
    await reload();
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7']);

    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    await reload();
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7']);
    await dragBefore(page, 'HSR-7', 'HSR-5');
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-7', 'HSR-5', 'HSR-6']);
    await page.locator('.rail-tool', { hasText: 'Dark theme' }).click();
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  },

  'theme choice is remembered and modals close with Escape, returning focus': async ({ page, assert, reload }) => {
    await page.locator('.rail-tool', { hasText: 'Dark theme' }).click();
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await reload();
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(17, 20, 26)');
    await page.locator('.rail-tool', { hasText: 'Light theme' }).click();
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(244, 245, 247)');

    await page.locator('#add-card').focus();
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'new-card-title');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.modal').count(), 0);
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'add-card');

    await card(page, 'HSR-2').locator('.card-open').focus();
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.locator('.panel').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.panel').isVisible(), false);
    assert.strictEqual(await page.evaluate(() => document.activeElement.closest('.card').querySelector('.card-key').textContent), 'HSR-2');
  },

  'phone width: views stay inside the screen and the menu moves cards': async ({ page, assert }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok((await overflow()) <= 0);
    await card(page, 'HSR-1').locator('.card-menu').click({ force: true });
    const box = await page.locator('.menu').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 780, 'menu fits the screen');
    await menuItem(page, 'Ready').click();
    assert.deepStrictEqual(await laneKeys(page, 'Ready'), ['HSR-5', 'HSR-6', 'HSR-7', 'HSR-1']);

    for (const name of ['Calendar', 'Table', 'Archive', 'Board']) {
      await openTab(page, name);
      assert.ok((await overflow()) <= 0, `${name} overflows at 390px`);
    }
    await openTab(page, 'Table');
    const wrap = await page.locator('.table-wrap').evaluate((el) => el.scrollWidth > el.clientWidth);
    assert.ok(wrap, 'the table scrolls inside its own container');
    await page.locator('.cell-title .link-btn').first().click();
    const panel = await page.locator('.panel').boundingBox();
    assert.deepStrictEqual([panel.x, panel.width], [0, 390], 'details cover the screen');
    await page.locator('.panel-close').click();

    await page.locator('.rail-open-btn').click();
    assert.strictEqual(await page.locator('.rail').isVisible(), true);
    await page.locator('.rail-item', { hasText: 'Customer onboarding' }).click();
    assert.strictEqual(await page.locator('.rail').isVisible(), false);
    assert.strictEqual(await page.locator('.topbar-title h1').textContent(), 'Customer onboarding');
  },
};
