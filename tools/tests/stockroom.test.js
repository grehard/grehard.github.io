// Feature tests for Stockroom. Every expected money value below is worked out by hand in a
// comment, so a change to the rounding rules can't quietly change the answers.
const go = async (page, route) => {
  await page.evaluate((r) => { window.location.hash = `#/${r}`; }, route);
  await page.waitForTimeout(40);
};
const testid = (page, id) => page.locator(`[data-testid="${id}"]`).first();
const textOf = async (page, id) => (await testid(page, id).innerText()).trim();
const dialog = (page) => page.getByRole('dialog').last();

const entry = async (page, code) => {
  await page.fill('#reg-search', code);
  await page.press('#reg-search', 'Enter');
};

/** Finishes the open sale in cash, exact tender, using only the keyboard. */
const payExactCash = async (page) => {
  await page.keyboard.press('F7');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
};

async function addProduct(page, p) {
  await go(page, 'products');
  await page.getByRole('button', { name: 'Add product' }).first().click();
  const d = dialog(page);
  await d.getByLabel('Product name').fill(p.name);
  await d.getByLabel('Category').fill(p.category || 'Bench tests');
  if (p.supplier) await d.getByLabel('Supplier', { exact: true }).selectOption({ label: p.supplier });
  await d.getByLabel('SKU for variant').fill(p.sku);
  await d.getByLabel('Price for variant').fill(p.price);
  await d.getByLabel('Unit cost for variant').fill(p.cost);
  await d.getByLabel('Opening stock for variant').fill(String(p.stock));
  if (p.reorderPoint !== undefined) await d.getByLabel('Reorder point for variant').fill(String(p.reorderPoint));
  if (p.reorderQty !== undefined) await d.getByLabel('Reorder quantity for variant').fill(String(p.reorderQty));
  await d.getByRole('button', { name: 'Add product' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
}

async function openLatestSale(page) {
  await go(page, 'sales');
  await page.locator('table tbody tr').first().getByRole('button').first().click();
}

async function refund(page, label, qty, { restock = true, method } = {}) {
  await openLatestSale(page);
  await dialog(page).getByRole('button', { name: 'Refund or return' }).click();
  const d = dialog(page);
  await d.getByLabel(`Return quantity for ${label}`).fill(String(qty));
  if (!restock) await d.getByLabel(`Return ${label} to stock`).uncheck();
  if (method) await d.getByLabel('Refund method').selectOption(method);
  await d.getByRole('button', { name: 'Record refund' }).click();
  await page.keyboard.press('Escape');
}

/** Ledger rows for a SKU as [reason, change, balance, unit cost], newest first. */
async function ledgerFor(page, sku) {
  await go(page, `inventory/ledger/${sku}`);
  return page.locator('[data-testid="ledger"] tbody tr').evaluateAll((rows) => rows.map((row) => {
    const cells = [...row.cells].map((c) => c.innerText.trim());
    return [cells[3], cells[5], cells[6], cells[7]];
  }));
}

async function createOrder(page, { supplier, sku, qty, cost }) {
  await go(page, 'orders');
  await page.getByRole('button', { name: 'New purchase order' }).first().click();
  const d = dialog(page);
  await d.getByLabel('Supplier', { exact: true }).selectOption({ label: supplier });
  await d.getByRole('combobox', { name: 'Add a product' }).fill(sku);
  await d.getByRole('combobox', { name: 'Add a product' }).press('Enter');
  await d.locator('tbody tr input').nth(0).fill(String(qty));
  await d.locator('tbody tr input').nth(1).fill(cost);
  await d.getByRole('button', { name: 'Save draft' }).click();
  await dialog(page).getByRole('button', { name: 'Mark as ordered' }).click();
}

async function receive(page, qty, cost) {
  await dialog(page).getByRole('button', { name: 'Receive goods' }).click();
  const d = dialog(page);
  const inputs = d.locator('tbody tr input');
  await inputs.nth(0).fill(String(qty));
  if (cost) await inputs.nth(1).fill(cost);
}

const moneyToCents = (text) => Math.round(Number(text.replace(/[$,]/g, '')) * 100);

module.exports = {
  'seed data is a rich, reconciled 60 day shop': async ({ page, assert }) => {
    await go(page, 'products');
    const summary = await page.locator('.list-summary').innerText();
    assert.ok(Number(summary.match(/(\d+) products/)[1]) >= 40, summary);
    await go(page, 'reports');
    await page.getByRole('button', { name: '60 days' }).click();
    const salesTile = await page.locator('[data-testid="report-kpis"] .stat').nth(3).locator('.stat-value').innerText();
    assert.ok(Number(salesTile.replace(/,/g, '')) > 600, `sales: ${salesTile}`);
    await page.locator('[data-testid="day-report"]').getByRole('button', { name: 'Show more' }).click();
    const quietDays = await page.locator('[data-testid="day-report"] tbody tr').evaluateAll((rows) => rows.filter((r) => r.cells[1].innerText.trim() === '0').length);
    assert.ok(quietDays <= 1, `only today can be empty, found ${quietDays}`);
    await go(page, 'inventory');
    assert.strictEqual(await page.locator('.stat').nth(3).locator('.stat-value').innerText(), 'Reconciled');
    await go(page, 'orders');
    for (const status of ['Draft', 'Ordered', 'Partially received']) assert.ok(await page.locator('table').getByText(status, { exact: true }).first().isVisible(), status);
  },

  'barcode, SKU and quantity entry work from the keyboard': async ({ page, assert }) => {
    await page.locator('#reg-search').waitFor();
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'reg-search', 'register opens ready to scan');
    await page.keyboard.type('3*PNT-T60');
    await page.keyboard.press('Enter');
    let lines = page.locator('[data-testid="cart-line"]');
    assert.strictEqual(await lines.count(), 1);
    assert.strictEqual(await lines.first().locator('.qty-input').inputValue(), '3');
    assert.strictEqual(await page.inputValue('#reg-search'), '');

    const barcode = await page.evaluate(() => SR.catalog.findByCode(SR.store.state, 'HSP-SUC2').variant.barcode);
    await page.keyboard.type(barcode);
    await page.keyboard.press('Enter');
    assert.strictEqual(await lines.count(), 2);

    await page.keyboard.press('+');
    assert.strictEqual(await lines.nth(1).locator('.qty-input').inputValue(), '2');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('-');
    assert.strictEqual(await lines.nth(0).locator('.qty-input').inputValue(), '2');
    await page.keyboard.press('Delete');
    assert.strictEqual(await lines.count(), 1);
    await page.getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await lines.count(), 2);

    await entry(page, 'NOT-A-CODE');
    assert.ok((await page.locator('.reg-error').innerText()).includes('NOT-A-CODE'));
    assert.strictEqual(await lines.count(), 2);

    await page.fill('#reg-search', 'peace lily');
    assert.strictEqual(await page.locator('.tile').count(), 1);
    await page.keyboard.press('Enter');
    assert.strictEqual(await lines.count(), 3, 'Enter adds the only search result');

    await page.getByRole('tab', { name: 'Seeds' }).click();
    assert.strictEqual(await page.locator('.tile').count(), 5);
    await page.getByRole('tab', { name: 'Houseplants' }).click();
    await page.locator('.tile', { hasText: 'Monstera' }).click();
    await dialog(page).getByRole('button', { name: /10 in pot/ }).click();
    assert.strictEqual(await lines.count(), 4);
  },

  'tax and discounts come to exact cents': async ({ page, assert }) => {
    // Painter's tape 3 x 6.25 = 18.75, 10% line discount = 1.875, rounds to 1.88, leaving 16.87.
    await entry(page, '3*PNT-T60');
    await page.keyboard.press('F3');
    await page.keyboard.type('10');
    assert.ok((await textOf(page, 'line-preview')).includes('$16.87'));
    await page.keyboard.press('Enter');
    // Pothos 8.50 taxable. Tomato seed 2 x 3.49 = 6.98, tax exempt.
    await entry(page, 'HSP-POT4');
    await entry(page, '2*SED-TOM');
    assert.strictEqual(await textOf(page, 'subtotal'), '$34.23');
    assert.strictEqual(await textOf(page, 'line-discounts'), '-$1.88');
    // Before the order discount: 16.87 + 8.50 + 6.98 = 32.35. 5% = 1.6175, rounds to 1.62.
    await page.keyboard.press('F4');
    await page.keyboard.type('5');
    await page.keyboard.press('Enter');
    assert.strictEqual(await textOf(page, 'order-discount'), '-$1.62');
    // Largest-remainder split of 1.62 over the lines: 0.84, 0.43, 0.35. Taxable net is
    // 16.03 + 8.07 = 24.10, and 8.25% of that is 1.98825, which rounds to 1.99.
    assert.strictEqual(await textOf(page, 'tax'), '$1.99');
    // 32.35 - 1.62 + 1.99 = 32.72.
    assert.strictEqual(await textOf(page, 'total'), '$32.72');

    await page.keyboard.press('F7');
    assert.strictEqual(await textOf(page, 'pay-total'), '$32.72');
    await page.keyboard.type('30');
    await page.keyboard.press('Enter');
    assert.ok((await dialog(page).getByRole('alert').first().innerText()).includes('$2.72 short'), 'short tender is refused');
    await page.fill('[aria-label="Cash tendered"]', '40');
    assert.strictEqual(await textOf(page, 'change-due'), '$7.28');
    await page.keyboard.press('Enter');
    assert.strictEqual(await textOf(page, 'complete-change'), '$7.28');
    const receipt = await testid(page, 'receipt').innerText();
    for (const expected of ['$34.23', '-$1.88', '-$1.62', '$1.99', '$32.72', '$40.00', '$7.28', '(no tax)']) assert.ok(receipt.includes(expected), expected);
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.locator('[data-testid="cart-line"]').count(), 0, 'cart empties after the sale');

    // An amount discount larger than the line is refused rather than going negative.
    await entry(page, 'HSP-SUC2');
    await page.keyboard.press('F3');
    await dialog(page).getByRole('radio', { name: 'Amount' }).click();
    await dialog(page).getByLabel('Discount value').fill('9.00');
    await dialog(page).getByRole('button', { name: 'Apply' }).click();
    assert.ok((await dialog(page).getByRole('alert').filter({ hasText: 'more than' }).innerText()).includes('$4.50'));
  },

  'card payment is only a recorded label and says so': async ({ page, assert }) => {
    await entry(page, 'ELC-AA8');
    await page.keyboard.press('F8');
    assert.ok((await textOf(page, 'card-note')).includes('does not process payments'));
    await page.keyboard.press('Enter');
    assert.ok((await testid(page, 'receipt').innerText()).includes('No payment was processed'));
    await page.keyboard.press('Enter');
    await go(page, 'settings');
    assert.ok(await page.getByText('Stockroom has no payment processing').isVisible());
  },

  'hold and resume keeps the sale, and deleting a held sale can be undone': async ({ page, assert }) => {
    await entry(page, '2*POT-TC8');
    await page.keyboard.press('F9');
    await page.keyboard.type('Blue jacket');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.locator('[data-testid="cart-line"]').count(), 0);

    await entry(page, 'PLB-TT1');
    await page.keyboard.press('F10');
    const d = dialog(page);
    assert.strictEqual(await d.locator('.held-row').count(), 2, 'seeded hold plus this one');
    await d.locator('.held-row', { hasText: 'Blue jacket' }).getByRole('button', { name: 'Resume' }).click();
    const line = page.locator('[data-testid="cart-line"]');
    assert.strictEqual(await line.count(), 1);
    assert.strictEqual(await line.first().getAttribute('data-sku'), 'POT-TC8');
    assert.strictEqual(await line.first().locator('.qty-input').inputValue(), '2');

    await page.keyboard.press('F10');
    assert.strictEqual(await dialog(page).locator('.held-row').count(), 2, 'the displaced sale went on hold');
    await dialog(page).locator('.held-row').first().getByRole('button', { name: /Delete held sale/ }).click();
    assert.strictEqual(await dialog(page).locator('.held-row').count(), 1);
    await page.getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await dialog(page).locator('.held-row').count(), 2);
  },

  'receipt prints alone on the thermal layout': async ({ page, assert }) => {
    await entry(page, 'PNT-RK1');
    await payExactCash(page);
    await page.locator('#print-root .receipt').waitFor({ state: 'attached' });
    await page.emulateMedia({ media: 'print' });
    assert.strictEqual(await page.locator('#app').isVisible(), false);
    assert.strictEqual(await page.locator('#modal-root').isVisible(), false);
    assert.ok(await page.locator('#print-root .receipt').isVisible());
    const printed = await page.locator('#print-root').innerText();
    assert.ok(printed.includes('Tallow Lane Hardware & Garden'));
    assert.ok(printed.includes('Paint roller kit'));
    // 13.50 plus 8.25% (1.11375, rounds to 1.11).
    assert.ok(printed.includes('$14.61'));
    const fontFamily = await page.locator('#print-root .receipt').evaluate((el) => getComputedStyle(el).fontFamily);
    assert.ok(/consolas|mono/i.test(fontFamily), fontFamily);
    const widthMm = await page.locator('#print-root').evaluate((el) => el.getBoundingClientRect().width / (96 / 25.4));
    assert.ok(Math.abs(widthMm - 74) < 1, `print width ${widthMm}mm`);
    await page.emulateMedia({ media: 'screen' });
    assert.strictEqual(await page.locator('#print-root').isVisible(), false);
  },

  'stock ledger stays exact through sale, refund and PO receipt': async ({ page, assert }) => {
    await addProduct(page, { name: 'Leaf rake', sku: 'RAKE-1', price: '20.00', cost: '8.00', stock: 10, supplier: 'Hedgerow Seed & Soil' });
    await go(page, 'register');
    await entry(page, '4*RAKE-1');
    assert.strictEqual(await textOf(page, 'tax'), '$6.60');
    await payExactCash(page);

    // One of four back: 80.00 / 4 = 20.00 net, 6.60 / 4 = 1.65 tax.
    await openLatestSale(page);
    await dialog(page).getByRole('button', { name: 'Refund or return' }).click();
    await dialog(page).getByLabel('Return quantity for Leaf rake').fill('1');
    assert.strictEqual(await textOf(page, 'refund-total'), '$21.65');
    await dialog(page).getByRole('button', { name: 'Record refund' }).click();
    await page.keyboard.press('Escape');

    // A damaged return gives money back but no stock, so it adds no ledger row.
    await refund(page, 'Leaf rake', 1, { restock: false });
    // More than remains is refused.
    await openLatestSale(page);
    await dialog(page).getByRole('button', { name: 'Refund or return' }).click();
    await dialog(page).getByLabel('Return quantity for Leaf rake').fill('3');
    await dialog(page).getByRole('button', { name: 'Record refund' }).click();
    assert.ok((await dialog(page).getByRole('alert').filter({ hasText: 'return up to 2' }).innerText()).length > 0);
    await page.keyboard.press('Escape');

    await createOrder(page, { supplier: 'Hedgerow Seed & Soil', sku: 'RAKE-1', qty: 5, cost: '10.00' });
    await receive(page, 5);
    await dialog(page).getByRole('button', { name: 'Post receipt' }).click();
    await page.keyboard.press('Escape');

    const rows = await ledgerFor(page, 'RAKE-1');
    assert.deepStrictEqual(rows, [
      ['PO receipt', '+5', '12', '$10.00'],
      ['Refund, restocked', '+1', '7', '$8.00'],
      ['Sale', '-4', '6', '$8.00'],
      ['Opening balance', '+10', '10', '$8.00'],
    ]);
    assert.strictEqual(await page.locator('.stat').nth(3).locator('.stat-value').innerText(), 'Reconciled');
    // (7 x 8.00 + 5 x 10.00) / 12 = 8.8333, rounds to 8.83.
    await go(page, 'products');
    await page.getByLabel('Search products').fill('RAKE-1');
    await page.waitForTimeout(200);
    const cells = await page.locator('table tbody tr').first().locator('td').allInnerTexts();
    assert.strictEqual(cells[6], '$8.83');
    assert.strictEqual(cells[8], '12');
  },

  'partial PO receipt updates stock, status and weighted-average cost': async ({ page, assert }) => {
    await addProduct(page, { name: 'Twine ball', sku: 'TWN-1', price: '9.00', cost: '4.00', stock: 10 });
    await createOrder(page, { supplier: 'Hedgerow Seed & Soil', sku: 'TWN-1', qty: 20, cost: '5.50' });
    assert.ok(await dialog(page).locator('.po-meta').getByText('Ordered', { exact: true }).isVisible());
    let ledger = await ledgerFor(page, 'TWN-1');
    assert.strictEqual(ledger.length, 1, 'placing an order does not move stock');

    await go(page, 'orders');
    await page.locator('table tbody tr').first().getByRole('button').first().click();
    await receive(page, 25);
    await dialog(page).getByRole('button', { name: 'Post receipt' }).click();
    assert.ok(await dialog(page).getByText('Only 20 still expected').isVisible(), 'over-receipt is refused');

    await dialog(page).locator('tbody tr input').nth(0).fill('6');
    // (10 x 4.00 + 6 x 5.50) / 16 = 4.5625, rounds to 4.56.
    assert.strictEqual(await testid(page, 'new-average').innerText(), '$4.56');
    await dialog(page).getByRole('button', { name: 'Post receipt' }).click();
    assert.ok(await dialog(page).locator('.po-meta').getByText('Partially received', { exact: true }).isVisible());
    const lineCells = await dialog(page).locator('tbody tr').first().locator('td').allInnerTexts();
    assert.deepStrictEqual(lineCells.slice(2, 5), ['20', '6', '14']);

    // The rest arrives dearer: (16 x 4.56 + 14 x 6.10) / 30 = 527.87 cents, rounds to 5.28.
    await receive(page, 14, '6.10');
    assert.strictEqual(await testid(page, 'new-average').innerText(), '$5.28');
    await dialog(page).getByRole('button', { name: 'Post receipt' }).click();
    assert.ok(await dialog(page).locator('.po-meta').getByText('Received', { exact: true }).isVisible());
    assert.strictEqual(await dialog(page).getByRole('button', { name: 'Receive goods' }).count(), 0);
    await page.keyboard.press('Escape');

    ledger = await ledgerFor(page, 'TWN-1');
    assert.deepStrictEqual(ledger, [
      ['PO receipt', '+14', '30', '$6.10'],
      ['PO receipt', '+6', '16', '$5.50'],
      ['Opening balance', '+10', '10', '$4.00'],
    ]);
  },

  'a part-received order can be closed short': async ({ page, assert }) => {
    await addProduct(page, { name: 'Hazel stakes', sku: 'HZL-1', price: '3.00', cost: '1.00', stock: 2, reorderPoint: 5, reorderQty: 10, supplier: 'Hedgerow Seed & Soil' });
    await createOrder(page, { supplier: 'Hedgerow Seed & Soil', sku: 'HZL-1', qty: 10, cost: '1.20' });
    await receive(page, 4);
    await dialog(page).getByRole('button', { name: 'Post receipt' }).click();
    await page.keyboard.press('Escape');
    await go(page, 'inventory');
    // Stock is now 2 + 4 = 6, above the reorder point of 5.
    assert.strictEqual(await page.locator('table tbody tr', { hasText: 'HZL-1' }).count(), 0, 'not low with 6 on hand');
    await go(page, 'orders');
    await page.locator('table tbody tr', { hasText: 'Hedgerow' }).filter({ hasText: '4 of 10' }).getByRole('button').first().click();
    await dialog(page).getByRole('button', { name: 'Close short' }).click();
    assert.ok(await dialog(page).locator('.po-meta').getByText('Received, closed short').isVisible());
    assert.strictEqual((await dialog(page).locator('tbody tr').first().locator('td').allInnerTexts())[4], '0');
    assert.strictEqual(await dialog(page).getByRole('button', { name: 'Receive goods' }).count(), 0);
  },

  'gross margin in reports is exact, including refunds': async ({ page, assert }) => {
    await addProduct(page, { name: '1 margin spade', sku: 'SPD-1', price: '25.00', cost: '10.00', stock: 9, category: '1 spades' });
    await go(page, 'register');
    await entry(page, '3*SPD-1');
    await page.keyboard.press('F4');
    await page.keyboard.type('10');
    await page.keyboard.press('Enter');
    await payExactCash(page);

    const row = async () => {
      await go(page, 'reports');
      await page.getByRole('button', { name: '7 days' }).click();
      const report = page.locator('[data-testid="product-report"]');
      if (await report.locator('th[aria-sort="ascending"]', { hasText: 'Product' }).count() === 0) await report.getByRole('button', { name: 'Product' }).click();
      return page.locator('[data-testid="product-report"] tbody tr').first().locator('td').allInnerTexts();
    };
    // Revenue 75.00 less 10% = 67.50. Cost 3 x 10.00 = 30.00. Profit 37.50. 37.50 / 67.50 = 55.56%.
    assert.deepStrictEqual(await row(), ['1 margin spade', '1 spades', '3', '$67.50', '$30.00', '$37.50', '55.56%']);

    // Restocked return: revenue falls by 22.50, cost falls by 10.00.
    await refund(page, '1 margin spade', 1);
    assert.deepStrictEqual(await row(), ['1 margin spade', '1 spades', '2', '$45.00', '$20.00', '$25.00', '55.56%']);

    // Return not restocked: revenue falls but the cost stays, since the goods are gone.
    await refund(page, '1 margin spade', 1, { restock: false });
    assert.deepStrictEqual(await row(), ['1 margin spade', '1 spades', '1', '$22.50', '$20.00', '$2.50', '11.11%']);

    const categoryRow = await page.locator('[data-testid="category-report"] tbody tr', { hasText: '1 spades' }).locator('td').allInnerTexts();
    assert.deepStrictEqual(categoryRow, ['1 spades', '1', '$22.50', '$2.50', '11.11%']);
    await page.locator('[data-testid="category-chart"] svg').waitFor();
    // A typed date range far in the past is held to one year, so the chart stays usable.
    await page.getByLabel('From').fill('1990-01-01');
    await page.locator('.stat-value').first().waitFor();
    assert.notStrictEqual(await page.getByLabel('From').inputValue(), '1990-01-01');
    await page.getByRole('button', { name: '7 days' }).click();
    await page.getByRole('radio', { name: 'Units' }).click();
    await page.locator('[data-testid="top-chart"] svg').waitFor();
  },

  'low stock alert drafts a reorder in one click': async ({ page, assert }) => {
    await addProduct(page, { name: 'Copper sulfate tin', sku: 'CST-1', price: '12.00', cost: '6.25', stock: 2, reorderPoint: 5, reorderQty: 12, supplier: 'Hedgerow Seed & Soil' });
    await go(page, 'inventory');
    const row = page.locator('table tbody tr', { hasText: 'CST-1' });
    // Stock 2 against reorder point 5 needs 4 units to clear it, which is one lot of 12.
    await row.getByRole('button', { name: /Draft reorder of 12/ }).click();
    const link = row.getByRole('button', { name: /On draft PO-/ });
    await link.waitFor();
    const label = await link.innerText();
    assert.ok(await page.getByText(/12 x Copper sulfate tin added to/).isVisible());

    await link.click();
    const d = dialog(page);
    assert.ok(await d.locator('.po-meta').getByText('Draft', { exact: true }).isVisible());
    assert.ok(await d.getByText('Hedgerow Seed & Soil').first().isVisible());
    const cells = await d.locator('tbody tr', { hasText: 'CST-1' }).locator('td').allInnerTexts();
    assert.deepStrictEqual([cells[2], cells[5], cells[6]], ['12', '$6.25', '$75.00']);

    // Full draft lifecycle: edit, place, step back, delete, undo.
    await d.getByRole('button', { name: 'Edit draft' }).click();
    await dialog(page).getByLabel('Quantity of Copper sulfate tin').fill('24');
    await dialog(page).getByRole('button', { name: 'Save draft' }).click();
    assert.strictEqual((await dialog(page).locator('tbody tr', { hasText: 'CST-1' }).locator('td').allInnerTexts())[2], '24');
    await dialog(page).getByRole('button', { name: 'Mark as ordered' }).click();
    await dialog(page).getByRole('button', { name: 'Back to draft' }).click();
    const number = label.replace('On draft ', '');
    await dialog(page).getByRole('button', { name: 'Delete draft' }).click();
    await go(page, 'orders');
    await page.getByLabel('Search orders').fill(number);
    await page.waitForTimeout(200);
    assert.ok(await page.getByText('No purchase orders here').isVisible());
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByLabel('Search orders').fill(number);
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('table tbody tr', { hasText: number }).count(), 1);
  },

  'stock adjustments need a reason and land in the ledger': async ({ page, assert }) => {
    await addProduct(page, { name: 'Bamboo cane bundle', sku: 'BMB-1', price: '6.00', cost: '2.00', stock: 20 });
    await go(page, 'inventory');
    await page.getByRole('button', { name: 'Adjust stock' }).click();
    await dialog(page).getByRole('button', { name: 'Post adjustment' }).click();
    assert.ok(await dialog(page).getByText('Choose a product.').isVisible());
    assert.ok(await dialog(page).getByText('Enter a change other than zero.').isVisible());
    assert.ok(await dialog(page).getByText('Choose a reason.').isVisible());

    await dialog(page).getByRole('combobox', { name: 'Product' }).fill('BMB-1');
    await dialog(page).getByRole('combobox', { name: 'Product' }).press('Enter');
    await dialog(page).getByLabel('Change in units').fill('-3');
    assert.ok((await textOf(page, 'adjust-preview')).includes('becomes 17'));
    await dialog(page).getByLabel('Reason').selectOption('damaged');
    await dialog(page).getByLabel('Note (optional)').fill('Snapped in the yard');
    await dialog(page).getByRole('button', { name: 'Post adjustment' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });

    await page.getByRole('button', { name: 'Adjust stock' }).click();
    await dialog(page).getByRole('combobox', { name: 'Product' }).fill('BMB-1');
    await dialog(page).getByRole('combobox', { name: 'Product' }).press('Enter');
    await dialog(page).getByRole('radio', { name: 'Count to' }).click();
    await dialog(page).getByLabel('Counted on hand').fill('15');
    await dialog(page).getByLabel('Reason').selectOption('count');
    await dialog(page).getByRole('button', { name: 'Post adjustment' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });

    const rows = await ledgerFor(page, 'BMB-1');
    assert.deepStrictEqual(rows.map((r) => r.slice(0, 3)), [
      ['Stock count correction', '-2', '15'],
      ['Damaged', '-3', '17'],
      ['Opening balance', '+20', '20'],
    ]);
    assert.ok(await page.getByText('Snapped in the yard').isVisible());
    await page.getByLabel('Reason').selectOption('damaged');
    await page.waitForTimeout(100);
    assert.strictEqual(await page.locator('[data-testid="ledger"] tbody tr').count(), 1, 'filter by reason');
  },

  'end of day cash count reports over and short exactly': async ({ page, assert }) => {
    await go(page, 'close');
    const before = moneyToCents(await textOf(page, 'expected-cash'));
    assert.strictEqual(await textOf(page, 'over-short'), '--', 'nothing is declared short before a count');

    // Tape 6.25 plus 8.25% (0.515625, rounds to 0.52) = 6.77.
    await go(page, 'register');
    await entry(page, 'PNT-T60');
    await page.keyboard.press('F7');
    await page.keyboard.type('20');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await go(page, 'close');
    assert.strictEqual(moneyToCents(await textOf(page, 'expected-cash')), before + 677, 'cash up by the total, not by the tender');

    await refund(page, "Painter's tape, 60 yd", 1, { method: 'cash' });
    await go(page, 'close');
    assert.strictEqual(moneyToCents(await textOf(page, 'expected-cash')), before, 'cash refund comes back out');

    // Count 1.25 short, using notes and coins.
    const target = before - 125;
    await page.getByLabel('Count of $100').fill(String(Math.floor(target / 10000)));
    await page.getByLabel('Count of $1', { exact: true }).fill(String(Math.floor((target % 10000) / 100)));
    await page.getByLabel('Count of 1c').fill(String(target % 100));
    assert.strictEqual(moneyToCents(await textOf(page, 'counted-cash')), target);
    assert.strictEqual(await textOf(page, 'over-short'), '-$1.25');
    await page.getByLabel('Note (optional)').fill('Till roll change');
    await page.getByRole('button', { name: 'Save count' }).click();
    const history = page.locator('[data-testid="close-history"] tbody tr').first();
    assert.ok((await history.innerText()).includes('Short $1.25'));
    assert.ok((await history.innerText()).includes('Till roll change'));

    await history.getByRole('button', { name: /Delete count/ }).click();
    assert.ok(!(await page.locator('[data-testid="close-history"] tbody tr').first().innerText()).includes('Short $1.25'));
    await page.getByRole('button', { name: 'Undo' }).last().click();
    assert.ok((await page.locator('[data-testid="close-history"] tbody tr').first().innerText()).includes('Short $1.25'));
  },

  'data persists after reload': async ({ page, assert, reload }) => {
    await addProduct(page, { name: 'Pruning saw', sku: 'SAW-1', price: '31.00', cost: '15.00', stock: 6 });
    await go(page, 'register');
    await entry(page, 'SAW-1');
    await payExactCash(page);
    await entry(page, '2*SAW-1');
    await reload();
    await page.locator('#reg-search').waitFor();
    const line = page.locator('[data-testid="cart-line"]');
    assert.strictEqual(await line.count(), 1, 'the open sale survives a reload');
    assert.strictEqual(await line.first().locator('.qty-input').inputValue(), '2');
    await go(page, 'sales');
    await page.getByLabel('Search sales').fill('SAW-1');
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('table tbody tr').count(), 1);
    const rows = await ledgerFor(page, 'SAW-1');
    assert.strictEqual(rows[0][2], '5');
  },

  'JSON backup and restore round-trips, and bad files are refused': async ({ page, assert }) => {
    await addProduct(page, { name: 'Backed-up trowel', sku: 'TRW-1', price: '11.00', cost: '5.00', stock: 3 });
    await go(page, 'settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up to JSON' }).click()]);
    assert.ok(/^stockroom-backup-.*\.json$/.test(download.suggestedFilename()));
    const fs = require('fs');
    const text = fs.readFileSync(await download.path(), 'utf8');
    assert.strictEqual(JSON.parse(text).app, 'stockroom');

    await page.setInputFiles('#restore-file', { name: 'junk.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
    await testid(page, 'restore-errors').getByText('not valid JSON').waitFor();

    const tampered = JSON.parse(text);
    tampered.data.sales[0].totalCents = 'lots';
    tampered.data.ledger[0].delta = 1.5;
    await page.setInputFiles('#restore-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tampered)) });
    await testid(page, 'restore-errors').getByText('Sale 1 is invalid.').waitFor();
    assert.ok(await testid(page, 'restore-errors').getByText('Ledger row 1 is invalid.').isVisible());

    await go(page, 'products');
    await page.getByLabel('Search products').fill('TRW-1');
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Delete Backed-up trowel' }).click();
    await page.waitForTimeout(50);
    assert.ok(await page.getByText('No products found').isVisible());

    await go(page, 'settings');
    await page.setInputFiles('#restore-file', { name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await dialog(page).getByRole('button', { name: 'Restore backup' }).click();
    await page.getByText('Backup restored').waitFor();
    await go(page, 'products');
    await page.getByLabel('Search products').fill('TRW-1');
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('table tbody tr', { hasText: 'TRW-1' }).count(), 1);
  },

  'CSV exports carry the right columns and safely quote awkward text': async ({ page, assert }) => {
    const fs = require('fs');
    const name = 'Rake, "long" <img src=x onerror=boom>';
    await addProduct(page, { name, sku: 'CSV-1', price: '10.00', cost: '4.00', stock: 8, category: '=SUM(A1)' });
    assert.strictEqual(await page.locator('table img').count(), 0, 'product names are rendered as text');
    const [productsFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export products CSV' }).click()]);
    assert.strictEqual(productsFile.suggestedFilename(), 'stockroom-products.csv');
    const products = fs.readFileSync(await productsFile.path(), 'utf8');
    assert.ok(products.startsWith('Product,Variant,SKU,Barcode,Category,Supplier,Taxable,Price,Unit cost,On hand,Reorder point,Reorder quantity'));
    assert.ok(products.includes('"Rake, ""long"" <img src=x onerror=boom>",Standard,CSV-1,,\'=SUM(A1),,yes,10.00,4.00,8,5,6'), 'quotes commas and neutralises formulas');
    assert.ok(products.includes('Deck screws #8,1 lb box,FAS-DS1'));

    await go(page, 'register');
    await entry(page, '2*CSV-1');
    await payExactCash(page);
    await go(page, 'sales');
    const [salesFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export sales CSV' }).click()]);
    const sales = fs.readFileSync(await salesFile.path(), 'utf8').trim().split('\r\n');
    assert.ok(sales[0].startsWith('Sale,Date,Time,Payment,SKU,Product'));
    assert.ok(sales.length > 1000, `sales rows: ${sales.length}`);
    // 2 x 10.00 net, 8.25% tax = 1.65.
    assert.ok(sales[sales.length - 1].endsWith(',2,10.00,0.00,0.00,20.00,1.65,4.00,0'), sales[sales.length - 1]);
  },

  'product form validates, supports variants, and delete can be undone': async ({ page, assert }) => {
    await go(page, 'products');
    await page.getByRole('button', { name: 'Add product' }).first().click();
    let d = dialog(page);
    await d.getByRole('button', { name: 'Add product' }).click();
    assert.ok(await d.getByText('Enter a product name.').isVisible());
    assert.ok(await d.getByText('SKU is required.').isVisible());
    assert.ok(await d.getByText('Enter a valid price.').isVisible());

    await d.getByLabel('Product name').fill('Seed tray');
    await d.getByLabel('Category').fill('Garden');
    await d.getByLabel('SKU for variant').fill('FAS-DS1');
    await d.getByLabel('Price for variant').fill('abc');
    await d.getByLabel('Unit cost for variant').fill('1.10');
    await d.getByRole('button', { name: 'Add product' }).click();
    assert.ok(await d.getByText('Already used by Deck screws #8.').isVisible());
    assert.ok(await d.getByText('Enter a valid price.').isVisible());

    await d.getByLabel('Name for variant').fill('6 cell');
    await d.getByLabel('SKU for variant').fill('TRY-6');
    await d.getByLabel('Price for variant').fill('2.50');
    await d.getByRole('button', { name: 'Add variant' }).click();
    await d.getByLabel('Name for variant').nth(1).fill('12 cell');
    await d.getByLabel('SKU for variant').nth(1).fill('TRY-12');
    await d.getByLabel('Price for variant').nth(1).fill('3.75');
    await d.getByLabel('Unit cost for variant').nth(1).fill('1.60');
    await d.getByRole('button', { name: 'Add product' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });

    await page.getByLabel('Search products').fill('seed tray');
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('table tbody tr').count(), 2);

    // Edit: rename, and a variant holding stock can't be removed.
    await page.getByRole('button', { name: 'Edit Seed tray' }).click();
    d = dialog(page);
    await d.getByLabel('Product name').fill('Seed tray, rigid');
    await d.getByRole('button', { name: 'Save product' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.getByLabel('Search products').fill('rigid');
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Delete Seed tray, rigid' }).click();
    assert.ok(await page.getByText('No products found').isVisible());
    await page.getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await page.locator('table tbody tr').count(), 2);

    // Variant picker on the register shows both.
    await go(page, 'register');
    await page.fill('#reg-search', 'rigid');
    await page.keyboard.press('Enter');
    assert.strictEqual(await dialog(page).locator('.variant-choice').count(), 2);
    await page.keyboard.press('2');
    assert.strictEqual(await page.locator('[data-testid="cart-line"]').first().getAttribute('data-sku'), 'TRY-12');
  },

  'suppliers can be added, edited and deleted with undo': async ({ page, assert }) => {
    await go(page, 'orders');
    await page.getByRole('button', { name: 'Add supplier' }).click();
    let d = dialog(page);
    await d.getByRole('button', { name: 'Add supplier' }).click();
    assert.ok(await d.getByText('Enter a supplier name.').isVisible());
    await d.getByLabel('Supplier name').fill('Fernside Twine Co');
    await d.getByLabel('Email').fill('nope');
    await d.getByRole('button', { name: 'Add supplier' }).click();
    assert.ok(await d.getByText('Enter a valid email address.').isVisible());
    await d.getByLabel('Email').fill('sales@fernside.example');
    await d.getByRole('button', { name: 'Add supplier' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });

    await page.getByRole('tab', { name: /Suppliers/ }).click();
    await page.getByRole('button', { name: 'Edit Fernside Twine Co' }).click();
    d = dialog(page);
    await d.getByLabel('Contact').fill('Ruth Allard');
    await d.getByRole('button', { name: 'Save supplier' }).click();
    assert.ok(await page.locator('table tbody tr', { hasText: 'Ruth Allard' }).isVisible());
    await page.getByRole('button', { name: 'Delete Fernside Twine Co' }).click();
    assert.strictEqual(await page.locator('table tbody tr', { hasText: 'Fernside' }).count(), 0);
    await page.getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await page.locator('table tbody tr', { hasText: 'Fernside' }).count(), 1);
    // A supplier with products on it is protected.
    await page.getByRole('button', { name: 'Delete Marlow Greenhouse Growers' }).click();
    assert.ok(await page.getByText(/can't be deleted/).isVisible());
  },

  'reset demo data restores the shop, and can be undone': async ({ page, assert }) => {
    await addProduct(page, { name: 'Soon to be gone', sku: 'GONE-1', price: '1.00', cost: '0.50', stock: 1 });
    await go(page, 'settings');
    await page.getByRole('button', { name: 'Reset demo data' }).click();
    await dialog(page).getByRole('button', { name: 'Reset demo data' }).click();
    await page.getByText('Demo data restored').waitFor();
    await go(page, 'products');
    await page.getByLabel('Search products').fill('GONE-1');
    await page.waitForTimeout(200);
    assert.ok(await page.getByText('No products found').isVisible());
    await page.getByLabel('Search products').fill('');
    await page.waitForTimeout(200);
    assert.ok((await page.locator('.list-summary').innerText()).startsWith('53 products'));
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByLabel('Search products').fill('GONE-1');
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('table tbody tr', { hasText: 'GONE-1' }).count(), 1);
  },

  'Escape closes modals, and focus stays visible and trapped': async ({ page, assert }) => {
    await entry(page, 'ELC-OT1');
    await page.keyboard.press('F4');
    assert.strictEqual(await page.getByRole('dialog').count(), 1);
    const inside = await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]'));
    assert.ok(inside, 'focus moves into the modal');
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), 'Tab stays inside');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.getByRole('dialog').count(), 0);
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'reg-search', 'focus returns to the search field');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    assert.strictEqual(outline, 'solid');
  },

  'theme choice is remembered': async ({ page, assert, reload }) => {
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await bg();
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    const dark = await bg();
    assert.notStrictEqual(dark, light);
    await reload();
    await page.locator('#reg-search').waitFor();
    assert.strictEqual(await bg(), dark);
    assert.ok(await page.getByRole('button', { name: 'Switch to light theme' }).isVisible());
  },

  'corrupt saved data does not crash the app': async ({ page, assert, reload }) => {
    await page.evaluate(() => localStorage.setItem('stockroom:data:v1', '{"version":1,"products":"oops"'));
    await reload();
    await page.getByText('Saved data could not be read').waitFor();
    assert.ok(await page.locator('.tile').first().isVisible());
    await page.evaluate(() => localStorage.setItem('stockroom:data:v1', JSON.stringify({ version: 1, products: [{ name: 'x', variants: [{}] }] })));
    await reload();
    await page.getByText('Saved data could not be read').waitFor();
    assert.ok(await page.locator('.tile').first().isVisible());
  },

  'a full sale works at phone width': async ({ page, assert }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.locator('.tile', { hasText: 'Utility knife' }).click();
    assert.ok((await page.locator('.phone-bar-text').innerText()).includes('1 item'));
    await page.locator('.phone-bar').click();
    assert.ok(await page.getByRole('button', { name: 'Cash' }).isVisible());
    await page.getByRole('button', { name: 'One more Utility knife' }).click();
    // 2 x 9.99 = 19.98, 8.25% = 1.64835, rounds to 1.65, total 21.63.
    assert.strictEqual(await textOf(page, 'total'), '$21.63');
    await page.getByRole('button', { name: 'Cash' }).click();
    await dialog(page).getByRole('button', { name: 'Exact' }).click();
    await page.getByRole('button', { name: 'New sale' }).click();
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
    for (const route of ['sales', 'products', 'inventory', 'orders', 'reports', 'close', 'settings']) {
      await go(page, route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.strictEqual(overflow, 0, `${route} overflows sideways`);
    }
  },
};
