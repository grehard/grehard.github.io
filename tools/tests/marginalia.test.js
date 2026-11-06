// Feature tests for Marginalia. They drive the real UI: text goes in through the editor,
// and assertions read the rendered preview, panels, downloads and localStorage.
const fs = require('fs');

const STORAGE_KEY = 'marginalia.v1';
const AUTOSAVE_MS = 800;

/** Creates a note through the UI and leaves it open with `body` typed in. */
async function newNote(page, title, body) {
  await page.click('#new-note');
  await page.fill('#note-title', title);
  await page.press('#note-title', 'Enter');
  if (body) await setBody(page, body);
}

/** The preview renders on the next animation frame. */
async function previewRendered(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function setBody(page, body) {
  await page.fill('#editor', body);
  await previewRendered(page);
}

async function previewHtml(page, body) {
  await setBody(page, body);
  return page.$eval('#preview', (el) => el.innerHTML);
}

function noteRow(page, title) {
  return page.locator('a.note-item').filter({ has: page.getByText(title, { exact: true }) }).first();
}

async function openNote(page, title) {
  await noteRow(page, title).click();
  await page.waitForFunction((t) => document.getElementById('note-title').value === t, title);
}

async function saved(page) {
  await page.waitForTimeout(AUTOSAVE_MS);
}

async function stored(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
}

async function noteTitles(page) {
  return page.$$eval('#note-list .note-item .note-title-text', (els) => els.map((el) => el.textContent));
}

async function textOf(page, selector) {
  return (await page.textContent(selector)).trim();
}

async function downloadText(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return { name: download.suggestedFilename(), text: fs.readFileSync(await download.path(), 'utf8') };
}

function mdFile(name, text) {
  return { name, mimeType: 'text/markdown', buffer: Buffer.from(text) };
}

module.exports = {
  'opens on realistic seed data with folders, tags and a rendered note': async ({ page, assert }) => {
    await page.waitForSelector('#note-list .note-item');
    assert.strictEqual((await noteTitles(page)).length, 17);
    assert.strictEqual(await page.inputValue('#note-title'), 'Thesis outline');
    assert.strictEqual(await page.locator('#folder-chips .chip').count(), 5);
    assert.ok(await page.locator('#tag-chips .chip', { hasText: '#culverts' }).count());
    assert.strictEqual(await textOf(page, '#preview h2'), 'Argument');
    assert.strictEqual(await page.locator('#preview ol > li').count(), 5);
  },

  'renders headings, emphasis and nested lists to exact HTML': async ({ page, assert }) => {
    await newNote(page, 'Parser check');
    assert.strictEqual(await previewHtml(page, '# One\n\n### Three ###\n\nSetext\n---'), '<h1>One</h1>\n<h3>Three</h3>\n<h2>Setext</h2>');
    assert.strictEqual(
      await previewHtml(page, '**bold** *em* ***both*** ~~gone~~ snake_case_word `a*b*c` 2 * 3 \\*literal\\*'),
      '<p><strong>bold</strong> <em>em</em> <em><strong>both</strong></em> <del>gone</del> snake_case_word <code>a*b*c</code> 2 * 3 *literal*</p>',
    );
    assert.strictEqual(
      await previewHtml(page, '- one\n  - two\n    - three\n- four\n\n3. c\n4. d'),
      '<ul>\n<li>one\n<ul>\n<li>two\n<ul>\n<li>three</li>\n</ul></li>\n</ul></li>\n<li>four</li>\n</ul>\n<ol start="3">\n<li>c</li>\n<li>d</li>\n</ol>',
    );
    assert.strictEqual(
      await previewHtml(page, '1. first\n  - shallow child\n2. second'),
      '<ol>\n<li>first\n<ul>\n<li>shallow child</li>\n</ul></li>\n<li>second</li>\n</ol>',
    );
    assert.strictEqual(await previewHtml(page, '- a\n\n- b'), '<ul>\n<li><p>a</p></li>\n<li><p>b</p></li>\n</ul>');
  },

  'renders tables, code blocks, blockquotes and links to exact HTML': async ({ page, assert }) => {
    await newNote(page, 'Parser check two');
    assert.strictEqual(
      await previewHtml(page, '| A | B | C |\n| :-- | :-: | --: |\n| 1 | **2** | a\\|b |\n| only |'),
      '<div class="table-wrap"><table><thead><tr><th style="text-align:left">A</th><th style="text-align:center">B</th><th style="text-align:right">C</th></tr></thead>'
      + '<tbody><tr><td style="text-align:left">1</td><td style="text-align:center"><strong>2</strong></td><td style="text-align:right">a|b</td></tr>'
      + '<tr><td style="text-align:left">only</td><td style="text-align:center"></td><td style="text-align:right"></td></tr></tbody></table></div>',
    );
    assert.strictEqual(
      await previewHtml(page, '```js\nconst a = "<b>";\n# not a heading\n```'),
      '<pre><code class="language-js">const a = "&lt;b&gt;";\n# not a heading\n</code></pre>',
    );
    assert.strictEqual(await previewHtml(page, '> quote\nlazy line\n>\n> > nested'), '<blockquote>\n<p>quote\nlazy line</p>\n<blockquote>\n<p>nested</p>\n</blockquote>\n</blockquote>');
    assert.strictEqual(
      await previewHtml(page, '[Site](https://example.test/a_(b) "Hi") and <https://example.test>'),
      '<p><a href="https://example.test/a_(b)" title="Hi" target="_blank" rel="noopener noreferrer">Site</a> and <a href="https://example.test" target="_blank" rel="noopener noreferrer">https://example.test</a></p>',
    );
  },

  'neutralises script tags, event handlers and dangerous links': async ({ page, assert }) => {
    await newNote(page, 'Safety check');
    const blocked = (text) => `<span class="unsafe-link" title="Link removed: unsafe address">${text}</span>`;
    assert.strictEqual(await previewHtml(page, '<script>window.hacked = 1</script>'), '<p>&lt;script&gt;window.hacked = 1&lt;/script&gt;</p>');
    assert.strictEqual(await previewHtml(page, '<img src=x onerror="window.hacked = 1">'), '<p>&lt;img src=x onerror="window.hacked = 1"&gt;</p>');
    assert.strictEqual(await previewHtml(page, '[x](javascript:window.hacked=1)'), `<p>${blocked('x')}</p>`);
    assert.strictEqual(await previewHtml(page, '[x](JaVaScRiPt:alert(1))'), `<p>${blocked('x')}</p>`);
    assert.strictEqual(await previewHtml(page, '[x](java&#115;cript:alert(1))'), `<p>${blocked('x')}</p>`);
    assert.strictEqual(await previewHtml(page, '[x](javascript&colon;alert(1))'), `<p>${blocked('x')}</p>`);
    assert.strictEqual(await previewHtml(page, '[x](<java\tscript:alert(1)>)'), `<p>${blocked('x')}</p>`);
    assert.strictEqual(await previewHtml(page, '[x](data:text/html,<script>alert(1)</script>)'), `<p>${blocked('x')}</p>`);
    assert.strictEqual(await previewHtml(page, '<javascript:alert(1)>'), `<p>${blocked('javascript:alert(1)')}</p>`);
    assert.strictEqual(await previewHtml(page, '![pic](vbscript:x)'), `<p>${blocked('pic')}</p>`);
    assert.strictEqual(
      await previewHtml(page, '[[x" onclick="window.hacked=1]]'),
      '<p><a class="wikilink is-missing" href="#" data-wiki="x&quot; onclick=&quot;window.hacked=1">x" onclick="window.hacked=1</a></p>',
    );
    assert.strictEqual(await page.locator('#preview script, #preview img, #preview [onclick], #preview [onerror]').count(), 0);
    assert.strictEqual(await page.evaluate(() => window.hacked), undefined);
  },

  'ticks a task from the preview, including a nested one, and writes it back to the source': async ({ page, assert, reload }) => {
    await newNote(page, 'Tasks', 'Intro\n\n- [ ] top\n  - [x] done child\n  - [ ] open child\n\n> - [ ] quoted');
    const boxes = page.locator('#preview .task-box');
    assert.strictEqual(await boxes.count(), 4);
    await boxes.nth(2).check();
    assert.strictEqual(await page.inputValue('#editor'), 'Intro\n\n- [ ] top\n  - [x] done child\n  - [x] open child\n\n> - [ ] quoted');
    await page.locator('#preview .task-box').nth(1).uncheck();
    assert.strictEqual(await page.inputValue('#editor'), 'Intro\n\n- [ ] top\n  - [ ] done child\n  - [x] open child\n\n> - [ ] quoted');
    await page.locator('#preview .task-box').nth(3).check();
    assert.strictEqual(await page.inputValue('#editor'), 'Intro\n\n- [ ] top\n  - [ ] done child\n  - [x] open child\n\n> - [x] quoted');
    assert.match(await textOf(page, '#doc-stats'), /2 of 4 tasks done/);
    await saved(page);
    await reload();
    assert.strictEqual(await page.locator('#preview .task-box:checked').count(), 2);
  },

  'formats text from the toolbar and shortcuts, and switches modes': async ({ page, assert }) => {
    await newNote(page, 'Formatting');
    await page.click('#editor');
    await page.keyboard.type('word');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Control+B');
    assert.strictEqual(await page.inputValue('#editor'), '**word**');
    await page.keyboard.press('Control+B');
    assert.strictEqual(await page.inputValue('#editor'), 'word');
    await page.click('[data-tool="italic"]');
    assert.strictEqual(await page.inputValue('#editor'), '*word*');
    await page.keyboard.press('Control+A');
    await page.click('[data-tool="task"]');
    assert.strictEqual(await page.inputValue('#editor'), '- [ ] *word*');
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('next');
    assert.strictEqual(await page.inputValue('#editor'), '- [ ] *word*\n- [ ] next');
    await page.keyboard.press('Control+z');
    assert.notStrictEqual(await page.inputValue('#editor'), '- [ ] *word*\n- [ ] next', 'native undo still works');

    await page.click('#mode-switch [data-mode="edit"]');
    assert.ok(await page.isVisible('#editor'));
    assert.ok(!(await page.isVisible('#preview')));
    await page.click('#mode-switch [data-mode="preview"]');
    assert.ok(!(await page.isVisible('#editor')));
    assert.ok(await page.isVisible('#preview'));
    assert.ok(!(await page.isVisible('[data-tool="bold"]')));
    await page.keyboard.press('Alt+1');
    assert.ok(await page.isVisible('#editor'));
    assert.ok(await page.isVisible('#preview'));
  },

  'autocompletes wiki links and creates a note from an unresolved link': async ({ page, assert }) => {
    await newNote(page, 'Linking');
    await page.click('#editor');
    await page.keyboard.type('See [[chap');
    const options = page.locator('#wiki-popup [role="option"]');
    assert.deepStrictEqual(await options.allTextContents(), ['Chapter 2: Buried rivers', 'Chapter 3: Flood memory', 'Create note "chap"']);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.inputValue('#editor'), 'See [[Chapter 3: Flood memory]]');
    assert.ok(!(await page.isVisible('#wiki-popup')));

    await page.keyboard.type(' and [[Fresh idea]]');
    await previewRendered(page);
    const missing = page.locator('#preview a.wikilink.is-missing');
    assert.strictEqual(await missing.textContent(), 'Fresh idea');
    await missing.click();
    await page.waitForFunction(() => document.getElementById('note-title').value === 'Fresh idea');
    assert.ok((await noteTitles(page)).includes('Fresh idea'));
    await page.locator('#backlinks-list .backlink', { hasText: 'Linking' }).click();
    await page.waitForFunction(() => document.getElementById('note-title').value === 'Linking');
    assert.strictEqual(await page.locator('#preview a.wikilink.is-missing').count(), 0);
  },

  'backlinks list linking notes with counts and ignore code and self links': async ({ page, assert }) => {
    await newNote(page, 'Target note', 'A [[Target note]] self link.');
    await newNote(page, 'Linker one', 'Twice: [[Target note]] and [[target NOTE|an alias]].');
    await newNote(page, 'Only in code', 'Inline `[[Target note]]` and\n\n```\n[[Target note]]\n```\n\n    [[Target note]]\n\nescaped \\[[Target note]]');
    await newNote(page, 'Linker two', '- nested\n  - see [[Target note]] here');
    await saved(page);
    await openNote(page, 'Target note');
    const cards = page.locator('#backlinks-list .backlink');
    assert.deepStrictEqual(await page.$$eval('#backlinks-list .backlink-title', (els) => els.map((el) => el.textContent)), ['Linker one', 'Linker two']);
    assert.strictEqual(await cards.nth(0).locator('.backlink-count').textContent(), '2 links');
    assert.strictEqual(await cards.nth(0).locator('.backlink-context').textContent(), 'Twice: Target note and an alias.');
    assert.strictEqual(await cards.nth(1).locator('.backlink-context').textContent(), 'see Target note here');
    await cards.nth(1).click();
    await page.waitForFunction(() => document.getElementById('note-title').value === 'Linker two');

    // The seed's "Thesis outline" is only mentioned inside a code block in the flood records.
    await openNote(page, 'Thesis outline');
    const titles = await page.$$eval('#backlinks-list .backlink-title', (els) => els.map((el) => el.textContent));
    assert.deepStrictEqual(titles, ['Ideas to sort', 'Supervisor meetings', 'Writing routine']);
  },

  'renaming rewrites links exactly, keeps aliases and code, and can be undone': async ({ page, assert }) => {
    const source = 'See [[Old name]], [[old NAME|my alias]] and [[Other]].\n\n`[[Old name]]` stays.\n\n```\n[[Old name]]\n```\n\n[[Old names]] is different.';
    await newNote(page, 'Old name', 'Body');
    await newNote(page, 'Other', 'Link back to [[Old name]]');
    await newNote(page, 'Referrer', source);
    await saved(page);
    await openNote(page, 'Old name');
    await page.fill('#note-title', 'Better name');
    await page.press('#note-title', 'Enter');
    assert.match(await textOf(page, '#toast-region .toast-text'), /Updated 3 links in 2 notes/);
    await openNote(page, 'Referrer');
    const expected = 'See [[Better name]], [[Better name|my alias]] and [[Other]].\n\n`[[Old name]]` stays.\n\n```\n[[Old name]]\n```\n\n[[Old names]] is different.';
    assert.strictEqual(await page.inputValue('#editor'), expected);
    await openNote(page, 'Other');
    assert.strictEqual(await page.inputValue('#editor'), 'Link back to [[Better name]]');
    await page.click('#toast-region .toast-action');
    await previewRendered(page);
    assert.strictEqual(await page.inputValue('#editor'), 'Link back to [[Old name]]');
    assert.ok((await noteTitles(page)).includes('Old name'));
  },

  'validates titles without losing the old one': async ({ page, assert }) => {
    await newNote(page, 'Unique title');
    await page.fill('#note-title', '   ');
    await page.press('#note-title', 'Enter');
    assert.strictEqual(await textOf(page, '#title-error'), 'Give the note a title.');
    await page.fill('#note-title', 'thesis OUTLINE');
    await page.press('#note-title', 'Enter');
    assert.strictEqual(await textOf(page, '#title-error'), 'A note called "Thesis outline" already exists.');
    await page.fill('#note-title', 'Bad [title]');
    await page.press('#note-title', 'Enter');
    assert.match(await textOf(page, '#title-error'), /can't contain/);
    assert.ok((await noteTitles(page)).includes('Unique title'));
    await page.press('#note-title', 'Escape');
    assert.strictEqual(await page.inputValue('#note-title'), 'Unique title');
    assert.ok(!(await page.isVisible('#title-error')));
  },

  'search ranks title over tag, heading and body matches with exact scores and snippets': async ({ page, assert }) => {
    const updatedAt = Date.now() - 1000; // Equal dates, so a score tie falls through to the title.
    const notes = [
      { title: 'Zeppelin history', body: 'Nothing else here.' },
      { title: 'Tagged note', body: 'Filed under #zeppelin only.' },
      { title: 'Heading note', body: '## Zeppelin flights\n\nShort text.' },
      { title: 'Body note', body: 'A zeppelin, another zeppelin, and a third zeppelin passed over.' },
      { title: 'Prefix note', body: 'Several zeppelins went by.' },
      { title: 'Unrelated', body: 'Canal boats <b>only</b>.' },
    ].map((note) => Object.assign(note, { updatedAt }));
    await page.click('#import-btn');
    await page.setInputFiles('#import-file', {
      name: 'rank.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ app: 'marginalia', notes })),
    });
    await page.waitForSelector('#import-results .import-ok');
    await page.keyboard.press('Escape');
    await page.fill('#search', 'zeppelin');
    await page.waitForFunction(() => document.getElementById('list-count').textContent === '5 results');
    const results = await page.$$eval('#note-list .note-item', (els) => els.map((el) => [el.querySelector('.note-title-text').textContent, Number(el.dataset.score)]));
    assert.deepStrictEqual(results, [
      ['Zeppelin history', 10],
      ['Tagged note', 8],
      ['Body note', 6],
      ['Heading note', 6],
      ['Prefix note', 1],
    ]);
    const bodySnippet = await page.locator('.note-item', { hasText: 'Body note' }).locator('.note-snippet').innerHTML();
    assert.strictEqual(bodySnippet, 'A <mark>zeppelin</mark>, another <mark>zeppelin</mark>, and a third <mark>zeppelin</mark> passed over.');
    assert.strictEqual(await page.locator('.note-item', { hasText: 'Zeppelin history' }).locator('.note-title-text mark').textContent(), 'Zeppelin');

    await page.fill('#search', 'canal boats');
    await page.waitForFunction(() => document.getElementById('list-count').textContent === '1 result');
    const first = page.locator('#note-list .note-item').first();
    assert.strictEqual(await first.getAttribute('data-score'), String(2 + 2 + 8 + 12));
    assert.strictEqual(await first.locator('.note-snippet').innerHTML(), '<mark>Canal</mark> <mark>boats</mark> &lt;b&gt;only&lt;/b&gt;.');

    await page.fill('#search', 'xylophonist');
    await page.waitForFunction(() => document.getElementById('list-count').textContent === '0 results');
    assert.match(await textOf(page, '#note-list .list-empty'), /Nothing matches/);
  },

  'graph draws linked notes as SVG, with toggles, and a click opens the note': async ({ page, assert }) => {
    await page.click('#open-graph');
    await page.waitForSelector('#graph-svg .graph-node');
    assert.strictEqual(await textOf(page, '#graph-count'), '17 notes, 32 links');
    assert.strictEqual(await page.locator('#graph-svg .graph-node').count(), 19);
    assert.strictEqual(await page.locator('#graph-svg .graph-edge').count(), 32);
    assert.strictEqual(await page.locator('#graph-svg .graph-node.is-ghost').count(), 2);
    await page.uncheck('#graph-ghosts');
    assert.strictEqual(await page.locator('#graph-svg .graph-node.is-ghost').count(), 0);
    assert.strictEqual(await textOf(page, '#graph-count'), '17 notes, 29 links');
    await page.uncheck('#graph-orphans');
    assert.strictEqual(await page.locator('#graph-svg .graph-node').count(), 16, 'the one unlinked note is hidden');
    await page.check('#graph-orphans');
    await page.check('#graph-ghosts');
    await page.waitForTimeout(2200); // let the layout settle before clicking a moving target
    const positions = await page.$$eval('#graph-svg .graph-node', (els) => els.map((el) => el.getAttribute('transform')));
    assert.ok(new Set(positions).size === positions.length, 'every node has its own position');

    // Dragging moves a node and does not open it.
    const glossary = page.locator('.graph-node[data-title="Glossary"]');
    const before = await glossary.getAttribute('transform');
    const box = await glossary.locator('.graph-dot').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 40, { steps: 6 });
    await page.mouse.up();
    assert.notStrictEqual(await glossary.getAttribute('transform'), before);
    assert.ok(await page.isVisible('#graph-svg'), 'a drag stays on the graph');

    // Keyboard: focus a node and press Enter.
    await page.locator('.graph-node[data-title="Writing routine"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('note-title').value === 'Writing routine');
    await page.click('#open-graph');
    await page.waitForTimeout(2200);
    await page.locator('.graph-node[data-title="Glossary"] .graph-dot').click();
    await page.waitForFunction(() => document.getElementById('note-title').value === 'Glossary');
    assert.ok(await page.isVisible('#editor'));
    await page.click('#open-graph');
    await page.waitForTimeout(2200);
    await page.locator('.graph-node[data-title="Ward assessment rolls"] .graph-dot').click();
    await page.waitForFunction(() => document.getElementById('note-title').value === 'Ward assessment rolls');
  },

  'keeps version history and restores an older version, with undo': async ({ page, assert }) => {
    await openNote(page, 'Glossary');
    const original = await page.inputValue('#editor');
    await setBody(page, 'Completely rewritten');
    await saved(page);
    await page.click('#history-btn');
    assert.strictEqual(await page.locator('#version-list .version').count(), 1);
    assert.match(await textOf(page, '#version-summary'), /1 line added, \d+ removed/);
    assert.strictEqual(await page.locator('.diff-line.is-add').count(), 1);
    await page.click('#restore-version');
    await previewRendered(page);
    assert.strictEqual(await page.inputValue('#editor'), original);
    assert.strictEqual(await textOf(page, '#preview th'), 'Term');
    await page.click('#toast-region .toast-action');
    await previewRendered(page);
    assert.strictEqual(await page.inputValue('#editor'), 'Completely rewritten');
    await page.click('#history-btn');
    await page.click('#version-list .version');
    await page.click('#save-version');
    await page.click('#modal-root button[aria-label="Close"]');
    assert.ok(!(await page.isVisible('#restore-version')));
  },

  'pins, trashes with undo, restores from trash and deletes forever': async ({ page, assert }) => {
    await openNote(page, 'Glossary');
    await page.click('#pin-btn');
    assert.strictEqual((await noteTitles(page))[0], 'Essay draft: What a street remembers');
    await page.click('#note-kinds [data-kind="pinned"]');
    assert.ok((await noteTitles(page)).includes('Glossary'));
    await page.click('#note-kinds [data-kind="all"]');
    assert.strictEqual(await textOf(page, '#note-kinds [data-kind="pinned"] .count'), '4');

    await page.click('#trash-btn');
    assert.ok(!(await noteTitles(page)).includes('Glossary'));
    assert.notStrictEqual(await page.inputValue('#note-title'), 'Glossary');
    await page.click('#toast-region .toast-action');
    await previewRendered(page);
    assert.ok((await noteTitles(page)).includes('Glossary'));
    assert.strictEqual(await page.inputValue('#note-title'), 'Glossary');

    await page.click('#trash-btn');
    await page.click('#note-kinds [data-kind="trash"]');
    assert.deepStrictEqual((await noteTitles(page)).sort(), ['Glossary', 'Old abstract (too long)']);
    await openNote(page, 'Glossary');
    assert.ok(await page.isVisible('#trash-banner'));
    assert.ok(!(await page.isVisible('#editor')));
    await page.click('#restore-note');
    assert.ok(!(await page.isVisible('#trash-banner')));
    assert.deepStrictEqual(await noteTitles(page), ['Old abstract (too long)']);

    await openNote(page, 'Old abstract (too long)');
    await page.click('#delete-forever');
    await page.click('.modal-panel .btn.danger');
    assert.match(await textOf(page, '#note-list .list-empty'), /trash is empty/);
    await page.click('#toast-region .toast-action');
    assert.deepStrictEqual(await noteTitles(page), ['Old abstract (too long)']);
    await page.click('#empty-trash');
    await page.keyboard.press('Escape');
    assert.deepStrictEqual(await noteTitles(page), ['Old abstract (too long)']);
    await page.click('#empty-trash');
    await page.click('.modal-panel .btn.danger');
    assert.match(await textOf(page, '#note-list .list-empty'), /trash is empty/);
  },

  'filters by folder and tag, and manages folders with validation and undo': async ({ page, assert }) => {
    await page.locator('#folder-chips .chip', { hasText: 'Reading' }).click();
    assert.strictEqual((await noteTitles(page)).length, 3);
    await page.locator('#tag-chips .chip', { hasText: '#memory' }).click();
    assert.deepStrictEqual(await noteTitles(page), ['Reading: The Archive and the Flood']);
    await page.click('#list-head .link-btn');
    assert.strictEqual((await noteTitles(page)).length, 17);

    await page.locator('#preview a.tag', { hasText: '#planning' }).click();
    assert.deepStrictEqual((await noteTitles(page)).sort(), ['Supervisor meetings', 'Thesis outline']);
    await page.click('#list-head .link-btn');

    await page.click('#manage-folders');
    await page.fill('#new-folder-name', '  ');
    await page.press('#new-folder-name', 'Enter');
    assert.strictEqual(await textOf(page, '#new-folder-error'), 'Give the folder a name.');
    await page.fill('#new-folder-name', 'reading');
    await page.press('#new-folder-name', 'Enter');
    assert.match(await textOf(page, '#new-folder-error'), /already a folder/);
    await page.fill('#new-folder-name', 'Dissertation');
    await page.press('#new-folder-name', 'Enter');
    assert.strictEqual(await page.locator('#folder-list .folder-row').count(), 6);
    await page.locator('#folder-list input[aria-label="Name of folder Dissertation"]').fill('Dissertation draft');
    await page.locator('#folder-list input[aria-label="Name of folder Dissertation"]').press('Tab');
    await page.keyboard.press('Escape');
    assert.ok(!(await page.isVisible('#folder-list')), 'Escape closes the dialog');
    assert.ok(await page.locator('#folder-chips .chip', { hasText: 'Dissertation draft' }).count());

    await page.selectOption('#note-folder', { label: 'Dissertation draft' });
    await page.locator('#folder-chips .chip', { hasText: 'Dissertation draft' }).click();
    assert.deepStrictEqual(await noteTitles(page), ['Thesis outline']);
    await page.click('#list-head .link-btn');

    await page.click('#manage-folders');
    await page.click('button[aria-label="Delete folder Dissertation draft"]');
    assert.strictEqual(await page.locator('#folder-list .folder-row').count(), 5);
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#note-list .note-item', { hasText: 'Thesis outline' }).count(), 'notes survive their folder');
    assert.strictEqual(await page.inputValue('#note-folder'), '');
    await page.click('#toast-region .toast-action');
    assert.ok(await page.locator('#folder-chips .chip', { hasText: 'Dissertation draft' }).count());
    assert.strictEqual(await page.locator('#note-folder option:checked').textContent(), 'Dissertation draft');
  },

  'autosaves with visible status and keeps everything after reload': async ({ page, assert, reload }) => {
    await newNote(page, 'Persistent note');
    await page.click('#editor');
    await page.keyboard.type('Typed text with #persisted tag and a [[Glossary]] link.');
    assert.strictEqual(await textOf(page, '#save-status'), 'Saving…');
    await page.waitForFunction(() => /^Saved at /.test(document.getElementById('save-status').textContent));
    await page.click('#pin-btn');
    await page.click('#mode-switch [data-mode="preview"]');
    await reload();
    assert.strictEqual(await page.inputValue('#note-title'), 'Persistent note');
    assert.strictEqual(await page.inputValue('#editor'), 'Typed text with #persisted tag and a [[Glossary]] link.');
    assert.strictEqual(await page.locator('#tag-chips .chip', { hasText: '#persisted' }).count(), 1);
    assert.strictEqual(await page.getAttribute('#pin-btn', 'aria-pressed'), 'true');
    assert.strictEqual(await page.getAttribute('#mode-switch [data-mode="preview"]', 'aria-pressed'), 'true');
    const data = await stored(page);
    assert.ok(data.notes.some((note) => note.title === 'Persistent note' && note.pinned));
  },

  'exports a note as .md and all notes as JSON that round-trips': async ({ page, assert }) => {
    await newNote(page, 'Export me', '# Heading\n\nBody with **bold**.');
    await saved(page);
    const md = await downloadText(page, () => page.click('#export-note'));
    assert.strictEqual(md.name, 'Export me.md');
    assert.strictEqual(md.text, '# Heading\n\nBody with **bold**.');

    const json = await downloadText(page, () => page.click('#export-all'));
    assert.match(json.name, /^marginalia-notes-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(json.text);
    assert.strictEqual(data.app, 'marginalia');
    assert.strictEqual(data.notes.length, 19);
    assert.strictEqual(data.folders.length, 5);
    assert.strictEqual(data.notes.find((note) => note.title === 'Essay draft: What a street remembers').versions.length, 2);

    await page.click('#import-btn');
    await page.setInputFiles('#import-file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(json.text) });
    await page.waitForSelector('#import-results .import-ok');
    assert.strictEqual(await textOf(page, '#import-results .import-ok'), 'Imported 19 notes.');
    await page.keyboard.press('Escape');
    const titles = await noteTitles(page);
    assert.ok(titles.includes('Export me 2'), 'duplicate titles get a suffix');
    assert.strictEqual(await page.locator('#folder-chips .chip').count(), 5, 'folders merge by name');
  },

  'imports .md files, shows clear errors for bad files, and undoes an import': async ({ page, assert }) => {
    await page.click('#import-btn');
    await page.setInputFiles('#import-file', [
      mdFile('Field trip.md', 'Went to [[Glossary]] today.\n\n#imported'),
      mdFile('Glossary.md', 'A clash with an existing title.'),
      { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from([1, 2, 3]) },
    ]);
    await page.waitForSelector('#import-results .import-ok');
    assert.strictEqual(await textOf(page, '#import-results .import-ok'), 'Imported 2 notes.');
    assert.match(await textOf(page, '#import-results .import-errors'), /photo\.png: only \.md, \.markdown, \.txt and \.json files can be imported\./);
    await page.click('#toast-region .toast-action');
    await page.setInputFiles('#import-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
    await page.waitForSelector('#import-results .import-errors');
    assert.strictEqual(await textOf(page, '#import-results .import-errors'), "bad.json: this isn't valid JSON.");
    assert.strictEqual(await page.locator('#import-results .import-ok').count(), 0);
    await page.setInputFiles('#import-file', { name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await page.waitForFunction(() => document.getElementById('import-results').textContent.includes('other.json'));
    assert.match(await textOf(page, '#import-results .import-errors'), /expected a Marginalia export/);
    await page.setInputFiles('#import-file', {
      name: 'mixed.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ notes: [{ title: 'Good one', body: 'ok' }, { title: 42 }, { title: 'Bad [title]', body: 'x' }] })),
    });
    await page.waitForFunction(() => document.getElementById('import-results').textContent.includes('mixed.json'));
    assert.strictEqual(await textOf(page, '#import-results .import-ok'), 'Imported 1 note.');
    assert.match(await textOf(page, '#import-results .import-errors'), /skipped 2 entries/);
    await page.keyboard.press('Escape');
    const titles = await noteTitles(page);
    assert.ok(titles.includes('Good one'));
    assert.ok(!titles.includes('Field trip'), 'the first import was undone');
  },

  'reset demo data restores the seed and can be undone; corrupt storage cannot crash the app': async ({ page, assert, reload }) => {
    await newNote(page, 'Scratch', 'to be reset');
    await saved(page);
    await page.click('#reset-demo');
    assert.ok(!(await noteTitles(page)).includes('Scratch'));
    assert.strictEqual((await noteTitles(page)).length, 17);
    assert.strictEqual(await page.inputValue('#note-title'), 'Thesis outline');
    await page.click('#toast-region .toast-action');
    await previewRendered(page);
    assert.ok((await noteTitles(page)).includes('Scratch'));

    await page.evaluate((key) => localStorage.setItem(key, '{broken json'), STORAGE_KEY);
    await reload();
    assert.strictEqual((await noteTitles(page)).length, 17);
    assert.match(await textOf(page, '#toast-region .toast-text'), /could not be read/);

    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({
      notes: [null, 7, { title: 'Kept', body: 'fine', versions: 'nope', folderId: 'missing', updatedAt: 'x' }, { title: 'kept', body: 'duplicate' }, { body: 'no title' }],
      folders: [{ id: 1 }],
    })), STORAGE_KEY);
    await reload();
    assert.deepStrictEqual(await noteTitles(page), ['Kept']);
    assert.strictEqual(await page.inputValue('#editor'), 'fine');
  },

  'keeps working when storage is blocked, and warns that nothing is saved': async ({ page, assert, reload }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    await reload();
    assert.strictEqual((await noteTitles(page)).length, 17);
    assert.match(await textOf(page, '#toast-region .toast-text'), /storage is unavailable/);
    await setBody(page, 'Still editable');
    assert.strictEqual(await textOf(page, '#preview p'), 'Still editable');
    await page.waitForFunction(() => /Not saved/.test(document.getElementById('save-status').textContent));
  },

  'theme toggle is remembered, and modals close with Escape and return focus': async ({ page, assert, reload }) => {
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await background();
    await page.click('#theme-btn');
    assert.notStrictEqual(await background(), light);
    await reload();
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.notStrictEqual(await background(), light);

    await page.focus('#help-btn');
    await page.keyboard.press('Enter');
    assert.ok(await page.isVisible('.modal-panel'));
    assert.match(await textOf(page, '.modal-panel'), /Ctrl\+B/);
    await page.keyboard.press('Escape');
    assert.ok(!(await page.isVisible('.modal-panel')));
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'help-btn');
  },

  'works on a phone: list, then note, then back, with a usable editor and graph': async ({ page, assert }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(page.url().split('#')[0], { waitUntil: 'load' });
    await page.evaluate(() => { window.location.hash = '#/'; });
    await page.waitForTimeout(60);
    assert.ok(await page.isVisible('#note-list'));
    assert.ok(!(await page.isVisible('#editor')));
    await openNote(page, 'Glossary');
    assert.ok(await page.isVisible('#editor'));
    assert.ok(!(await page.isVisible('#note-list')));
    assert.ok(!(await page.isVisible('#mode-switch [data-mode="split"]')), 'split is hidden on phones');
    assert.ok(!(await page.isVisible('#margin')), 'the margin starts closed and does not cover the note');
    await page.click('#margin-btn');
    assert.ok(await page.isVisible('#backlinks-list'));
    await page.click('#margin-btn');
    await page.click('#mode-switch [data-mode="preview"]');
    assert.ok(await page.isVisible('#preview'));
    const tableOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(tableOverflow <= 0);
    await page.click('#doc-back');
    await page.waitForSelector('#note-list', { state: 'visible' });
    await page.click('#open-graph');
    await page.waitForSelector('#graph-svg .graph-node');
    assert.ok(!(await page.isVisible('#note-list')));
    await page.click('#graph-back');
    await page.waitForSelector('#note-list', { state: 'visible' });
  },
};
