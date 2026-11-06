// Scripted demo: from the dashboard, through a new invoice and a part payment, to a clean printed page.
module.exports = {
  name: 'Billcraft',
  tagline: 'Invoicing for freelancers and small studios',
  scope: ['Invoices and quotes with live preview', 'Partial payments and aged receivables', 'Print-ready documents and client statements'],
  accent: '#0f5e5b',
  run: async (d) => {
    const { page } = d;
    const label = (text) => page.getByLabel(text, { exact: true });
    const addFromCatalogue = async (name) => {
      await d.click(page.getByRole('button', { name: 'Add from catalogue' }), { hold: 200 });
      await d.click(page.locator('.picker-row', { hasText: name }), { hold: 300 });
    };

    await d.caption('The dashboard shows what is owed, what is late and how old the debt is.', 2700);
    await d.move('.aged-row[data-bucket="older"]', 500);
    await d.wait(300);

    await d.caption('A new invoice takes the next number and the client\'s payment terms.', 0);
    await d.click('a.btn-primary[href="#/invoices/new"]', { hold: 300 });
    await d.select(label('Client'), { label: 'Oakhollow Cider' });
    await d.wait(1000);

    await d.caption('Catalogue items drop in with their price and tax, and the preview follows.', 0);
    await addFromCatalogue('Brand identity system');
    await addFromCatalogue('Printed brochures');
    await d.wait(400);

    await d.caption('Each line has its own tax rate: 20% on design, 0% on print.', 0);
    await d.type(label('Quantity, line 2'), '4', { delay: 60 });
    await d.wait(1500);

    await d.caption('Lines reorder by dragging, or with the keyboard.', 0);
    await d.drag(page.getByRole('button', { name: /^Reorder line 2/ }), page.getByRole('button', { name: /^Reorder line 1/ }), { ms: 700 });
    await d.wait(800);

    await d.caption('A 7.5% discount comes off before tax, and totals stay in exact cents.', 0);
    await d.select(label('Discount'), 'percent');
    await d.type(label('Discount percent'), '7.5', { delay: 70 });
    await d.wait(900);
    await d.poster();

    await d.caption('Mark it as sent, then record a deposit. Balance and status follow.', 0);
    await d.click('#save-document', { hold: 500 });
    await d.click(page.getByRole('button', { name: 'Mark as sent' }), { hold: 400 });
    await d.click(page.getByRole('button', { name: 'Record payment' }), { hold: 200 });
    await d.type(label('Amount'), '2500', { delay: 70 });
    await d.click('.modal-foot .btn-primary', { hold: 300 });
    await d.wait(1200);

    await d.caption('Print removes the app around it, leaving a clean A4 or Letter invoice.', 0);
    await page.emulateMedia({ media: 'print' });
    await d.wait(2600);
    await page.emulateMedia({ media: 'screen' });

    await d.caption('An accepted quote becomes an invoice in one click, with the next number.', 0);
    await d.click('.side-nav a[data-nav="quotes"]', { hold: 300 });
    await d.click(page.getByRole('link', { name: 'QUO-0021' }), { hold: 300 });
    await d.click(page.getByRole('button', { name: 'Convert to invoice' }), { hold: 300 });
    await d.wait(800);

    await d.caption('Each client gets a statement with a running balance, ready to print.', 0);
    await d.click('.side-nav a[data-nav="clients"]', { hold: 300 });
    await d.click(page.getByRole('link', { name: 'Tallis Architects LLP' }), { hold: 300 });
    await d.wait(1500);

    await d.caption('Back on the dashboard, the new invoice and the deposit are already counted.', 0);
    await d.click('.side-nav a[data-nav="dashboard"]', { hold: 300 });
    await d.wait(500);
    await d.move('[data-tile="Paid this month"]', 500);
    await d.wait(1200);
  },
};
