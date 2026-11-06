// Feature tests for Gridlens. Files are uploaded through the real file input with setInputFiles,
// and expected values are worked out by hand from the small CSVs in each test.
const fs = require('fs');

/** The app has finished opening its first dataset. */
const ready = (page) => page.waitForFunction(() => document.getElementById('dataset-name').textContent !== 'Loading');

async function upload(page, name, content) {
  await ready(page);
  await page.setInputFiles('#file-input', { name, mimeType: 'text/csv', buffer: Buffer.from(content) });
  await page.waitForFunction((n) => document.getElementById('dataset-name').textContent === n, name);
}

/** The rendered rows as arrays of cell text, in row order and then column order. */
function readRows(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.grid-body .row'))
    .filter((row) => row.style.display !== 'none')
    .sort((a, b) => a.getAttribute('aria-rowindex') - b.getAttribute('aria-rowindex'))
    .map((row) => Array.from(row.querySelectorAll('[role=gridcell]'))
      .sort((a, b) => a.getAttribute('aria-colindex') - b.getAttribute('aria-colindex'))
      .map((cell) => cell.textContent)));
}

const headers = (page) => page.locator('.grid-head .head-text').allTextContents();
const typeOf = (page, name) => page.locator(`.head-cell[data-name="${name}"]`).getAttribute('data-type');
const rowCount = (page) => page.locator('#row-count').textContent();
const waitRowCount = (page, text) => page.waitForFunction((t) => document.getElementById('row-count').textContent === t, text);
const stat = (page, id) => page.locator(`[data-stat="${id}"] dd`).textContent();

async function selectColumn(page, name) {
  await page.click('#inspector-tab-profile');
  await page.selectOption('#profile-column', name);
  await page.waitForFunction((n) => {
    const stats = document.querySelector('#panel-profile .stats');
    return stats && document.getElementById('profile-column').value === n;
  }, name);
  await page.waitForTimeout(60);
}

async function addCondition(page, col, op, a, b) {
  await page.click('#inspector-tab-filters');
  await page.click('#add-filter');
  const last = page.locator('.condition').last();
  await last.locator('.condition-col').selectOption(col);
  await page.locator('.condition').last().locator('.condition-op').selectOption(op);
  if (a !== undefined) await page.locator('.condition').last().locator('.condition-value').nth(0).fill(a);
  if (b !== undefined) await page.locator('.condition').last().locator('.condition-value').nth(1).fill(b);
}

async function openComputed(page) {
  await page.click('#inspector-tab-columns');
  await page.click('#add-computed');
}

async function tryFormula(page, formula) {
  await page.fill('#computed-expr', formula);
  return page.locator('#computed-result').textContent();
}

function readPivot(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#pivot-table tr'))
    .map((row) => Array.from(row.children).map((cell) => cell.textContent)));
}

async function downloadText(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return { name: download.suggestedFilename(), text: fs.readFileSync(await download.path(), 'utf8'), path: await download.path() };
}

/** A small independent RFC 4180 reader, so sample checks do not depend on the app's own parser. */
function parseCsv(text) {
  const rows = [[]];
  let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { rows[rows.length - 1].push(field); field = ''; } else if (c === '\n') {
      rows[rows.length - 1].push(field.replace(/\r$/, ''));
      field = '';
      rows.push([]);
    } else field += c;
  }
  rows.pop();
  const [header, ...data] = rows;
  return data.map((row) => Object.fromEntries(header.map((name, i) => [name, row[i]])));
}

async function openSampleAndExport(page, id, name) {
  await ready(page);
  await page.click('#inspector-tab-data');
  await page.click(`[data-sample="${id}"]`);
  await page.waitForFunction((n) => document.getElementById('dataset-name').textContent === n, name);
  const { text } = await downloadText(page, () => page.click('#export-btn'));
  return parseCsv(text);
}

const PIVOT_CSV = [
  'region,product,qty,price,when',
  'East,A,2,10,2024-01-15',
  'East,B,4,,2024-01-20',
  'West,A,1,30,2024-02-01',
  'West,A,3,50,2024-02-10',
  'West,B,,70,2024-03-05',
].join('\n');

const FILTER_CSV = [
  'item,qty,when,ok,note',
  'Anvil,5,2024-01-10,yes,heavy',
  'Bolt,10,2024-02-15,no,',
  'Clamp,15,2024-03-20,yes,Light duty',
  'Drill,20,2024-04-25,no,heavy duty',
  'Eyelet,,2024-05-30,yes,small',
  'File,30,,no,light',
].join('\n');

