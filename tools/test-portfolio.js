// End-to-end check of the portfolio page itself: every video, every Try it panel, phone layout, screenshots.
const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright-core');
const { startServer } = require('./serve');

(async () => {
  const { server, port } = await startServer(0);
  // Set BASE_URL to test a deployed copy, e.g. BASE_URL=https://grehard.github.io
  const base = (process.env.BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const out = path.join(__dirname, '.out');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });

  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(out, 'home-top.png') });
  const slugs = await page.$$eval('[data-try]', (els) => els.map((e) => e.dataset.try));
  assert.strictEqual(slugs.length, 12, 'expected 12 projects');

  for (const slug of slugs) {
    const article = page.locator(`#${slug}`);
    await article.scrollIntoViewIfNeeded();
    // Poster loaded
    await page.waitForFunction((s) => {
      const v = document.querySelector(`#${s} video`); const i = new Image(); i.src = v.poster; return i.complete && i.naturalWidth > 0;
    }, slug);
    // Video really plays
    await article.locator('.play').click();
    await page.waitForFunction((s) => { const v = document.querySelector(`#${s} video`); return v.currentTime > 0.4 && !v.paused; }, slug, { timeout: 15000 });
    const duration = await article.locator('video').evaluate((v) => v.duration);
    assert.ok(Math.abs(duration - 60) < 1, `${slug} video is ${duration}s`);
    // Seek works (needs range requests)
    await article.locator('video').evaluate((v) => { v.currentTime = 30; });
    await page.waitForFunction((s) => document.querySelector(`#${s} video`).currentTime >= 30, slug);
    // Try it opens in-page, pauses the video, and the app renders
    await article.locator('[data-try]').click();
    await page.waitForSelector('#try[open]');
    assert.strictEqual(await page.evaluate(() => location.hash), `#try/${slug}`);
    assert.ok(await article.locator('video').evaluate((v) => v.paused), `${slug} video kept playing behind the panel`);
    await page.waitForSelector('.try-frame.ready');
    const frame = page.frameLocator('#try-iframe');
    await frame.locator('body').waitFor();
    const text = await frame.locator('body').innerText();
    assert.ok(text.trim().length > 20, `${slug} app is empty`);
    if (slug === 'driftboard') await page.screenshot({ path: path.join(out, 'try-panel.png') });
    // Browser Back closes the panel; Try it again, then the Close button
    await page.goBack();
    await page.waitForSelector('#try:not([open])', { state: 'attached' });
    await article.locator('[data-try]').click();
    await page.waitForSelector('#try[open]');
    await page.click('#try-close');
    await page.waitForSelector('#try:not([open])', { state: 'attached' });
    assert.strictEqual(await page.evaluate(() => location.hash), '');
    assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.try), slug, 'focus should return to Try it');
    console.log(`  pass  ${slug}: poster, plays, ${duration.toFixed(1)}s, seeks, opens in page, closes`);
  }
  await page.locator('#gridlens').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, 'home-project.png') });

  // A shared link opens the app directly; Escape closes it.
  await page.goto(`${base}/#try/mise`, { waitUntil: 'load' });
  await page.waitForSelector('#try[open]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#try:not([open])', { state: 'attached' });
  console.log('  pass  #try/ link opens directly; Escape closes');
  assert.deepStrictEqual(errors, []);

  for (const [name, viewport, scheme] of [['phone', { width: 390, height: 844 }, 'light'], ['dark', { width: 1440, height: 900 }, 'dark']]) {
    const c = await browser.newContext({ viewport, colorScheme: scheme });
    const p = await c.newPage();
    await p.goto(`${base}/`, { waitUntil: 'load' });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `${name}: page overflows by ${overflow}px`);
    await p.screenshot({ path: path.join(out, `${name}-top.png`) });
    await p.locator('#driftboard').scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(out, `${name}-project.png`) });
    await c.close();
    console.log(`  pass  ${name}: no sideways scroll`);
  }
  await browser.close();
  server.close();
  console.log('portfolio: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
