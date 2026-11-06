// Runs a project's scripted demo in headless Chrome.
//   node tools/demo.js <slug>            Check mode: real-time run, screenshots to tools/.out/<slug>/, prints timing.
//   node tools/demo.js <slug> --record   Also writes assets/videos/<slug>.mp4 and assets/posters/<slug>.jpg.
//   node tools/demo.js --all --record    Records every demo in tools/demos, one at a time.
//
// A demo module (tools/demos/<slug>.js) exports:
//   { name, tagline, scope: [3 short strings], accent: '#hex', run: async (d) => { ... } }
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright-core');
const ffmpeg = require('ffmpeg-static');
const { startServer, ROOT } = require('./serve');

const TOTAL_MS = 60000;
const TITLE_MS = 6000;
const END_MS = 4000;
const RUN_BUDGET_MS = TOTAL_MS - TITLE_MS - END_MS; // 50s for run()
const VIEWPORT = { width: 1280, height: 720 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Injected into the page. Lives in a shadow root so it can't touch or inherit from the app's CSS.
function overlayScript() {
  if (window.__demo) return;
  let root, cursor, caption, card;
  const mount = () => {
    if (root || !document.documentElement) return;
    const host = document.createElement('div');
    host.id = '__demo_host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      *{box-sizing:border-box;font-family:"Segoe UI",system-ui,sans-serif}
      .cursor{position:fixed;left:0;top:0;width:22px;height:22px;transform:translate(-100px,-100px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
      .ripple{position:fixed;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:rgba(40,40,40,.28);animation:r .38s ease-out forwards}
      @keyframes r{from{transform:scale(.3);opacity:1}to{transform:scale(1.3);opacity:0}}
      .caption{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(10px);max-width:880px;padding:12px 20px;border-radius:8px;
        background:rgba(17,18,20,.93);color:#fff;font-size:20px;line-height:1.35;font-weight:500;text-align:center;opacity:0;transition:opacity .2s,transform .2s}
      .caption.on{opacity:1;transform:translateX(-50%)}
      .card{position:fixed;inset:0;background:#111214;color:#f4f4f2;display:none;flex-direction:column;justify-content:center;padding:0 120px}
      .card.on{display:flex}
      .bar{width:44px;height:5px;margin-bottom:26px}
      h1{margin:0 0 12px;font-size:60px;font-weight:650;letter-spacing:-.02em}
      p{margin:0 0 30px;font-size:25px;line-height:1.35;color:#c8c9c6;max-width:900px}
      ul{margin:0;padding:0;list-style:none;font-size:20px;color:#e6e6e3}
      li{padding:8px 0;border-top:1px solid #2c2e31;max-width:900px}
      .tag{font-size:15px;letter-spacing:.09em;text-transform:uppercase;color:#8e9090;margin-bottom:10px}
    </style>
    <div class="caption"></div>
    <div class="card"></div>
    <svg class="cursor" viewBox="0 0 24 24"><path d="M4 2l15 11.5-6.6 1.1 4 7.2-3 1.6-4-7.3L4 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    cursor = root.querySelector('.cursor');
    caption = root.querySelector('.caption');
    card = root.querySelector('.card');
    document.documentElement.appendChild(host);
  };
  window.addEventListener('mousemove', (e) => { mount(); cursor.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
  window.addEventListener('mousedown', (e) => {
    mount();
    const r = document.createElement('div');
    r.className = 'ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
    root.appendChild(r); setTimeout(() => r.remove(), 400);
  }, true);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  window.__demo = {
    caption(text) { mount(); caption.textContent = text || ''; caption.classList.toggle('on', !!text); },
    title(m) {
      mount();
      card.innerHTML = `<div class="bar" style="background:${m.accent}"></div><h1>${esc(m.name)}</h1><p>${esc(m.tagline)}</p>
        <ul>${m.scope.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
      card.classList.add('on');
    },
    end(m) {
      mount();
      caption.classList.remove('on');
      card.innerHTML = `<div class="bar" style="background:${m.accent}"></div><h1>${esc(m.name)}</h1>
        <p style="margin:0">Press Try it to use every feature yourself. No sign-up needed.</p>`;
      card.classList.add('on');
    },
    hideCard() { mount(); card.classList.remove('on'); },
    visible(v) { mount(); root.host.style.visibility = v ? 'visible' : 'hidden'; },
  };
  if (document.documentElement) mount(); else window.addEventListener('DOMContentLoaded', mount);
}

class Demo {
  constructor(page, shots) {
    this.page = page; this.shots = shots; this.mouse = { x: 640, y: 360 }; this.captions = []; this.lastCaption = null; this.onPoster = null;
  }
  wait(ms) { return sleep(ms); }
  async _shot(label) { if (this.shots) await this.shots(label); }
  /** Shows a caption and holds for ms. Replaces the previous caption. Keep under ~90 characters. */
  async caption(text, ms = 2800) {
    const now = Date.now();
    if (this.lastCaption) this.lastCaption.shown = now - this.lastCaption.at;
    this.lastCaption = { text, at: now }; this.captions.push(this.lastCaption);
    await this.page.evaluate((t) => window.__demo.caption(t), text);
    await this._shot(`caption-${this.captions.length}`);
    if (ms) await sleep(ms);
  }
  _loc(target) { return typeof target === 'string' ? this.page.locator(target).first() : target; }
  async _point(target) {
    if (target && typeof target.x === 'number') return target;
    const loc = this._loc(target);
    await loc.scrollIntoViewIfNeeded({ timeout: 5000 });
    const box = await loc.boundingBox();
    if (!box) throw new Error(`Demo target not visible: ${target}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  /** Glides the visible cursor to a selector, Locator or {x,y}. */
  async move(target, ms = 420) {
    const p = await this._point(target);
    const from = { ...this.mouse };
    const steps = Math.max(6, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps; const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await this.page.mouse.move(from.x + (p.x - from.x) * e, from.y + (p.y - from.y) * e);
      await sleep(ms / steps);
    }
    this.mouse = p;
  }
  async click(target, { hold = 320 } = {}) {
    await this.move(target);
    await sleep(90);
    await this.page.mouse.down(); await sleep(50); await this.page.mouse.up();
    await sleep(hold);
  }
  /** Clicks a field, then types at human speed. Clears it first unless clear:false. */
  async type(target, text, { delay = 38, clear = true, hold = 200 } = {}) {
    await this.click(target, { hold: 120 });
    if (clear) { await this.page.keyboard.press('Control+A'); await this.page.keyboard.press('Delete'); }
    await this.page.keyboard.type(text, { delay });
    await sleep(hold);
  }
  async press(key, hold = 250) { await this.page.keyboard.press(key); await sleep(hold); }
  /** Native dropdowns don't appear in recordings, so this moves to the select then sets its value. */
  async select(target, value, { hold = 350 } = {}) {
    await this.move(target);
    await this._loc(target).selectOption(value);
    await sleep(hold);
  }
  /** Sets an input directly, e.g. date inputs whose native picker can't be recorded. */
  async fill(target, value, { hold = 250 } = {}) {
    await this.move(target);
    await this._loc(target).fill(value);
    await sleep(hold);
  }
  /** Real mouse drag between two selectors, Locators or {x,y} points. */
  async drag(from, to, { ms = 800 } = {}) {
    await this.move(from);
    await sleep(100);
    await this.page.mouse.down();
    await sleep(120);
    await this.move(to, ms);
    await sleep(120);
    await this.page.mouse.up();
    await sleep(300);
  }
  /** Smoothly scrolls the window, or an element given by selector, by dy pixels. */
  async scroll(dy, selector = null, ms = 700) {
    await this.page.evaluate(([dy, selector]) => {
      const el = selector ? document.querySelector(selector) : window;
      el.scrollBy({ top: dy, behavior: 'smooth' });
    }, [dy, selector]);
    await sleep(ms);
  }
  /** Marks this moment as the poster image. Call once, on the app's best-looking screen. */
  async poster() { if (this.onPoster) await this.onPoster(); }
}

async function runDemo(slug, { record = false } = {}) {
  const modPath = path.join(__dirname, 'demos', `${slug}.js`);
  delete require.cache[require.resolve(modPath)];
  const mod = require(modPath);
  const outDir = path.join(__dirname, '.out', slug);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const { server, port } = await startServer(0);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.5, colorScheme: 'light', reducedMotion: 'no-preference', acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.addInitScript(overlayScript);
  await page.goto(`http://127.0.0.1:${port}/projects/${slug}/`, { waitUntil: 'load' });
  await page.evaluate((m) => window.__demo.title(m), { name: mod.name, tagline: mod.tagline, scope: mod.scope, accent: mod.accent });
  await page.mouse.move(640, 360);

  const frames = [];
  let cdp = null; let ignoreFrames = false; let frameDir = null;
  if (record) {
    frameDir = fs.mkdtempSync(path.join(os.tmpdir(), `demo-${slug}-`));
    cdp = await context.newCDPSession(page);
    cdp.on('Page.screencastFrame', async (f) => {
      if (!ignoreFrames) {
        const file = path.join(frameDir, `${String(frames.length).padStart(6, '0')}.jpg`);
        fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
        frames.push({ file, ts: Date.now() / 1000 }); // Arrival time shares a clock with the first frame and the end
      }
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    // The screencast only sends frames on change, so a still title card may produce none. Seed the first frame.
    const firstFile = path.join(frameDir, 'first.jpg');
    await page.screenshot({ path: firstFile, type: 'jpeg', quality: 92 });
    frames.push({ file: firstFile, ts: Date.now() / 1000 });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  }

  const shots = record ? null : async (label) => { await page.screenshot({ path: path.join(outDir, `${label}.jpg`), type: 'jpeg', quality: 70 }); };
  const d = new Demo(page, shots);
  let posterTaken = false;
  d.onPoster = async () => {
    ignoreFrames = true;
    await page.evaluate(() => window.__demo.visible(false));
    const dest = record ? path.join(ROOT, 'assets', 'posters', `${slug}.jpg`) : path.join(outDir, 'poster.jpg');
    await page.screenshot({ path: dest, type: 'jpeg', quality: 86 });
    await page.evaluate(() => window.__demo.visible(true));
    ignoreFrames = false;
    posterTaken = true;
  };

  const t0 = Date.now();
  await sleep(TITLE_MS);
  await page.evaluate(() => window.__demo.hideCard());
  const runStart = Date.now();
  let failure = null;
  try { await mod.run(d); } catch (e) { failure = e; }
  const runMs = Date.now() - runStart;
  if (d.lastCaption && !d.lastCaption.shown) d.lastCaption.shown = Date.now() - d.lastCaption.at;
  if (!failure) await sleep(Math.max(0, RUN_BUDGET_MS - runMs)); // hold the final state so the video lands on 60s
  await page.evaluate((m) => window.__demo.end(m), { name: mod.name, accent: mod.accent });
  await page.screenshot({ path: path.join(outDir, 'end-card.jpg'), type: 'jpeg', quality: 60 }).catch(() => {});
  await sleep(END_MS);
  const totalMs = Date.now() - t0;

  let videoInfo = null;
  if (record && !failure) {
    const endTs = Date.now() / 1000; // metadata.timestamp is epoch seconds; the last frame holds until now
    await cdp.send('Page.stopScreencast');
    // Write a constant-rate MJPEG stream (each frame repeated for as long as it was on screen), so timing is exact.
    const FPS = 30;
    const outputFrames = Math.round((endTs - frames[0].ts) * FPS);
    const stream = path.join(frameDir, 'stream.mjpeg');
    const fd = fs.openSync(stream, 'w');
    for (let i = 0, src = 0, data = null, loaded = -1; i < outputFrames; i++) {
      const at = frames[0].ts + i / FPS;
      while (src + 1 < frames.length && frames[src + 1].ts <= at) src++;
      if (loaded !== src) { data = fs.readFileSync(frames[src].file); loaded = src; }
      fs.writeSync(fd, data);
    }
    fs.closeSync(fd);
    const out = path.join(ROOT, 'assets', 'videos', `${slug}.mp4`);
    const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'mjpeg', '-framerate', String(FPS), '-i', stream,
      '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
      '-movflags', '+faststart', '-an', out], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
    videoInfo = { out, mb: (fs.statSync(out).size / 1048576).toFixed(1), frames: frames.length };
    fs.rmSync(frameDir, { recursive: true, force: true });
  }
  await browser.close();
  server.close();

  const shortCaptions = d.captions.filter((c) => c.shown < 2000).map((c) => `"${c.text}" (${c.shown}ms)`);
  const longCaptions = d.captions.filter((c) => (c.text || '').length > 95).map((c) => c.text);
  const problems = [];
  if (failure) problems.push(`demo threw: ${failure.message}`);
  if (errors.length) problems.push(...[...new Set(errors)]);
  if (runMs > RUN_BUDGET_MS + 1500) problems.push(`run() too long: ${runMs}ms, budget ${RUN_BUDGET_MS}ms`);
  if (runMs < RUN_BUDGET_MS - 6000) problems.push(`run() too short: ${runMs}ms, leaves a long frozen ending (aim for ${RUN_BUDGET_MS - 3000}-${RUN_BUDGET_MS}ms)`);
  if (shortCaptions.length) problems.push(`captions on screen under 2s: ${shortCaptions.join('; ')}`);
  if (longCaptions.length) problems.push(`captions over 95 chars: ${longCaptions.join('; ')}`);
  if (!posterTaken && !failure) problems.push('demo never called d.poster()');
  const result = { slug, runMs, totalMs, captions: d.captions.length, video: videoInfo, problems };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

(async () => {
  const args = process.argv.slice(2);
  const record = args.includes('--record');
  const slugs = args.includes('--all')
    ? fs.readdirSync(path.join(__dirname, 'demos')).filter((f) => f.endsWith('.js')).map((f) => f.replace('.js', ''))
    : args.filter((a) => !a.startsWith('--'));
  if (!slugs.length) { console.error('Usage: node tools/demo.js <slug>|--all [--record]'); process.exit(2); }
  let bad = 0;
  for (const slug of slugs) { const r = await runDemo(slug, { record }); if (r.problems.length) bad++; }
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
