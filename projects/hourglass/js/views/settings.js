// Settings: billing rules, week start, theme, data export and import, reset.
(function (HG) {
  'use strict';
  const { h, icon } = HG;
  const T = HG.time;
  const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
  const SAMPLE_MS = 37 * T.MIN;
  let importErrors = [];

  const setSetting = (key, value) => HG.store.commit((s) => { s.settings[key] = value; });

  function today() { return T.dayKey(Date.now()); }

  function exportJson() {
    HG.dom.downloadFile(`hourglass-backup-${today()}.json`, 'application/json', HG.exporter.toJson(HG.store.state));
    HG.ui.toast('Exported all data to JSON');
  }

  function exportCsv() {
    HG.dom.downloadFile(`hourglass-entries-${today()}.csv`, 'text/csv;charset=utf-8', HG.exporter.allRowsCsv(HG.store.state));
    HG.ui.toast('Exported all entries to CSV');
  }

  function showImportErrors(errors) {
    importErrors = errors;
    HG.app.render();
  }

  function confirmImport(data, fileName) {
    HG.ui.confirmModal({
      title: 'Replace all data?',
      message: `${fileName} contains ${data.entries.length} entries, ${data.projects.length} projects, ${data.clients.length} clients and ${data.tags.length} tags. Importing replaces what is here now. You can undo it right after.`,
      confirmLabel: 'Replace data',
      danger: true,
      onConfirm: () => {
        importErrors = [];
        const before = HG.store.snapshot();
        HG.store.replaceData(data);
        HG.ui.toast(`Imported ${data.entries.length} entries`, { action: { label: 'Undo', run: () => HG.store.restore(before) } });
      },
    });
  }

  function onImportFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { showImportErrors(['This file is larger than 20 MB, which is too big to be an Hourglass export.']); return; }
    const reader = new FileReader();
    reader.onerror = () => showImportErrors(['The file could not be read.']);
    reader.onload = () => {
      const result = HG.exporter.parseImport(String(reader.result));
      if (result.errors) { showImportErrors(result.errors); return; }
      importErrors = [];
      HG.app.render();
      confirmImport(result.data, file.name);
    };
    reader.readAsText(file);
  }

  function resetDemo() {
    HG.ui.confirmModal({
      title: 'Reset demo data?',
      message: 'This replaces all clients, projects, tags, entries and settings with the sample data, and stops any running timer.',
      confirmLabel: 'Reset demo data',
      danger: true,
      onConfirm: () => {
        const before = HG.store.snapshot();
        HG.views.reports.resetFilters();
        HG.store.resetDemo();
        HG.ui.toast('Demo data restored', { action: { label: 'Undo', run: () => HG.store.restore(before) } });
      },
    });
  }

  function roundingExample(st) {
    const rounded = HG.calc.roundDuration(SAMPLE_MS, st.roundingMinutes, st.roundingMode);
    return st.roundingMinutes
      ? `An entry of ${T.duration(SAMPLE_MS)} bills as ${T.duration(rounded)}. Rounding applies once per entry, so timers stay exact and only billing changes.`
      : `An entry of ${T.duration(SAMPLE_MS)} bills as ${T.duration(SAMPLE_MS)}.`;
  }

  function billingSection(st) {
    const rate = h('input', { type: 'number', id: 'setting-rate', min: 0, step: '0.01', value: st.defaultRate,
      onchange: (e) => {
        const n = Number(e.target.value);
        const valid = Number.isFinite(n) && n >= 0 && n <= 100000;
        if (valid) setSetting('defaultRate', Math.round(n * 100) / 100);
        else HG.ui.toast('The default rate must be between 0 and 100,000.', { kind: 'alert' });
        if (!valid) e.target.value = st.defaultRate;
      } });
    return h('section', { class: 'panel settings-section', 'aria-labelledby': 'set-billing' },
      h('h2', { id: 'set-billing' }, 'Billing'),
      h('div', { class: 'form-grid' },
        HG.ui.field('Rounding', h('select', { id: 'setting-rounding', 'data-fk': 'setting-rounding', onchange: (e) => setSetting('roundingMinutes', Number(e.target.value)) },
          [[0, 'None'], [6, '6 minutes (tenth of an hour)'], [15, '15 minutes (quarter of an hour)']].map(([v, l]) => h('option', { value: v, selected: st.roundingMinutes === v }, l)))),
        HG.ui.field('Rounding direction', h('select', { id: 'setting-rounding-mode', 'data-fk': 'setting-rounding-mode', onchange: (e) => setSetting('roundingMode', e.target.value) },
          [['up', 'Always up'], ['nearest', 'To the nearest']].map(([v, l]) => h('option', { value: v, selected: st.roundingMode === v }, l)))),
        h('p', { class: 'hint span-2', id: 'rounding-example' }, roundingExample(st)),
        HG.ui.field('Currency', h('select', { id: 'setting-currency', 'data-fk': 'setting-currency', onchange: (e) => setSetting('currency', e.target.value) },
          HG.store.CURRENCIES.map((c) => h('option', { value: c, selected: st.currency === c }, c)))),
        HG.ui.field('Default hourly rate', rate, { hint: 'Used when neither the project nor its client has a rate.' }),
        h('label', { class: 'check span-2' }, h('input', { type: 'checkbox', id: 'setting-billable', 'data-fk': 'setting-billable', checked: st.defaultBillable, onchange: (e) => setSetting('defaultBillable', e.target.checked) }), 'New entries are billable unless their project says otherwise')));
  }

  function generalSection(st) {
    const themeChoice = HG.theme.choice() || 'system';
    return h('section', { class: 'panel settings-section', 'aria-labelledby': 'set-general' },
      h('h2', { id: 'set-general' }, 'General'),
      h('div', { class: 'form-grid' },
        HG.ui.field('Your name, for timesheets', h('input', { type: 'text', id: 'setting-name', maxlength: 120, value: st.name, onchange: (e) => setSetting('name', e.target.value.trim()) }), { className: 'span-2' }),
        HG.ui.field('Week starts on', h('select', { id: 'setting-week', 'data-fk': 'setting-week', onchange: (e) => setSetting('weekStart', Number(e.target.value)) },
          [[1, 'Monday'], [0, 'Sunday']].map(([v, l]) => h('option', { value: v, selected: st.weekStart === v }, l)))),
        HG.ui.field('Theme', h('select', { id: 'setting-theme', 'data-fk': 'setting-theme', onchange: (e) => { HG.theme.choose(e.target.value); HG.app.render(); } },
          [['system', 'Follow system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('option', { value: v, selected: themeChoice === v }, l))))));
  }

  function dataSection() {
    const file = h('input', { type: 'file', id: 'import-file', accept: '.json,application/json', class: 'visually-hidden', onchange: onImportFile, tabindex: '-1', 'aria-hidden': 'true' });
    return h('section', { class: 'panel settings-section', 'aria-labelledby': 'set-data' },
      h('h2', { id: 'set-data' }, 'Your data'),
      h('p', { class: 'hint' }, HG.store.storageOk
        ? 'Everything is stored in this browser. Export a backup whenever you like.'
        : 'This browser is blocking storage, so your data lasts only until you close this tab. Export it to keep it.'),
      h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'btn', id: 'export-json', onclick: exportJson }, icon('download'), 'Export JSON'),
        h('button', { type: 'button', class: 'btn', id: 'export-csv', onclick: exportCsv }, icon('download'), 'Export CSV'),
        h('button', { type: 'button', class: 'btn', id: 'import-json', onclick: () => file.click() }, icon('upload'), 'Import JSON'),
        file),
      importErrors.length > 0 && h('div', { class: 'import-errors', id: 'import-errors', role: 'alert' },
        h('strong', null, 'Nothing was imported.'),
        h('ul', null, importErrors.map((message) => h('li', null, message)))),
      h('div', { class: 'danger-zone' },
        h('div', null, h('strong', null, 'Reset demo data'), h('p', { class: 'hint' }, 'Puts the sample clients, projects and six weeks of entries back.')),
        h('button', { type: 'button', class: 'btn btn-quiet-danger', id: 'reset-demo', onclick: resetDemo }, 'Reset demo data')));
  }

  function render() {
    const st = HG.store.state.settings;
    return h('div', { class: 'settings-view' },
      h('div', { class: 'view-head' }, h('h1', null, 'Settings')),
      h('div', { class: 'settings-grid' }, billingSection(st), generalSection(st), dataSection()));
  }

  HG.views = HG.views || {};
  HG.views.settings = { render };
})(window.HG);
