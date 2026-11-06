// Scripted demo: from a sample file to a saved chart, then a large file and a messy one.
const MESSY_CSV = [
  '﻿invoice;customer;note;amount',
  'INV-204;"Harbor; Lane Supply";"Paid by ""standing order""";1.240,50',
  'INV-205;Northgate Timber;"Two lines:\nchecked and sent";86,20',
  'INV-206;Fennel & Rye;;312,00',
  'INV-207;Saltfleet Marine;Part paid;2.905,75',
].join('\r\n');

module.exports = {
  name: 'Gridlens',
  tagline: 'Open a CSV and get answers, without uploading anything',
  scope: ['CSV parsing and type inference', 'Profile, filter, pivot and chart', 'Computed columns and saved views'],
  accent: '#1f4fcc',
  run: async (d) => {
    const { page } = d;
    await page.waitForSelector('[role=gridcell]');

    const quick = { hold: 120 };

    await d.caption('A CSV opens right here: 12,000 sales orders, parsed in a background worker.', 2000);
    await d.move('#privacy', 300);
    await d.caption('Nothing is uploaded. There is no server, and files never leave the browser.', 2000);

    await d.caption('Each column gets a detected type and a profile: top values, or a histogram and median.', 900);
    await d.click('.grid-body .row[aria-rowindex="7"] [role=gridcell][data-col="4"]', { hold: 700 });

    await d.caption('Filters combine with AND, by column type. Here: West region, totals over 1,000.', 0);
    await d.click(page.locator('.top-row', { hasText: 'West' }), quick);
    await d.click('#inspector-tab-filters', quick);
    await d.click('#add-filter', quick);
    await d.select(page.locator('.condition-col').last(), 'total', { hold: 100 });
    await d.type(page.locator('.condition-value').last(), '1000', { delay: 30, hold: 300 });

    await d.click('#inspector-tab-columns', quick);
    await d.click('#add-computed', quick);
    await d.type('#computed-name', 'margin_pct', { delay: 15, hold: 60 });
    await d.caption('Formulas go through a parser written for this app. Unsafe input is simply rejected.', 0);
    await d.type('#computed-expr', 'window.alert(1)', { delay: 20, hold: 1400 });
    await d.caption('Valid formulas preview live, then become real columns you can filter and chart.', 0);
    await d.type('#computed-expr', 'round(margin / total * 100, 1)', { delay: 20, hold: 800 });
    await d.click('#computed-save', { hold: 300 });

    await d.caption('Pivots group the filtered rows with sum, average, count, min and max.', 0);
    await d.click('#workspace-tab-pivot', quick);
    await d.select('#pivot-split', '', { hold: 100 });
    await d.select(page.locator('.measure-agg').last(), 'avg', { hold: 60 });
    await d.select(page.locator('.measure-col').last(), 'margin_pct', { hold: 900 });

    await d.caption('Charts are drawn by hand on canvas, with axes, tooltips and PNG export.', 0);
    await d.click('#workspace-tab-chart', quick);
    await d.select('#chart-series', 'category', { hold: 200 });
    const box = await page.locator('#chart-canvas').boundingBox();
    await d.move({ x: box.x + box.width * 0.72, y: box.y + box.height * 0.55 }, 450);
    await d.wait(300);
    await d.poster();
    await d.click('#export-btn', quick);

    await d.caption('Saved views keep filters, formulas, pivot and chart settings between visits.', 0);
    await d.click('#save-view-btn', quick);
    await d.type('#view-name', 'West revenue', { delay: 25, hold: 100 });
    await d.click('#view-save', { hold: 700 });

    await d.caption('100,000 rows scroll smoothly, because only the rows on screen exist in the page.', 0);
    await d.click('#inspector-tab-data', quick);
    await d.click('[data-sample="sales100k"]', { hold: 0 });
    await page.waitForFunction(() => document.getElementById('dataset-name').textContent === 'sales_orders_100k.csv', null, { timeout: 30000 });
    await d.scroll(1400000, '#grid', 1300);
    await d.scroll(-500000, '#grid', 600);

    await d.caption('A messy file: BOM, semicolons, quoted newlines, escaped quotes, decimal commas.', 0);
    await page.setInputFiles('#file-input', { name: 'invoices_export.csv', mimeType: 'text/csv', buffer: Buffer.from(MESSY_CSV) });
    await page.waitForFunction(() => document.getElementById('dataset-name').textContent === 'invoices_export.csv');
    await d.wait(2000);

    await d.caption('Back to the saved view: the chart returns exactly as it was left.', 0);
    await d.click('#inspector-tab-views', quick);
    await d.click(page.locator('.view-row[data-name="West revenue"] .view-open'), { hold: 900 });
  },
};