module.exports = {
  'parses BOM, semicolons, quoted delimiters, newlines and escaped quotes exactly': async ({ page, assert }) => {
    const csv = '﻿name;note;qty\r\n"Smith; Jo";"He said ""hi""";1,5\r\n"Multi\nline";plain;2,25\r\n\r\nlast;;3';
    await upload(page, 'semi.csv', csv);
    assert.deepStrictEqual(await headers(page), ['name', 'note', 'qty']);
    assert.deepStrictEqual(await readRows(page), [
      ['Smith; Jo', 'He said "hi"', '1,5'],
      ['Multi\nline', 'plain', '2,25'],
      ['last', '', '3'],
    ]);
    assert.match(await page.locator('#status-parse').textContent(), /semicolon delimited/);
    assert.strictEqual(await typeOf(page, 'qty'), 'number');
    await selectColumn(page, 'qty');
    assert.strictEqual(await stat(page, 'sum'), '6.75');
  },

  'detects tabs and commas, and repairs ragged rows and duplicate headers': async ({ page, assert }) => {
    await upload(page, 'tabs.tsv', 'a\tb\n1\t"x,y"\n2\tz\n');
    assert.deepStrictEqual(await readRows(page), [['1', 'x,y'], ['2', 'z']]);
    assert.match(await page.locator('#status-parse').textContent(), /tab delimited/);

    await upload(page, 'ragged.csv', 'id,id,\n1,2,3,4\n5\n"6","",\n');
    assert.deepStrictEqual(await headers(page), ['id', 'id_2', 'column_3', 'column_4']);
    assert.deepStrictEqual(await readRows(page), [['1', '2', '3', '4'], ['5', '', '', ''], ['6', '', '', '']]);
    const status = await page.locator('#status-parse').textContent();
    assert.match(status, /comma delimited/);
    assert.match(status, /2 short rows padded/);
    assert.match(status, /1 extra column added/);
  },

  'infers number, date, boolean and text, and allows a manual override': async ({ page, assert }) => {
    const csv = [
      'zip,amount,flag,iso,dmy,binary,mixed,region,blank,bad_date,count',
      '02134,"$1,234.50",yes,2024-01-31,31/01/2024,0,12,NA,,2024-02-30,N/A',
      '10001,99,No,2024-02-29 14:30,01/02/2024,1,abc,EU,,2024-02-28,7',
      '94105,-3.5,YES,2023-12-01,15/03/2024,1,3,US,,2024-01-01,null',
    ].join('\n');
    await upload(page, 'types.csv', csv);
    const expected = { zip: 'text', amount: 'number', flag: 'boolean', iso: 'date', dmy: 'date', binary: 'number', mixed: 'text', region: 'text', blank: 'text', bad_date: 'text', count: 'number' };
    await page.click('#inspector-tab-columns');
    for (const [name, type] of Object.entries(expected)) {
      assert.strictEqual(await page.locator(`.column-type[data-col="${name}"]`).inputValue(), type, `type of ${name}`);
    }
    await selectColumn(page, 'amount');
    assert.strictEqual(await stat(page, 'max'), '1,234.5');
    assert.strictEqual(await stat(page, 'min'), '-3.5');
    await selectColumn(page, 'count');
    assert.strictEqual(await stat(page, 'nulls'), '2 (67%)');
    await selectColumn(page, 'dmy');
    assert.strictEqual(await stat(page, 'min'), '2024-01-31');
    assert.strictEqual(await stat(page, 'max'), '2024-03-15');
    await selectColumn(page, 'region');
    assert.strictEqual(await stat(page, 'nulls'), '0 (0.0%)', 'NA stays a value in a text column');

    await selectColumn(page, 'mixed');
    await page.selectOption('#profile-type', 'number');
    await page.waitForSelector('#panel-profile .warning-note');
    assert.match(await page.locator('#panel-profile .warning-note').textContent(), /1 value did not fit/);
    assert.strictEqual(await typeOf(page, 'mixed'), 'number');
    assert.strictEqual(await stat(page, 'median'), '7.5');
    assert.strictEqual(await page.locator('.cell.is-invalid').count(), 1);
    await page.click('#inspector-tab-columns');
    await page.locator('.column-row[data-name="mixed"] .link-btn').click();
    await page.waitForFunction(() => document.querySelector('.head-cell[data-name="mixed"]').dataset.type === 'text');
  },

  'profiles a column: median, mean, nulls, unique, histogram and top values': async ({ page, assert }) => {
    await upload(page, 'stats.csv', 'n,word\n1,red\n2,red\n3,blue\n4,\n100,green\n,red\n');
    await selectColumn(page, 'n');
    assert.strictEqual(await stat(page, 'rows'), '6');
    assert.strictEqual(await stat(page, 'nulls'), '1 (17%)');
    assert.strictEqual(await stat(page, 'unique'), '5');
    assert.strictEqual(await stat(page, 'min'), '1');
    assert.strictEqual(await stat(page, 'max'), '100');
    assert.strictEqual(await stat(page, 'mean'), '22');
    assert.strictEqual(await stat(page, 'median'), '3');
    assert.ok(await page.locator('.mini-hist .mini-bar').count() > 1, 'histogram drawn');

    await addCondition(page, 'n', 'lte', '4');
    await waitRowCount(page, '4 of 6 rows');
    await selectColumn(page, 'n');
    await page.waitForFunction(() => document.querySelector('[data-stat="median"] dd').textContent === '2.5');
    assert.strictEqual(await stat(page, 'mean'), '2.5');

    await page.click('#inspector-tab-filters');
    await page.click('#clear-filters');
    await waitRowCount(page, '6 rows');
    await selectColumn(page, 'word');
    assert.strictEqual(await stat(page, 'nulls'), '1 (17%)');
    assert.strictEqual(await stat(page, 'unique'), '3');
    assert.deepStrictEqual(await page.locator('.top-label').allTextContents(), ['red', 'blue', 'green']);
    assert.strictEqual(await page.locator('.top-count').first().textContent(), '3 · 60%');
    await page.locator('.top-row').first().click();
    await waitRowCount(page, '3 of 6 rows');
    await page.click('.toast-action');
    await waitRowCount(page, '6 rows');
  },

  'combines filter conditions with AND, per type, plus text search': async ({ page, assert }) => {
    await upload(page, 'filters.csv', FILTER_CSV);
    const items = async () => (await readRows(page)).map((row) => row[0]);

    await addCondition(page, 'qty', 'between', '10', '20');
    await waitRowCount(page, '3 of 6 rows');
    assert.deepStrictEqual(await items(), ['Bolt', 'Clamp', 'Drill']);

    await addCondition(page, 'ok', 'isTrue');
    await waitRowCount(page, '1 of 6 rows');
    assert.deepStrictEqual(await items(), ['Clamp']);

    await page.locator('.condition').last().locator('.condition-op').selectOption('isFalse');
    await waitRowCount(page, '2 of 6 rows');
    assert.deepStrictEqual(await items(), ['Bolt', 'Drill']);

    await addCondition(page, 'when', 'before', '2024-03-01');
    await waitRowCount(page, '1 of 6 rows');
    assert.deepStrictEqual(await items(), ['Bolt']);

    await page.click('#clear-filters');
    await waitRowCount(page, '6 rows');

    await addCondition(page, 'note', 'notContains', 'heavy');
    await waitRowCount(page, '4 of 6 rows');
    assert.deepStrictEqual(await items(), ['Bolt', 'Clamp', 'Eyelet', 'File'], 'does not contain keeps empty cells');
    await page.fill('#search', 'LIGHT');
    await waitRowCount(page, '2 of 6 rows');
    assert.deepStrictEqual(await items(), ['Clamp', 'File'], 'search ignores case and is ANDed');
    await page.fill('#search', '');
    await page.click('#clear-filters');
    await waitRowCount(page, '6 rows');

    await addCondition(page, 'qty', 'empty');
    await waitRowCount(page, '1 of 6 rows');
    await page.locator('.condition').last().locator('.condition-op').selectOption('notEmpty');
    await waitRowCount(page, '5 of 6 rows');
    await page.click('#clear-filters');

    await addCondition(page, 'when', 'on', '2024-03-20');
    await waitRowCount(page, '1 of 6 rows');
    await page.locator('.condition').last().locator('.condition-op').selectOption('after');
    await waitRowCount(page, '2 of 6 rows');
    await page.click('#clear-filters');
    await addCondition(page, 'note', 'equals', 'HEAVY');
    await waitRowCount(page, '1 of 6 rows');
    await page.click('#clear-filters');
    await addCondition(page, 'item', 'startsWith', 'c');
    await waitRowCount(page, '1 of 6 rows');
    await page.fill('#search', 'zzzz');
    await waitRowCount(page, '0 of 6 rows');
    assert.match(await page.locator('.grid-empty').textContent(), /No rows match/);
    await page.click('.grid-empty button');
    await waitRowCount(page, '6 rows');
    assert.strictEqual(await page.inputValue('#search'), '');
    await page.click('.toast-action');
    await waitRowCount(page, '0 of 6 rows');
  },

  'rejects invalid filter values with a visible message': async ({ page, assert }) => {
    await upload(page, 'filters2.csv', FILTER_CSV);
    await addCondition(page, 'qty', 'gt', 'abc');
    await page.waitForSelector('.condition-error:not([hidden])');
    assert.strictEqual(await page.locator('.condition-error').textContent(), 'Enter a number.');
    assert.strictEqual(await rowCount(page), '6 rows', 'an invalid condition is not applied');
    await page.locator('.condition-op').selectOption('between');
    await page.locator('.condition-value').nth(0).fill('20');
    await page.locator('.condition-value').nth(1).fill('10');
    await page.waitForFunction(() => document.querySelector('.condition-error').textContent === 'The lower bound is above the upper bound.');
    assert.strictEqual(await rowCount(page), '6 rows');
    await page.locator('.condition-value').nth(1).fill('30');
    await waitRowCount(page, '2 of 6 rows');
    assert.strictEqual(await page.locator('.condition-error').isHidden(), true);
  },

  'pivots with exact sum, average, count, min and max, including true totals': async ({ page, assert }) => {
    await upload(page, 'pivot.csv', PIVOT_CSV);
    await page.click('#workspace-tab-pivot');
    await page.selectOption('#pivot-row', 'region');
    await page.locator('.measure-agg').first().selectOption('sum');
    await page.locator('.measure-col').first().selectOption('qty');
    for (const [agg, col] of [['avg', 'price'], ['count', ''], ['min', 'price'], ['max', 'price']]) {
      await page.click('#pivot-add-measure');
      await page.locator('.measure-agg').last().selectOption(agg);
      await page.locator('.measure-col').last().selectOption(col);
    }
    assert.deepStrictEqual(await readPivot(page), [
      ['region', 'Sum of qty', 'Average of price', 'Count of rows', 'Min of price', 'Max of price'],
      ['East', '6', '10', '2', '10', '10'],
      ['West', '4', '50', '3', '30', '70'],
      ['Total', '10', '40', '5', '10', '70'],
    ], 'the total average is 40, not the average of averages (30)');

    await page.locator('.measure-agg').nth(2).selectOption('count');
    await page.locator('.measure-col').nth(2).selectOption('qty');
    assert.strictEqual((await readPivot(page))[2][3], '2', 'count of a column skips blanks');

    await page.selectOption('#pivot-row', 'when');
    while (await page.locator('.measure').count() > 1) await page.locator('.measure button').last().click();
    await page.selectOption('#pivot-split', 'product');
    assert.deepStrictEqual(await readPivot(page), [
      ['when', 'A', 'B', 'Total · Sum of qty'],
      ['2024-01', '2', '4', '6'],
      ['2024-02', '4', '', '4'],
      ['2024-03', '', '', ''],
      ['Total', '6', '4', '10'],
    ]);

    await page.locator('[data-role="bucket"]').first().selectOption('quarter');
    assert.deepStrictEqual((await readPivot(page))[1], ['2024 Q1', '6', '4', '10']);

    const { name, text } = await downloadText(page, () => page.click('#export-btn'));
    assert.strictEqual(name, 'pivot-pivot.csv');
    assert.strictEqual(text, 'when,A,B,Total · Sum of qty\r\n2024 Q1,6,4,10\r\nTotal,6,4,10\r\n');
  },

  'sorts pivot rows by a value column and rejects an unusable split': async ({ page, assert }) => {
    await upload(page, 'pivot2.csv', PIVOT_CSV);
    await page.click('#workspace-tab-pivot');
    await page.selectOption('#pivot-row', 'region');
    await page.locator('.measure-agg').first().selectOption('sum');
    await page.locator('.measure-col').first().selectOption('qty');
    await page.locator('#pivot-table thead .th-btn').nth(1).click();
    assert.strictEqual((await readPivot(page))[1][0], 'East');
    await page.locator('#pivot-table thead .th-btn').nth(1).click();
    assert.strictEqual((await readPivot(page))[1][0], 'West');

    const many = ['id,v'].concat(Array.from({ length: 80 }, (_, i) => `k${i},1`)).join('\n');
    await upload(page, 'many.csv', many);
    await page.click('#workspace-tab-pivot');
    await page.selectOption('#pivot-split', 'id');
    await page.waitForSelector('#pivot-split-error');
    assert.match(await page.locator('#pivot-split-error').textContent(), /id has 80 different values/);
    const failure = await page.locator('#export-btn').click().then(() => page.locator('.toast-error').textContent());
    assert.match(failure, /no pivot result/);
  },

  'evaluates computed columns with exact results': async ({ page, assert }) => {
    await upload(page, 'expr.csv', 'name,qty,price,when,done\nAnvil,2,10.5,2024-01-31,yes\nBolt,0,3,2024-03-01,no\nClamp,,4,,yes\n');
    await openComputed(page);
    const cases = [
      ['qty * price', 'Gives number: 21, 0, (empty)'],
      ['price / qty', 'Gives number: 5.25, (empty), (empty)'],
      ['2 + 3 * 4', 'Gives number: 14, 14, 14'],
      ['(2 + 3) * 4', 'Gives number: 20, 20, 20'],
      ['-2 * 3 + 10 % 3', 'Gives number: -5, -5, -5'],
      ['round(price / 3, 2)', 'Gives number: 3.5, 1, 1.33'],
      ['if(done, upper(name), lower(name))', 'Gives text: ANVIL, bolt, CLAMP'],
      ['year(when) + month(when)', 'Gives number: 2025, 2027, (empty)'],
      ["when > '2024-02-01'", 'Gives boolean: false, true, (empty)'],
      ['when + 1', 'Gives date: 2024-02-01, 2024-03-02, (empty)'],
      ['coalesce(qty, 99) + 1', 'Gives number: 3, 1, 100'],
      ["name + '!'", 'Gives text: Anvil!, Bolt!, Clamp!'],
      ['isnull(qty)', 'Gives boolean: false, false, true'],
      ['[qty] = 2 and done', 'Gives boolean: true, false, (empty)'],
    ];
    for (const [formula, expected] of cases) {
      assert.strictEqual(await tryFormula(page, formula), expected, formula);
    }
    assert.match(await tryFormula(page, "when - '2024-01-01'"), /Cannot apply '-' to a date and text/);

    await tryFormula(page, 'qty * price');
    await page.fill('#computed-name', 'line_total');
    await page.click('#computed-save');
    assert.deepStrictEqual((await readRows(page)).map((row) => row[5]), ['21', '0', '']);
    assert.strictEqual(await typeOf(page, 'line_total'), 'number');

    // Edit, rename, and a later column that depends on an earlier one.
    await page.click('[aria-label="Edit line_total"]');
    await page.fill('#computed-name', 'cost');
    await page.fill('#computed-expr', 'qty * price * 2');
    await page.click('#computed-save');
    assert.deepStrictEqual((await readRows(page)).map((row) => row[5]), ['42', '0', '']);
    await page.click('#add-computed');
    await page.fill('#computed-name', 'half');
    await page.fill('#computed-expr', 'cost / 2');
    await page.click('#computed-save');
    assert.deepStrictEqual((await readRows(page)).map((row) => row[6]), ['21', '0', '']);

    // Deleting cost breaks half visibly, and undo repairs it.
    await page.click('[aria-label="Delete cost"]');
    await page.waitForSelector('.column-row[data-name="half"] .error-note');
    assert.match(await page.locator('.column-row[data-name="half"] .error-note').textContent(), /Unknown column 'cost'/);
    await page.click('.toast-action');
    await page.waitForFunction(() => !document.querySelector('.column-row[data-name="half"] .error-note'));
    assert.deepStrictEqual((await readRows(page)).map((row) => row[6]), ['21', '0', '']);

    await page.click('#add-computed');
    await page.fill('#computed-name', 'cost');
    await page.fill('#computed-expr', '1');
    await page.click('#computed-save');
    assert.strictEqual(await page.locator('#computed-name-error').textContent(), 'A column with this name already exists.');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.modal').count(), 0, 'Escape closes the editor');
  },

  'rejects unsafe and malformed formulas without running anything': async ({ page, assert }) => {
    await upload(page, 'unsafe.csv', 'name,qty\nAnvil,2\nBolt,3\n');
    await openComputed(page);
    const rejected = [
      ["constructor.constructor('return 1')()", /'\.' is not allowed/],
      ['alert(1)', /Unknown function 'alert'/],
      ["eval('window.pwned = 1')", /Unknown function 'eval'/],
      ["Function('window.pwned = 1')", /Unknown function 'Function'/],
      ["Function('window.pwned = 1')()", /Unexpected '\('/],
      ['constructor', /Unknown column 'constructor'/],
      ['__proto__', /Unknown column '__proto__'/],
      ['[__proto__]', /Unknown column '__proto__'/],
      ['this', /Unknown column 'this'/],
      ['window', /Unknown column 'window'/],
      ['qty.toString()', /'\.' is not allowed/],
      ['[qty].constructor', /'\.' is not allowed/],
      ['qty; window', /';' is not allowed/],
      ['`x`', /Backticks are not allowed/],
      ['x => 1', /Unexpected '>'/],
      ['qty && 1', /Use 'and'/],
      ['qty ||  1', /Use 'or'/],
      ['{}', /'\{' is not allowed/],
      ['qty +', /ends too early/],
      ['(qty', /is missing/],
      ['"open', /missing its closing quote/],
      ['1 2', /Unexpected '2'/],
      ['2x', /Unexpected 'x' after a number/],
      ['name * 2', /Cannot apply '\*' to text and a number/],
      ['upper(qty)', /upper\(\) needs text/],
      ['round()', /Wrong number of arguments/],
      ['if(qty, 1, 2)', /must be true\/false/],
      ["if(qty > 1, 1, 'x')", /same type/],
      ['qty = null', /Use isnull/],
      [`${'('.repeat(60)}1${')'.repeat(60)}`, /nested too deeply/],
      ['1'.repeat(2001), /limited to 2000 characters/],
    ];
    for (const [formula, message] of rejected) {
      const shown = await tryFormula(page, formula);
      assert.match(shown, message, formula.slice(0, 40));
    }
    await page.fill('#computed-name', 'bad');
    await page.click('#computed-save');
    assert.strictEqual(await page.locator('.modal').count(), 1, 'the editor stays open');
    assert.strictEqual(await page.evaluate(() => window.pwned), undefined);
    await page.fill('#computed-expr', '');
    await page.click('#computed-save');
    assert.strictEqual(await page.locator('#computed-error').textContent(), 'Enter a formula.');
    await page.click('.modal-foot .btn:not(.btn-primary)');
    assert.deepStrictEqual(await headers(page), ['name', 'qty']);
  },

  'scrolls 100,000 rows with a small, recycled DOM': async ({ page, assert }) => {
    await ready(page);
    await page.click('#inspector-tab-data');
    await page.click('[data-sample="sales100k"]');
    await page.waitForFunction(() => document.getElementById('dataset-name').textContent === 'sales_orders_100k.csv', null, { timeout: 60000 });
    assert.strictEqual(await rowCount(page), '100,000 rows');
    const scrolled = await page.evaluate(async () => {
      const grid = document.getElementById('grid');
      const frames = [];
      let maxRows = 0, last = performance.now();
      const max = grid.scrollHeight - grid.clientHeight;
      for (let i = 1; i <= 60; i++) {
        grid.scrollTop = (max * i) / 60;
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        frames.push((now - last) / 2);
        last = now;
        maxRows = Math.max(maxRows, document.querySelectorAll('.grid-body .row').length);
      }
      frames.sort((a, b) => a - b);
      return { maxRows, median: frames[30], height: grid.scrollHeight };
    });
    assert.ok(scrolled.maxRows < 80, `pool stayed small: ${scrolled.maxRows} row elements`);
    assert.ok(scrolled.median < 60, `median frame ${scrolled.median} ms`);
    assert.strictEqual(scrolled.height, 100000 * 26 + 30);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.grid-body .gutter')).some((g) => g.textContent === '100000'));
    const rows = await readRows(page);
    assert.ok(rows[rows.length - 1][0].startsWith('SO-'), 'last row is painted');
    await page.evaluate(() => { document.getElementById('grid').scrollTop = 0; });

    // total sits off screen to the right: columns are virtualised too, so scroll it into view first.
    await page.evaluate(() => { document.getElementById('grid').scrollLeft = 1100; });
    const started = Date.now();
    await page.click('.head-cell[data-name="total"] .head-name');
    await page.waitForSelector('.head-cell[data-name="total"][aria-sort="ascending"]');
    assert.ok(Date.now() - started < 5000, 'sorted 100,000 rows quickly');
    const totals = await page.evaluate(() => Array.from(document.querySelectorAll('.grid-body .row:not([style*="none"])'))
      .sort((a, b) => a.getAttribute('aria-rowindex') - b.getAttribute('aria-rowindex'))
      .slice(0, 5).map((row) => Number(row.querySelector('[data-col="11"]').textContent)));
    assert.strictEqual(totals.length, 5);
    assert.deepStrictEqual(totals, totals.slice().sort((a, b) => a - b));
  },

  'sorts, resizes and hides columns, and keeps the layout after reload': async ({ page, assert, reload }) => {
    await upload(page, 'sort.csv', 'name,qty,when\nb,10,2024-02-01\na,9,2024-01-01\nC,,2024-03-01\nd,100,\n');
    const col = async (index) => (await readRows(page)).map((row) => row[index]);
    await page.click('.head-cell[data-name="qty"] .head-name');
    assert.deepStrictEqual(await col(1), ['9', '10', '100', ''], 'numeric ascending, blanks last');
    await page.click('.head-cell[data-name="qty"] .head-name');
    assert.deepStrictEqual(await col(1), ['100', '10', '9', ''], 'descending, blanks still last');
    await page.click('.head-cell[data-name="qty"] .head-name');
    assert.deepStrictEqual(await col(0), ['b', 'a', 'C', 'd'], 'third click restores file order');
    await page.click('.head-cell[data-name="name"] .head-name');
    assert.deepStrictEqual(await col(0), ['a', 'b', 'C', 'd'], 'text ignores case');
    await page.click('.head-cell[data-name="when"] .head-name');
    await page.click('.head-cell[data-name="when"] .head-name');
    assert.deepStrictEqual(await col(2), ['2024-03-01', '2024-02-01', '2024-01-01', '']);
    await page.waitForSelector('.head-cell[data-name="when"][aria-sort="descending"]');

    const handle = await page.locator('.head-cell[data-name="name"] .resize-handle').boundingBox();
    const before = (await page.locator('.head-cell[data-name="name"]').boundingBox()).width;
    await page.mouse.move(handle.x + 4, handle.y + 10);
    await page.mouse.down();
    await page.mouse.move(handle.x + 94, handle.y + 10, { steps: 4 });
    await page.mouse.up();
    const after = (await page.locator('.head-cell[data-name="name"]').boundingBox()).width;
    assert.strictEqual(after, before + 90);
    const firstCell = await page.locator('.grid-body .row:not([style*="none"]) [role=gridcell][data-col="0"]').first().boundingBox();
    assert.strictEqual(firstCell.width, after, 'cells follow the header');
    await page.locator('.head-cell[data-name="name"] .resize-handle').focus();
    await page.keyboard.press('ArrowRight');
    const afterKey = (await page.locator('.head-cell[data-name="name"]').boundingBox()).width;
    assert.strictEqual(afterKey, after + 12, 'resize also works by keyboard');

    await page.click('.head-cell[data-name="qty"] .head-menu');
    await page.locator('.menu-item', { hasText: 'Hide column' }).click();
    assert.deepStrictEqual(await headers(page), ['name', 'when']);
    await page.waitForTimeout(300);
    await reload();
    await ready(page);
    assert.deepStrictEqual(await headers(page), ['name', 'when'], 'hidden column stays hidden');
    assert.strictEqual((await page.locator('.head-cell[data-name="name"]').boundingBox()).width, afterKey);
    assert.strictEqual(await page.locator('.head-cell[data-name="when"]').getAttribute('aria-sort'), 'descending');
    await page.click('#inspector-tab-columns');
    await page.locator('.column-row[data-name="qty"] input[type=checkbox]').check();
    assert.deepStrictEqual(await headers(page), ['name', 'qty', 'when']);
    await page.locator('.column-row input[type=checkbox]').first().uncheck();
    await page.locator('.column-row input[type=checkbox]').nth(1).uncheck();
    await page.locator('.column-row input[type=checkbox]').nth(2).uncheck();
    assert.match(await page.locator('.grid-empty').textContent(), /All columns are hidden/);
    await page.click('.grid-empty button');
    assert.deepStrictEqual(await headers(page), ['name', 'qty', 'when']);
  },

  'draws bar, line, scatter and histogram charts with exact tooltips and table view': async ({ page, assert }) => {
    await upload(page, 'chart.csv', 'cat,value,when,other\na,4,2024-01-05,1\nb,30,2024-02-10,2\nc,20,2024-03-15,3\na,6,2024-01-20,4\n');
    await page.click('#workspace-tab-chart');
    await page.click('[data-chart-type="bar"]');
    await page.selectOption('#chart-x', 'cat');
    await page.selectOption('#chart-agg', 'sum');
    await page.selectOption('#chart-y', 'value');
    await page.locator('#chart-canvas').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector('#chart-tooltip:not([hidden])');
    assert.strictEqual(await page.locator('#chart-tooltip .tip-title').textContent(), 'b', 'largest category first');
    assert.strictEqual(await page.locator('#chart-tooltip .tip-value').textContent(), '30');
    await page.keyboard.press('End');
    assert.strictEqual(await page.locator('#chart-tooltip .tip-title').textContent(), 'a');
    assert.strictEqual(await page.locator('#chart-tooltip .tip-value').textContent(), '10');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('#chart-tooltip').isHidden(), true);

    const box = await page.locator('#chart-canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2);
    await page.waitForSelector('#chart-tooltip:not([hidden])');
    assert.strictEqual(await page.locator('#chart-tooltip .tip-title').textContent(), 'c', 'hover finds the middle bar');
    assert.strictEqual(await page.locator('#chart-tooltip .tip-value').textContent(), '20');
    await page.mouse.move(box.x + box.width + 40, box.y - 40);

    await page.click('#chart-table-toggle');
    assert.deepStrictEqual(await page.locator('#chart-table tbody tr').allInnerTexts().then((rows) => rows.map((r) => r.replace(/\s+/g, ' '))), ['b 30', 'c 20', 'a 10']);

    await page.click('[data-chart-type="line"]');
    await page.selectOption('#chart-x', 'when');
    await page.selectOption('#chart-bucket', 'month');
    await page.locator('#chart-canvas').focus();
    await page.keyboard.press('Home');
    assert.strictEqual(await page.locator('#chart-tooltip .tip-title').textContent(), '2024-01');
    assert.strictEqual(await page.locator('#chart-tooltip .tip-value').textContent(), '10');

    await page.selectOption('#chart-series', 'cat');
    await page.locator('#chart-canvas').focus();
    await page.keyboard.press('ArrowRight');
    assert.deepStrictEqual(await page.locator('#chart-tooltip .tip-label').allTextContents(), ['a']);

    await page.click('[data-chart-type="scatter"]');
    await page.selectOption('#chart-x', 'other');
    await page.selectOption('#chart-y', 'value');
    await page.selectOption('#chart-series', '');
    await page.locator('#chart-canvas').focus();
    await page.keyboard.press('ArrowRight');
    assert.strictEqual(await page.locator('#chart-tooltip .tip-title').textContent(), 'Row 1');
    assert.deepStrictEqual(await page.locator('#chart-tooltip .tip-value').allTextContents(), ['1', '4']);

    await upload(page, 'hist.csv', 'v\n1\n2\n2\n3\n3\n3\n10\n');
    await page.click('#workspace-tab-chart');
    await page.click('[data-chart-type="histogram"]');
    const table = async () => (await page.locator('#chart-table tbody tr').allInnerTexts()).map((r) => r.replace(/\s+/g, ' '));
    assert.deepStrictEqual(await table(), ['0 2 1', '2 4 5', '4 6 0', '6 8 0', '8 10 0', '10 12 1']);
    await page.fill('#chart-bins', '999');
    await page.locator('#chart-bins').blur();
    await page.waitForSelector('#chart-bins-error:not([hidden])');
    await page.fill('#chart-bins', '9');
    await page.locator('#chart-bins').blur();
    await page.waitForFunction(() => document.querySelectorAll('#chart-table tbody tr').length === 10);
    assert.deepStrictEqual((await table()).slice(0, 3), ['1 2 1', '2 3 2', '3 4 3']);
    assert.strictEqual((await table())[9], '10 11 1');
  },

  'exports a chart as a real PNG': async ({ page, assert }) => {
    await ready(page);
    await page.click('#workspace-tab-chart');
    await page.waitForFunction(() => document.getElementById('export-label').textContent === 'Export PNG');
    const { name, path } = await downloadText(page, () => page.click('#export-btn'));
    assert.strictEqual(name, 'sales_orders-line-chart.png');
    const bytes = fs.readFileSync(path);
    assert.deepStrictEqual(Array.from(bytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10], 'PNG signature');
    assert.ok(bytes.length > 5000, 'contains a drawn chart');
    assert.ok(bytes.readUInt32BE(16) > 1000, 'exported at double resolution');
  },

  'exports filtered rows as CSV that parses back identically': async ({ page, assert }) => {
    const source = 'name,note,qty\n"Comma, Inc","says ""hi""",5\n"two\nlines",plain,10\nskip,me,1\n';
    await upload(page, 'round trip.csv', source);
    await addCondition(page, 'qty', 'gte', '5');
    await waitRowCount(page, '2 of 3 rows');
    await page.click('.head-cell[data-name="qty"] .head-name');
    await page.click('.head-cell[data-name="qty"] .head-name');
    const shown = await readRows(page);
    const { name, text } = await downloadText(page, () => page.click('#export-btn'));
    assert.strictEqual(name, 'round_trip-filtered.csv');
    assert.strictEqual(text, 'name,note,qty\r\n"two\nlines",plain,10\r\n"Comma, Inc","says ""hi""",5\r\n');
    await upload(page, 'again.csv', text);
    assert.deepStrictEqual(await readRows(page), shown);

    await page.fill('#search', 'no such value');
    await waitRowCount(page, '0 of 2 rows');
    await page.click('#export-btn');
    assert.match(await page.locator('.toast-error').textContent(), /no rows to export/);
  },

  'saves, reapplies, renames and updates views, keeps them after reload, and deletes with undo': async ({ page, assert, reload }) => {
    await upload(page, 'views.csv', FILTER_CSV);
    await addCondition(page, 'qty', 'gt', '10');
    await waitRowCount(page, '3 of 6 rows');
    await page.click('.head-cell[data-name="qty"] .head-name');
    await page.click('#save-view-btn');
    await page.click('#view-save');
    assert.strictEqual(await page.locator('#view-name-error').textContent(), 'Enter a name for this view.');
    await page.fill('#view-name', 'Big quantities');
    await page.click('#view-save');
    const row = page.locator('.view-row[data-name="Big quantities"]');
    await row.waitFor();
    assert.match(await row.locator('.view-summary').textContent(), /1 filter, sorted by qty/);

    await page.click('#inspector-tab-filters');
    await page.click('#clear-filters');
    await waitRowCount(page, '6 rows');
    await page.click('#inspector-tab-views');
    await row.locator('.view-open').click();
    await waitRowCount(page, '3 of 6 rows');
    assert.deepStrictEqual((await readRows(page)).map((r) => r[1]), ['15', '20', '30']);

    await page.click('[aria-label="Rename Big quantities"]');
    await page.fill('.rename-input', 'Large orders');
    await page.keyboard.press('Enter');
    await page.locator('.view-row[data-name="Large orders"]').waitFor();

    await page.fill('#search', 'light');
    await waitRowCount(page, '2 of 6 rows');
    await page.click('[aria-label="Update Large orders with current settings"]');
    await page.fill('#search', '');
    await waitRowCount(page, '3 of 6 rows');
    await page.waitForTimeout(250);

    await reload();
    await ready(page);
    assert.strictEqual(await page.locator('#dataset-name').textContent(), 'views.csv', 'the file itself is remembered');
    await page.click('#inspector-tab-views');
    await page.locator('.view-row[data-name="Large orders"] .view-open').click();
    await waitRowCount(page, '2 of 6 rows');
    assert.strictEqual(await page.inputValue('#search'), 'light');

    await page.click('[aria-label="Delete Large orders"]');
    assert.strictEqual(await page.locator('.view-row[data-name="Large orders"]').count(), 0);
    await page.click('.toast-action');
    await page.locator('.view-row[data-name="Large orders"]').waitFor();
    await page.waitForTimeout(50);
    await reload();
    await ready(page);
    await page.click('#inspector-tab-views');
    await page.locator('.view-row[data-name="Large orders"]').waitFor();
    await page.click('[aria-label="Delete Large orders"]');
    await page.waitForTimeout(50);
    await reload();
    await ready(page);
    await page.click('#inspector-tab-views');
    assert.strictEqual(await page.locator('.view-row[data-name="Large orders"]').count(), 0, 'stays deleted without undo');
  },

  'opens a view from another dataset and restores its pivot or chart tab': async ({ page, assert }) => {
    await ready(page);
    await page.click('#inspector-tab-views');
    await page.locator('.view-row[data-name="Open urgent tickets"] .view-open').click();
    await page.waitForFunction(() => document.getElementById('dataset-name').textContent === 'support_tickets.csv');
    const count = await rowCount(page);
    assert.match(count, /^\d+ of 6,500 rows$/);
    await page.locator('.view-row[data-name="Tickets by team and priority"] .view-open').click();
    await page.waitForSelector('#pivot-table');
    assert.strictEqual(await page.locator('#tab-pivot').isVisible(), true);
    assert.deepStrictEqual((await readPivot(page))[0], ['team', 'High', 'Low', 'Normal', 'Urgent', 'Total · Count of rows']);
    assert.strictEqual((await readPivot(page)).pop()[5], '6,500');
  },

  'exports and imports saved views, and rejects bad files with a message': async ({ page, assert }) => {
    await ready(page);
    await page.click('#inspector-tab-views');
    await page.fill('#view-name', 'Keep me');
    await page.click('#view-save');
    await page.locator('.view-row[data-name="Keep me"]').waitFor();
    const { name, text } = await downloadText(page, () => page.click('#views-export'));
    assert.strictEqual(name, 'gridlens-views.json');
    const exported = JSON.parse(text);
    assert.strictEqual(exported.views.filter((v) => v.name === 'Keep me').length, 1);

    const setImport = (fileName, content) => page.setInputFiles('#views-import', { name: fileName, mimeType: 'application/json', buffer: Buffer.from(content) });
    await setImport('nope.json', '{not json');
    await page.waitForSelector('#views-import-error');
    assert.strictEqual(await page.locator('#views-import-error').textContent(), 'That file is not valid JSON.');
    await setImport('other.json', JSON.stringify({ hello: 'world' }));
    await page.waitForFunction(() => document.getElementById('views-import-error').textContent === 'That file is not a Gridlens views export.');
    await setImport('empty.json', JSON.stringify({ app: 'gridlens', views: [{ name: 5 }] }));
    await page.waitForFunction(() => document.getElementById('views-import-error').textContent === 'That file contains no usable views.');

    await page.click('[aria-label="Delete Keep me"]');
    await setImport('good.json', JSON.stringify({ app: 'gridlens', views: [
      { id: 'x', name: 'Keep me', datasetKey: 'sample:sales', state: { filters: [{ col: 'region', op: 'equals', a: 'West', b: '' }], tab: 'nonsense', sort: 17 } },
      { name: 'broken' },
    ] }));
    await page.locator('.view-row[data-name="Keep me"]').waitFor();
    assert.match(await page.locator('.toast').textContent(), /Imported 1 view, skipped 1 invalid/);
    await page.locator('.view-row[data-name="Keep me"] .view-open').click();
    await page.waitForFunction(() => /of 12,000 rows/.test(document.getElementById('row-count').textContent));
    assert.strictEqual(await page.locator('#tab-table').isVisible(), true, 'bad settings in a view are sanitized');
  },

  'remembers small files, forgets them with undo, and survives a full storage quota': async ({ page, assert, reload }) => {
    await upload(page, 'small.csv', 'a,b\n1,2\n3,4\n');
    await page.click('#inspector-tab-data');
    const recent = page.locator('.data-row[data-file="small.csv"]');
    await recent.waitFor();
    assert.match(await recent.textContent(), /2 rows/);
    await page.waitForTimeout(250);
    await reload();
    await ready(page);
    assert.strictEqual(await page.locator('#dataset-name').textContent(), 'small.csv');
    assert.deepStrictEqual(await readRows(page), [['1', '2'], ['3', '4']]);

    await page.click('#inspector-tab-data');
    await page.click('[data-sample="weather"]');
    await page.waitForFunction(() => document.getElementById('dataset-name').textContent === 'station_weather.csv');
    await page.click('[aria-label="Forget small.csv"]');
    assert.strictEqual(await recent.count(), 0);
    await page.click('.toast-action');
    await recent.waitFor();
    await recent.locator('.data-open').click();
    await page.waitForFunction(() => document.getElementById('dataset-name').textContent === 'small.csv');
    await page.click('[aria-label="Forget small.csv"]');
    await page.waitForSelector('#recent-empty');

    // Fill localStorage to the brim, then open another file: it must still open, in memory.
    await page.evaluate(() => {
      let chunk = 'x'.repeat(1024 * 1024);
      let n = 0;
      while (chunk.length >= 8) {
        try { localStorage.setItem(`junk${n++}`, chunk); } catch (error) { chunk = chunk.slice(0, chunk.length >> 1); }
      }
    });
    await upload(page, 'overflow.csv', `a,b\n${'1,2\n'.repeat(2000)}`);
    assert.strictEqual(await rowCount(page), '2,000 rows');
    await page.waitForFunction(() => /Browser storage is full/.test(document.getElementById('status-parse').textContent));
    assert.match(await page.locator('.toast').textContent(), /Browser storage is full/);
    assert.strictEqual(await page.locator('.data-row[data-file="overflow.csv"]').count(), 0);
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('junk')).forEach((k) => localStorage.removeItem(k)));
    await page.waitForTimeout(250);
    await reload();
    await ready(page);
    assert.strictEqual(await page.locator('#dataset-name').textContent(), 'sales_orders.csv', 'falls back when a file was not stored');
  },

  'evicts the oldest file when a new one does not fit': async ({ page, assert }) => {
    const big = (mark, size) => `a,b\n${mark},${'y'.repeat(size)}\n`;
    await upload(page, 'first.csv', big('one', 1400000));
    await upload(page, 'second.csv', big('two', 1400000));
    await upload(page, 'third.csv', big('three', 1400000));
    await upload(page, 'fourth.csv', big('four', 1400000));
    await page.click('#inspector-tab-data');
    await page.locator('.data-row[data-file="fourth.csv"]').waitFor();
    assert.strictEqual(await page.locator('.data-row[data-file="first.csv"]').count(), 0, 'oldest was evicted');
    assert.strictEqual(await page.locator('.data-row[data-file="third.csv"]').count(), 1);
    assert.match(await page.locator('#status-parse').textContent(), /Removed first\.csv/);

    await upload(page, 'huge.csv', big('five', 1600000));
    assert.match(await page.locator('#status-parse').textContent(), /Too large to remember/);
  },

  'reports unusable files and keeps the current dataset open': async ({ page, assert }) => {
    await ready(page);
    const failing = async (name, buffer, pattern) => {
      await page.setInputFiles('#file-input', { name, mimeType: 'application/octet-stream', buffer });
      await page.waitForSelector('.toast-error');
      assert.match(await page.locator('.toast-error').textContent(), pattern);
      assert.strictEqual(await page.locator('#dataset-name').textContent(), 'sales_orders.csv');
      await page.click('.toast-close');
    };
    await failing('empty.csv', Buffer.alloc(0), /Could not open empty\.csv: it is empty/);
    await failing('blank.csv', Buffer.from('   \n\n '), /This file is empty/);
    await failing('book.xlsx', Buffer.from('PK'), /Save it as CSV first/);
    await failing('data.csv', Buffer.from([0x50, 0x00, 0x4b, 0x00, 0x01, 0x02]), /binary file/);

    await upload(page, 'header-only.csv', 'a,b,c\n');
    assert.strictEqual(await rowCount(page), '0 rows');
    assert.match(await page.locator('.grid-empty').textContent(), /header row but no data rows/);
    await page.click('#workspace-tab-chart');
    assert.match(await page.locator('#chart-message').textContent(), /No rows to chart|needs a number/);
  },

  'uses a worker, and falls back to the main thread when workers are unavailable': async ({ page, context, assert, reload }) => {
    await upload(page, 'worker.csv', 'x\n1\n2\n');
    assert.match(await page.locator('#status-parse').textContent(), /Parsed in a background worker/);
    await context.addInitScript(() => { delete window.Worker; });
    await reload();
    await ready(page);
    await upload(page, 'noworker.csv', 'q;r\n"a;b";2\n');
    assert.match(await page.locator('#status-parse').textContent(), /Parsed on the main thread/);
    assert.deepStrictEqual(await readRows(page), [['a;b', '2']]);
  },

  'opens a file dropped on the page': async ({ page, assert }) => {
    await ready(page);
    await page.evaluate(() => {
      const file = new File(['p,q\n7,8\n'], 'dropped.csv', { type: 'text/csv' });
      const data = new DataTransfer();
      data.items.add(file);
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: data, cancelable: true, bubbles: true }));
    });
    assert.strictEqual(await page.locator('#drop-overlay').isVisible(), true);
    await page.evaluate(() => {
      const file = new File(['p,q\n7,8\n'], 'dropped.csv', { type: 'text/csv' });
      const data = new DataTransfer();
      data.items.add(file);
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: data, cancelable: true, bubbles: true }));
    });
    await page.waitForFunction(() => document.getElementById('dataset-name').textContent === 'dropped.csv');
    assert.strictEqual(await page.locator('#drop-overlay').isVisible(), false);
    assert.deepStrictEqual(await readRows(page), [['7', '8']]);
  },

  'ships three consistent samples of over 5,000 rows, with dates relative to today': async ({ page, assert }) => {
    const today = Date.now();
    const close = (a, b) => Math.abs(a - b) < 0.006;
    const daysAgo = (date) => (today - Date.parse(`${date.slice(0, 10)}T00:00:00Z`)) / 86400000;

    const sales = await openSampleAndExport(page, 'sales', 'sales_orders.csv');
    assert.strictEqual(sales.length, 12000);
    let latest = Infinity;
    for (const o of sales) {
      assert.ok(close(+o.total, +o.quantity * +o.unit_price * (1 - +o.discount_pct / 100)), `total of ${o.order_id}`);
      if (o.ship_date) assert.ok(o.ship_date >= o.order_date, `ship date of ${o.order_id}`);
      if (o.status === 'Pending' || o.status === 'Cancelled') assert.strictEqual(o.ship_date, '');
      else assert.notStrictEqual(o.ship_date, '', `${o.status} order ${o.order_id} has shipped`);
      assert.ok(+o.unit_cost < +o.unit_price);
      latest = Math.min(latest, daysAgo(o.order_date));
    }
    assert.ok(latest >= -1 && latest < 5, `latest order is recent: ${latest}`);
    assert.ok(sales.some((o) => o.product.includes(',')), 'has quoted commas');

    const weather = await openSampleAndExport(page, 'weather', 'station_weather.csv');
    assert.ok(weather.length >= 5000);
    for (const w of weather) {
      assert.ok(+w.temp_high_c >= +w.temp_low_c);
      assert.strictEqual(+w.precip_mm > 0, w.had_precip === 'true', `${w.station} ${w.date}`);
      if (w.snow === 'true') assert.strictEqual(w.conditions, 'Snow');
      if (w.conditions === 'Rain' || w.conditions === 'Snow') assert.strictEqual(w.had_precip, 'true');
      assert.ok(+w.humidity_pct <= 100);
    }
    assert.ok(Math.min(...weather.map((w) => daysAgo(w.date))) < 3);

    const tickets = await openSampleAndExport(page, 'tickets', 'support_tickets.csv');
    assert.ok(tickets.length >= 5000);
    for (const t of tickets) {
      const finished = t.status === 'Resolved' || t.status === 'Closed';
      assert.strictEqual(t.resolved_at !== '', finished, t.ticket_id);
      assert.strictEqual(t.resolution_hours !== '', finished, t.ticket_id);
      if (finished) {
        const hours = (Date.parse(`${t.resolved_at}Z`) - Date.parse(`${t.created_at}Z`)) / 3600000;
        assert.ok(Math.abs(hours - +t.resolution_hours) < 0.02, `${t.ticket_id}: ${hours} vs ${t.resolution_hours}`);
      } else {
        assert.strictEqual(t.csat, '');
      }
      if (t.first_response_min && finished) assert.ok(+t.first_response_min / 60 <= +t.resolution_hours + 0.02, t.ticket_id);
    }
    assert.ok(tickets.some((t) => t.subject.includes('"')), 'has escaped quotes');
  },

  'resets demo data after confirmation': async ({ page, assert }) => {
    await upload(page, 'mine.csv', 'a\n1\n');
    await page.click('#inspector-tab-views');
    await page.fill('#view-name', 'My view');
    await page.click('#view-save');
    await page.click('#inspector-tab-data');
    await page.click('#reset-demo');
    await page.waitForSelector('.modal');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.modal').count(), 0);
    assert.strictEqual(await page.locator('#dataset-name').textContent(), 'mine.csv', 'cancelling changes nothing');

    await page.click('#reset-demo');
    await page.click('#confirm-yes');
    await page.waitForFunction(() => document.getElementById('dataset-name').textContent === 'sales_orders.csv');
    assert.strictEqual(await rowCount(page), '12,000 rows');
    await page.click('#inspector-tab-views');
    assert.strictEqual(await page.locator('.view-row[data-name="My view"]').count(), 0);
    assert.strictEqual(await page.locator('.view-row[data-name="West orders over 1,000"]').count(), 1);
    await page.click('#inspector-tab-data');
    await page.waitForSelector('#recent-empty');
    assert.strictEqual(await page.locator('.data-row[data-file="mine.csv"]').count(), 0);
  },

  'never renders file contents as markup': async ({ page, assert }) => {
    const nasty = '<img src=x onerror="window.pwned=1">';
    await upload(page, '<b>x</b>.csv', `"${nasty.replace(/"/g, '""')}",v\n"${nasty.replace(/"/g, '""')}",1\n"${nasty.replace(/"/g, '""')}",2\n`);
    await selectColumn(page, nasty);
    await page.click('#workspace-tab-pivot');
    await page.waitForSelector('#pivot-table');
    await page.click('#workspace-tab-chart');
    await page.click('#inspector-tab-data');
    await page.waitForTimeout(100);
    assert.strictEqual(await page.locator('img, b').count(), 0);
    assert.strictEqual(await page.evaluate(() => window.pwned), undefined);
    assert.strictEqual(await page.locator('#dataset-name').textContent(), '<b>x</b>.csv');
  },

  'keeps working when storage holds corrupt data or is blocked': async ({ page, context, assert, reload }) => {
    await ready(page);
    await page.evaluate(() => {
      localStorage.setItem('gridlens.views', '{broken');
      localStorage.setItem('gridlens.recent', '"nope"');
      localStorage.setItem('gridlens.session', JSON.stringify({ key: 'sample:weather', state: { filters: 'x', sort: 3, widths: { station: 'wide' }, pivot: null, chart: 4 } }));
      localStorage.setItem('gridlens.theme', 'neon');
    });
    await page.evaluate(() => {
      // Stop the running page from overwriting the corrupt session on its way out.
      Storage.prototype.setItem = () => {};
    });
    await reload();
    await ready(page);
    assert.strictEqual(await page.locator('#dataset-name').textContent(), 'station_weather.csv');
    assert.strictEqual(await rowCount(page), '5,600 rows');

    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    await reload();
    await ready(page);
    await upload(page, 'blocked.csv', 'a\n1\n');
    assert.deepStrictEqual(await readRows(page), [['1']]);
    await page.click('#inspector-tab-views');
    await page.fill('#view-name', 'In memory only');
    await page.click('#view-save');
    await page.locator('.view-row[data-name="In memory only"]').waitFor();
  },

  'theme toggle is remembered, and the grid works by keyboard': async ({ page, assert, reload }) => {
    await upload(page, 'keys.csv', 'a,b\n1,2\n3,4\n5,6\n');
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await background();
    await page.click('#theme-toggle');
    const dark = await background();
    assert.notStrictEqual(light, dark);
    await page.waitForTimeout(250);
    await reload();
    await ready(page);
    assert.strictEqual(await background(), dark);
    assert.strictEqual(await page.getAttribute('html', 'data-theme'), 'dark');

    await page.locator('#grid').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    assert.strictEqual(await page.locator('#status-cell').textContent(), 'Row 3 · b: 6');
    assert.strictEqual(await page.locator('.cell.is-active').textContent(), '6');
    assert.strictEqual(await page.getAttribute('#grid', 'aria-activedescendant'), 'grid-active-cell');
    await page.keyboard.press('Control+Home');
    assert.strictEqual(await page.locator('.cell.is-active').textContent(), '1');
    await page.locator('.head-cell[data-name="a"] .head-menu').click();
    assert.strictEqual(await page.locator('.menu').count(), 1);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.menu').count(), 0);
  },
};
