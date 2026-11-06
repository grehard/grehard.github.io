// Scripted demo for Coinpath: a month's money, from overview to a clean statement import.
const pad = (n) => String(n).padStart(2, '0');
const QUICK = { hold: 120 };

module.exports = {
  name: 'Coinpath',
  tagline: 'A personal finance tracker for accounts, budgets and cash flow',
  scope: [
    'Accounts, transfers and running balances',
    'Monthly category budgets',
    'Recurring transactions with catch-up',
    'CSV import with duplicate detection',
  ],
  accent: '#0e5a3c',
  run: async (d) => {
    const { page } = d;
    const nav = (label) => page.locator('.nav-link', { hasText: label });
    const modal = page.locator('[role="dialog"]');
    const now = new Date();
    const threeWeeksAgo = new Date(now.getTime() - 21 * 86400000);
    const overdueDate = `${threeWeeksAgo.getFullYear()}-${pad(threeWeeksAgo.getMonth() + 1)}-${pad(threeWeeksAgo.getDate())}`;
    const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const dismissToast = async () => {
      const close = page.locator('.toast-close');
      if (await close.count()) await close.click();
    };

    // Overview
    await dismissToast();
    await d.caption('Net worth and this month’s income and spending at a glance.', 2000);
    await d.poster();
    await d.move(`[data-month="${month}"]`, 500);
    await d.caption('Hover a month or a category for exact values.', 1100);
    await d.move('.donut-slice >> nth=1', 400);
    await d.wait(800);

    // Add an expense
    await d.click(page.getByRole('button', { name: 'Add transaction' }), QUICK);
    await d.caption('Add an expense. Amounts are stored as integer cents.', 300);
    await page.keyboard.type('64.20', { delay: 40 });
    await d.type(modal.getByLabel('Description'), 'Noodle Yard', { delay: 25, hold: 60 });
    await d.select(modal.getByLabel('Category'), { label: 'Dining out' }, { hold: 120 });
    await d.click(modal.getByRole('button', { name: 'Add transaction' }), QUICK);
    await dismissToast();

    // Transfer
    await d.click(page.getByRole('button', { name: 'Add transaction' }), QUICK);
    await d.click(modal.locator('.segment', { hasText: 'Transfer' }), QUICK);
    await d.caption('Transfers move money but never count as spending.', 300);
    await d.type(modal.getByLabel('Amount'), '500', { delay: 40, hold: 60 });
    await d.fill(modal.getByLabel('Description'), 'Top up savings', { hold: 60 });
    await d.select(modal.getByLabel('To account'), { label: 'Harbor Savings' }, { hold: 120 });
    await d.click(modal.getByRole('button', { name: 'Add transaction' }), QUICK);
    await dismissToast();

    // Running balance and filters
    await d.click(nav('Transactions'), QUICK);
    await d.select(page.getByLabel('Account', { exact: true }), { label: 'Harbor Savings' }, { hold: 150 });
    await d.caption('Pick one account to see its running balance, row by row.', 2300);

    // Budgets
    await d.click(nav('Budgets'), QUICK);
    await d.caption('Budgets show progress and call out overspending.', 2100);

    // Recurring catch-up
    await d.click(nav('Recurring'), QUICK);
    await d.click(page.getByRole('button', { name: 'Add rule' }), QUICK);
    await page.keyboard.type('Language class', { delay: 22 });
    await d.type(modal.getByLabel('Amount'), '25', { delay: 40, hold: 50 });
    await d.select(modal.getByLabel('Repeats'), 'weekly', { hold: 60 });
    await d.fill(modal.getByLabel('Next date', { exact: true }), overdueDate, { hold: 60 });
    await d.caption('A rule three weeks overdue posts each missed week, once.', 300);
    await d.click(modal.getByRole('button', { name: 'Add rule' }), { hold: 1100 });
    await dismissToast();

    // Import
    await d.click(nav('Transactions'), QUICK);
    await d.click(page.getByRole('button', { name: 'Import CSV' }), QUICK);
    await d.click(modal.getByRole('button', { name: 'Use a sample statement' }), QUICK);
    await d.caption('Import a bank statement and map its columns.', 500);
    await d.click(modal.getByRole('button', { name: 'Continue' }), { hold: 500 });
    await d.click(modal.getByRole('button', { name: 'Review rows' }), QUICK);
    await d.caption('Rows already in the ledger stay unticked as duplicates.', 2200);
    await d.click(modal.getByRole('button', { name: /^Import \d+ transactions?$/ }), QUICK);
    await dismissToast();

    // Result
    await d.click(nav('Dashboard'), QUICK);
    await d.caption('Data stays in this browser, with CSV and JSON export.', 2000);
  },
};
