// Feature tests for Coinpath. Exact-value tests start from "Clear all data" so every
// expected balance can be worked out by hand from the amounts entered.
const fs = require('fs');

const pad = (n) => String(n).padStart(2, '0');
const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const thisMonthDay = (day) => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(day)}`; };

// Routing runs on hashchange, so wait for the new page's heading before reading it.
const go = async (page, label) => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label }).click();
  await page.locator('h1', { hasText: label }).waitFor();
};
const modal = (page) => page.locator('[role="dialog"]');
const tileValue = (page, label) => page.locator(`[data-tile="${label}"] .tile-value`);
const toast = (page) => page.locator('.toast');

async function clearAll(page) {
  await go(page, 'Settings');
  await page.getByRole('button', { name: 'Clear all data' }).click();
  await modal(page).getByRole('button', { name: 'Clear data' }).click();
  await toast(page).getByRole('button', { name: 'Dismiss' }).click();
}

async function addAccount(page, name, opening) {
  await go(page, 'Accounts');
  await page.getByRole('button', { name: 'Add account' }).first().click();
  await modal(page).getByLabel('Account name').fill(name);
  await modal(page).getByLabel('Opening balance').fill(opening);
  await modal(page).getByRole('button', { name: 'Add account' }).click();
}

async function addTx(page, { type = 'Expense', amount, date, payee, account, to, category, notes }) {
  await go(page, 'Transactions');
  await page.getByRole('button', { name: 'Add transaction' }).first().click();
  const m = modal(page);
  await m.getByRole('radio', { name: type }).check({ force: true });
  await m.getByLabel('Amount').fill(amount);
  if (date) await m.getByLabel('Date').fill(date);
  if (payee) await m.getByLabel('Description').fill(payee);
  if (account) await m.getByLabel(type === 'Transfer' ? 'From account' : 'Account', { exact: true }).selectOption({ label: account });
  if (to) await m.getByLabel('To account').selectOption({ label: to });
  if (category) await m.getByLabel('Category').selectOption({ label: category });
  if (notes) await m.getByLabel('Notes').fill(notes);
  await m.getByRole('button', { name: 'Add transaction' }).click();
}

async function addCategory(page, name) {
  await go(page, 'Settings');
  await page.locator('.category-group', { hasText: 'Expense categories' }).getByRole('button', { name: 'Add' }).click();
  await modal(page).getByLabel('Category name').fill(name);
  await modal(page).getByRole('button', { name: 'Add category' }).click();
}

async function accountBalance(page, name) {
  await go(page, 'Accounts');
  return page.locator('tr', { has: page.locator('.row-payee', { hasText: name }) }).locator('[data-balance]').innerText();
}

const balanceColumn = (page) => page.locator('.tx-table tbody tr .cell-balance').allInnerTexts();

module.exports = {
  'running balances are exact, in date order, and survive a back-dated entry': async ({ page, assert }) => {
    await clearAll(page);
    await addAccount(page, 'Main', '1000.00');
    await addTx(page, { amount: '19.99', date: daysAgo(5), payee: 'Lunch' });
    await addTx(page, { type: 'Income', amount: '250.10', date: daysAgo(3), payee: 'Refund' });
    await addTx(page, { amount: '0.11', date: daysAgo(1), payee: 'Parking' });

    await go(page, 'Transactions');
    await page.getByLabel('Account', { exact: true }).selectOption({ label: 'Main' });
    assert.deepStrictEqual(await balanceColumn(page), ['$1,230.00', '$1,230.11', '$980.01']);

    // Dated before everything else, so every later balance must move by 100.
    await addTx(page, { amount: '100.00', date: daysAgo(9), payee: 'Older bill' });
    await page.getByLabel('Account', { exact: true }).selectOption({ label: 'Main' });
    assert.deepStrictEqual(await balanceColumn(page), ['$1,130.00', '$1,130.11', '$880.01', '$900.00']);
    assert.strictEqual(await accountBalance(page, 'Main'), '$1,130.00');
  },

  'same-day entries keep entry order, and search or filters do not change balances': async ({ page, assert }) => {
    await clearAll(page);
    await addAccount(page, 'Main', '50.00');
    const day = daysAgo(2);
    await addTx(page, { amount: '10.00', date: day, payee: 'First coffee' });
    await addTx(page, { amount: '20.00', date: day, payee: 'Second lunch' });
    await addTx(page, { amount: '5.00', date: day, payee: 'Third snack' });
    await go(page, 'Transactions');
    await page.getByLabel('Account', { exact: true }).selectOption({ label: 'Main' });
    assert.deepStrictEqual(await balanceColumn(page), ['$15.00', '$20.00', '$40.00']);
    await page.getByLabel('Search').fill('second');
    assert.deepStrictEqual(await balanceColumn(page), ['$20.00']);
  },

  'transfers move balances but are not income or spending, and net worth holds': async ({ page, assert }) => {
    await clearAll(page);
    await addAccount(page, 'Checking', '2000.00');
    await addAccount(page, 'Savings', '500.00');
    await addTx(page, { amount: '75.25', payee: 'Groceries run', account: 'Checking' });
    await addTx(page, { type: 'Transfer', amount: '600.00', account: 'Checking', to: 'Savings', payee: 'Monthly saving' });

    assert.strictEqual(await accountBalance(page, 'Checking'), '$1,324.75');
    assert.strictEqual(await accountBalance(page, 'Savings'), '$1,100.00');

    await go(page, 'Dashboard');
    assert.strictEqual(await tileValue(page, 'Net worth').innerText(), '$2,424.75');
    assert.strictEqual(await tileValue(page, 'Income').innerText(), '$0.00');
    assert.strictEqual(await tileValue(page, 'Spending').innerText(), '$75.25');

    await go(page, 'Transactions');
    await page.getByLabel('Account', { exact: true }).selectOption({ label: 'Savings' });
    assert.deepStrictEqual(await balanceColumn(page), ['$1,100.00']);
    assert.match(await page.locator('.tx-table .cell-amount').nth(1).innerText(), /\+\$600\.00/);
    const summary = await page.locator('[data-summary]').innerText();
    assert.match(summary, /Income \$0\.00/);
    assert.match(summary, /Spending \$0\.00/);
  },

  'a transfer to the same account is refused': async ({ page, assert }) => {
    await clearAll(page);
    await addAccount(page, 'Only one', '10.00');
    await go(page, 'Transactions');
    await page.getByRole('button', { name: 'Add transaction' }).first().click();
    const m = modal(page);
    await m.getByRole('radio', { name: 'Transfer' }).check({ force: true });
    await m.getByLabel('Amount').fill('5');
    await m.getByRole('button', { name: 'Add transaction' }).click();
    assert.match(await m.locator('.field-error:visible').innerText(), /different account/);
  },

  'budget totals, over-budget state, and limit changes keep past months': async ({ page, assert }) => {
    await clearAll(page);
    await addCategory(page, 'Food');
    await addCategory(page, 'Fun');
    await addCategory(page, 'Other stuff');
    await addAccount(page, 'Main', '5000.00');
    await addAccount(page, 'Second', '0');
    const day = thisMonthDay(1);
    await addTx(page, { amount: '180.50', date: day, payee: 'Market', category: 'Food', account: 'Main' });
    await addTx(page, { amount: '69.50', date: day, payee: 'Bakery', category: 'Food', account: 'Main' });
    await addTx(page, { amount: '30.00', date: day, payee: 'Cinema', category: 'Fun', account: 'Main' });
    await addTx(page, { amount: '45.00', date: day, payee: 'Unbudgeted thing', category: 'Other stuff', account: 'Main' });
    await addTx(page, { type: 'Transfer', amount: '900.00', date: day, payee: 'Moved', account: 'Main', to: 'Second' });

    await go(page, 'Budgets');
    const addBudget = async (category, limit) => {
      await page.getByRole('button', { name: 'Add budget' }).first().click();
      await modal(page).getByLabel('Category').selectOption({ label: category });
      await modal(page).getByLabel('Monthly limit').fill(limit);
      await modal(page).getByRole('button', { name: 'Add budget' }).click();
    };
    await addBudget('Food', '200');
    await addBudget('Fun', '30');

    assert.strictEqual(await tileValue(page, 'Budgeted').innerText(), '$230.00');
    assert.strictEqual(await tileValue(page, 'Spent').innerText(), '$280.00');
    assert.strictEqual(await tileValue(page, 'Over budget').innerText(), '$50.00');
    assert.strictEqual(await tileValue(page, 'Unbudgeted spending').innerText(), '$45.00');

    const food = page.locator('[data-budget="Food"]');
    assert.match(await food.innerText(), /Over by \$50\.00/);
    assert.match(await food.innerText(), /125%/);
    const fun = page.locator('[data-budget="Fun"]');
    assert.ok(!(await fun.innerText()).includes('Over by'), 'exactly on the limit is not over');
    assert.match(await fun.innerText(), /\$0\.00 left/);

    await page.getByRole('button', { name: 'Edit Food budget' }).click();
    await modal(page).getByLabel('Monthly limit').fill('300');
    await modal(page).getByRole('button', { name: 'Save budget' }).click();
    assert.strictEqual(await tileValue(page, 'Budgeted').innerText(), '$330.00');
    assert.strictEqual(await tileValue(page, 'Remaining').innerText(), '$50.00');

    await page.getByRole('button', { name: 'Next month' }).click();
    assert.strictEqual(await tileValue(page, 'Budgeted').innerText(), '$330.00');
    assert.strictEqual(await tileValue(page, 'Spent').innerText(), '$0.00');
  },

  'recurring rules catch up every missed period on load, once only': async ({ page, assert }) => {
    await clearAll(page);
    await addAccount(page, 'Main', '1000.00');
    await go(page, 'Recurring');
    await page.getByRole('button', { name: 'Add rule' }).first().click();
    const m = modal(page);
    await m.getByLabel('Name').fill('Veg box');
    await m.getByLabel('Amount').fill('12.50');
    await m.getByLabel('Repeats').selectOption('weekly');
    await m.getByLabel('Next date', { exact: true }).fill(daysAgo(21));
    await m.getByRole('button', { name: 'Add rule' }).click();

    // 21, 14, 7 and 0 days ago: four periods post straight away.
    assert.match(await toast(page).innerText(), /posted 4 past occurrences/);
    assert.strictEqual(await accountBalance(page, 'Main'), '$950.00');

    // Three weeks pass with the app closed. Exactly three more periods are due.
    const later = new Date(Date.now() + 21 * 24 * 3600 * 1000);
    await page.clock.setFixedTime(later);
    await page.reload({ waitUntil: 'load' });
    assert.match(await toast(page).innerText(), /Posted 3 due recurring transactions/);
    assert.strictEqual(await accountBalance(page, 'Main'), '$912.50');

    await page.reload({ waitUntil: 'load' });
    assert.strictEqual(await accountBalance(page, 'Main'), '$912.50');
    await go(page, 'Recurring');
    assert.match(await page.locator('[data-rule="Veg box"]').innerText(), /7/);
  },

  'a monthly rule on the 31st clamps to short months and returns to the 31st': async ({ page, assert }) => {
    await clearAll(page);
    await addAccount(page, 'Main', '0');
    await page.clock.setFixedTime(new Date('2026-04-30T12:00:00'));
    await page.reload({ waitUntil: 'load' });
    await go(page, 'Recurring');
    await page.getByRole('button', { name: 'Add rule' }).first().click();
    const m = modal(page);
    await m.getByLabel('Name').fill('Card fee');
    await m.getByRole('radio', { name: 'Income' }).check({ force: true });
    await m.getByLabel('Amount').fill('1.00');
    await m.getByLabel('Next date', { exact: true }).fill('2026-01-31');
    await m.getByRole('button', { name: 'Add rule' }).click();
    await go(page, 'Transactions');
    const dates = await page.locator('.tx-table tbody .cell-date').allInnerTexts();
    assert.deepStrictEqual(dates, ['Apr 30', 'Mar 31', 'Feb 28', 'Jan 31']);
    assert.strictEqual(await accountBalance(page, 'Main'), '$4.00');
    await go(page, 'Recurring');
    assert.match(await page.locator('[data-rule="Card fee"]').innerText(), /Monthly on the 31st/);
    assert.match(await page.locator('[data-rule="Card fee"]').innerText(), /May 31, 2026/);
  },

  'pausing a rule stops it posting, and resuming skips the paused periods': async ({ page, assert }) => {
    await clearAll(page);
    await addAccount(page, 'Main', '100.00');
    await go(page, 'Recurring');
    await page.getByRole('button', { name: 'Add rule' }).first().click();
    const m = modal(page);
    await m.getByLabel('Name').fill('Gym');
    await m.getByLabel('Amount').fill('10.00');
    await m.getByLabel('Repeats').selectOption('weekly');
    const start = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await m.getByLabel('Next date', { exact: true }).fill(iso(start));
    await m.getByRole('button', { name: 'Add rule' }).click();
    await page.getByRole('button', { name: 'Pause Gym' }).click();
    await page.clock.setFixedTime(new Date(Date.now() + 15 * 24 * 3600 * 1000));
    await page.reload({ waitUntil: 'load' });
    assert.strictEqual(await accountBalance(page, 'Main'), '$100.00');
    await go(page, 'Recurring');
    await page.getByRole('button', { name: 'Resume Gym' }).click();
    assert.strictEqual(await accountBalance(page, 'Main'), '$100.00');
  },

  'first run has seed data and posts its own overdue rule': async ({ page, assert }) => {
    assert.match(await toast(page).innerText(), /Posted 2 due recurring transactions/);
    assert.match(await tileValue(page, 'Net worth').innerText(), /^\$[\d,]+\.\d\d$/);
    await go(page, 'Transactions');
    const count = Number((await page.locator('[data-summary] strong').first().innerText()).replace(/,/g, ''));
    assert.ok(count > 300, `expected rich seed data, saw ${count}`);
  },

  'charts show exact values on hover': async ({ page, assert }) => {
    await clearAll(page);
    await addCategory(page, 'Rent');
    await addAccount(page, 'Main', '0');
    await addTx(page, { type: 'Income', amount: '3000.00', date: thisMonthDay(1), payee: 'Pay' });
    await addTx(page, { amount: '1250.40', date: thisMonthDay(1), payee: 'Landlord', category: 'Rent' });
    await go(page, 'Dashboard');
    const month = thisMonthDay(1).slice(0, 7);
    await page.locator(`[data-month="${month}"]`).hover();
    const tip = await page.locator('.chart-wrap .chart-tip').innerText();
    assert.match(tip, /Income\s+\$3,000\.00/);
    assert.match(tip, /Spending\s+\$1,250\.40/);
    assert.match(tip, /Net\s+\+\$1,749\.60/);
    // A lone category is a full ring, so its bounding box center is the empty hole.
    await page.locator('.donut-slice').first().hover({ position: { x: 86, y: 12 } });
    const donutTip = await page.locator('.donut .chart-tip').innerText();
    assert.match(donutTip, /Rent/);
    assert.match(donutTip, /\$1,250\.40/);
    assert.match(donutTip, /100\.0%/);
    assert.strictEqual(await page.locator('.chart-wrap .bar-income').count(), 1);
  },

  'filters narrow by date range, account, category and search': async ({ page, assert }) => {
    await clearAll(page);
    await addCategory(page, 'Food');
    await addCategory(page, 'Fuel');
    await addAccount(page, 'A', '0');
    await addAccount(page, 'B', '0');
    await addTx(page, { amount: '1.00', date: daysAgo(40), payee: 'Old bread', category: 'Food', account: 'A' });
    await addTx(page, { amount: '2.00', date: daysAgo(2), payee: 'New bread', category: 'Food', account: 'B', notes: 'sourdough' });
    await addTx(page, { amount: '3.00', date: daysAgo(1), payee: 'Petrol', category: 'Fuel', account: 'A' });
    await go(page, 'Transactions');
    const names = () => page.locator('.tx-table tbody .row-payee').allInnerTexts();
    assert.strictEqual((await names()).length, 3);
    await page.getByLabel('From').fill(daysAgo(10));
    assert.deepStrictEqual(await names(), ['Petrol', 'New bread']);
    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Food' });
    assert.deepStrictEqual(await names(), ['New bread']);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByLabel('Account', { exact: true }).selectOption({ label: 'A' });
    assert.deepStrictEqual(await names(), ['Petrol', 'Old bread']);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByLabel('Search').fill('sourdough');
    assert.deepStrictEqual(await names(), ['New bread']);
    await page.getByLabel('Search').fill('no such thing');
    assert.match(await page.locator('.results').innerText(), /No transactions match/);
  },

  'validation errors block saving': async ({ page, assert }) => {
    await page.getByRole('button', { name: 'Add transaction' }).click();
    const m = modal(page);
    await m.getByRole('button', { name: 'Add transaction' }).click();
    assert.match(await m.locator('.field-error:visible').first().innerText(), /Enter an amount/);
    await m.getByLabel('Amount').fill('12.345');
    await m.getByRole('button', { name: 'Add transaction' }).click();
    assert.match(await m.locator('.field-error:visible').first().innerText(), /Enter a number/);
    await m.getByLabel('Amount').fill('-4');
    await m.getByRole('button', { name: 'Add transaction' }).click();
    assert.match(await m.locator('.field-error:visible').first().innerText(), /above zero/);
    await m.getByLabel('Amount').fill('4');
    await m.getByRole('button', { name: 'Add transaction' }).click();
    assert.match(await m.locator('.field-error:visible').first().innerText(), /description/);
    await page.keyboard.press('Escape');
    assert.strictEqual(await modal(page).count(), 0);
  },

  'user text is rendered as text, not markup': async ({ page, assert }) => {
    await addTx(page, { amount: '1.00', payee: '<img src=x onerror=window.hacked=1>', notes: '<b>bold</b>' });
    await go(page, 'Transactions');
    assert.strictEqual(await page.locator('.tx-table tbody img').count(), 0);
    assert.strictEqual(await page.evaluate(() => window.hacked), undefined);
    assert.match(await page.locator('.tx-table tbody tr').first().innerText(), /<img src=x/);
  },

  'edit changes persist after reload': async ({ page, assert, reload }) => {
    await clearAll(page);
    await addAccount(page, 'Main', '10.00');
    await addTx(page, { amount: '1.00', payee: 'Typo nmae' });
    await go(page, 'Transactions');
    await page.getByRole('button', { name: 'Edit Typo nmae' }).click();
    await modal(page).getByLabel('Description').fill('Fixed name');
    await modal(page).getByLabel('Amount').fill('2.50');
    await modal(page).getByRole('button', { name: 'Save changes' }).click();
    await reload();
    await go(page, 'Transactions');
    assert.deepStrictEqual(await page.locator('.tx-table tbody .row-payee').allInnerTexts(), ['Fixed name']);
    assert.strictEqual(await accountBalance(page, 'Main'), '$7.50');
  },

  'delete with undo restores the transaction and balance': async ({ page, assert }) => {
    await clearAll(page);
    await addAccount(page, 'Main', '10.00');
    await addTx(page, { amount: '4.00', payee: 'Doomed' });
    await go(page, 'Transactions');
    await page.getByRole('button', { name: 'Delete Doomed' }).click();
    assert.match(await page.locator('.results').innerText(), /No transactions yet/);
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    assert.deepStrictEqual(await page.locator('.tx-table tbody .row-payee').allInnerTexts(), ['Doomed']);
    assert.strictEqual(await accountBalance(page, 'Main'), '$6.00');
  },

  'deleting an account removes its transfers and warns first, with undo': async ({ page, assert }) => {
    await clearAll(page);
    await addAccount(page, 'Keep', '100.00');
    await addAccount(page, 'Drop', '0');
    await addTx(page, { type: 'Transfer', amount: '40.00', account: 'Keep', to: 'Drop', payee: 'Move' });
    assert.strictEqual(await accountBalance(page, 'Keep'), '$60.00');
    await page.getByRole('button', { name: 'Delete Drop' }).click();
    assert.match(await modal(page).innerText(), /1 transactions/);
    await modal(page).getByRole('button', { name: 'Delete account' }).click();
    assert.strictEqual(await accountBalance(page, 'Keep'), '$100.00');
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await accountBalance(page, 'Keep'), '$60.00');
    assert.strictEqual(await accountBalance(page, 'Drop'), '$40.00');
  },

  'CSV import maps columns, reads quotes, and detects duplicates on re-import': async ({ page, assert }) => {
    await clearAll(page);
    await addAccount(page, 'Bank', '100.00');
    const csv = [
      'When;What;Out;In;Extra',
      '31/01/2026;"Corner shop; north";12,50;;',
      '01/02/2026;"Salary ""Feb""";;1.000,00;',
      '02/02/2026;Coffee;3,00;;',
      '02/02/2026;Coffee;3,00;;',
      'soon;Pending thing;9,00;;',
    ].join('\n');
    const importIt = async () => {
      await go(page, 'Transactions');
      await page.getByRole('button', { name: 'Import CSV' }).click();
      await modal(page).getByLabel('Or paste CSV text').fill(csv);
      await modal(page).getByRole('button', { name: 'Continue' }).click();
      const m = modal(page);
      await m.getByLabel('Date column').selectOption({ label: 'When' });
      await m.getByLabel('Description column').selectOption({ label: 'What' });
      await m.getByRole('radio', { name: 'Separate in and out columns' }).check({ force: true });
      await m.getByLabel('Money out column').selectOption({ label: 'Out' });
      await m.getByLabel('Money in column').selectOption({ label: 'In' });
      await m.getByLabel('Date format').selectOption('dmy');
      await m.getByRole('button', { name: 'Review rows' }).click();
    };

    await importIt();
    const m = modal(page);
    assert.strictEqual(await m.locator('[data-import-summary]').innerText(), '3 new, 1 repeated in this file, 0 duplicates, 1 not readable');
    await m.getByRole('button', { name: 'Import 4 transactions' }).click();
    assert.match(await toast(page).innerText(), /Imported 4 transactions/);
    // 100 - 12.50 + 1000 - 3 - 3
    assert.strictEqual(await accountBalance(page, 'Bank'), '$1,081.50');
    await go(page, 'Transactions');
    assert.match(await page.locator('.tx-table').innerText(), /Salary "Feb"/);
    assert.match(await page.locator('.tx-table').innerText(), /Corner shop; north/);

    await importIt();
    assert.strictEqual(await m.locator('[data-import-summary]').innerText(), '0 new, 4 duplicates, 1 not readable');
    assert.strictEqual(await m.getByRole('button', { name: 'Import 0 transactions' }).isDisabled(), true);
    await m.locator('[data-import-row="4"] input').check();
    await m.getByRole('button', { name: 'Import 1 transaction' }).click();
    assert.strictEqual(await accountBalance(page, 'Bank'), '$1,078.50');
  },

  'CSV import refuses empty input and missing column mappings': async ({ page, assert }) => {
    await go(page, 'Transactions');
    await page.getByRole('button', { name: 'Import CSV' }).click();
    const m = modal(page);
    await m.getByRole('button', { name: 'Continue' }).click();
    assert.match(await m.locator('.form-error').innerText(), /No rows found/);
    await m.getByLabel('Or paste CSV text').fill('Foo,Bar\n1,2\n');
    await m.getByRole('button', { name: 'Continue' }).click();
    await m.getByRole('button', { name: 'Review rows' }).click();
    assert.match(await m.locator('.field-error:visible').first().innerText(), /column with the date/);
  },

  'sample statement import flags overlapping rows as duplicates': async ({ page, assert }) => {
    await go(page, 'Transactions');
    await page.getByRole('button', { name: 'Import CSV' }).click();
    const m = modal(page);
    await m.getByRole('button', { name: 'Use a sample statement' }).click();
    await m.getByRole('button', { name: 'Continue' }).click();
    await m.getByRole('button', { name: 'Review rows' }).click();
    assert.strictEqual(await m.locator('[data-import-summary]').innerText(), '4 new, 1 repeated in this file, 3 duplicates, 1 not readable');
  },

  'CSV and JSON export contain exact values, and JSON restores everything': async ({ page, assert }) => {
    await clearAll(page);
    await addAccount(page, 'Main', '10.00');
    await addAccount(page, 'Other', '0');
    await addTx(page, { amount: '1234.50', payee: 'Comma, "quoted"', notes: '=SUM(A1)', date: '2026-03-04', account: 'Main' });
    await addTx(page, { type: 'Transfer', amount: '5.00', payee: 'Shift', date: '2026-03-05', account: 'Main', to: 'Other' });

    await go(page, 'Transactions');
    const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    assert.match(csvDownload.suggestedFilename(), /^coinpath-transactions-.*\.csv$/);
    const csv = fs.readFileSync(await csvDownload.path(), 'utf8');
    assert.strictEqual(csv,
      'Date,Type,Account,To account,Category,Description,Notes,Amount\r\n'
      + '2026-03-04,expense,Main,,,"Comma, ""quoted""",\'=SUM(A1),-1234.50\r\n'
      + '2026-03-05,transfer,Main,Other,,Shift,,5.00\r\n');

    await go(page, 'Settings');
    const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON backup' }).click()]);
    const jsonPath = await jsonDownload.path();
    const backup = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.strictEqual(backup.transactions[0].amountCents, 123450);

    await addTx(page, { amount: '1.00', payee: 'After backup', date: '2026-03-06', account: 'Main' });
    await go(page, 'Settings');
    await page.getByLabel('Restore a JSON backup').setInputFiles(jsonPath);
    await modal(page).getByRole('button', { name: 'Replace data' }).click();
    await go(page, 'Transactions');
    assert.deepStrictEqual(await page.locator('.tx-table tbody .row-payee').allInnerTexts(), ['Shift', 'Comma, "quoted"']);
    assert.strictEqual(await accountBalance(page, 'Other'), '$5.00');
  },

  'a bad backup file shows an error and changes nothing': async ({ page, assert }) => {
    await go(page, 'Settings');
    const input = page.getByLabel('Restore a JSON backup');
    await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{ not json') });
    assert.match(await page.locator('[data-import-error]').innerText(), /not valid JSON/);
    await input.setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') });
    await page.waitForFunction(() => /not a Coinpath backup/.test(document.querySelector('[data-import-error]').textContent));
    assert.strictEqual(await modal(page).count(), 0);
  },

  'corrupt saved data cannot crash the app': async ({ page, assert, reload }) => {
    await page.evaluate(() => localStorage.setItem('coinpath.data.v1', '{"accounts":[{"id":1}],broken'));
    await reload();
    assert.match(await toast(page).innerText(), /could not be read/);
    assert.match(await tileValue(page, 'Net worth').innerText(), /\$/);
    await page.evaluate(() => localStorage.setItem('coinpath.data.v1', JSON.stringify({
      currency: 'XXX',
      accounts: [{ id: 'a', name: 'Fine', openingCents: 1000 }, { id: 'b', name: 'Float', openingCents: 1.5 }, null],
      transactions: [
        { id: 't1', type: 'expense', date: '2026-01-02', amountCents: 250, accountId: 'a' },
        { id: 't2', type: 'expense', date: 'nope', amountCents: 250, accountId: 'a' },
        { id: 't3', type: 'expense', date: '2026-01-02', amountCents: 2.5, accountId: 'a' },
        { id: 't4', type: 'transfer', date: '2026-01-02', amountCents: 100, accountId: 'a', toAccountId: 'gone' },
      ],
    })));
    await reload();
    assert.strictEqual(await accountBalance(page, 'Fine'), '$7.50');
    assert.strictEqual(await accountBalance(page, 'Float'), '$0.00');
  },

  'reset demo data restores the seed, with undo': async ({ page, assert }) => {
    await clearAll(page);
    await go(page, 'Accounts');
    assert.match(await page.locator('.main').innerText(), /No accounts yet/);
    await page.getByRole('button', { name: 'Reset demo data' }).first().click();
    await modal(page).getByRole('button', { name: 'Reset data' }).click();
    assert.match(await page.locator('.main').innerText(), /Everyday Checking/);
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    assert.match(await page.locator('.main').innerText(), /No accounts yet/);
  },

  'categories can be added, renamed and deleted; transactions become uncategorized': async ({ page, assert }) => {
    await clearAll(page);
    await addCategory(page, 'Temp');
    await addAccount(page, 'Main', '0');
    await addTx(page, { amount: '3.00', payee: 'Thing', category: 'Temp' });
    await go(page, 'Settings');
    await page.getByRole('button', { name: 'Edit Temp' }).click();
    await modal(page).getByLabel('Category name').fill('Renamed');
    await modal(page).getByRole('button', { name: 'Save changes' }).click();
    await go(page, 'Transactions');
    assert.match(await page.locator('.tx-table tbody').innerText(), /Renamed/);
    await go(page, 'Settings');
    await page.getByRole('button', { name: 'Delete Renamed' }).click();
    await go(page, 'Transactions');
    assert.match(await page.locator('.tx-table tbody').innerText(), /Uncategorized/);
  },

  'currency setting relabels amounts without changing them, and persists': async ({ page, assert, reload }) => {
    await clearAll(page);
    await addAccount(page, 'Main', '1234.56');
    await go(page, 'Settings');
    await page.getByLabel('Display currency').selectOption('EUR');
    assert.strictEqual(await accountBalance(page, 'Main'), '€1,234.56');
    await go(page, 'Settings');
    await page.getByLabel('Display currency').selectOption('SEK');
    assert.strictEqual(await accountBalance(page, 'Main'), '1,234.56 kr');
    await reload();
    assert.strictEqual(await accountBalance(page, 'Main'), '1,234.56 kr');
  },

  'theme toggle is remembered': async ({ page, assert, reload }) => {
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    await reload();
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    assert.strictEqual(await page.getByRole('button', { name: 'Switch to light theme' }).count(), 1);
  },

  'large and long values stay on the page at phone width': async ({ page, assert }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await clearAll(page);
    await addAccount(page, 'Very long account name that keeps going and going for ages', '9999999999.99');
    await addTx(page, { amount: '9999999999.99', payee: 'A very long description '.repeat(5).trim() });
    await go(page, 'Dashboard');
    await go(page, 'Transactions');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `overflow ${overflow}px`);
    assert.strictEqual(await accountBalance(page, 'Very long'), '$0.00');
  },
};
