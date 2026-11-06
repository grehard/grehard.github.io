// Modals that manage shared lists (team, labels) and bring data in from a file.
const Editors = (() => {
  const { h, icon, iconButton, select } = Dom;

  const LABEL_COLORS = [
    { value: '#be185d', label: 'Pink' }, { value: '#1d4ed8', label: 'Blue' }, { value: '#b45309', label: 'Amber' }, { value: '#dc2626', label: 'Red' },
    { value: '#0f766e', label: 'Teal' }, { value: '#6d28d9', label: 'Violet' }, { value: '#4d7c0f', label: 'Green' }, { value: '#475569', label: 'Slate' },
  ];

  function isDuplicate(list, name, ignoreId) {
    return list.some((entry) => entry.id !== ignoreId && entry.name.toLowerCase() === name.toLowerCase());
  }

  function rowError(row, message) {
    row.querySelector('.field-error').textContent = message;
    row.querySelector('.field-error').hidden = !message;
    row.querySelector('input').setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  // The same editor serves the team and label lists; `config` holds what differs.
  function listRow(entry, config) {
    const list = App.getState()[config.listName];
    const commit = (event) => {
      const row = event.target.closest('.editor-row');
      const name = event.target.value.trim();
      if (!name) { rowError(row, `${config.noun} name can't be empty.`); event.target.value = entry.name; return; }
      if (isDuplicate(list, name, entry.id)) { rowError(row, `There is already a ${config.noun.toLowerCase()} with this name.`); event.target.value = entry.name; return; }
      rowError(row, '');
      if (name !== entry.name) Actions.updateListEntry(config.listName, entry.id, { name });
    };
    const nameInput = h('input', { type: 'text', value: entry.name, maxlength: 80, 'aria-label': `${config.noun} name`, 'data-fkey': `editor-${entry.id}`, onChange: commit });
    const colorControl = config.hasColor
      ? select(LABEL_COLORS, entry.color, { 'aria-label': `Color of ${entry.name}`, class: 'editor-color', 'data-fkey': `editor-color-${entry.id}`, onChange: (e) => Actions.updateListEntry(config.listName, entry.id, { color: e.target.value }) })
      : null;
    return h('li', { class: 'editor-row' },
      h('div', { class: 'editor-row-main' },
        config.leading(entry), nameInput, colorControl,
        iconButton('trash', `Remove ${entry.name}`, () => config.remove(entry.id), { class: 'editor-remove' })),
      h('p', { class: 'field-error', role: 'alert', hidden: true }));
  }

  function addForm(config) {
    const input = h('input', { type: 'text', id: `add-${config.listName}`, maxlength: 80, autocomplete: 'off', placeholder: config.placeholder, 'aria-label': `New ${config.noun.toLowerCase()} name`, 'data-fkey': `add-${config.listName}`, 'data-autofocus': true });
    const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const submit = (event) => {
      event.preventDefault();
      const name = input.value.trim();
      const list = App.getState()[config.listName];
      const message = !name ? `Enter a ${config.noun.toLowerCase()} name.` : isDuplicate(list, name, null) ? `There is already a ${config.noun.toLowerCase()} with this name.` : '';
      error.textContent = message;
      error.hidden = !message;
      if (message) { input.focus(); return; }
      input.value = '';
      Actions.addListEntry(config.listName, name);
    };
    return h('form', { class: 'editor-add', novalidate: true, onSubmit: submit },
      h('div', { class: 'editor-row-main' }, input, h('button', { type: 'submit', class: 'btn' }, icon('plus', 14), config.addLabel)), error);
  }

  function openListEditor(config) {
    let addFormElement = null;
    Modal.open({
      title: config.title,
      render: (body) => {
        const entries = App.getState()[config.listName];
        addFormElement = addFormElement || addForm(config);
        const list = entries.length
          ? h('ul', { class: 'editor-list' }, entries.map((entry) => listRow(entry, config)))
          : h('p', { class: 'muted' }, config.emptyText);
        body.replaceChildren(list, addFormElement);
      },
    });
  }

  const openTeam = () => openListEditor({
    title: 'Team', listName: 'team', noun: 'Member', addLabel: 'Add member', placeholder: 'Full name',
    emptyText: 'No one on the team yet. Add the people who pick up cards.',
    leading: (member) => Parts.avatar(member),
    remove: Actions.removeMember,
  });

  const openLabels = () => openListEditor({
    title: 'Labels', listName: 'labels', noun: 'Label', addLabel: 'Add label', placeholder: 'Label name', hasColor: true,
    emptyText: 'No labels yet. Add one to group related cards.',
    leading: (label) => h('span', { class: 'label-dot', style: `background:${label.color}` }),
    remove: Actions.removeLabel,
  });

  function handleImportFile(file, errorBox) {
    const showErrors = (errors) => {
      errorBox.replaceChildren(h('p', null, 'This file was not imported. Your board is unchanged.'), h('ul', null, errors.slice(0, 6).map((e) => h('li', null, e))));
      errorBox.hidden = false;
    };
    const reader = new FileReader();
    reader.onerror = () => showErrors(['The file could not be read.']);
    reader.onload = () => {
      const { state, errors } = Store.parseImport(String(reader.result));
      if (!state) { showErrors(errors); return; }
      Modal.close();
      Actions.importWorkspace(state);
    };
    reader.readAsText(file);
  }

  function openImport() {
    const errorBox = h('div', { class: 'import-errors', id: 'import-errors', role: 'alert', hidden: true });
    const input = h('input', {
      type: 'file', id: 'import-file', accept: '.json,application/json', 'data-autofocus': true,
      onChange: (e) => { if (e.target.files[0]) handleImportFile(e.target.files[0], errorBox); e.target.value = ''; },
    });
    Modal.open({
      title: 'Import JSON',
      render: (body) => body.replaceChildren(
        h('p', null, 'Choose a file saved with Export JSON. It replaces every project, team member and label here. You can undo right after.'),
        Forms.field('Laneboard file', input),
        errorBox),
    });
  }

  return { openTeam, openLabels, openImport };
})();
