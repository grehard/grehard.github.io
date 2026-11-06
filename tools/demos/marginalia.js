// One-minute demo: a thesis writer drafts a new note, links it into her notebook,
// renames a source, searches, explores the graph and recovers an earlier version.
module.exports = {
  name: 'Marginalia',
  tagline: 'Linked Markdown notes for writers, students and researchers',
  scope: [
    'Markdown editor with live preview',
    'Wiki links, backlinks and link graph',
    'Ranked full-text search',
    'Version history, trash and file import',
  ],
  accent: '#a5402d',

  run: async (d) => {
    const { page } = d;
    const row = (title) => page.locator('a.note-item').filter({ has: page.getByText(title, { exact: true }) }).first();
    const backlinkToNewNote = () => page.locator('#backlinks-list .backlink', { hasText: 'Walking the old creek line' }).first();

    await d.caption('A research notebook, open on a thesis outline with live preview.', 2200);

    await d.click('#new-note', { hold: 150 });
    await page.keyboard.type('Walking the old creek line', { delay: 12 });
    await d.press('Enter', 100);
    await d.caption('New note. The hand-written parser renders on every keystroke.', 200);
    await page.keyboard.type('## Tuesday walk\n\nFollowed the *old line* to number 42.\n\n', { delay: 12 });
    await page.keyboard.type('- [ ] Photograph the raised steps\nAsk about the 1958 flood\n', { delay: 12 });
    await d.press('Enter', 40);
    await d.press('Enter', 40);

    await d.caption('Typing [[ offers matching notes. The new link resolves at once.', 200);
    await page.keyboard.type('Compare with [[flood', { delay: 45 });
    await d.wait(1300);
    await d.press('Enter', 200);
    await page.keyboard.type(' and #fieldwork notes.', { delay: 12 });
    await d.wait(300);

    await d.caption('Tick a task in the preview, and the source line changes with it.', 400);
    await d.click(page.locator('#preview .task-box').first(), { hold: 1200 });

    await d.caption("The linked note's backlinks panel now lists the new note.", 200);
    await d.click(page.locator('#preview a.wikilink').first(), { hold: 500 });
    await d.move(backlinkToNewNote());
    await d.wait(1100);

    await d.caption('Rename a note, and every link to it is rewritten everywhere.', 200);
    await d.click('#note-title', { hold: 60 });
    await page.keyboard.press('Control+A');
    await page.keyboard.type('City flood returns 1931-1987', { delay: 14 });
    await d.press('Enter', 300);
    await d.click(backlinkToNewNote(), { hold: 1200 });

    await d.caption('Search ranks title and tag matches first, with highlighted snippets.', 200);
    await d.type('#search', 'flood memory', { delay: 40, hold: 2200 });
    await d.click('#search-clear', { hold: 150 });

    await d.caption("The graph shows how notes connect. Dashed circles aren't written yet.", 200);
    await d.click('#open-graph', { hold: 1500 });
    await d.poster();
    const hub = page.locator('.graph-node[data-title="Chapter 3: Flood memory"] .graph-dot');
    await d.move(hub, 450);
    await d.wait(1000);
    await d.click(hub, { hold: 400 });

    await d.caption('Preview mode is set in a system serif for long reading.', 200);
    await d.click('#mode-switch [data-mode="preview"]', { hold: 1600 });
    await d.click('#mode-switch [data-mode="split"]', { hold: 100 });

    await d.caption('Every note keeps its history. Compare versions, then restore one.', 200);
    await d.click(row('Essay draft: What a street remembers'), { hold: 200 });
    await d.click('#history-btn', { hold: 800 });
    await d.click(page.locator('#version-list .version').nth(1), { hold: 1100 });
    await d.click('#restore-version', { hold: 600 });

    await d.caption('One click undoes it. Notes export as .md or JSON, with no server.', 200);
    await d.click('#toast-region .toast-action', { hold: 500 });
    await d.move('#export-all', 450);
    await d.wait(2300);
  },
};
