// Settings: reminders, week start, theme, and data import, export and reset.
(function (R) {
  'use strict';
  const { h, icon, button, plural } = R.dom;
  const Store = R.Store;
  const Sel = R.Select;
  const Rem = R.Reminders;
  const { toast, withUndo } = R.overlays;

  let importErrors = [];

  const PERMISSION_TEXT = {
    unsupported: 'This browser can\'t show notifications here, so reminders appear inside Rhythm while the tab is open.',
    default: 'Your browser will ask for permission when you turn this on. If you decline, reminders appear inside Rhythm instead.',
    granted: 'Notifications are allowed. Reminders arrive as system notifications while this tab is open.',
    denied: 'Notifications are blocked for this site, so reminders appear inside Rhythm instead. You can change this in your browser\'s site settings.',
    embedded: 'Browsers don\'t allow notification prompts in embedded pages, so reminders appear inside Rhythm instead.',
  };

  function reminderSection() {
    const state = Rem.permissionState();
    const on = Store.get().settings.reminders;
    const count = Store.get().habits.filter((habit) => habit.reminder && !habit.archivedOn).length;
    const toggle = h('input', { type: 'checkbox', id: 'reminders-toggle', checked: on, data: { fk: 'reminders-toggle' },
      onChange: async (e) => {
        const enabled = e.target.checked;
        if (enabled) await Rem.requestPermission();
        Store.setSetting('reminders', enabled);
        if (enabled) Rem.check();
      } });
    return h('section', { class: 'card settings-card' },
      h('h2', {}, 'Reminders'),
      h('label', { class: 'check-row', htmlFor: 'reminders-toggle' }, toggle, h('span', {}, 'Remind me while this tab is open')),
      h('p', { class: 'hint', data: { testid: 'permission-text' } }, PERMISSION_TEXT[state]),
      state === 'embedded' ? h('p', { class: 'hint' }, h('a', { href: location.href, target: '_blank', rel: 'noopener' }, 'Open Rhythm in its own tab'), ' to allow notifications.') : null,
      h('p', { class: 'hint' }, `${plural(count, 'habit has', 'habits have')} a reminder time. Set one when editing a habit.`),
      h('div', { class: 'settings-actions' }, button('Send a test reminder', () => Rem.sendTest(), { data: { fk: 'reminder-test' } })));
  }

  function preferenceSection() {
    return h('section', { class: 'card settings-card' },
      h('h2', {}, 'Preferences'),
      h('div', { class: 'pref-row' }, h('span', { class: 'label' }, 'Week starts on'),
        R.forms.segmented('Week starts on', [{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }], String(Sel.weekStart()),
          (value) => Store.setSetting('weekStart', +value), { name: 'week-start', compact: true })),
      h('p', { class: 'hint' }, 'Sets the week grid and the windows used by times-per-week habits.'),
      h('div', { class: 'pref-row' }, h('span', { class: 'label' }, 'Theme'),
        R.forms.segmented('Theme', [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], R.theme.current(),
          (value) => { R.theme.set(value); R.app.render(); }, { name: 'theme-choice', compact: true })));
  }

  function exportFile(kind) {
    const today = Sel.today();
    const state = Store.get();
    if (kind === 'json') R.Transfer.download(`rhythm-${today}.json`, 'application/json', R.Transfer.toJson(state));
    else R.Transfer.download(`rhythm-${today}.csv`, 'text/csv', R.Transfer.toCsv(state));
    toast(`Exported ${kind.toUpperCase()} file.`);
  }

  async function importFile(file) {
    let text = '';
    try {
      text = await file.text();
    } catch (e) {
      importErrors = ['The file could not be read.'];
      R.app.render();
      return;
    }
    const result = R.Transfer.parseImport(text);
    if (result.errors) {
      importErrors = result.errors;
      R.app.render();
      return;
    }
    importErrors = [];
    withUndo(`Imported ${plural(result.state.habits.length, 'habit')}.`, () => Store.replaceAll(result.state));
  }

  function dataSection() {
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', id: 'import-file', 'aria-label': 'Import JSON file',
      onChange: (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) importFile(file); } });
    const notes = Object.keys(Store.get().notes).length;
    return h('section', { class: 'card settings-card' },
      h('h2', {}, 'Your data'),
      h('p', { class: 'hint' }, `Stored in this browser: ${plural(Store.get().habits.length, 'habit')}, ${plural(notes, 'note')}.`),
      Store.storageWorks() ? null : h('p', { class: 'notice', role: 'status' }, 'Browser storage is unavailable, so changes last only until this tab closes. Export to keep them.'),
      h('div', { class: 'settings-actions' },
        button([icon('download', 16), 'Export JSON'], () => exportFile('json'), { data: { fk: 'export-json' } }),
        button([icon('download', 16), 'Export CSV'], () => exportFile('csv'), { data: { fk: 'export-csv' } }),
        fileInput,
        button([icon('upload', 16), 'Import JSON'], () => fileInput.click(), { data: { fk: 'import-json' } })),
      h('p', { class: 'hint' }, 'Importing replaces everything here. You can undo it right after.'),
      importErrors.length ? h('div', { class: 'error-box', role: 'alert' },
        h('strong', {}, 'That file was not imported.'),
        h('ul', {}, importErrors.map((message) => h('li', {}, message)))) : null,
      h('div', { class: 'settings-actions settings-danger' },
        button([icon('reset', 16), 'Reset demo data'], () => {
          importErrors = [];
          withUndo('Demo data restored.', () => Store.resetDemo());
        }, { data: { fk: 'reset-demo' } })),
      h('p', { class: 'hint' }, 'Replaces everything with the sample habits and history.'));
  }

  function render() {
    return h('div', { class: 'view view-settings' },
      h('header', { class: 'view-head' }, h('h1', {}, 'Settings')),
      h('div', { class: 'settings-grid' }, h('div', { class: 'settings-col' }, preferenceSection(), reminderSection()), dataSection()));
  }

  R.views = R.views || {};
  R.views.settings = { render, title: 'Settings' };
})(window.Rhythm);
