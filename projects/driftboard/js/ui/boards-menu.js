// The board switcher: search, open, rename, duplicate and delete boards, plus the load, stress-test
// and reset actions.
(function (DB) {
  'use strict';
  const { el } = DB.util;

  let root;
  let popover;
  let filter = '';
  let renamingId = null;

  function timeAgo(timestamp) {
    const minutes = Math.round((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function iconAction(icon, label, handler) {
    return el('button', { type: 'button', class: 'icon-button icon-small', 'data-icon': icon, 'data-icon-size': '16', 'aria-label': label, title: label, onclick: handler });
  }

  function renameRow(meta) {
    const error = el('p', { class: 'field-error', role: 'alert', hidden: true });
    const input = el('input', { type: 'text', class: 'text-input', value: meta.name, maxlength: 80, 'aria-label': `New name for ${meta.name}` });
    const submit = () => {
      const problem = DB.boards.rename(meta.id, input.value);
      if (problem) {
        error.textContent = problem;
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      renamingId = null;
      render();
    };
    const cancel = () => { renamingId = null; render(); };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
      if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
    });
    const form = el('div', { class: 'rename-row' }, input,
      el('button', { type: 'button', class: 'plain-button', text: 'Save', onclick: submit }),
      el('button', { type: 'button', class: 'plain-button', text: 'Cancel', onclick: cancel }));
    setTimeout(() => { input.focus(); input.select(); }, 0);
    return el('li', { class: 'board-row is-renaming' }, form, error);
  }

  function boardRow(meta) {
    if (renamingId === meta.id) return renameRow(meta);
    const isCurrent = DB.boards.current() && DB.boards.current().id === meta.id;
    const open = el('button', {
      type: 'button', class: 'board-open', 'aria-current': isCurrent ? 'true' : null,
      onclick: () => { DB.boards.open(meta.id); popover.close(); },
    },
    el('span', { class: 'board-open-name truncate', text: meta.name }),
    el('span', { class: 'board-open-meta', text: `${DB.actions.plural(meta.count, 'shape')}, ${timeAgo(meta.updatedAt)}` }));
    const actions = el('div', { class: 'board-actions' },
      iconAction('rename', `Rename ${meta.name}`, () => { renamingId = meta.id; render(); }),
      iconAction('copy', `Duplicate ${meta.name}`, () => { DB.boards.duplicate(meta.id); render(); }),
      iconAction('trash', `Delete ${meta.name}`, () => deleteBoard(meta)));
    return el('li', { class: `board-row${isCurrent ? ' is-current' : ''}` }, open, actions);
  }

  function deleteBoard(meta) {
    const restore = DB.boards.remove(meta.id);
    render();
    DB.toast.show(`Deleted board "${meta.name}".`, { action: 'Undo', onAction: restore, timeout: 9000 });
  }

  function renderList(list) {
    list.textContent = '';
    const query = filter.trim().toLowerCase();
    const matches = DB.boards.list.filter((m) => m.name.toLowerCase().includes(query));
    if (!matches.length) {
      list.append(el('li', { class: 'board-empty', text: `No boards match "${filter.trim()}".` }));
      return;
    }
    matches.forEach((meta) => list.append(boardRow(meta)));
    DB.icons.hydrate(list);
  }

  function render() {
    root.textContent = '';
    const search = el('input', {
      type: 'search', class: 'text-input', id: 'board-search', placeholder: 'Search boards', 'aria-label': 'Search boards', value: filter,
    });
    const list = el('ul', { class: 'board-list', id: 'board-list' });
    search.addEventListener('input', () => { filter = search.value; renderList(list); });
    search.addEventListener('keydown', (ev) => ev.stopPropagation());
    renderList(list);
    const footer = el('div', { class: 'boards-footer' },
      el('button', {
        type: 'button', class: 'primary-button', id: 'new-board', text: 'New board',
        onclick: () => { DB.boards.create(''); popover.close(); },
      }),
      el('button', {
        type: 'button', class: 'plain-button', id: 'load-board', text: 'Load JSON file',
        onclick: () => document.getElementById('load-input').click(),
      }),
      el('button', {
        type: 'button', class: 'plain-button', id: 'stress-board', text: '1,000-shape board', title: 'Add a board with 1,000 shapes, to try pan, zoom and selection under load',
        onclick: () => { DB.boards.addDoc('Load test, 1,000 shapes', DB.seed.stressShapes(), null, true); popover.close(); },
      }),
      el('button', {
        type: 'button', class: 'plain-button', id: 'reset-demo', text: 'Reset demo data',
        onclick: () => {
          const restore = DB.boards.resetDemo();
          popover.close();
          DB.toast.show('Restored the demo boards.', { action: 'Undo', onAction: restore, timeout: 9000 });
        },
      }));
    root.append(el('div', { class: 'boards-head' }, el('h2', { text: 'Boards' }), search), list, footer);
  }

  async function onFilePicked(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    popover.close();
    try {
      const parsed = DB.schema.parseFile(await file.text());
      DB.boards.importBoards(parsed);
      const skipped = parsed.reduce((sum, board) => sum + board.skipped, 0);
      const count = DB.actions.plural(parsed.length, 'board');
      DB.toast.show(skipped ? `Loaded ${count}. Skipped ${DB.actions.plural(skipped, 'invalid shape')}.` : `Loaded ${count} from ${file.name}.`);
    } catch (error) {
      DB.modal.message('Could not load that file', error.message);
    }
  }

  function attach() {
    root = document.getElementById('boards-menu');
    popover = DB.modal.bindPopover(document.getElementById('boards-button'), root, {
      onOpen: () => {
        renamingId = null;
        filter = '';
        render();
        const search = document.getElementById('board-search');
        if (search) search.focus();
      },
    });
    document.getElementById('load-input').addEventListener('change', onFilePicked);
    DB.bus.on('boards', () => { if (!root.hidden) render(); });
  }

  DB.boardsMenu = { attach };
})(window.DB);
