// Left column: filters, folder and tag chips, and the note list or search results.
(function (MG) {
  'use strict';

  const { Store, Links, Search } = MG;
  const { h, icon, $, relativeTime, plural } = MG.Dom;

  const filter = { kind: 'all', folderId: null, tag: null, query: '' };

  function baseNotes() {
    let notes;
    if (filter.kind === 'trash') notes = Store.trashed();
    else if (filter.kind === 'pinned') notes = Store.live().filter((note) => note.pinned);
    else notes = Store.live();
    if (filter.folderId) notes = notes.filter((note) => note.folderId === filter.folderId);
    if (filter.tag) notes = notes.filter((note) => Links.extractTags(note.body).includes(filter.tag));
    return notes;
  }

  function sortedNotes(notes) {
    const byTrash = (a, b) => b.deletedAt - a.deletedAt;
    const byPinThenRecent = (a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt);
    return [...notes].sort(filter.kind === 'trash' ? byTrash : byPinThenRecent);
  }

  function hasNarrowingFilter() {
    return !!(filter.folderId || filter.tag || filter.query.trim());
  }

  function clearFilters() {
    filter.folderId = null;
    filter.tag = null;
    filter.query = '';
    $('search').value = '';
    $('search-clear').hidden = true;
    render();
  }

  function setKind(kind) {
    filter.kind = kind;
    render();
  }

  function renderKinds() {
    const counts = { all: Store.live().length, pinned: Store.live().filter((n) => n.pinned).length, trash: Store.trashed().length };
    document.querySelectorAll('#note-kinds button').forEach((btn) => {
      const kind = btn.dataset.kind;
      btn.setAttribute('aria-pressed', kind === filter.kind ? 'true' : 'false');
      btn.querySelector('.count').textContent = counts[kind];
    });
  }

  function chip({ key, label, count, pressed, onclick }) {
    return h('button', {
      class: 'chip', type: 'button', 'aria-pressed': pressed ? 'true' : 'false', 'data-key': key, title: label, onclick,
    }, h('span', { class: 'chip-label' }, label), count !== undefined ? h('span', { class: 'count' }, count) : null);
  }

  function renderFolders() {
    const box = $('folder-chips');
    box.textContent = '';
    if (!Store.folders.length) {
      box.appendChild(h('span', { class: 'chip-empty' }, 'No folders yet'));
      return;
    }
    const live = Store.live();
    Store.folders.forEach((f) => {
      box.appendChild(chip({
        key: `folder:${f.id}`, label: f.name, count: live.filter((note) => note.folderId === f.id).length,
        pressed: filter.folderId === f.id,
        onclick: () => {
          filter.folderId = filter.folderId === f.id ? null : f.id;
          render();
        },
      }));
    });
  }

  function renderTags() {
    const box = $('tag-chips');
    box.textContent = '';
    const tags = Store.tagCounts();
    if (filter.tag && !tags.some((entry) => entry.tag === filter.tag)) filter.tag = null;
    if (!tags.length) {
      box.appendChild(h('span', { class: 'chip-empty' }, 'Write #tag in a note'));
      return;
    }
    tags.forEach(({ tag, count }) => {
      box.appendChild(chip({
        key: `tag:${tag}`, label: `#${tag}`, count,
        pressed: filter.tag === tag,
        onclick: () => {
          filter.tag = filter.tag === tag ? null : tag;
          render();
        },
      }));
    });
  }

  function noteHref(note) {
    return `#/note/${encodeURIComponent(note.id)}`;
  }

  function firstLine(note) {
    const withoutHeadings = note.body.split('\n').filter((line) => !/^ {0,3}#{1,6}\s/.test(line)).join('\n');
    const plain = Links.toPlain(withoutHeadings).replace(/\s+/g, ' ').trim();
    return plain.slice(0, 110) || 'Empty note';
  }

  function metaFor(note) {
    const folder = note.folderId ? Store.folder(note.folderId) : null;
    const when = note.deletedAt ? `Deleted ${relativeTime(note.deletedAt)}` : relativeTime(note.updatedAt);
    return folder ? `${folder.name}  \u00b7  ${when}` : when;
  }

  function noteItem(note, activeId) {
    const isActive = note.id === activeId;
    return h('li', null, h('a', {
      class: isActive ? 'note-item is-active' : 'note-item', href: noteHref(note),
      'aria-current': isActive ? 'true' : null, 'data-key': `note:${note.id}`,
    },
    h('span', { class: 'note-title' }, note.pinned ? icon('pin') : null, h('span', { class: 'note-title-text' }, note.title)),
    h('span', { class: 'note-snippet' }, firstLine(note)),
    h('span', { class: 'note-meta' }, metaFor(note))));
  }

  function whyMatched(result) {
    const parts = [];
    if (result.titleHits) parts.push('Title');
    if (result.tagHits) parts.push('Tag');
    if (result.bodyHits) parts.push(`${result.bodyHits} in text`);
    return parts.join(', ');
  }

  // titleHtml and snippetHtml come from Search, which escapes all note text before adding <mark>.
  function resultItem(result, activeId) {
    const { note } = result;
    const isActive = note.id === activeId;
    const title = h('span', { class: 'note-title-text' });
    title.innerHTML = result.titleHtml;
    const snippet = h('span', { class: 'note-snippet is-result' });
    snippet.innerHTML = result.snippetHtml;
    return h('li', null, h('a', {
      class: isActive ? 'note-item is-active' : 'note-item', href: noteHref(note),
      'aria-current': isActive ? 'true' : null, 'data-key': `note:${note.id}`, 'data-score': result.score,
    },
    h('span', { class: 'note-title' }, title),
    snippet,
    h('span', { class: 'note-meta' }, whyMatched(result))));
  }

  function emptyMessage() {
    if (filter.query.trim()) return `Nothing matches "${filter.query.trim()}".`;
    if (hasNarrowingFilter()) return 'No notes match these filters.';
    if (filter.kind === 'trash') return 'The trash is empty.';
    if (filter.kind === 'pinned') return 'Pin a note to keep it at the top.';
    return 'No notes yet. Create one to get started.';
  }

  function renderListHead(count, searching) {
    const head = $('list-head');
    head.textContent = '';
    const noun = searching ? 'result' : 'note';
    head.appendChild(h('span', { id: 'list-count', role: 'status' }, plural(count, noun)));
    if (hasNarrowingFilter()) {
      head.appendChild(h('button', { class: 'link-btn', type: 'button', onclick: clearFilters }, 'Clear filters'));
    } else if (filter.kind === 'trash' && count) {
      head.appendChild(h('button', { class: 'link-btn danger-text', type: 'button', id: 'empty-trash', onclick: () => MG.App.emptyTrash() }, 'Empty trash'));
    }
  }

  function renderList() {
    const list = $('note-list');
    const activeId = MG.DocView.activeId;
    const query = filter.query.trim();
    const notes = baseNotes();
    list.textContent = '';
    let count;
    if (query) {
      const results = Search.search(query, notes);
      count = results.length;
      results.forEach((result) => list.appendChild(resultItem(result, activeId)));
    } else {
      const sorted = sortedNotes(notes);
      count = sorted.length;
      sorted.forEach((note) => list.appendChild(noteItem(note, activeId)));
    }
    if (!count) list.appendChild(h('li', { class: 'list-empty' }, emptyMessage()));
    renderListHead(count, !!query);
  }

  // The list is rebuilt on every change, so keyboard focus is put back on the same item.
  function render() {
    const focusedKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
    renderKinds();
    renderFolders();
    renderTags();
    renderList();
    if (focusedKey) {
      const again = document.querySelector(`[data-key="${CSS.escape(focusedKey)}"]`);
      if (again) again.focus();
    }
  }

  function init() {
    let searchTimer = null;
    $('search').addEventListener('input', (event) => {
      clearTimeout(searchTimer);
      const value = event.target.value;
      $('search-clear').hidden = !value;
      searchTimer = setTimeout(() => {
        filter.query = value;
        renderList();
      }, 80);
    });
    $('search').addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && event.target.value) {
        event.preventDefault();
        clearSearch();
      }
    });
    $('search-clear').addEventListener('click', () => {
      clearSearch();
      $('search').focus();
    });
    document.querySelectorAll('#note-kinds button').forEach((btn) => {
      btn.addEventListener('click', () => setKind(btn.dataset.kind));
    });
  }

  function clearSearch() {
    $('search').value = '';
    $('search-clear').hidden = true;
    filter.query = '';
    renderList();
  }

  MG.Sidebar = {
    init, render,
    visibleNotes: () => (filter.query.trim() ? Search.search(filter.query, baseNotes()).map((r) => r.note) : sortedNotes(baseNotes())),
    filterByTag(tag) {
      filter.kind = 'all';
      filter.tag = tag;
      render();
    },
    showTrash() { setKind('trash'); },
    get filter() { return filter; },
  };
})(window.MG = window.MG || {});
