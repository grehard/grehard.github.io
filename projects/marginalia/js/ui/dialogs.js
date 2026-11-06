// The folder manager, import dialog and shortcut reference.
(function (MG) {
  'use strict';

  const { Store, Transfer, Overlays } = MG;
  const { h, icon, plural } = MG.Dom;

  const SHORTCUTS = [
    ['Editing', [
      ['Bold', 'Ctrl+B'], ['Italic', 'Ctrl+I'], ['Strikethrough', 'Ctrl+Shift+X'], ['Inline code', 'Ctrl+E'],
      ['Link', 'Ctrl+K'], ['Link to a note', '[['], ['Heading 1, 2, 3', 'Ctrl+Alt+1, 2, 3'], ['Quote', 'Ctrl+Shift+.'],
      ['Numbered list', 'Ctrl+Shift+7'], ['Bulleted list', 'Ctrl+Shift+8'], ['Task list', 'Ctrl+Shift+9'],
      ['Code block', 'Ctrl+Alt+C'], ['Indent or outdent a list item', 'Tab, Shift+Tab'],
    ]],
    ['App', [
      ['Split, edit, preview', 'Alt+1, 2, 3'], ['New note', 'Alt+N'], ['Graph', 'Alt+G'],
      ['Search notes', '/'], ['Save a version now', 'Ctrl+S'], ['Close a dialog', 'Esc'],
    ]],
  ];

  function openShortcuts() {
    const groups = SHORTCUTS.map(([name, rows]) => h('section', { class: 'shortcut-group' },
      h('h3', null, name),
      h('dl', { class: 'shortcut-list' }, rows.map(([label, keys]) => h('div', { class: 'shortcut-row' },
        h('dt', null, label), h('dd', null, h('kbd', null, keys)))))));
    Overlays.openModal({ title: 'Keyboard shortcuts', wide: true, content: h('div', { class: 'shortcut-grid' }, groups) });
  }

  function folderRow(folder, refresh) {
    const input = h('input', { type: 'text', value: folder.name, 'aria-label': `Name of folder ${folder.name}`, maxlength: '40', class: 'input' });
    const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const count = Store.live().filter((note) => note.folderId === folder.id).length;
    input.addEventListener('change', () => {
      const problem = Store.folderNameProblem(input.value, folder.id);
      error.textContent = problem;
      error.hidden = !problem;
      if (problem) input.value = folder.name;
      else Store.renameFolder(folder.id, input.value);
    });
    const remove = h('button', {
      class: 'icon-btn', type: 'button', 'aria-label': `Delete folder ${folder.name}`, title: 'Delete folder',
      onclick: () => {
        const snapshot = Store.checkpoint();
        Store.deleteFolder(folder.id);
        refresh();
        Overlays.toast(`Folder "${folder.name}" deleted. Its ${plural(count, 'note')} stayed.`, {
          undo: () => {
            Store.rollback(snapshot);
            refresh();
          },
        });
      },
    }, icon('trash'));
    return h('li', { class: 'folder-row' }, h('div', { class: 'folder-row-main' }, input, h('span', { class: 'count' }, count), remove), error);
  }

  function openFolders() {
    const list = h('ul', { class: 'folder-list', id: 'folder-list' });
    const nameInput = h('input', { type: 'text', id: 'new-folder-name', class: 'input', maxlength: '40', 'data-autofocus': true, placeholder: 'For example, Dissertation' });
    const error = h('p', { class: 'field-error', id: 'new-folder-error', role: 'alert', hidden: true });

    function refresh() {
      list.textContent = '';
      if (!Store.folders.length) list.appendChild(h('li', { class: 'modal-hint' }, 'No folders yet.'));
      Store.folders.forEach((folder) => list.appendChild(folderRow(folder, refresh)));
    }

    const form = h('form', {
      class: 'inline-form', novalidate: true,
      onsubmit: (event) => {
        event.preventDefault();
        const problem = Store.folderNameProblem(nameInput.value);
        error.textContent = problem;
        error.hidden = !problem;
        if (problem) return;
        Store.createFolder(nameInput.value);
        nameInput.value = '';
        refresh();
      },
    }, h('label', { class: 'field-label', for: 'new-folder-name' }, 'New folder'),
    h('div', { class: 'inline-form-row' }, nameInput, h('button', { class: 'btn primary', type: 'submit' }, 'Add folder')), error);

    refresh();
    Overlays.openModal({
      title: 'Folders',
      content: h('div', null, list, form, h('p', { class: 'modal-hint' }, 'Deleting a folder keeps its notes. They become unfiled.')),
    });
  }

  function reportImport(results, plan, added) {
    results.textContent = '';
    if (added) {
      results.appendChild(h('p', { class: 'import-ok', role: 'status' }, `Imported ${plural(added, 'note')}.`));
    }
    if (plan.errors.length) {
      results.appendChild(h('ul', { class: 'import-errors', role: 'alert' }, plan.errors.map((message) => h('li', null, message))));
    }
  }

  async function runImport(files, results) {
    if (!files.length) return;
    const plan = await Transfer.planImport(files);
    const added = plan.notes.length;
    if (added) {
      const snapshot = Store.checkpoint();
      Store.addImported(plan.notes, plan.folders);
      Overlays.toast(`Imported ${plural(added, 'note')}.`, { undo: () => Store.rollback(snapshot) });
    }
    reportImport(results, plan, added);
  }

  function openImport() {
    const results = h('div', { class: 'import-results', id: 'import-results' });
    const input = h('input', { type: 'file', id: 'import-file', multiple: true, accept: '.md,.markdown,.txt,.json', class: 'file-input' });
    const zone = h('label', { class: 'drop-zone', for: 'import-file' },
      icon('upload'),
      h('span', { class: 'drop-zone-title' }, 'Choose files, or drop them here'),
      h('span', { class: 'modal-hint' }, '.md files become notes titled after the file. A Marginalia .json export restores notes, folders and history.'));
    input.addEventListener('change', () => {
      runImport([...input.files], results);
      input.value = '';
    });
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('is-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('is-over');
      runImport([...event.dataTransfer.files], results);
    });
    Overlays.openModal({ title: 'Import notes', content: h('div', null, input, zone, results) });
  }

  MG.Dialogs = { openShortcuts, openFolders, openImport };
})(window.MG = window.MG || {});
