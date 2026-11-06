// Wires the views together and owns routing. Routes live in the location hash so the
// app can run inside an iframe or from file://.
(function (MG) {
  'use strict';

  const { Store, DocView, Sidebar, Margin, GraphView, History, Dialogs, Transfer, Overlays } = MG;
  const { $, icon } = MG.Dom;

  const THEME_KEY = 'marginalia.theme';
  let narrow = null;

  function noteRoute(id) {
    return `#/note/${encodeURIComponent(id)}`;
  }

  function setPage(page, view) {
    const app = $('app');
    app.dataset.page = page;
    app.dataset.view = view;
    $('graph-page').hidden = page !== 'graph';
    $('doc').hidden = page !== 'note';
    $('open-graph').setAttribute('aria-pressed', page === 'graph' ? 'true' : 'false');
    if (page !== 'graph') GraphView.stop();
  }

  function defaultNote() {
    const last = Store.settings.lastId ? Store.get(Store.settings.lastId) : null;
    if (last && !last.deletedAt) return last;
    return Sidebar.visibleNotes().find((note) => !note.deletedAt) || Store.live()[0] || null;
  }

  function showNote(note) {
    if (note) Store.setSetting('lastId', note.id);
    setPage('note', 'doc');
    DocView.show(note ? note.id : null);
    refreshPanels();
  }

  function route() {
    const hash = window.location.hash;
    if (hash === '#/graph') {
      DocView.flushSave();
      setPage('graph', 'doc');
      GraphView.render();
      return;
    }
    const match = /^#\/note\/(.+)$/.exec(hash);
    const note = match ? Store.get(decodeURIComponent(match[1])) : null;
    if (note) {
      showNote(note);
      return;
    }
    if (narrow.matches) {
      setPage('note', 'list');
      DocView.show(null);
      refreshPanels();
      return;
    }
    const fallback = defaultNote();
    if (fallback) window.location.replace(noteRoute(fallback.id));
    showNote(fallback);
  }

  function refreshPanels() {
    Sidebar.render();
    Margin.render();
  }

  function refreshAll() {
    if (DocView.activeId && !Store.get(DocView.activeId)) {
      const fallback = defaultNote();
      if (fallback) open(fallback.id);
      else {
        window.location.hash = '#/';
        DocView.show(null);
      }
    } else {
      DocView.sync();
    }
    refreshPanels();
  }

  function open(id) {
    DocView.flushSave();
    // route() runs now so callers can rely on the note being open; the later hashchange is a no-op.
    window.location.hash = noteRoute(id);
    route();
  }

  function newNote() {
    const { folderId } = Sidebar.filter;
    if (Sidebar.filter.kind === 'trash') Sidebar.filter.kind = 'all';
    const note = Store.createNote({ folderId });
    open(note.id);
    DocView.focusTitle();
  }

  function nextNoteAfter(id) {
    const visible = Sidebar.visibleNotes().filter((note) => note.id !== id);
    const live = visible.filter((note) => !note.deletedAt);
    return live[0] || visible[0] || Store.live().find((note) => note.id !== id) || null;
  }

  function leaveNote(id) {
    if (DocView.activeId !== id) return;
    const next = nextNoteAfter(id);
    if (next) open(next.id);
    else {
      DocView.show(null);
      if (narrow.matches || window.location.hash !== '#/') window.location.hash = '#/';
    }
  }

  function undoable(message, change) {
    DocView.flushSave();
    const before = DocView.activeId;
    const snapshot = Store.checkpoint();
    change();
    Overlays.toast(message, {
      undo: () => {
        Store.rollback(snapshot);
        if (before) open(before);
      },
    });
  }

  function trashActive() {
    const note = DocView.note;
    if (!note) return;
    undoable(`Moved "${note.title}" to the trash.`, () => {
      const next = nextNoteAfter(note.id);
      Store.trashNote(note.id);
      if (next) open(next.id);
      else leaveNote(note.id);
    });
  }

  function restoreActive() {
    const note = DocView.note;
    if (!note) return;
    undoable(`Restored "${note.title}".`, () => {
      Store.restoreNote(note.id);
      DocView.show(note.id);
    });
  }

  function deleteActiveForever() {
    const note = DocView.note;
    if (!note) return;
    Overlays.confirmModal({
      title: 'Delete this note forever?',
      message: `"${note.title}" and its version history will be removed from this browser.`,
      confirmLabel: 'Delete forever',
      onConfirm: () => undoable(`Deleted "${note.title}".`, () => {
        const next = nextNoteAfter(note.id);
        Store.deleteForever(note.id);
        if (next) open(next.id);
        else leaveNote(note.id);
      }),
    });
  }

  function emptyTrash() {
    const count = Store.trashed().length;
    if (!count) return;
    Overlays.confirmModal({
      title: 'Empty the trash?',
      message: `${count === 1 ? 'The note' : `All ${count} notes`} in the trash will be removed from this browser.`,
      confirmLabel: 'Empty trash',
      onConfirm: () => undoable('Trash emptied.', () => {
        const wasInTrash = DocView.note && DocView.note.deletedAt;
        Store.emptyTrash();
        if (wasInTrash) {
          const next = Store.live()[0];
          if (next) open(next.id);
        }
      }),
    });
  }

  function createInCurrentFolder(title) {
    const current = DocView.note;
    return Store.createNote({ title, folderId: current ? current.folderId : null });
  }

  /** Creates a note for a link just typed in the editor, without leaving the current note. */
  function createLinkedNote(title) {
    const note = createInCurrentFolder(title);
    Overlays.toast(`Created "${note.title}".`, { undo: () => Store.deleteForever(note.id) });
  }

  /** Opens the note a wiki link points at, creating it first when the link is unresolved. */
  function followWiki(title) {
    const existing = Store.findByTitle(title);
    if (existing) {
      open(existing.id);
      return;
    }
    const before = DocView.activeId;
    const created = createInCurrentFolder(title);
    open(created.id);
    Overlays.toast(`Created "${created.title}" from the link.`, {
      undo: () => {
        Store.deleteForever(created.id);
        if (before) open(before);
      },
    });
  }

  function resetDemo() {
    undoable('Demo data restored.', () => {
      Store.resetDemo();
      Sidebar.filter.kind = 'all';
      Sidebar.filter.folderId = null;
      Sidebar.filter.tag = null;
      open('n_outline');
    });
  }

  function currentTheme() {
    const set = document.documentElement.dataset.theme;
    if (set) return set;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function renderThemeButton() {
    const btn = $('theme-btn');
    const dark = currentTheme() === 'dark';
    btn.textContent = '';
    btn.appendChild(icon(dark ? 'sun' : 'moon'));
    btn.setAttribute('aria-label', dark ? 'Use light theme' : 'Use dark theme');
    btn.title = dark ? 'Use light theme' : 'Use dark theme';
  }

  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch (err) {
      // Storage blocked: the choice lasts for this page view.
    }
    renderThemeButton();
  }

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function onGlobalKeys(event) {
    if ($('modal-root').firstChild) return;
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      const modes = { Digit1: 'split', Digit2: 'edit', Digit3: 'preview' };
      if (modes[event.code] && DocView.note && !DocView.note.deletedAt) {
        event.preventDefault();
        DocView.setMode(modes[event.code]);
      } else if (event.code === 'KeyN') {
        event.preventDefault();
        newNote();
      } else if (event.code === 'KeyG') {
        event.preventDefault();
        window.location.hash = '#/graph';
      }
    } else if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') {
      event.preventDefault();
      if (DocView.captureManualVersion()) Overlays.toast('Version saved. Find it in History.');
      else Overlays.toast('Nothing has changed since the last version.');
    } else if (event.key === '/' && !isTypingTarget(document.activeElement) && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      $('search').focus();
    }
  }

  function wireButtons() {
    const clicks = {
      'new-note': newNote,
      'empty-new-note': newNote,
      'open-graph': () => {
        window.location.hash = window.location.hash === '#/graph' ? noteRoute((defaultNote() || {}).id || '') : '#/graph';
      },
      'graph-back': () => {
        const note = defaultNote();
        window.location.hash = note && !narrow.matches ? noteRoute(note.id) : '#/';
      },
      'doc-back': () => { window.location.hash = '#/'; },
      'theme-btn': toggleTheme,
      'help-btn': Dialogs.openShortcuts,
      'manage-folders': Dialogs.openFolders,
      'import-btn': Dialogs.openImport,
      'export-all': Transfer.exportAll,
      'reset-demo': resetDemo,
      'history-btn': () => { if (DocView.activeId) History.open(DocView.activeId); },
      'export-note': () => {
        const note = DocView.note;
        if (note) {
          DocView.flushSave();
          Transfer.exportNote(note);
        }
      },
      'trash-btn': trashActive,
      'restore-note': restoreActive,
      'delete-forever': deleteActiveForever,
    };
    Object.entries(clicks).forEach(([id, handler]) => $(id).addEventListener('click', handler));
  }

  function init() {
    Store.load();
    narrow = window.matchMedia('(max-width: 820px)');
    DocView.init();
    Sidebar.init();
    GraphView.init();
    wireButtons();
    renderThemeButton();
    Store.subscribe(refreshAll);
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', onGlobalKeys);
    narrow.addEventListener('change', () => {
      if (!narrow.matches && !window.location.hash.startsWith('#/note/') && window.location.hash !== '#/graph') route();
    });
    route();
    const warning = Store.takeLoadWarning();
    if (warning) Overlays.toast(warning, { error: true, duration: 12000 });
    else if (!Store.storageHealthy) Overlays.toast('Browser storage is unavailable, so changes last only until you close this page.', { error: true, duration: 12000 });
  }

  MG.App = {
    open, followWiki, createLinkedNote, emptyTrash,
    filterByTag(tag) {
      Sidebar.filterByTag(tag);
      if (narrow.matches) window.location.hash = '#/';
    },
  };

  init();
})(window.MG = window.MG || {});
