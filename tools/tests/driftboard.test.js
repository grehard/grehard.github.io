// Driftboard feature tests. Every action goes through real mouse, keyboard or touch input, and every
// assertion reads what a user can see: the status bar, the inspector fields, or an exported file.
const fs = require('fs');
const os = require('os');
const path = require('path');

const wait = (page, ms = 60) => page.waitForTimeout(ms);
const SETTLE_MS = 320; // Zoom animations last 130ms.

async function stageOrigin(page) {
  const box = await page.locator('#overlay').boundingBox();
  return { x: box.x, y: box.y, w: box.width, h: box.height };
}

// Opens a new empty board. A new board shows world (0,0) at stage pixel (60,60), at 100% zoom.
async function blankBoard(page) {
  await page.click('#boards-button');
  await page.click('#new-board');
  await wait(page);
  const origin = await stageOrigin(page);
  return (wx, wy) => ({ x: origin.x + 60 + wx, y: origin.y + 60 + wy });
}

async function drag(page, from, to, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
  await wait(page);
}

async function clickAt(page, p) {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
  await wait(page);
}

async function drawRect(page, at, x, y, w, h, tool = 'r') {
  await page.keyboard.press(tool);
  await drag(page, at(x, y), at(x + w, y + h));
}

async function geometry(page) {
  await wait(page, 40);
  return page.evaluate(() => {
    const out = {};
    ['x', 'y', 'w', 'h', 'rotation', 'x1', 'y1', 'x2', 'y2'].forEach((key) => {
      const input = document.getElementById(`geo-${key}`);
      if (input && input.offsetParent !== null) out[key] = Number(input.value);
    });
    return out;
  });
}

const status = (page, id) => page.locator(`#${id}`).innerText();

async function downloadText(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const file = await download.path();
  return { name: download.suggestedFilename(), text: fs.readFileSync(file, 'utf8'), file };
}

async function exportSvg(page, scope) {
  await page.click('#export-button');
  await page.click('label[for="export-format-svg"]');
  if (scope) await page.click(`label[for="export-scope-${scope}"]`);
  return downloadText(page, () => page.click('#export-download'));
}

async function typeText(page, text) {
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await wait(page);
}

function writeTempFile(name, text) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'driftboard-')), name);
  fs.writeFileSync(file, text);
  return file;
}

