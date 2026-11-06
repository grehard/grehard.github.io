// The open note: title, editor, preview, toolbar, modes and autosave.
(function (MG) {
  'use strict';

  const { Store, Links, TextOps, Overlays, Autocomplete } = MG;
  const { h, icon, $, relativeTime, clockTime, plural } = MG.Dom;

  const AUTOSAVE_DELAY = 600;
  const EDIT_SESSION_MS = 5 * 60000; // A long sitting gets a history entry every five minutes.
  const WORDS_PER_MINUTE = 220;

  let activeId = null;
  let saveTimer = null;
  let previewFrame = 0;
  let sessionStart = 0;
  let autocomplete = null;
  let els = null;
  let narrow = null;
  let marginAsOverlay = null;
  let overlayMarginOpen = false;

  const TOOLS = [
    { id: 'bold', icon: 'bold', label: 'Bold', keys: 'Ctrl+B', run: (s) => TextOps.toggleWrap(s, '**') },
    { id: 'italic', icon: 'italic', label: 'Italic', keys: 'Ctrl+I', run: (s) => TextOps.toggleWrap(s, '*') },
    { id: 'strike', icon: 'strike', label: 'Strikethrough', keys: 'Ctrl+Shift+X', run: (s) => TextOps.toggleWrap(s, '~~') },
    { id: 'code', icon: 'code', label: 'Inline code', keys: 'Ctrl+E', run: (s) => TextOps.toggleWrap(s, '`') },
    null,
    { id: 'heading', icon: 'heading', label: 'Heading', keys: 'Ctrl+Alt+2', run: (s) => TextOps.toggleHeading(s, 2) },
    { id: 'quote', icon: 'quote', label: 'Quote', keys: 'Ctrl+Shift+.', run: TextOps.toggleQuote },
    { id: 'bullets', icon: 'list', label: 'Bulleted list', keys: 'Ctrl+Shift+8', run: TextOps.toggleBullets },
    { id: 'numbers', icon: 'ordered', label: 'Numbered list', keys: 'Ctrl+Shift+7', run: TextOps.toggleNumbers },
    { id: 'task', icon: 'task', label: 'Task list', keys: 'Ctrl+Shift+9', run: TextOps.toggleTasks },
    null,
    { id: 'link', icon: 'link', label: 'Link', keys: 'Ctrl+K', run: TextOps.insertLink },
    { id: 'wiki', icon: 'wiki', label: 'Link to a note', keys: 'Type [[', run: TextOps.insertWikiOpener },
    { id: 'codeblock', icon: 'codeblock', label: 'Code block', keys: 'Ctrl+Alt+C', run: TextOps.insertCodeBlock },
    { id: 'table', icon: 'table', label: 'Table', keys: '', run: TextOps.insertTable },
  ];

  const WIRED_SHORTCUTS = [
    { ctrl: true, code: 'KeyB', tool: 'bold' },
    { ctrl: true, code: 'KeyI', tool: 'italic' },
    { ctrl: true, shift: true, code: 'KeyX', tool: 'strike' },
    { ctrl: true, code: 'KeyE', tool: 'code' },
    { ctrl: true, code: 'KeyK', tool: 'link' },
    { ctrl: true, shift: true, code: 'Period', tool: 'quote' },
    { ctrl: true, shift: true, code: 'Digit8', tool: 'bullets' },
    { ctrl: true, shift: true, code: 'Digit7', tool: 'numbers' },
    { ctrl: true, shift: true, code: 'Digit9', tool: 'task' },
    { ctrl: true, alt: true, code: 'KeyC', tool: 'codeblock' },
    { ctrl: true, alt: true, code: 'Digit1', run: (s) => TextOps.toggleHeading(s, 1) },
    { ctrl: true, alt: true, code: 'Digit2', tool: 'heading' },
    { ctrl: true, alt: true, code: 'Digit3', run: (s) => TextOps.toggleHeading(s, 3) },
  ];

  function activeNote() {
    return activeId ? Store.get(activeId) : null;
  }

  function isReadOnly() {
    const note = activeNote();
    return !note || !!note.deletedAt;
  }

  // Autosave

  function setStatus(text, kind) {
    els.status.textContent = text;
    els.status.className = kind ? `save-status is-${kind}` : 'save-status';
  }

  function reportSaved() {
    if (Store.storageHealthy) setStatus(`Saved at ${clockTime(Date.now())}`);
    else setStatus('Not saved: browser storage is unavailable. Export to keep your work.', 'error');
  }

  function flushSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    Store.commit();
    reportSaved();
  }

  function scheduleSave() {
    setStatus('Saving\u2026', 'saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      Store.commit();
      reportSaved();
    }, AUTOSAVE_DELAY);
  }

  // Editing

  function beginEditSession(note) {
    const now = Date.now();
    if (!sessionStart || now - sessionStart > EDIT_SESSION_MS) {
      Store.captureVersion(note.id, 'Before editing');
      sessionStart = now;
    }
  }

  function changeBody(body) {
    const note = activeNote();
    if (!note || note.deletedAt) return;
    beginEditSession(note);
    if (Store.setBody(note.id, body)) {
      schedulePreview();
      scheduleSave();
    }
  }

  function onEditorInput() {
    changeBody(els.editor.value);
    autocomplete.update();
    renderStats();
  }

  /** Replaces only the changed range through execCommand, so the browser's undo stack survives. */
  function applyEdit(next) {
    const ta = els.editor;
    const current = ta.value;
    const limit = Math.min(current.length, next.value.length);
    let prefix = 0;
    while (prefix < limit && current[prefix] === next.value[prefix]) prefix++;
    let suffix = 0;
    while (suffix < limit - prefix && current[current.length - 1 - suffix] === next.value[next.value.length - 1 - suffix]) suffix++;
    const inserted = next.value.slice(prefix, next.value.length - suffix);
    ta.focus();
    ta.setSelectionRange(prefix, current.length - suffix);
    let done = false;
    try {
      done = document.execCommand(inserted ? 'insertText' : 'delete', false, inserted);
    } catch (err) {
      done = false;
    }
    if (!done || ta.value !== next.value) {
      ta.value = next.value;
      onEditorInput();
    }
    ta.setSelectionRange(next.start, next.end);
    autocomplete.update();
  }

  function selection() {
    const ta = els.editor;
    return { value: ta.value, start: ta.selectionStart, end: ta.selectionEnd };
  }

  function runTool(run) {
    if (isReadOnly()) return;
    applyEdit(run(selection()));
  }

  function matchShortcut(event) {
    const ctrl = event.ctrlKey || event.metaKey;
    return WIRED_SHORTCUTS.find((sc) => !!sc.ctrl === ctrl && !!sc.shift === event.shiftKey && !!sc.alt === event.altKey && sc.code === event.code);
  }

  function onEditorKeyDown(event) {
    if (autocomplete.onKeyDown(event)) return;
    const shortcut = matchShortcut(event);
    if (shortcut) {
      event.preventDefault();
      const tool = TOOLS.find((t) => t && t.id === shortcut.tool);
      runTool(shortcut.run || tool.run);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      const next = TextOps.continueList(selection());
      if (next) {
        event.preventDefault();
        applyEdit(next);
      }
    } else if (event.key === 'Tab') {
      const next = TextOps.indentList(selection(), event.shiftKey);
      if (next) {
        event.preventDefault();
        applyEdit(next);
      }
    }
  }

  // Preview

  function resolveWiki(target) {
    const note = Store.findByTitle(target);
    return note ? { href: `#/note/${encodeURIComponent(note.id)}`, missing: false } : { missing: true };
  }

  function renderPreview() {
    const note = activeNote();
    if (!note) return;
    // Safe: Markdown.render escapes all source text and emits only its own fixed tags.
    els.preview.innerHTML = MG.Markdown.render(note.body, { wiki: resolveWiki }) || '<p class="preview-empty">Nothing here yet.</p>';
    if (note.deletedAt) els.preview.querySelectorAll('.task-box').forEach((box) => { box.disabled = true; });
  }

  function schedulePreview() {
    if (previewFrame) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      renderPreview();
    });
  }

  function onTaskToggled(box) {
    const note = activeNote();
    if (!note || note.deletedAt) return;
    const line = Number(box.dataset.line);
    const body = Links.toggleTask(note.body, line);
    els.editor.value = body;
    changeBody(body);
    renderPreview();
    renderStats();
    const again = els.preview.querySelector(`.task-box[data-line="${line}"]`);
    if (again) again.focus();
  }

  function onPreviewClick(event) {
    const link = event.target.closest('a');
    if (!link) return;
    if (link.classList.contains('wikilink')) {
      event.preventDefault();
      MG.App.followWiki(link.dataset.wiki);
    } else if (link.classList.contains('tag')) {
      event.preventDefault();
      MG.App.filterByTag(link.dataset.tag);
    } else if (!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(link.getAttribute('href'))) {
      event.preventDefault();
      Overlays.toast('Relative links have nowhere to go from a note. Use a full address.');
    }
  }

  // Modes

  function isNarrow() {
    return narrow.matches;
  }

  function effectiveMode() {
    const note = activeNote();
    if (note && note.deletedAt) return 'preview';
    const mode = Store.settings.mode;
    return mode === 'split' && isNarrow() ? 'edit' : mode;
  }

  function applyMode() {
    const mode = effectiveMode();
    els.panes.dataset.mode = mode;
    els.toolbar.hidden = mode === 'preview' || isReadOnly();
    els.modes.querySelectorAll('button').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.mode === mode ? 'true' : 'false');
    });
    els.tools.hidden = isReadOnly();
  }

  function setMode(mode) {
    Store.setSetting('mode', mode);
    applyMode();
    if (mode !== 'preview' && !isNarrow()) els.editor.focus();
  }

  // On small screens the margin covers the note, so it starts closed there and isn't remembered.
  function isMarginOpen() {
    return marginAsOverlay.matches ? overlayMarginOpen : !!Store.settings.marginOpen;
  }

  function applyMargin() {
    const open = isMarginOpen();
    els.panes.classList.toggle('has-margin', open);
    els.marginBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
  }

  function toggleMargin() {
    if (marginAsOverlay.matches) overlayMarginOpen = !overlayMarginOpen;
    else Store.setSetting('marginOpen', !Store.settings.marginOpen);
    applyMargin();
  }

  // Title

  function showTitleError(message) {
    els.titleError.textContent = message;
    els.titleError.hidden = !message;
    if (message) els.title.setAttribute('aria-invalid', 'true');
    else els.title.removeAttribute('aria-invalid');
  }

  function commitTitle() {
    const note = activeNote();
    if (!note || note.deletedAt || els.title.value === note.title) {
      showTitleError('');
      return true;
    }
    const error = Store.validateTitle(els.title.value, note.id);
    if (error) {
      showTitleError(error);
      return false;
    }
    showTitleError('');
    flushSave();
    const snapshot = Store.checkpoint();
    const id = note.id;
    const result = Store.renameNote(id, els.title.value);
    if (result.changed && result.links) {
      Overlays.toast(`Renamed. Updated ${plural(result.links, 'link')} in ${plural(result.notes, 'note')}.`, {
        undo: () => Store.rollback(snapshot),
      });
    }
    return true;
  }

  function onTitleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (commitTitle() && !isReadOnly() && effectiveMode() !== 'preview') els.editor.focus();
    } else if (event.key === 'Escape') {
      const note = activeNote();
      els.title.value = note ? note.title : '';
      showTitleError('');
      els.title.blur();
    }
  }

  // Rendering the current note

  function renderStats() {
    const note = activeNote();
    if (!note) return;
    const words = Links.countWords(note.body);
    const tasks = Links.countTasks(note.body);
    const parts = [plural(words, 'word'), `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min read`];
    if (tasks.total) parts.push(`${tasks.done} of ${tasks.total} tasks done`);
    parts.push(`Edited ${relativeTime(note.updatedAt)}`);
    els.stats.textContent = parts.join('  \u00b7  ');
  }

  function renderFolderSelect(note) {
    const select = els.folder;
    select.textContent = '';
    select.appendChild(h('option', { value: '' }, 'No folder'));
    Store.folders.forEach((f) => select.appendChild(h('option', { value: f.id }, f.name)));
    select.value = note.folderId || '';
    select.disabled = !!note.deletedAt;
  }

  function renderActions(note) {
    const trashedNow = !!note.deletedAt;
    els.pinBtn.setAttribute('aria-pressed', note.pinned ? 'true' : 'false');
    els.pinBtn.setAttribute('aria-label', note.pinned ? 'Unpin note' : 'Pin note');
    els.pinBtn.title = note.pinned ? 'Unpin note' : 'Pin note';
    els.pinBtn.hidden = trashedNow;
    els.trashBtn.hidden = trashedNow;
    els.historyBtn.hidden = trashedNow;
    els.trashBanner.hidden = !trashedNow;
    els.title.readOnly = trashedNow;
    els.editor.readOnly = trashedNow;
  }

  /** Brings the view in line with the store without disturbing what the user is typing. */
  function sync() {
    const note = activeNote();
    if (!note) return;
    if (document.activeElement !== els.title || els.title.readOnly) {
      if (els.title.value !== note.title) els.title.value = note.title;
    }
    if (els.editor.value !== note.body) els.editor.value = note.body;
    schedulePreview();
    renderFolderSelect(note);
    renderActions(note);
    renderStats();
    applyMode();
  }

  function show(noteId) {
    flushSave();
    const changed = noteId !== activeId;
    activeId = noteId;
    const note = activeNote();
    els.empty.hidden = !!note;
    els.content.hidden = !note;
    if (!note) return;
    if (changed) {
      sessionStart = 0;
      overlayMarginOpen = false;
      applyMargin();
      autocomplete.close();
      showTitleError('');
      els.title.value = note.title;
      els.editor.value = note.body;
      els.editor.scrollTop = 0;
      els.preview.scrollTop = 0;
      setStatus(Store.storageHealthy ? 'Saved' : 'Not saved: browser storage is unavailable. Export to keep your work.', Store.storageHealthy ? '' : 'error');
    }
    renderPreview();
    sync();
  }

  function focusTitle() {
    els.title.focus();
    els.title.select();
  }

  function buildToolbar() {
    TOOLS.forEach((tool) => {
      if (!tool) {
        els.toolbarGroup.appendChild(h('span', { class: 'tool-sep', 'aria-hidden': 'true' }));
        return;
      }
      const hint = tool.keys ? `${tool.label} (${tool.keys})` : tool.label;
      els.toolbarGroup.appendChild(h('button', {
        class: 'tool-btn', type: 'button', title: hint, 'aria-label': tool.label, 'data-tool': tool.id,
        onmousedown: (event) => event.preventDefault(),
        onclick: () => runTool(tool.run),
      }, icon(tool.icon)));
    });
    els.toolbarGroup.addEventListener('keydown', onToolbarKeys);
    resetToolbarTabStops();
  }

  // Toolbar pattern: one tab stop, arrow keys move between buttons.
  function resetToolbarTabStops() {
    els.toolbarGroup.querySelectorAll('button').forEach((btn, i) => { btn.tabIndex = i === 0 ? 0 : -1; });
  }

  function onToolbarKeys(event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const buttons = [...els.toolbarGroup.querySelectorAll('button')];
    const at = buttons.indexOf(document.activeElement);
    if (at < 0) return;
    event.preventDefault();
    const next = buttons[(at + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
    buttons.forEach((btn) => { btn.tabIndex = -1; });
    next.tabIndex = 0;
    next.focus();
  }

  function syncScroll() {
    if (els.panes.dataset.mode !== 'split') return;
    const ta = els.editor;
    const range = ta.scrollHeight - ta.clientHeight;
    if (range <= 0) return;
    els.preview.scrollTop = (ta.scrollTop / range) * (els.preview.scrollHeight - els.preview.clientHeight);
  }

  function init() {
    narrow = window.matchMedia('(max-width: 820px)');
    marginAsOverlay = window.matchMedia('(max-width: 1100px)');
    els = {
      empty: $('doc-empty'), content: $('doc-content'), title: $('note-title'), titleError: $('title-error'),
      status: $('save-status'), editor: $('editor'), preview: $('preview'), panes: $('panes'), toolbar: $('toolbar'),
      toolbarGroup: $('toolbar-group'), modes: $('mode-switch'), stats: $('doc-stats'), folder: $('note-folder'),
      pinBtn: $('pin-btn'), historyBtn: $('history-btn'), marginBtn: $('margin-btn'), trashBtn: $('trash-btn'),
      trashBanner: $('trash-banner'), tools: $('doc-tools'),
    };
    buildToolbar();
    autocomplete = Autocomplete.create(els.editor, $('wiki-popup'), {
      getTitles: () => Store.live().filter((note) => note.id !== activeId).map((note) => note.title),
      applyEdit,
      createNote: (title) => MG.App.createLinkedNote(title),
    });
    els.editor.addEventListener('input', onEditorInput);
    els.editor.addEventListener('keydown', onEditorKeyDown);
    els.editor.addEventListener('scroll', syncScroll);
    els.preview.addEventListener('click', onPreviewClick);
    els.preview.addEventListener('change', (event) => {
      if (event.target.matches('.task-box')) onTaskToggled(event.target);
    });
    els.title.addEventListener('change', commitTitle);
    els.title.addEventListener('keydown', onTitleKeyDown);
    els.title.addEventListener('input', () => showTitleError(''));
    els.modes.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
    els.marginBtn.addEventListener('click', toggleMargin);
    els.folder.addEventListener('change', () => {
      if (activeId) Store.setFolder(activeId, els.folder.value || null);
    });
    els.pinBtn.addEventListener('click', () => { if (activeId) Store.togglePin(activeId); });
    narrow.addEventListener('change', applyMode);
    marginAsOverlay.addEventListener('change', applyMargin);
    window.addEventListener('pagehide', flushSave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSave();
    });
    applyMargin();
  }

  MG.DocView = {
    init, show, sync, flushSave, focusTitle, setMode, toggleMargin, commitTitle,
    captureManualVersion() {
      const note = activeNote();
      if (!note) return false;
      flushSave();
      const added = Store.captureVersion(note.id, 'Saved by hand');
      if (added) Store.persist();
      return added;
    },
    get activeId() { return activeId; },
    get note() { return activeNote(); },
  };
})(window.MG = window.MG || {});
