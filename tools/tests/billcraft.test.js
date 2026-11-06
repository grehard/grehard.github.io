// Feature tests for Billcraft. Each test starts from the first-run seed data.
const fs = require('fs');
const os = require('os');
const path = require('path');

const pad = (n) => String(n).padStart(2, '0');
function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const go = async (page, hash) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(60);
};
const tile = (page, label) => page.locator(`[data-tile="${label}"] .tile-value`);
const total = (page, key) => page.locator(`.sheet [data-total="${key}"] dd`);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const summaryValue = (page) => page.getByTestId('summary-value');
const toast = (page) => page.locator('#toast-root');
const badge = (page) => page.locator('.summary .badge');

async function setLine(page, n, { description, qty, unit, tax }) {
  if (description !== undefined) await page.getByLabel(`Description, line ${n}`).fill(description);
  if (qty !== undefined) await page.getByLabel(`Quantity, line ${n}`).fill(qty);
  if (unit !== undefined) await page.getByLabel(`Unit price, line ${n}`).fill(unit);
  if (tax !== undefined) await page.getByLabel(`Tax percent, line ${n}`).fill(tax);
}

// Fills in lines on the open editor, adding rows as needed.
async function setLines(page, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) await button(page, 'Add line').click();
    await setLine(page, i + 1, lines[i]);
  }
}

async function newInvoice(page, lines, options = {}) {
  await go(page, '#/invoices/new');
  await page.getByLabel('Client', { exact: true }).selectOption({ label: options.client || 'Oakhollow Cider' });
  await setLines(page, lines || [{ description: 'Test work', qty: '1', unit: '100.00', tax: '0' }]);
}

async function saveInvoice(page) {
  await page.locator('#save-document').click();
  await page.waitForFunction(() => !location.hash.includes('new') && !location.hash.includes('edit'));
  await page.waitForSelector('.summary');
}

async function sentInvoice(page, lines) {
  await newInvoice(page, lines);
  await saveInvoice(page);
  await button(page, 'Mark as sent').click();
}

async function recordPayment(page, amount) {
  await button(page, 'Record payment').click();
  await page.getByLabel('Amount', { exact: true }).fill(amount);
  await page.locator('.modal-foot .btn-primary').click();
}

async function downloadText(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const file = await download.path();
  return { name: download.suggestedFilename(), text: fs.readFileSync(file, 'utf8') };
}

