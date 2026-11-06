// Driftboard demo: extend a real architecture diagram, then show that it stays tidy when things move.
//
// Sections start on a fixed timeline, so the run lands in the 47-50s window whether the machine is idle
// or busy: a fast section waits for its slot, and a late one skips its optional extra.
module.exports = {
  name: 'Driftboard',
  tagline: 'Infinite whiteboard for diagrams, wireframes and system sketches',
  scope: [
    'Infinite canvas with zoom to cursor and pinch',
    'Connectors that re-route as shapes move',
    'Snapping, groups, layers and full undo',
    'PNG, SVG and JSON export of named boards',
  ],
  accent: '#e8401c',
  run: async (d) => {
    const { page } = d;
    const started = Date.now();
    const elapsed = () => (Date.now() - started) / 1000;
    let captionAt = 0;
    const show = async (text) => { captionAt = elapsed(); await d.caption(text, 0); };
    // Waits for a section's end slot, while keeping its caption up for at least 2.2 seconds.
    const until = async (seconds) => {
      const left = Math.max(seconds, captionAt + 2.2) - elapsed();
      if (left > 0) await d.wait(left * 1000);
    };
    const tool = (name) => d.click(`#toolbar [data-tool="${name}"]`, { hold: 80 });

    // World coordinates to page coordinates, using the app's current view.
    const pt = (wx, wy) => page.evaluate(([x, y]) => {
      const box = document.getElementById('overlay').getBoundingClientRect();
      const p = window.DB.app.camera.toScreen(x, y);
      return { x: box.left + p.x, y: box.top + p.y };
    }, [wx, wy]);

    await show('A production architecture sketch, ready to extend.');
    await until(2.8);

    await show('The wheel zooms at the cursor; drag with Hand to pan.');
    await d.move(await pt(940, 440), 300);
    for (let i = 0; i < 2; i += 1) { await page.mouse.wheel(0, -100); await d.wait(220); }
    await tool('hand');
    const from = await pt(700, 600);
    const anchor = await pt(540, 320);
    await d.drag(from, { x: from.x + (110 - anchor.x), y: from.y + (90 - anchor.y) }, { ms: 400 });
    await tool('select');
    await until(7.5);

    await show('Draw a read replica, then double-click to name it.');
    await tool('ellipse');
    await d.drag(await pt(1080, 500), await pt(1280, 580), { ms: 350 });
    const replica = await pt(1180, 540);
    await page.mouse.dblclick(replica.x, replica.y);
    await d.wait(100);
    await page.keyboard.type('Read replica', { delay: 30 });
    await d.press('Escape', 150);
    await d.click('[aria-label="Fill color: Green tint"]', { hold: 120 });
    await d.click('[aria-label="Stroke color: Pine"]', { hold: 200 });
    await until(12.5);

    await show('Drag an arrow between shapes and it attaches to both.');
    await d.press('Escape', 40);
    await d.click('[aria-label="Connector route: Elbow"]', { hold: 60 });
    await tool('arrow');
    await d.drag(await pt(960, 440), await pt(1180, 540), { ms: 500 });
    await until(16.5);

    await show('Move the shape and the connector re-routes with it.');
    await d.press('Escape', 40);
    await d.drag(await pt(1180, 540), await pt(1300, 680), { ms: 500 });
    if (elapsed() < 18.5) {
      await d.drag(await pt(1300, 680), await pt(1120, 720), { ms: 500 });
    }
    await until(20.5);

    await show('Undo walks back every step, and redo walks forward.');
    await d.click('#undo-button', { hold: 250 });
    await d.click('#redo-button', { hold: 250 });
    await d.click('#undo-button', { hold: 200 });
    if (elapsed() < 22.5) await d.click('#undo-button', { hold: 200 });
    await until(24);

    await show('Alignment guides appear as edges and centers line up.');
    await page.keyboard.press('Escape');
    await d.click(await pt(1180, 540), { hold: 40 });
    await d.press('Control+d', 120);
    await d.move(await pt(1200, 560), 120);
    await page.mouse.down();
    await d.move(await pt(1420, 540), 500);
    await d.wait(elapsed() < 27 ? 700 : 300);
    await page.mouse.up();
    await until(28);

    await show('Group shapes, then rotate them about one center.');
    await d.press('Escape', 40);
    await d.drag(await pt(1075, 482), await pt(1540, 610), { ms: 350 });
    await d.press('Control+g', 120);
    const frame = await page.evaluate(() => ['x', 'y', 'w', 'h'].map((k) => Number(document.getElementById(`geo-${k}`).value)));
    const handle = await pt(frame[0] + frame[2] / 2, frame[1]);
    await d.drag({ x: handle.x, y: handle.y - 24 }, await pt(frame[0] + frame[2] / 2 + 160, frame[1] - 20), { ms: 400 });
    await d.wait(300);
    await d.press('Control+z', 120);
    await d.press('Control+z', 120);
    await d.press('Escape', 40);
    await until(32.5);

    await show('Freehand marks are smoothed and stay editable.');
    await d.click('[aria-label="Stroke color: Vermilion"]', { hold: 60 });
    await tool('pen');
    const c = await pt(800, 628);
    await d.move({ x: c.x - 70, y: c.y - 30 }, 180);
    await page.mouse.down();
    const steps = 30;
    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2.1 - 2.6;
      await page.mouse.move(c.x + Math.cos(angle) * 88 + Math.sin(i * 1.7) * 2, c.y + Math.sin(angle) * 42 + Math.cos(i * 1.3) * 2);
      await d.wait(10);
    }
    await page.mouse.up();
    await d.wait(120);
    await tool('sticky');
    await d.drag(await pt(1100, 610), await pt(1280, 700), { ms: 220 });
    await page.keyboard.type('Replica lag budget: 5 seconds', { delay: 18 });
    await d.press('Escape', 60);
    await d.press('Escape', 40);
    await until(38);

    await show('The minimap shows the whole board; drag it to move.');
    await page.keyboard.press('Shift+1');
    await d.wait(300);
    await d.poster();
    if (elapsed() < 40) {
      await d.press('=', 180);
      await d.press('=', 180);
    }
    const map = await page.locator('#minimap').boundingBox();
    await d.move({ x: map.x + 82, y: map.y + 54 }, 200);
    await page.mouse.down();
    await d.move({ x: map.x + 112, y: map.y + 74 }, 350);
    await page.mouse.up();
    await d.wait(200);
    await page.keyboard.press('Shift+1');
    await until(41.5);

    await show('Export PNG or SVG of the selection or board, or save JSON.');
    await d.click('#export-button', { hold: 300 });
    await d.click('label[for="export-format-svg"]', { hold: 400 });
    if (elapsed() < 44) await d.click('label[for="export-format-json"]', { hold: 300 });
    await d.press('Escape', 100);
    await until(45);

    await show('Named boards hold wireframes and flows too.');
    await d.click('#boards-button', { hold: 300 });
    await d.click('.board-row:nth-child(2) .board-open', { hold: 300 });
    await until(48);
  },
};