module.exports = {
  'seed board shows a system architecture on first run, with dates near today': async ({ page, assert }) => {
    assert.strictEqual(await page.locator('#board-name').innerText(), 'Fernway checkout architecture');
    assert.strictEqual(await status(page, 'status-count'), '64 shapes');
    const { text } = await exportSvg(page, 'board');
    for (const label of ['API gateway', 'Orders service', 'Event bus', 'Card processor']) assert.ok(text.includes(label), `missing ${label}`);
    const year = new Date();
    const inNineDays = new Date(year.getTime() + 9 * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    assert.ok(text.includes(`Load test on ${inNineDays}`), 'sticky date is not relative to today');
  },

  'screen to world is exact after panning and zooming to the cursor': async ({ page, assert }) => {
    const origin = await stageOrigin(page);
    await blankBoard(page);
    const readCursor = async (sx, sy) => {
      await page.mouse.move(origin.x + sx, origin.y + sy);
      await wait(page, 30);
      return status(page, 'status-cursor');
    };
    // New board: world = screen - 60.
    assert.strictEqual(await readCursor(260, 160), 'X 200 Y 100');

    // One wheel notch up at (260,160): zoom 120%, and the point under the cursor stays where it was.
    await page.mouse.wheel(0, -100);
    await wait(page, SETTLE_MS);
    assert.strictEqual(await page.locator('#zoom-label').innerText(), '120%');
    assert.strictEqual(await readCursor(260, 160), 'X 200 Y 100');
    // Moving 60px right is now 60 / 1.2 = 50 world units.
    assert.strictEqual(await readCursor(320, 160), 'X 250 Y 100');

    // Hand tool drag by (+120, -60): offset moves, zoom stays. World x = (320 - 120 - ox) / 1.2.
    await page.keyboard.press('h');
    await drag(page, { x: origin.x + 320, y: origin.y + 300 }, { x: origin.x + 440, y: origin.y + 240 });
    assert.strictEqual(await readCursor(320, 160), 'X 150 Y 150');

    // The + key zooms by 1.25 at the cursor: 150%, the cursor's world point unchanged.
    await page.keyboard.press('=');
    await wait(page, SETTLE_MS);
    assert.strictEqual(await page.locator('#zoom-label').innerText(), '150%');
    assert.strictEqual(await readCursor(320, 160), 'X 150 Y 150');
    assert.strictEqual(await readCursor(350, 190), 'X 170 Y 170');

    // 0 resets to 100%, about the middle of the stage.
    await page.keyboard.press('0');
    await wait(page, SETTLE_MS);
    assert.strictEqual(await page.locator('#zoom-label').innerText(), '100%');
  },

  'draws a shape where the mouse says, in world units, at any zoom': async ({ page, assert }) => {
    const at = await blankBoard(page);
    await page.keyboard.press('g'); // Snap to grid off, so the drag lands on exact values.
    await page.mouse.move(at(100, 100).x, at(100, 100).y);
    await page.mouse.wheel(0, -100); // 120% about world (100,100).
    await wait(page, SETTLE_MS);
    const scaled = (wx, wy) => ({ x: at(100, 100).x + (wx - 100) * 1.2, y: at(100, 100).y + (wy - 100) * 1.2 });
    await page.keyboard.press('r');
    await drag(page, scaled(100, 100), scaled(300, 200));
    assert.deepStrictEqual(await geometry(page), { x: 100, y: 100, w: 200, h: 100, rotation: 0 });
  },

  'each drawing tool creates its shape, and pen strokes are smoothed': async ({ page, assert }) => {
    const at = await blankBoard(page);
    await drawRect(page, at, 0, 0, 120, 80, 'r');
    await drawRect(page, at, 160, 0, 120, 80, 'o');
    await drawRect(page, at, 320, 0, 120, 80, 'd');
    await drawRect(page, at, 0, 120, 120, 40, 'l');
    await drawRect(page, at, 160, 120, 120, 40, 'a');
    await page.keyboard.press('n');
    await drag(page, at(320, 120), at(460, 240));
    await typeText(page, 'Sticky');
    await page.keyboard.press('t');
    await clickAt(page, at(0, 240));
    await typeText(page, 'Label');
    await page.keyboard.press('Escape');
    // A jittery pen stroke of 80 samples.
    await page.keyboard.press('p');
    await page.mouse.move(at(160, 240).x, at(160, 240).y);
    await page.mouse.down();
    for (let i = 1; i <= 80; i += 1) {
      await page.mouse.move(at(160 + i * 2, 240).x, at(160, 240 + (i % 2 ? 3 : -3)).y);
    }
    await page.mouse.up();
    await wait(page);
    await page.keyboard.press('v');
    assert.strictEqual(await status(page, 'status-count'), '8 shapes');
    const { text } = await exportSvg(page, 'board');
    for (const type of ['rect', 'ellipse', 'diamond', 'line', 'arrow', 'sticky', 'text', 'pen']) assert.ok(text.includes(`data-type="${type}"`), `no ${type} in export`);
    assert.ok(text.includes('<polygon'), 'diamond and arrowhead use polygons');
    const pen = /data-type="pen" d="([^"]+)"/.exec(text)[1];
    assert.ok(pen.includes('Q'), 'pen path is not curved');
    const segments = pen.split(/[QL]/).length - 1;
    assert.ok(segments < 80, `smoothing kept all samples (${segments})`);
    const ys = pen.match(/-?\d+(\.\d+)? (-?\d+(\.\d+)?)/g).map((pair) => Number(pair.split(' ')[1])).slice(10);
    assert.ok(Math.max(...ys) - Math.min(...ys) < 6, 'jitter of 6 units was not reduced');
  },

  'connector endpoints attach and follow a moved shape, with exact coordinates': async ({ page, assert }) => {
    const at = await blankBoard(page);
    await drawRect(page, at, 100, 100, 200, 100);
    await drawRect(page, at, 500, 100, 200, 100);
    // Draw an arrow from inside A to inside B. Each end snaps to the side facing the other shape.
    await page.keyboard.press('a');
    await drag(page, at(200, 150), at(600, 150));
    assert.deepStrictEqual(await geometry(page), { x1: 300, y1: 150, x2: 500, y2: 150 });
    assert.match(await page.locator('#connector-info').innerText(), /Attached/);

    // Move B by (-300, +200). Its center is now mostly below A's, so the arrow re-routes from
    // east/west sides to south/north: A's bottom middle to B's top middle.
    await page.keyboard.press('Escape');
    await drag(page, at(600, 150), at(300, 350));
    await clickAt(page, at(600, 400)); // Empty space: deselect.
    await clickAt(page, at(250, 250)); // Midpoint of the arrow from (200,200) to (300,300).
    assert.deepStrictEqual(await geometry(page), { x1: 200, y1: 200, x2: 300, y2: 300 });

    // Undo the move and the arrow returns to the original endpoints.
    await page.keyboard.press('Control+z');
    await wait(page);
    const { text } = await exportSvg(page, 'board');
    assert.ok(text.includes('data-from="300,150" data-to="500,150"'), 'undo did not restore the connector');
  },

  'elbow connectors route orthogonally and re-route on move': async ({ page, assert }) => {
    const at = await blankBoard(page);
    await drawRect(page, at, 100, 100, 200, 100);
    await drawRect(page, at, 500, 300, 200, 100);
    await page.keyboard.press('a');
    await drag(page, at(200, 150), at(600, 350));
    await page.getByRole('button', { name: 'Connector route: Elbow' }).click();
    await wait(page);
    let svg = (await exportSvg(page, 'board')).text;
    assert.match(svg, /data-from="300,150" data-to="500,350"/);
    assert.match(svg, /d="M300 150 L400 150 L400 350 L4\d\d(\.\d+)? 350"/);
    await page.keyboard.press('Escape');
    await clickAt(page, at(850, 0));
    await drag(page, at(600, 350), at(800, 350));
    svg = (await exportSvg(page, 'board')).text;
    assert.match(svg, /data-from="300,150" data-to="700,350"/);
    assert.match(svg, /d="M300 150 L500 150 L500 350 L6\d\d(\.\d+)? 350"/);
  },

  'undo and redo walk the full history in order': async ({ page, assert }) => {
    const at = await blankBoard(page);
    const count = () => status(page, 'status-count');
    assert.ok(await page.locator('#undo-button').isDisabled());
    await drawRect(page, at, 100, 100, 100, 100);
    await drag(page, at(150, 150), at(250, 150));
    assert.strictEqual((await geometry(page)).x, 200);
    await page.getByRole('button', { name: 'Stroke color: Vermilion' }).click();
    await page.keyboard.press('Control+d');
    await wait(page);
    assert.strictEqual(await count(), '2 shapes');
    assert.deepStrictEqual(await geometry(page), { x: 220, y: 120, w: 100, h: 100, rotation: 0 });
    await page.keyboard.press('Delete');
    await wait(page);
    assert.strictEqual(await count(), '1 shape');

    await page.keyboard.press('Control+z'); // Undo delete.
    await wait(page);
    assert.strictEqual(await count(), '2 shapes');
    assert.strictEqual((await geometry(page)).x, 220);
    await page.keyboard.press('Control+z'); // Undo duplicate.
    await wait(page);
    assert.strictEqual(await count(), '1 shape');
    assert.strictEqual((await geometry(page)).x, 200);
    assert.ok((await exportSvg(page, 'board')).text.includes('stroke="#e8401c"'));
    await page.keyboard.press('Control+z'); // Undo color.
    await wait(page);
    assert.ok(!(await exportSvg(page, 'board')).text.includes('stroke="#e8401c"'));
    await page.keyboard.press('Control+z'); // Undo move.
    await wait(page);
    assert.strictEqual((await geometry(page)).x, 100);
    await page.keyboard.press('Control+z'); // Undo draw.
    await wait(page);
    assert.strictEqual(await count(), '0 shapes');
    assert.ok(await page.locator('#undo-button').isDisabled());

    for (let i = 0; i < 5; i += 1) await page.keyboard.press('Control+Shift+z');
    await wait(page);
    assert.strictEqual(await count(), '1 shape');
    assert.ok(await page.locator('#redo-button').isDisabled());

    // A new edit clears the redo stack.
    await page.keyboard.press('Control+z');
    await wait(page);
    assert.ok(await page.locator('#redo-button').isEnabled());
    await drawRect(page, at, 400, 400, 100, 100);
    assert.ok(await page.locator('#redo-button').isDisabled());
  },

  'marquee, multi-select and group transforms give exact values': async ({ page, assert }) => {
    const at = await blankBoard(page);
    await drawRect(page, at, 100, 100, 100, 100);
    await drawRect(page, at, 300, 100, 100, 100);
    await drawRect(page, at, 700, 100, 100, 100);

    // Window selection (rightward) takes only shapes fully inside.
    await drag(page, at(80, 80), at(420, 220));
    assert.match(await status(page, 'status-selection'), /2 shapes selected/);
    assert.deepStrictEqual(await geometry(page), { x: 100, y: 100, w: 300, h: 100 });

    // Group, then clicking one member selects the group.
    await page.keyboard.press('Control+g');
    await wait(page);
    await clickAt(page, at(600, 400));
    await clickAt(page, at(150, 150));
    assert.match(await status(page, 'status-selection'), /2 shapes selected/);

    // Drag the group's east handle from x=400 to x=700: the width doubles about the left edge.
    await drag(page, at(400, 150), at(700, 150));
    assert.deepStrictEqual(await geometry(page), { x: 100, y: 100, w: 600, h: 100 });
    let svg = (await exportSvg(page, 'selection')).text;
    assert.ok(svg.includes('<rect x="100" y="100" width="200" height="100"'), 'first member scaled wrong');
    assert.ok(svg.includes('<rect x="500" y="100" width="200" height="100"'), 'second member scaled wrong');

    // Rotate the group 90 degrees right about its center (400,150).
    await page.click('#rotate-right');
    await wait(page);
    svg = (await exportSvg(page, 'selection')).text;
    // Member center (200,150) rotates to (400,-50); center (600,150) rotates to (400,350).
    assert.ok(svg.includes('x="300" y="-100" width="200" height="100"'), 'member 1 position after rotate');
    assert.ok(svg.includes('rotate(90 400 -50)'), 'member 1 rotation');
    assert.ok(svg.includes('rotate(90 400 350)'), 'member 2 rotation');
    assert.ok(svg.includes('data-group='), 'group is not kept in the SVG');

    // Ungroup: clicking a member now selects just it.
    await page.keyboard.press('Control+Shift+g');
    await wait(page);
    await clickAt(page, at(850, 0));
    await clickAt(page, at(400, -50 + 40));
    assert.strictEqual((await geometry(page)).rotation, 90);
  },

  'crossing selection, resize handles, rotate handle and lock': async ({ page, assert }) => {
    const at = await blankBoard(page);
    await drawRect(page, at, 100, 100, 100, 100);
    await drawRect(page, at, 300, 100, 100, 100);
    // Crossing selection (leftward) takes anything touched.
    await drag(page, at(320, 220), at(180, 180));
    assert.match(await status(page, 'status-selection'), /2 shapes/);
    await clickAt(page, at(600, 400));

    // Resize B by its south-east handle.
    await clickAt(page, at(350, 150));
    await drag(page, at(400, 200), at(460, 240));
    assert.deepStrictEqual(await geometry(page), { x: 300, y: 100, w: 160, h: 140, rotation: 0 });

    // Rotate handle sits 24px above the top-center (380,100). Drag it due east of center (380,170).
    await drag(page, at(380, 76), at(500, 170));
    assert.strictEqual((await geometry(page)).rotation, 90);

    // Locked shapes resist moves and deletion, and keep their spot.
    await page.keyboard.press('Control+Shift+l');
    await wait(page);
    const before = await geometry(page);
    await drag(page, at(380, 170), at(600, 400));
    assert.deepStrictEqual(await geometry(page), before);
    await page.keyboard.press('Delete');
    await wait(page);
    assert.strictEqual(await status(page, 'status-count'), '2 shapes');
    await page.keyboard.press('Control+Shift+l');
    await wait(page);
    await page.keyboard.press('g'); // Grid snap off: a rotated frame would otherwise snap its bounding box.
    await drag(page, at(380, 170), at(480, 170));
    assert.strictEqual((await geometry(page)).x, before.x + 100);
  },

  'snaps to the grid and to alignment guides': async ({ page, assert }) => {
    const at = await blankBoard(page);
    // Grid snap: a drag ending on (123,87) lands on the nearest multiple of 20.
    await page.keyboard.press('r');
    await drag(page, at(0, 0), at(123, 87));
    assert.deepStrictEqual(await geometry(page), { x: 0, y: 0, w: 120, h: 80, rotation: 0 });

    // With the grid off, a second shape aligns its left edge to the first's right edge within 6px.
    await page.keyboard.press('g');
    await page.keyboard.press('r');
    await drag(page, at(300, 300), at(450, 400));
    await drag(page, at(370, 350), at(190, 350)); // Proposed left edge 120 + 0: exact already, then nudge test.
    assert.strictEqual((await geometry(page)).x, 120);
    await drag(page, at(190, 350), at(194, 350)); // 4px away from the guide: pulled back.
    assert.strictEqual((await geometry(page)).x, 120);
    await drag(page, at(190, 350), at(230, 350)); // 40px away: released.
    assert.strictEqual((await geometry(page)).x, 160);

    // Ctrl ignores snapping for one drag.
    await page.keyboard.down('Control');
    await drag(page, at(230, 350), at(191, 350));
    await page.keyboard.up('Control');
    assert.strictEqual((await geometry(page)).x, 121);
  },

  'inline text editing on double-click, with long text growing the shape': async ({ page, assert }) => {
    const at = await blankBoard(page);
    await drawRect(page, at, 100, 100, 200, 60);
    await page.keyboard.press('Escape');
    await page.mouse.dblclick(at(200, 130).x, at(200, 130).y);
    await wait(page);
    const editor = page.locator('#text-editor');
    assert.ok(await editor.isVisible(), 'editor did not open');
    await page.keyboard.type('A <b> & "c"');
    await page.keyboard.press('Escape');
    await wait(page);
    assert.ok(!(await editor.isVisible()));
    const svg = (await exportSvg(page, 'board')).text;
    assert.ok(svg.includes('A &lt;b&gt; &amp; &quot;c&quot;'), 'text is not escaped in SVG');

    await page.mouse.dblclick(at(200, 130).x, at(200, 130).y);
    await wait(page);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('A long description that wraps across many lines and cannot fit a 60 unit tall box at all');
    await page.keyboard.press('Control+Enter');
    await wait(page);
    const g = await geometry(page);
    assert.ok(g.h > 60, `shape did not grow (${g.h})`);
    await page.keyboard.press('Control+z');
    await wait(page);
    assert.strictEqual((await geometry(page)).h, 60);
  },

  'style panel changes stroke, fill, width, line style, opacity and font size': async ({ page, assert }) => {
    const at = await blankBoard(page);
    await drawRect(page, at, 0, 0, 200, 100);
    await page.getByRole('button', { name: 'Stroke color: Steel blue' }).click();
    await page.getByRole('button', { name: 'Fill color: Green tint' }).click();
    await page.getByRole('button', { name: 'Stroke width: 5' }).click();
    await page.getByRole('button', { name: 'Line style: Dashed' }).click();
    await page.locator('#style-opacity').fill('50');
    await page.locator('#style-font').fill('30');
    await page.locator('#style-font').press('Tab');
    await wait(page);
    const svg = (await exportSvg(page, 'board')).text;
    assert.ok(svg.includes('fill="#deefe6" stroke="#2c6a96" stroke-width="5" stroke-dasharray="20 15"'), svg);
    assert.ok(svg.includes('opacity="0.5"'));
    // The new defaults carry to the next shape.
    await drawRect(page, at, 300, 0, 100, 100);
    assert.strictEqual(await page.getByRole('button', { name: 'Stroke width: 5' }).getAttribute('aria-pressed'), 'true');
    // Out-of-range font size is clamped.
    await page.locator('#style-font').fill('900');
    await page.locator('#style-font').press('Tab');
    await wait(page);
    assert.strictEqual(await page.locator('#style-font').inputValue(), '200');
  },

  'geometry fields clamp zero and huge values': async ({ page, assert }) => {
    const at = await blankBoard(page);
    await drawRect(page, at, 0, 0, 100, 100);
    await page.locator('#geo-w').fill('0');
    await page.locator('#geo-w').press('Enter');
    await wait(page);
    assert.strictEqual((await geometry(page)).w, 1);
    await page.locator('#geo-h').fill('99999999');
    await page.locator('#geo-h').press('Enter');
    await wait(page);
    assert.strictEqual((await geometry(page)).h, 1000000);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await wait(page);
    assert.deepStrictEqual(await geometry(page), { x: 0, y: 0, w: 100, h: 100, rotation: 0 });
  },

  'layer order, duplicate, copy and paste, delete with undo toast': async ({ page, assert }) => {
    const at = await blankBoard(page);
    await drawRect(page, at, 0, 0, 100, 100);
    await page.getByRole('button', { name: 'Fill color: Blue tint' }).click();
    await drawRect(page, at, 40, 40, 100, 100);
    await page.getByRole('button', { name: 'Fill color: Green tint' }).click();
    const order = async () => {
      const svg = (await exportSvg(page, 'board')).text;
      return svg.indexOf('#dfeaf2') < svg.indexOf('#deefe6') ? 'blue below' : 'blue above';
    };
    assert.strictEqual(await order(), 'blue below');
    await page.keyboard.press('Shift+BracketLeft'); // Send green to back.
    await wait(page);
    assert.strictEqual(await order(), 'blue above');
    await page.click('#layer-front');
    await wait(page);
    assert.strictEqual(await order(), 'blue below');

    await page.keyboard.press('Control+c');
    await page.mouse.move(at(410, 290).x, at(410, 290).y);
    await page.keyboard.press('Control+v');
    await wait(page, 120);
    assert.strictEqual(await status(page, 'status-count'), '3 shapes');
    // Centered on the cursor: (410 - 50, 290 - 50), which already falls on the 20-unit grid.
    assert.deepStrictEqual(await geometry(page), { x: 360, y: 240, w: 100, h: 100, rotation: 0 });

    await page.keyboard.press('Delete');
    await wait(page);
    assert.strictEqual(await status(page, 'status-count'), '2 shapes');
    await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
    await wait(page);
    assert.strictEqual(await status(page, 'status-count'), '3 shapes');

    // Eraser removes by dragging over shapes.
    await page.keyboard.press('e');
    await drag(page, at(390, 200), at(390, 400));
    assert.strictEqual(await status(page, 'status-count'), '2 shapes');
    assert.ok(await page.locator('.toast').isVisible());
  },

  'boards persist after reload, can be renamed, searched, and deleted with undo': async ({ page, assert, reload }) => {
    const at = await blankBoard(page);
    await drawRect(page, at, 40, 40, 120, 80);
    await page.click('#boards-button');
    const row = page.locator('.board-row', { hasText: 'Untitled board' });
    await row.getByRole('button', { name: /^Rename/ }).click();

    // Validation: an empty name is refused, with the reason on screen.
    await page.locator('.rename-row input').fill('   ');
    await page.locator('.rename-row').getByRole('button', { name: 'Save' }).click();
    assert.strictEqual(await page.locator('.field-error').innerText(), 'Enter a board name.');
    await page.locator('.rename-row input').fill('Storage tier sketch');
    await page.locator('.rename-row').getByRole('button', { name: 'Save' }).click();
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('#board-name').innerText(), 'Storage tier sketch');
    await wait(page, 350);

    await reload();
    await wait(page, 200);
    assert.strictEqual(await page.locator('#board-name').innerText(), 'Storage tier sketch');
    assert.strictEqual(await status(page, 'status-count'), '1 shape');
    await clickAt(page, at(100, 80));
    assert.deepStrictEqual(await geometry(page), { x: 40, y: 40, w: 120, h: 80, rotation: 0 });

    // Search filters the list.
    await page.click('#boards-button');
    await page.locator('#board-search').fill('wireframe');
    assert.strictEqual(await page.locator('.board-row').count(), 1);
    await page.locator('#board-search').fill('no such board');
    assert.match(await page.locator('.board-empty').innerText(), /No boards match/);
    await page.locator('#board-search').fill('');

    // Delete the open board, then undo from the toast.
    await page.locator('.board-row', { hasText: 'Storage tier sketch' }).getByRole('button', { name: /^Delete/ }).click();
    await wait(page);
    assert.strictEqual(await page.locator('.board-row', { hasText: 'Storage tier sketch' }).count(), 0);
    assert.notStrictEqual(await page.locator('#board-name').innerText(), 'Storage tier sketch');
    await page.locator('.toast-action').click();
    await wait(page);
    assert.strictEqual(await page.locator('#board-name').innerText(), 'Storage tier sketch');
    assert.strictEqual(await status(page, 'status-count'), '1 shape');
  },

  'reset demo data restores the seed boards, and can be undone': async ({ page, assert }) => {
    await blankBoard(page);
    await page.click('#boards-button');
    await page.click('#reset-demo');
    await wait(page);
    assert.strictEqual(await page.locator('#board-name').innerText(), 'Fernway checkout architecture');
    await page.click('#boards-button');
    assert.strictEqual(await page.locator('.board-row').count(), 3);
    await page.keyboard.press('Escape');
    await page.locator('.toast-action').click();
    await wait(page);
    await page.click('#boards-button');
    assert.strictEqual(await page.locator('.board-row').count(), 4);
  },

  'JSON save and load round-trips, and bad files are refused with a reason': async ({ page, assert }) => {
    const at = await blankBoard(page);
    await drawRect(page, at, 100, 100, 200, 100);
    await drawRect(page, at, 500, 100, 200, 100);
    await page.keyboard.press('a');
    await drag(page, at(200, 150), at(600, 150));

    await page.click('#export-button');
    await page.click('label[for="export-format-json"]');
    const saved = await downloadText(page, () => page.click('#export-download'));
    assert.match(saved.name, /\.json$/);
    const data = JSON.parse(saved.text);
    assert.strictEqual(data.app, 'driftboard');
    assert.strictEqual(data.boards[0].shapes.length, 3);

    await page.locator('#load-input').setInputFiles(saved.file);
    await wait(page, 200);
    assert.strictEqual(await status(page, 'status-count'), '3 shapes');
    await page.click('#boards-button');
    assert.strictEqual(await page.locator('.board-row', { hasText: 'Untitled board' }).count(), 2);
    await page.keyboard.press('Escape');

    // Loaded connectors stay attached: moving B re-routes the arrow.
    await drag(page, at(600, 150), at(600, 250));
    assert.match((await exportSvg(page, 'board')).text, /data-from="300,150" data-to="500,250"/);

    await page.locator('#load-input').setInputFiles(writeTempFile('garbage.json', '{not json'));
    await wait(page, 150);
    assert.match(await page.locator('.modal-text').innerText(), /not valid JSON/);
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.modal').count(), 0);

    await page.locator('#load-input').setInputFiles(writeTempFile('other.json', JSON.stringify({ hello: 'world' })));
    await wait(page, 150);
    assert.match(await page.locator('.modal-text').innerText(), /not a Driftboard file/);
    await page.keyboard.press('Escape');

    // A file with one good and one broken shape loads the good one and says so.
    const mixed = { app: 'driftboard', version: 1, boards: [{ name: 'Partial', shapes: [{ type: 'rect', x: 1, y: 2, w: 3, h: 4 }, { type: 'rect', x: 'nope' }] }] };
    await page.locator('#load-input').setInputFiles(writeTempFile('mixed.json', JSON.stringify(mixed)));
    await wait(page, 150);
    assert.match(await page.locator('.toast').innerText(), /Skipped 1 invalid shape/);
    assert.strictEqual(await status(page, 'status-count'), '1 shape');
  },

  'corrupt storage does not crash the app': async ({ page, assert, reload }) => {
    await page.evaluate(() => {
      localStorage.setItem('driftboard:index', '{broken');
      localStorage.setItem('driftboard:settings', '{"snapGrid":"yes","defaults":{"width":"huge"}}');
    });
    await reload();
    await wait(page, 200);
    assert.strictEqual(await status(page, 'status-count'), '64 shapes');
  },

  'SVG export has exact contents for a selection, and PNG has the expected size': async ({ page, assert }) => {
    const at = await blankBoard(page);
    await drawRect(page, at, 100, 100, 200, 100);
    await page.locator('#style-font').fill('20');
    await page.locator('#style-font').press('Tab');
    await drawRect(page, at, 400, 100, 100, 100, 'o');
    await clickAt(page, at(450, 150));
    const { text, name } = await exportSvg(page, 'selection');
    assert.match(name, /\.svg$/);
    // Selection only: the ellipse, padded by 24 on each side.
    assert.ok(text.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="376 76 148 148" width="148" height="148">'), text.slice(0, 120));
    assert.ok(text.includes('<ellipse cx="450" cy="150" rx="50" ry="50" fill="#fdfcf9" stroke="#1d1f21" stroke-width="2"/>'), text);
    assert.ok(!text.includes('<rect x="100"'), 'selection export included another shape');

    // Whole board at 1x: width (400 + 48) by height (100 + 48).
    await page.click('#export-button');
    await page.click('label[for="export-format-png"]');
    await page.click('label[for="export-scope-board"]');
    await page.click('label[for="export-scale-1"]');
    assert.strictEqual(await page.locator('#export-size').innerText(), '448 by 148 px');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-download')]);
    const png = fs.readFileSync(await download.path());
    assert.strictEqual(png.readUInt32BE(16), 448);
    assert.strictEqual(png.readUInt32BE(20), 148);
    assert.strictEqual(png.slice(1, 4).toString(), 'PNG');
  },

  'stays responsive at 1,000 shapes: picking is exact and frames stay short': async ({ page, assert }) => {
    await page.click('#boards-button');
    await page.click('#stress-board');
    await wait(page, 300);
    assert.strictEqual(await status(page, 'status-count'), '1,000 shapes');
    const origin = await stageOrigin(page);
    const center = { x: origin.x + origin.w / 2, y: origin.y + origin.h / 2 };

    // Fitted, every shape is on screen, so this is the heaviest frame.
    assert.match(await status(page, 'status-perf'), /1000 drawn/);

    // Pan at 100%, sampling the paint time the status bar reports.
    await page.mouse.move(center.x, center.y);
    await page.keyboard.press('0');
    await wait(page, SETTLE_MS);
    const samples = [];
    await page.keyboard.press('h');
    await page.mouse.down();
    for (let i = 0; i < 30; i += 1) {
      await page.mouse.move(center.x + i * 8, center.y + i * 4);
      await wait(page, 16);
      if (i % 5 === 0) samples.push(parseFloat(await status(page, 'status-perf')));
    }
    await page.mouse.up();
    const max = Math.max(...samples);
    assert.ok(max < 50, `paint took ${max} ms`);

    // Click the middle of a known node. The board lays nodes out at (col * 180, row * 120), 140 by 80,
    // and numbers them row by row in 40 columns, so the expected label follows from the world position.
    await page.keyboard.press('v');
    await page.mouse.move(center.x, center.y);
    await wait(page, 40);
    const [, wx, wy] = /X (-?[\d.]+) Y (-?[\d.]+)/.exec(await status(page, 'status-cursor')).map(Number);
    const column = Math.max(0, Math.min(39, Math.round((wx - 70) / 180)));
    const row = Math.max(0, Math.min(19, Math.round((wy - 40) / 120)));
    await clickAt(page, { x: center.x + (column * 180 + 70 - wx), y: center.y + (row * 120 + 40 - wy) });
    assert.match(await status(page, 'status-selection'), new RegExp(`: node ${row * 40 + column + 1}$`));
    assert.strictEqual((await geometry(page)).x, column * 180);

    // Dragging that one shape among 1,000 still commits exact values and paints quickly.
    await page.keyboard.press('g');
    await drag(page, { x: center.x + (column * 180 + 70 - wx), y: center.y + (row * 120 + 40 - wy) }, { x: center.x + (column * 180 + 70 - wx) + 33, y: center.y + (row * 120 + 40 - wy) + 7 });
    const moved = await geometry(page);
    assert.strictEqual(moved.x, column * 180 + 33);
    assert.strictEqual(moved.y, row * 120 + 7);
  },

  'help panel lists shortcuts, keyboard-only drawing works, and Escape closes it': async ({ page, assert }) => {
    await blankBoard(page);
    await page.keyboard.press('?');
    await wait(page);
    assert.match(await page.locator('#help-content').innerText(), /Sticky note/);
    assert.match(await page.locator('#help-content').innerText(), /Ctrl\+Shift\+G/);
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('#help-content').count(), 0);

    await page.locator('#overlay').focus();
    await page.keyboard.press('r');
    await page.keyboard.press('Enter');
    await wait(page);
    assert.strictEqual(await status(page, 'status-count'), '1 shape');
    const g = await geometry(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    await wait(page);
    const moved = await geometry(page);
    assert.strictEqual(moved.x, g.x + 1);
    assert.strictEqual(moved.y, g.y + 20);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Enter');
    await wait(page);
    assert.ok(await page.locator('#text-editor').isVisible());
    await page.keyboard.type('Keyboard only');
    await page.keyboard.press('Escape');
    await wait(page);
    assert.match(await status(page, 'status-selection'), /Keyboard only/);
  },

  'theme toggle and view settings are remembered; minimap moves the view': async ({ page, assert, reload }) => {
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await page.click('#theme-button');
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await page.click('#view-button');
    await page.click('#toggle-snapGrid');
    assert.strictEqual(await page.locator('#toggle-snapGrid').getAttribute('aria-checked'), 'false');
    await reload();
    await wait(page, 150);
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await page.click('#view-button');
    assert.strictEqual(await page.locator('#toggle-snapGrid').getAttribute('aria-checked'), 'false');
    await page.keyboard.press('Escape');

    const origin = await stageOrigin(page);
    const readWorld = async () => {
      await page.mouse.move(origin.x + 300, origin.y + 300);
      await wait(page, 30);
      return status(page, 'status-cursor');
    };
    const before = await readWorld();
    const map = await page.locator('#minimap').boundingBox();
    await page.mouse.click(map.x + 20, map.y + 20);
    await wait(page, 120);
    assert.notStrictEqual(await readWorld(), before);

    await page.keyboard.press('m');
    assert.ok(!(await page.locator('#minimap').isVisible()));
  },

  'phone width: toolbar fits, touch draws and pinch zooms': async ({ page, context, assert }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(150);
    const tools = page.locator('#toolbar .tool');
    assert.strictEqual(await tools.count(), 11);
    for (let i = 0; i < 11; i += 1) {
      const box = await tools.nth(i).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `tool ${i} is off screen`);
      assert.ok(box.height >= 40, `tool ${i} is too short for touch`);
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    await page.click('#boards-button');
    await page.click('#new-board');
    await wait(page);
    const stage = await stageOrigin(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x: stage.x + x, y: stage.y + y, id })) });

    // One finger drag with the rectangle tool.
    await tools.nth(2).click();
    await touch('touchStart', [[100, 100, 1]]);
    for (let i = 1; i <= 6; i += 1) await touch('touchMove', [[100 + i * 20, 100 + i * 15, 1]]);
    await touch('touchEnd', []);
    await wait(page, 120);
    const count = () => page.locator('#status-count').textContent();
    assert.strictEqual(await count(), '1 shape');

    // Pinch out from 100px to 200px apart around (195,300): zoom doubles.
    await touch('touchStart', [[145, 300, 1], [245, 300, 2]]);
    for (let i = 1; i <= 5; i += 1) await touch('touchMove', [[145 - i * 10, 300, 1], [245 + i * 10, 300, 2]]);
    await touch('touchEnd', []);
    await wait(page, 150);
    assert.strictEqual(await page.locator('#zoom-label').innerText(), '200%');
    // The second finger did not leave a stray shape behind.
    assert.strictEqual(await count(), '1 shape');

    // Pen with touch.
    await tools.nth(7).click();
    await touch('touchStart', [[60, 200, 1]]);
    for (let i = 1; i <= 8; i += 1) await touch('touchMove', [[60 + i * 15, 200 + Math.sin(i) * 12, 1]]);
    await touch('touchEnd', []);
    await wait(page, 120);
    assert.strictEqual(await count(), '2 shapes');

    // The style sheet opens over the canvas and stays inside the screen.
    await page.click('#panel-button');
    await wait(page);
    const sheet = await page.locator('#inspector').boundingBox();
    assert.ok(sheet.x >= 0 && sheet.x + sheet.width <= 390);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0);
  },
};
