// Feature tests for each project, run in a real headless Chrome.
//   node tools/test.js <slug>     or     node tools/test.js --all
//
// A test module (tools/tests/<slug>.test.js) exports an object of named async tests:
//   module.exports = { 'adds a task and keeps it after reload': async ({ page, assert, reload }) => { ... } };
// Every test gets a fresh browser profile (empty localStorage), so the app starts on its first-run seed data.
//
// These universal checks also run for every project:
//   - no console errors, page errors or failed requests
//   - only local requests (no CDN or remote dependency)
//   - no horizontal page overflow at 1280px and 390px wide
//   - works when embedded in an iframe, which is how the portfolio's Try it panel opens it
const assertLib = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { startServer } = require('./serve');

async function runProject(slug, browser, base) {
  const url = `${base}/projects/${slug}/`;
  const results = [];
  const fresh = async (viewport = { width: 1280, height: 720 }) => {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
    page.on('request', (r) => { const u = r.url(); if (/^https?:/.test(u) && !u.startsWith(base)) errors.push(`remote request: ${u}`); });
    return { context, page, errors };
  };
  const check = async (name, fn) => {
    const started = Date.now();
    try { await fn(); results.push({ name, ok: true, ms: Date.now() - started }); }
    catch (e) { results.push({ name, ok: false, error: String(e.message || e).split('\n').slice(0, 4).join(' | ') }); }
  };

  for (const [label, viewport] of [['desktop 1280', { width: 1280, height: 720 }], ['phone 390', { width: 390, height: 780 }]]) {
    await check(`[universal] loads clean, no sideways scroll at ${label}`, async () => {
      const { context, page, errors } = await fresh(viewport);
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assertLib.ok(overflow <= 0, `page overflows sideways by ${overflow}px`);
      assertLib.deepStrictEqual(errors, []);
      await context.close();
    });
  }
  await check('[universal] runs inside an iframe', async () => {
    const { context, page, errors } = await fresh();
    // A same-origin host page answered by the test itself, so it adds no 404s of its own to the error list.
    const hostUrl = `${base}/__iframe-host`;
    await page.route(hostUrl, (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><link rel="icon" href="data:,"><iframe id="f" src="${url}" style="width:1200px;height:680px"></iframe>`,
    }));
    await page.goto(hostUrl, { waitUntil: 'load' });
    const frame = await (await page.waitForSelector('#f')).contentFrame();
    await frame.waitForLoadState('load');
    await page.waitForTimeout(300);
    const text = await frame.evaluate(() => document.body.innerText.trim().length);
    assertLib.ok(text > 20, 'app rendered no text inside the iframe');
    assertLib.deepStrictEqual(errors, []);
    await context.close();
  });

  const testFile = path.join(__dirname, 'tests', `${slug}.test.js`);
  if (fs.existsSync(testFile)) {
    const tests = require(testFile);
    for (const [name, fn] of Object.entries(tests)) {
      await check(name, async () => {
        const { context, page, errors } = await fresh();
        await page.goto(url, { waitUntil: 'load' });
        await fn({ page, context, assert: assertLib, reload: () => page.reload({ waitUntil: 'load' }) });
        assertLib.deepStrictEqual(errors, []);
        await context.close();
      });
    }
  } else {
    results.push({ name: 'feature tests', ok: false, error: `missing ${testFile}` });
  }
  return results;
}

(async () => {
  const args = process.argv.slice(2);
  const slugs = args.includes('--all')
    ? fs.readdirSync(path.join(__dirname, '..', 'projects')).filter((d) => fs.existsSync(path.join(__dirname, '..', 'projects', d, 'index.html')))
    : args;
  if (!slugs.length) { console.error('Usage: node tools/test.js <slug>|--all'); process.exit(2); }
  const { server, port } = await startServer(0);
  // Set BASE_URL to test a deployed copy, e.g. BASE_URL=https://kazelweb.github.io
  const base = (process.env.BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let failed = 0; let passed = 0;
  for (const slug of slugs) {
    console.log(`\n${slug}`);
    for (const r of await runProject(slug, browser, base)) {
      if (r.ok) { passed++; console.log(`  pass  ${r.name}`); }
      else { failed++; console.log(`  FAIL  ${r.name}\n        ${r.error}`); }
    }
  }
  await browser.close();
  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
