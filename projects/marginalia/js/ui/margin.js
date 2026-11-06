// The margin beside the note: backlinks, outgoing links and tags.
(function (MG) {
  'use strict';

  const { Store, Links } = MG;
  const { h, icon, $ } = MG.Dom;
  const CONTEXT_MAX = 110;

  function section(titleText, count, body) {
    return h('section', { class: 'margin-section' },
      h('h3', { class: 'margin-heading' }, titleText, count !== null ? h('span', { class: 'count' }, count) : null),
      body);
  }

  function backlinkCard(entry) {
    const context = entry.contexts[0] || '';
    const clipped = context.length > CONTEXT_MAX ? `${context.slice(0, CONTEXT_MAX)}\u2026` : context;
    return h('li', null, h('a', { class: 'backlink', href: `#/note/${encodeURIComponent(entry.note.id)}` },
      h('span', { class: 'backlink-title' }, entry.note.title),
      entry.count > 1 ? h('span', { class: 'backlink-count' }, `${entry.count} links`) : null,
      clipped ? h('span', { class: 'backlink-context' }, clipped) : null));
  }

  function renderBacklinks(note, live) {
    const entries = Links.backlinks(note.title, live);
    const body = entries.length
      ? h('ul', { class: 'margin-list', id: 'backlinks-list' }, entries.map(backlinkCard))
      : h('p', { class: 'margin-empty', id: 'backlinks-list' }, `No notes link here yet. Write [[${note.title}]] in another note.`);
    return section('Backlinks', entries.length, body);
  }

  function outgoingRow(title) {
    const target = Store.findByTitle(title);
    if (target) {
      return h('li', null, h('a', { class: 'outgoing', href: `#/note/${encodeURIComponent(target.id)}` }, target.title));
    }
    return h('li', { class: 'outgoing-missing' },
      h('span', { class: 'outgoing-missing-title' }, title),
      h('button', {
        class: 'link-btn', type: 'button', 'aria-label': `Create note ${title}`,
        onclick: () => MG.App.followWiki(title),
      }, icon('plus'), 'Create'));
  }

  function renderOutgoing(note) {
    const titles = Links.outgoing(note.body);
    const body = titles.length
      ? h('ul', { class: 'margin-list', id: 'outgoing-list' }, titles.map(outgoingRow))
      : h('p', { class: 'margin-empty' }, 'No links yet. Type [[ in the editor to link a note.');
    return section('Links in this note', titles.length, body);
  }

  function renderTags(note) {
    const tags = Links.extractTags(note.body);
    if (!tags.length) return null;
    return section('Tags', null, h('div', { class: 'margin-tags' }, tags.map((tag) => h('button', {
      class: 'chip', type: 'button', onclick: () => MG.App.filterByTag(tag),
    }, h('span', { class: 'chip-label' }, `#${tag}`)))));
  }

  function render() {
    const box = $('margin');
    const note = MG.DocView.note;
    box.textContent = '';
    if (!note) return;
    const live = Store.live();
    box.append(renderBacklinks(note, live), renderOutgoing(note));
    const tags = renderTags(note);
    if (tags) box.appendChild(tags);
  }

  MG.Margin = { render };
})(window.MG = window.MG || {});
