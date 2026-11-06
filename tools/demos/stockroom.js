// A day at the counter: ring up a sale, reorder what's low, take a delivery, refund a return,
// read the numbers, and balance the drawer.
const TARGET_RUN_MS = 48500;

module.exports = {
  name: 'Stockroom',
  tagline: 'Point of sale and inventory for a small independent shop',
  scope: [
    'Keyboard-first register with discounts, tax and cash change',
    'Stock ledger, refunds and purchase orders with average cost',
    'Margin reports and end-of-day cash count',
  ],
  accent: '#C8420B',
  run: async (d) => {
    const { page } = d;
    const started = Date.now();
    const dialog = () => page.getByRole('dialog').last();
    // A quicker click than d.click, because a register is meant to be used at speed.
    const tap = async (target, hold = 180) => {
      await d.move(target, 220);
      await d.wait(30);
      await page.mouse.down();
      await d.wait(30);
      await page.mouse.up();
      await d.wait(hold);
    };

    await d.caption('Scan or type a SKU, with a quantity, right from the keyboard.', 600);
    await page.keyboard.type('3*PNT-T60', { delay: 55 });
    await d.wait(150);
    await d.press('Enter', 300);
    await tap(page.getByRole('tab', { name: 'Houseplants' }));
    await tap(page.locator('.tile', { hasText: 'Golden pothos' }), 200);
    await tap(dialog().getByRole('button', { name: /6 in pot/ }), 250);

    await d.caption('Line and order discounts come off first, then tax, in whole cents.', 200);
    await tap(page.locator('[data-testid="cart-line"]', { hasText: "Painter's tape" }).locator('.line-name'), 120);
    await d.press('F3', 180);
    await page.keyboard.type('10', { delay: 70 });
    await d.wait(350);
    await d.press('Enter', 220);
    await d.press('F4', 180);
    await page.keyboard.type('5', { delay: 70 });
    await d.wait(350);
    await d.press('Enter', 600);

    await d.caption('F7 takes cash, and quick tender shows the change at once.', 200);
    await d.press('F7', 300);
    await tap(dialog().locator('.tender').nth(3), 1000);
    await d.press('Enter', 200);
    await d.caption('The receipt prints alone, on an 80mm thermal layout.', 2000);
    await d.press('Enter', 200);

    await d.caption('Held sale resumed. Card is only a label: no payment is taken.', 200);
    await d.press('F10', 350);
    await tap(dialog().getByRole('button', { name: 'Resume' }), 300);
    await d.press('F8', 1300);
    await d.press('Enter', 300);
    await d.press('Enter', 180);

    await tap('a[data-route="inventory"]', 200);
    await d.caption('Low stock raises an alert, and one click drafts the reorder.', 300);
    await tap(page.locator('table tbody tr', { hasText: 'POT-TC6' }).getByRole('button', { name: /Draft reorder/ }), 1100);

    await tap('a[data-route="orders"]', 180);
    await d.caption('A short delivery leaves the order partially received.', 150);
    await tap(page.locator('table tbody tr', { hasText: 'Kettlewell' }).filter({ hasText: '0 of 20' }).getByRole('button').first(), 200);
    await tap(dialog().getByRole('button', { name: 'Receive goods' }), 220);
    const row = dialog().locator('tbody tr').first();
    await d.fill(row.locator('input').first(), '5', { hold: 120 });
    await d.fill(row.locator('input').nth(1), '26.40', { hold: 300 });
    await d.caption('The new weighted-average cost shows before anything is posted.', 2000);
    await tap(dialog().getByRole('button', { name: 'Post receipt' }), 700);
    await d.press('Escape', 120);

    await tap('a[data-route="inventory"]', 120);
    await tap(page.getByRole('tab', { name: 'Stock ledger' }), 150);
    await d.caption('The ledger records every unit with reason and running balance.', 150);
    await d.fill(page.getByLabel('Search ledger'), 'PNT-T60', { hold: 1400 });

    await tap('a[data-route="sales"]', 150);
    await d.caption('A return goes back on the shelf, refunded to the exact cent.', 150);
    await tap(page.locator('table tbody tr', { hasText: "Painter's tape" }).first().getByRole('button').first(), 200);
    await tap(dialog().getByRole('button', { name: 'Refund or return' }), 200);
    await d.fill(dialog().getByLabel(/Return quantity for Painter/), '1', { hold: 800 });
    await tap(dialog().getByRole('button', { name: 'Record refund' }), 350);
    await d.press('Escape', 120);

    await tap('a[data-route="reports"]', 150);
    await tap(page.getByRole('button', { name: '60 days' }), 350);
    await page.evaluate(() => SR.ui.clearToasts());
    await d.caption('Sixty days of revenue and margin, by day, category and product.', 1100);
    await d.poster();
    await d.scroll(330, '#view', 500);
    await d.wait(900);

    await tap('a[data-route="close"]', 180);
    await d.caption('At close, count the drawer by note and coin.', 100);
    const expected = await page.locator('[data-testid="expected-cash"]').innerText();
    const expectedCents = Math.round(Number(expected.replace(/[$,]/g, '')) * 100);
    const counts = await page.evaluate((cents) => SR.cashup.breakdown(cents), expectedCents);
    for (const { cents, label } of await page.evaluate(() => SR.cashup.DENOMINATIONS)) {
      if (!counts[cents]) continue;
      const box = page.getByLabel(`Count of ${label}`, { exact: true });
      await d.move(box, 90);
      await box.fill(String(counts[cents]));
      await d.wait(50);
    }
    await d.wait(200);
    await d.scroll(90, '#view', 250);
    await d.caption('The drawer balances to the cent, and the count joins the record.', 500);
    await tap(page.getByRole('button', { name: 'Save count' }), 1000);
    // Timing varies with machine load, so the last screen takes up whatever is left.
    await d.wait(Math.max(0, TARGET_RUN_MS - (Date.now() - started)));
  },
};