module.exports = {
  'dashboard shows exact outstanding, overdue and aged receivables from seed data': async ({ page, assert }) => {
    assert.strictEqual(await tile(page, 'Outstanding').innerText(), '£24,472.00');
    assert.strictEqual(await tile(page, 'Overdue').innerText(), '£9,511.00');
    const amounts = await page.locator('.aged-amount').allInnerTexts();
    assert.deepStrictEqual(amounts, ['£14,961.00', '£1,732.80', '£2,231.20', '£1,542.00', '£4,005.00']);
    assert.ok((await page.locator('[data-tile="Paid this month"] .tile-value').innerText()).startsWith('£'));
  },

  'totals with mixed tax and a percentage discount are exact, live and after saving': async ({ page, assert }) => {
    await newInvoice(page, [
      { description: 'Design', qty: '3', unit: '33.33', tax: '20' },
      { description: 'Reduced rate work', qty: '1.5', unit: '120.00', tax: '5' },
      { description: 'Zero rated print', qty: '1', unit: '19.99', tax: '0' },
    ]);
    await page.getByLabel('Discount', { exact: true }).selectOption('percent');
    await page.getByLabel('Discount percent').fill('10');
    const check = async () => {
      assert.strictEqual(await total(page, 'subtotal').innerText(), '£299.98');
      assert.strictEqual(await total(page, 'discount').innerText(), '-£30.00');
      // The discount of 30.00 splits 10.00 / 18.00 / 2.00, then tax rounds once per rate.
      assert.strictEqual(await total(page, 'tax-20').innerText(), '£18.00');
      assert.strictEqual(await total(page, 'tax-5').innerText(), '£8.10');
      assert.strictEqual(await total(page, 'tax-0').innerText(), '£0.00');
      assert.strictEqual(await total(page, 'total').innerText(), '£296.08');
    };
    await check();
    assert.match(await page.locator('.sheet [data-total="tax-20"] dt').innerText(), /on £89\.99/);
    await saveInvoice(page);
    await check();
    assert.strictEqual(await summaryValue(page).innerText(), '£296.08');
  },

  'a fixed discount is shared across tax rates and rounds to whole cents': async ({ page, assert }) => {
    await newInvoice(page, [
      { description: 'Standard', qty: '1', unit: '100.00', tax: '20' },
      { description: 'Zero rated', qty: '1', unit: '50.00', tax: '0' },
    ]);
    await page.getByLabel('Discount', { exact: true }).selectOption('fixed');
    await page.getByLabel('Discount amount').fill('10');
    assert.strictEqual(await total(page, 'discount').innerText(), '-£10.00');
    assert.strictEqual(await total(page, 'tax-20').innerText(), '£18.67'); // 20% of 93.33
    assert.strictEqual(await total(page, 'total').innerText(), '£158.67');
  },

  'rounding works in integer cents where floats would go wrong': async ({ page, assert }) => {
    await newInvoice(page, [{ description: 'Half cent case', qty: '1.005', unit: '1.00', tax: '7.5' }]);
    // 1.005 x 1.00 rounds up to 1.01 (floats give 1.00). Tax 0.07575 rounds to 0.08.
    assert.strictEqual(await page.getByLabel('Amount, line 1').innerText(), '£1.01');
    assert.strictEqual(await total(page, 'total').innerText(), '£1.09');
    await setLine(page, 1, { qty: '1.5', unit: '0.33', tax: '0' });
    assert.strictEqual(await page.getByLabel('Amount, line 1').innerText(), '£0.50');
    await setLine(page, 1, { qty: '3', unit: '0.07', tax: '17.5' });
    assert.strictEqual(await total(page, 'subtotal').innerText(), '£0.21');
    assert.strictEqual(await total(page, 'tax-17.5').innerText(), '£0.04');
    await setLine(page, 1, { qty: '99999', unit: '9999999.99', tax: '0' });
    assert.strictEqual(await total(page, 'total').innerText(), '£999,989,999,000.01');
  },

  'partial payments reduce the balance until the invoice is paid': async ({ page, assert }) => {
    await sentInvoice(page, [{ description: 'Stage work', qty: '1', unit: '1000.00', tax: '20' }]);
    assert.strictEqual(await badge(page).innerText(), 'Sent');
    assert.strictEqual(await summaryValue(page).innerText(), '£1,200.00');

    await recordPayment(page, '250.50');
    assert.strictEqual(await badge(page).innerText(), 'Partially paid');
    assert.strictEqual(await summaryValue(page).innerText(), '£949.50');

    await recordPayment(page, '2000');
    assert.match(await page.locator('.modal .field-error:not([hidden])').innerText(), /more than the £949\.50/);
    await page.getByLabel('Amount', { exact: true }).fill('300');
    await page.locator('.modal-foot .btn-primary').click();
    assert.strictEqual(await summaryValue(page).innerText(), '£649.50');
    assert.strictEqual(await total(page, 'paid').innerText(), '-£550.50');
    assert.strictEqual(await total(page, 'balance').innerText(), '£649.50');
    assert.strictEqual(await page.locator('.payment-list li').count(), 2);

    await recordPayment(page, '649.50');
    assert.strictEqual(await badge(page).innerText(), 'Paid');
    assert.strictEqual(await summaryValue(page).innerText(), '£0.00');
    assert.strictEqual(await button(page, 'Record payment').count(), 0);

    await page.getByRole('button', { name: 'Delete payment of £300.00' }).click();
    assert.strictEqual(await summaryValue(page).innerText(), '£300.00');
    assert.strictEqual(await badge(page).innerText(), 'Partially paid');
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    assert.strictEqual(await badge(page).innerText(), 'Paid');
  },

  'overdue is computed from the due date, and the due date itself is on time': async ({ page, assert }) => {
    await newInvoice(page, [{ description: 'Late job', qty: '1', unit: '100.00', tax: '0' }]);
    await page.getByLabel('Issue date').fill(isoDaysFromNow(-31));
    await page.getByLabel('Payment terms').selectOption('30');
    assert.strictEqual(await page.getByLabel('Due date').inputValue(), isoDaysFromNow(-1));
    await saveInvoice(page);
    assert.strictEqual(await badge(page).innerText(), 'Draft');
    await button(page, 'Mark as sent').click();
    assert.strictEqual(await badge(page).innerText(), 'Overdue');
    assert.match(await page.locator('.summary-top').innerText(), /1 day late/);

    await recordPayment(page, '40');
    assert.strictEqual(await badge(page).innerText(), 'Overdue');
    await go(page, '#/dashboard');
    assert.strictEqual(await tile(page, 'Overdue').innerText(), '£9,571.00');
    assert.deepStrictEqual((await page.locator('.aged-amount').allInnerTexts())[1], '£1,792.80');

    await newInvoice(page, [{ description: 'On time', qty: '1', unit: '100.00', tax: '0' }]);
    await page.getByLabel('Issue date').fill(isoDaysFromNow(-30));
    await page.getByLabel('Payment terms').selectOption('30');
    assert.strictEqual(await page.getByLabel('Due date').inputValue(), isoDaysFromNow(0));
    await saveInvoice(page);
    await button(page, 'Mark as sent').click();
    assert.strictEqual(await badge(page).innerText(), 'Sent');
  },

  'invoice numbers run in sequence and a sent number is never reused': async ({ page, assert }) => {
    const heading = () => page.locator('.page-head h1').innerText();
    await newInvoice(page);
    assert.match(await page.locator('.page-sub').innerText(), /INV-0059/);
    await saveInvoice(page);
    assert.strictEqual(await heading(), 'INV-0059');

    await newInvoice(page);
    await saveInvoice(page);
    assert.strictEqual(await heading(), 'INV-0060');

    // Deleting the newest draft hands its number back.
    await button(page, 'Delete').click();
    await page.waitForSelector('.table');
    await newInvoice(page);
    assert.match(await page.locator('.page-sub').innerText(), /INV-0060/);
    await saveInvoice(page);
    assert.strictEqual(await heading(), 'INV-0060');

    // Deleting a sent invoice does not.
    await button(page, 'Mark as sent').click();
    await button(page, 'Delete').click();
    await page.waitForSelector('.table');
    await newInvoice(page);
    assert.match(await page.locator('.page-sub').innerText(), /INV-0061/);

    // Quotes count separately.
    await page.evaluate(() => { document.querySelector('.page-actions a.btn').click(); });
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await go(page, '#/quotes/new');
    assert.match(await page.locator('.page-sub').innerText(), /QUO-0024/);
  },

  'settings refuse a next number that is already used, and accept a jump ahead': async ({ page, assert }) => {
    await go(page, '#/settings');
    await page.getByLabel('Next invoice number').fill('12');
    await page.locator('#save-settings').click();
    assert.match(await page.locator('.field-error:not([hidden])').first().innerText(), /59 or higher/);
    await page.getByLabel('Next invoice number').fill('200');
    await page.getByLabel('Invoice prefix').fill('LS-');
    await page.locator('#save-settings').click();
    await newInvoice(page);
    await saveInvoice(page);
    assert.strictEqual(await page.locator('.page-head h1').innerText(), 'LS-0200');
    assert.strictEqual(await page.locator('.sheet-number').innerText(), 'LS-0200');
  },

  'the due date follows payment terms and each client default': async ({ page, assert }) => {
    await go(page, '#/invoices/new');
    await page.getByLabel('Client', { exact: true }).selectOption({ label: 'Quayside Ceramics' });
    assert.strictEqual(await page.getByLabel('Payment terms').inputValue(), '14');
    assert.strictEqual(await page.getByLabel('Due date').inputValue(), isoDaysFromNow(14));
    await page.getByLabel('Payment terms').selectOption('60');
    assert.strictEqual(await page.getByLabel('Due date').inputValue(), isoDaysFromNow(60));
    await page.getByLabel('Payment terms').selectOption('0');
    assert.strictEqual(await page.getByLabel('Due date').inputValue(), isoDaysFromNow(0));
    await page.getByLabel('Due date').fill(isoDaysFromNow(9));
    assert.strictEqual(await page.getByLabel('Payment terms').inputValue(), 'custom');
    await page.getByLabel('Due date').fill(isoDaysFromNow(-2));
    await setLine(page, 1, { description: 'Job', unit: '10' });
    await page.locator('#save-document').click();
    assert.match(await page.locator('.field-error:not([hidden])').first().innerText(), /cannot be before the issue date/);
  },

  'lines reorder by dragging, by keyboard and by buttons, and the preview follows': async ({ page, assert }) => {
    await newInvoice(page, [
      { description: 'First', qty: '1', unit: '1', tax: '0' },
      { description: 'Second', qty: '1', unit: '2', tax: '0' },
      { description: 'Third', qty: '1', unit: '3', tax: '0' },
    ]);
    const order = () => page.locator('.sheet .line-title').allInnerTexts();
    assert.deepStrictEqual(await order(), ['First', 'Second', 'Third']);

    await button(page, 'Move line 1 down').click();
    assert.deepStrictEqual(await order(), ['Second', 'First', 'Third']);

    await page.getByRole('button', { name: /^Reorder line 3/ }).focus();
    await page.keyboard.press('ArrowUp');
    assert.deepStrictEqual(await order(), ['Second', 'Third', 'First']);

    const from = await page.getByRole('button', { name: /^Reorder line 3/ }).boundingBox();
    const to = await page.getByLabel('Description, line 1').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y - 2, { steps: 8 });
    await page.mouse.up();
    assert.deepStrictEqual(await order(), ['First', 'Second', 'Third']);
    assert.strictEqual(await page.getByLabel('Description, line 1').inputValue(), 'First');

    await saveInvoice(page);
    assert.deepStrictEqual(await order(), ['First', 'Second', 'Third']);
  },

  'a quote converts once into an invoice with matching totals': async ({ page, assert }) => {
    await go(page, '#/quotes');
    await page.getByRole('link', { name: 'QUO-0021' }).click();
    await page.waitForSelector('.summary');
    assert.strictEqual(await page.locator('.sheet-kind').innerText(), 'Quote');
    assert.strictEqual(await badge(page).innerText(), 'Accepted');
    const quoteTotal = await total(page, 'total').innerText();
    assert.strictEqual(quoteTotal, '£2,916.00');
    await button(page, 'Convert to invoice').click();
    await page.waitForFunction(() => location.hash.startsWith('#/invoices/'));
    await page.waitForSelector('.sheet-kind:has-text("Invoice")');
    assert.strictEqual(await page.locator('.page-head h1').innerText(), 'INV-0059');
    assert.strictEqual(await badge(page).innerText(), 'Draft');
    assert.strictEqual(await total(page, 'total').innerText(), quoteTotal);
    assert.match(await page.locator('.summary-link').innerText(), /QUO-0021/);

    await page.getByRole('link', { name: 'QUO-0021' }).click();
    await page.waitForSelector('.sheet-kind:has-text("Quote")');
    assert.strictEqual(await badge(page).innerText(), 'Converted');
    assert.strictEqual(await button(page, 'Convert to invoice').count(), 0);
    assert.match(await page.locator('.summary-link').innerText(), /INV-0059/);
  },

  'duplicating an invoice makes a new draft dated today with no payments': async ({ page, assert }) => {
    await go(page, '#/invoices');
    await page.getByRole('link', { name: 'INV-0046' }).click();
    await page.waitForSelector('.summary');
    const originalTotal = await total(page, 'total').innerText();
    assert.strictEqual(originalTotal, '£3,031.20');
    await button(page, 'Duplicate').click();
    await page.waitForSelector('#save-document');
    assert.strictEqual(await page.locator('.page-head h1').innerText(), 'Edit INV-0059');
    assert.strictEqual(await page.getByLabel('Issue date').inputValue(), isoDaysFromNow(0));
    assert.strictEqual(await page.getByLabel('Due date').inputValue(), isoDaysFromNow(30));
    assert.strictEqual(await total(page, 'total').innerText(), originalTotal);
    assert.strictEqual(await total(page, 'paid').count(), 0);
    await go(page, '#/invoices/inv-46');
    await page.waitForSelector('.summary');
    assert.strictEqual(await summaryValue(page).innerText(), '£2,231.20');
  },

  'data persists after reload': async ({ page, assert, reload }) => {
    await sentInvoice(page, [{ description: 'Persisted job', qty: '2', unit: '45.50', tax: '20' }]);
    await recordPayment(page, '10');
    const hash = await page.evaluate(() => location.hash);
    await reload();
    assert.strictEqual(await page.evaluate(() => location.hash), hash);
    await page.waitForSelector('.summary');
    assert.strictEqual(await page.locator('.page-head h1').innerText(), 'INV-0059');
    assert.strictEqual(await page.locator('.sheet .line-title').innerText(), 'Persisted job');
    assert.strictEqual(await summaryValue(page).innerText(), '£99.20');
    await newInvoice(page);
    assert.match(await page.locator('.page-sub').innerText(), /INV-0060/);
  },

  'CSV and JSON exports hold the data, and JSON imports back': async ({ page, assert }) => {
    await go(page, '#/settings');
    const csv = await downloadText(page, () => button(page, 'Invoices').click());
    assert.match(csv.name, /^billcraft-invoices-.*\.csv$/);
    const rows = csv.text.trim().split('\r\n');
    assert.strictEqual(rows.length, 19);
    assert.strictEqual(rows[0], 'Number,Client,Issue date,Due date,Status,Subtotal,Discount,Tax,Total,Paid,Balance');
    assert.ok(rows.some((r) => r.startsWith('INV-0046,Quayside Ceramics,') && r.endsWith(',Overdue,2526.00,0.00,505.20,3031.20,800.00,2231.20')));

    const payments = await downloadText(page, () => button(page, 'Payments').click());
    assert.ok(payments.text.includes('INV-0041,Tallis Architects LLP,1500.00,Bank transfer'));

    const backup = await downloadText(page, () => page.locator('#export-json').click());
    assert.strictEqual(JSON.parse(backup.text).app, 'billcraft');
    assert.strictEqual(JSON.parse(backup.text).data.invoices.length, 18);

    const file = path.join(os.tmpdir(), `billcraft-${Date.now()}.json`);
    fs.writeFileSync(file, backup.text);
    await go(page, '#/invoices/inv-58');
    await page.waitForSelector('.summary');
    await button(page, 'Delete').click();
    await go(page, '#/settings');
    await page.locator('#import-file').setInputFiles(file);
    await page.waitForSelector('#toast-root .toast');
    assert.match(await toast(page).innerText(), /Imported 18 invoices, 6 quotes and 7 clients/);
    await go(page, '#/invoices/inv-58');
    await page.waitForSelector('.summary');
    assert.strictEqual(await total(page, 'total').innerText(), '£950.40');
    fs.unlinkSync(file);
  },

  'import rejects bad files, explains why and changes nothing': async ({ page, assert }) => {
    await go(page, '#/settings');
    const write = (name, body) => {
      const file = path.join(os.tmpdir(), `billcraft-${Date.now()}-${name}.json`);
      fs.writeFileSync(file, body);
      return file;
    };
    const report = page.locator('.import-report .form-alert');
    const notJson = write('a', 'not json {');
    await page.locator('#import-file').setInputFiles(notJson);
    await report.waitFor();
    assert.match(await report.innerText(), /not valid JSON/);

    const wrong = write('b', JSON.stringify({ hello: 'world' }));
    await page.locator('#import-file').setInputFiles(wrong);
    await page.waitForSelector('.import-report:has-text("not a Billcraft backup")');

    const broken = write('c', JSON.stringify({
      app: 'billcraft',
      data: {
        profile: { name: 'X', currency: 'GBP' },
        clients: [{ id: 'a', name: 'A' }],
        items: [{ id: 'i', name: 'Bad', unitCents: -5, taxBp: 0 }],
        invoices: [{ id: 'x', seq: 1, number: 'N1', clientId: 'missing', issueDate: '2026-02-31', dueDate: '2026-03-01', status: 'sent', lines: [] }],
        quotes: [],
      },
    }));
    await page.locator('#import-file').setInputFiles(broken);
    await page.waitForSelector('.import-report:has-text("invalid price")');
    assert.match(await report.innerText(), /invalid date/);
    assert.match(await report.innerText(), /Nothing was imported/);
    await go(page, '#/invoices');
    assert.strictEqual(await page.locator('.table tbody tr').count(), 18);
    [notJson, wrong, broken].forEach((f) => fs.unlinkSync(f));
  },

  'the editor reports validation errors and saves nothing': async ({ page, assert }) => {
    await go(page, '#/invoices/new');
    await page.locator('#save-document').click();
    const errors = () => page.locator('.field-error:not([hidden])').allInnerTexts();
    let shown = await errors();
    assert.ok(shown.includes('Choose who this is for.'));
    assert.ok(shown.includes('Add a description.'));
    await page.getByLabel('Client', { exact: true }).selectOption({ label: 'Oakhollow Cider' });
    await setLine(page, 1, { description: 'Bad numbers', qty: 'abc', unit: '1.234', tax: '120' });
    await page.getByLabel('Discount', { exact: true }).selectOption('percent');
    await page.getByLabel('Discount percent').fill('150');
    await page.locator('#save-document').click();
    shown = await errors();
    assert.ok(shown.some((e) => /Quantity must be/.test(e)));
    assert.ok(shown.some((e) => /Price must be/.test(e)));
    assert.ok(shown.some((e) => /Tax cannot be above 100/.test(e)));
    assert.ok(shown.some((e) => /cannot be above 100\./.test(e)));
    assert.ok((await page.evaluate(() => location.hash)).endsWith('/new'));

    await page.getByLabel('Discount', { exact: true }).selectOption('fixed');
    await page.getByLabel('Discount amount').fill('5');
    await setLine(page, 1, { qty: '1', unit: '1.00', tax: '0' });
    await page.locator('#save-document').click();
    assert.ok((await errors()).some((e) => /more than the subtotal of £1\.00/.test(e)));

    // Leaving with unsaved work asks first.
    await go(page, '#/clients');
    await page.getByRole('dialog').waitFor();
    await button(page, 'Keep editing').click();
    assert.ok((await page.evaluate(() => location.hash)).endsWith('/new'));
    assert.strictEqual(await page.getByLabel('Description, line 1').inputValue(), 'Bad numbers');
  },

  'an invoice total cannot drop below what has already been paid': async ({ page, assert }) => {
    await sentInvoice(page, [{ description: 'Paid part', qty: '1', unit: '100.00', tax: '0' }]);
    await recordPayment(page, '60');
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.waitForSelector('#save-document');
    await setLine(page, 1, { unit: '50.00' });
    await page.locator('#save-document').click();
    assert.match(await page.locator('.form-alert').innerText(), /cannot be lower than the £60\.00 already paid/);
  },

  'deleting offers undo, and clients with documents are protected': async ({ page, assert }) => {
    await go(page, '#/invoices/inv-50');
    await page.waitForSelector('.summary');
    await button(page, 'Delete').click();
    await page.waitForSelector('.table');
    assert.strictEqual(await page.getByRole('link', { name: 'INV-0050' }).count(), 0);
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('link', { name: 'INV-0050' }).waitFor();

    await go(page, '#/clients');
    await button(page, 'Delete Oakhollow Cider').click();
    await page.getByRole('dialog').waitFor();
    assert.match(await page.getByRole('dialog').innerText(), /has 2 invoices and 1 quote/);
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.getByRole('dialog').count(), 0);

    await button(page, 'New client').click();
    await page.getByLabel('Name').fill('Withy Bank Nursery');
    await page.getByLabel('Email').fill('not an email');
    await page.locator('.modal-foot .btn-primary').click();
    assert.match(await page.locator('.modal .field-error:not([hidden])').innerText(), /valid email/);
    await page.getByLabel('Email').fill('office@withybank.example');
    await page.locator('.modal-foot .btn-primary').click();
    await page.getByRole('link', { name: 'Withy Bank Nursery' }).waitFor();
    await button(page, 'Delete Withy Bank Nursery').click();
    assert.strictEqual(await page.getByRole('link', { name: 'Withy Bank Nursery' }).count(), 0);
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('link', { name: 'Withy Bank Nursery' }).waitFor();
  },

  'reset demo data restores the seed after changes': async ({ page, assert }) => {
    await sentInvoice(page);
    await go(page, '#/settings');
    await page.getByLabel('Business name').fill('Changed Name Ltd');
    await page.locator('#save-settings').click();
    await button(page, 'Reset demo data').first().click();
    await go(page, '#/invoices');
    assert.strictEqual(await page.locator('.table tbody tr').count(), 18);
    await go(page, '#/settings');
    assert.strictEqual(await page.getByLabel('Business name').inputValue(), 'Larkfield Studio');
    assert.strictEqual(await page.getByLabel('Next invoice number').inputValue(), '59');
  },

  'print shows only the document and uses the chosen paper size': async ({ page, assert }) => {
    await go(page, '#/invoices/inv-46');
    await page.waitForSelector('.summary');
    await page.emulateMedia({ media: 'print' });
    const visible = async (selector) => page.locator(selector).first().isVisible();
    assert.strictEqual(await visible('.sheet'), true);
    for (const selector of ['.side', '.detail-side', '.page-head', '.tab-bar', '.mobile-bar']) {
      assert.strictEqual(await visible(selector), false, `${selector} should be hidden in print`);
    }
    const sheet = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.sheet'));
      return { transform: s.transform, background: s.backgroundColor };
    });
    assert.strictEqual(sheet.transform, 'none');
    assert.strictEqual(sheet.background, 'rgb(255, 255, 255)');
    await page.emulateMedia({ media: 'screen' });
    assert.match(await page.locator('#page-size').innerText().catch(() => page.locator('#page-size').textContent()), /A4/);
    await go(page, '#/settings');
    await page.getByLabel('Paper size').selectOption('Letter');
    await page.locator('#save-settings').click();
    assert.match(await page.locator('#page-size').textContent(), /size: letter/);
  },

  'a logo upload is stored as a data URL and appears on invoices': async ({ page, assert, reload }) => {
    await go(page, '#/settings');
    const png = path.join(os.tmpdir(), `billcraft-logo-${Date.now()}.png`);
    fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
    const notImage = path.join(os.tmpdir(), `billcraft-logo-${Date.now()}.txt`);
    fs.writeFileSync(notImage, 'text');
    await page.locator('#logo-file').setInputFiles(notImage);
    await page.waitForSelector('.field-error:has-text("Choose a PNG")');
    await page.locator('#logo-file').setInputFiles(png);
    await page.waitForFunction(() => document.querySelector('.logo-preview img')?.src.startsWith('data:image/png'));
    await page.locator('#save-settings').click();
    await reload();
    await go(page, '#/invoices/inv-46');
    await page.waitForSelector('.sheet-logo');
    assert.match(await page.locator('.sheet-logo').getAttribute('src'), /^data:image\/png;base64,/);
    fs.unlinkSync(png);
    fs.unlinkSync(notImage);
  },

  'client statements have exact running balances and respect the period': async ({ page, assert }) => {
    await go(page, '#/clients/c-tallis');
    await page.waitForSelector('.sheet-ledger');
    await page.getByLabel('Statement period').selectOption('all');
    const balances = () => page.locator('.sheet-ledger tbody tr td:last-child').allInnerTexts();
    assert.deepStrictEqual(await balances(), ['£0.00', '£5,505.00', '£4,005.00', '£5,723.40', '£4,005.00', '£11,109.00']);
    assert.strictEqual(await page.locator('.sheet [data-total="closing"] dd').innerText(), '£11,109.00');

    await page.getByLabel('Statement period').selectOption('30');
    assert.deepStrictEqual(await balances(), ['£5,723.40', '£4,005.00', '£11,109.00']);

    await page.getByLabel('Statement period').selectOption('custom');
    await page.getByLabel('From', { exact: true }).fill(isoDaysFromNow(0));
    await page.getByLabel('To', { exact: true }).fill(isoDaysFromNow(-5));
    await page.waitForSelector('.field-error:has-text("on or before")');
    await page.getByLabel('To', { exact: true }).fill(isoDaysFromNow(0));
    assert.deepStrictEqual(await balances(), ['£11,109.00']);

    const csv = await downloadText(page, () => button(page, 'Export CSV').click());
    assert.match(csv.name, /^billcraft-statement-tallis-architects-llp/);
    assert.ok(csv.text.includes('Opening balance,,,11109.00'));
  },

  'catalogue items can be managed, searched and added to an invoice': async ({ page, assert }) => {
    await go(page, '#/catalogue');
    await button(page, 'New item').click();
    await page.locator('.modal-foot .btn-primary').click();
    assert.strictEqual(await page.locator('.modal .field-error:not([hidden])').count(), 2);
    await page.getByLabel('Name').fill('Workshop facilitation');
    await page.getByLabel('Description').fill('Half day, up to eight people');
    await page.getByLabel('Unit price').fill('640');
    await page.getByLabel('Tax %').fill('5');
    await page.locator('.modal-foot .btn-primary').click();
    await page.getByRole('cell', { name: 'Workshop facilitation', exact: true }).waitFor();

    await button(page, 'Edit Workshop facilitation').click();
    await page.getByLabel('Unit price').fill('660.50');
    await page.locator('.modal-foot .btn-primary').click();
    await page.getByRole('cell', { name: '£660.50' }).waitFor();

    await page.getByPlaceholder('Search catalogue').fill('facilitation');
    assert.strictEqual(await page.locator('.table tbody tr').count(), 1);

    await newInvoice(page, [{ description: 'Opening call', qty: '1', unit: '100', tax: '20' }]);
    await button(page, 'Add from catalogue').click();
    await page.getByPlaceholder('Search catalogue').fill('workshop');
    await page.locator('.picker-row').first().click();
    assert.strictEqual(await page.getByLabel('Description, line 2').inputValue(), 'Workshop facilitation\nHalf day, up to eight people');
    assert.strictEqual(await total(page, 'tax-5').innerText(), '£33.03'); // 5% of 660.50 is 33.025
    assert.strictEqual(await total(page, 'total').innerText(), '£813.53');

    await go(page, '#/catalogue');
    await button(page, 'Discard changes').click();
    await page.getByPlaceholder('Search catalogue').fill('');
    await button(page, 'Delete Workshop facilitation').click();
    assert.strictEqual(await page.getByRole('cell', { name: 'Workshop facilitation', exact: true }).count(), 0);
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('cell', { name: 'Workshop facilitation', exact: true }).waitFor();
  },

  'search and status filters narrow the invoice list': async ({ page, assert }) => {
    await go(page, '#/invoices');
    await page.getByRole('button', { name: /^Overdue/ }).click();
    assert.strictEqual(await page.locator('.table tbody tr').count(), 4);
    await page.getByPlaceholder('Search invoices').fill('tallis');
    assert.strictEqual(await page.locator('.table tbody tr').count(), 1);
    await page.getByRole('button', { name: /^Draft/ }).click();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    assert.strictEqual(await page.locator('.table tbody tr').count(), 18);
    await page.getByRole('button', { name: 'Total', exact: true }).click();
    assert.strictEqual(await page.locator('.table tbody tr').first().locator('td').first().innerText(), 'INV-0055');
  },

  'user text is escaped and corrupt storage cannot crash the app': async ({ page, assert, reload }) => {
    await go(page, '#/clients');
    await button(page, 'New client').click();
    await page.getByLabel('Name').fill('<img src=x onerror="window.__hacked=1">');
    await page.locator('.modal-foot .btn-primary').click();
    await page.getByRole('link', { name: '<img src=x' }).waitFor();
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(() => window.__hacked), undefined);

    await page.evaluate(() => localStorage.setItem('billcraft.data.v1', '{"invoices":[{"bad":1}],"clients":"nope"'));
    await reload();
    await go(page, '#/dashboard');
    assert.strictEqual(await tile(page, 'Outstanding').innerText(), '£24,472.00');

    await page.evaluate(() => localStorage.setItem('billcraft.data.v1', JSON.stringify({ profile: { name: 'Kept' }, clients: 'nope', invoices: [{ bad: 1 }, null] })));
    await reload();
    await go(page, '#/dashboard');
    assert.strictEqual(await tile(page, 'Outstanding').innerText(), '£0.00');
    await go(page, '#/invoices');
    await page.getByText('No invoices yet').waitFor();
  },

  'the theme toggle is remembered': async ({ page, assert, reload }) => {
    const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.locator('.side [data-theme-toggle]').click();
    assert.strictEqual(await theme(), 'dark');
    await reload();
    assert.strictEqual(await theme(), 'dark');
    assert.strictEqual(await page.locator('.side [data-theme-toggle]').innerText(), 'Light theme');
  },
};
