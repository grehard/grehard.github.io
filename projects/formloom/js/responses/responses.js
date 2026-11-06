// The Responses view: filters, sortable table, detail modal, CSV export and the summary tab.
FL.responsesView = (function () {
  const { h, clear, plural, formatDateTime, slugify, isoDate } = FL.util;
  const { icon } = FL.icons;
  const { allFields, isQuestion, displayValue } = FL.fields;
  const model = FL.responseModel;
  const PAGE_SIZE = 50;
  const views = new Map(); // filter state survives moving between tabs, per form

  function viewState(formId) {
    if (!views.has(formId)) {
      views.set(formId, {
        tab: 'table', search: '', from: '', to: '', sortKey: 'submitted', sortDir: 'desc', limit: PAGE_SIZE,
        rule: { fieldId: '', op: 'equals', value: '' },
      });
    }
    return views.get(formId);
  }

  function selectedRows(form, state) {
    const all = FL.store.responsesFor(form.id);
    return model.sort(form, model.filter(form, all, state), state.sortKey, state.sortDir);
  }

  function mount(container, formId) {
    const form = FL.store.getForm(formId);
    const state = viewState(formId);
    const results = h('div', { class: 'responses-results', role: 'tabpanel' });
    const countLine = h('p', { class: 'responses-count', role: 'status' });
    const exportButton = h('button', { class: 'btn', type: 'button', onclick: () => exportCsv(form, state) }, icon('download'), 'Export CSV');
    const clearButton = h('button', { class: 'btn is-danger', type: 'button', onclick: () => deleteShown(form, state, refresh) }, icon('trash'), 'Delete shown');

    function refresh() {
      const rows = selectedRows(form, state);
      const total = FL.store.responsesFor(form.id).length;
      countLine.textContent = rows.length === total
        ? plural(total, 'response')
        : `${rows.length.toLocaleString('en-US')} of ${plural(total, 'response')}`;
      exportButton.disabled = !rows.length;
      clearButton.disabled = !rows.length;
      clear(results);
      if (!total) results.append(emptyState(form));
      else if (!rows.length) results.append(h('div', { class: 'empty-state' }, h('p', { class: 'empty-title' }, 'No responses match these filters'), h('p', null, 'Change or clear the filters above to see more.')));
      else if (state.tab === 'summary') results.append(FL.responseSummary.render(form, rows));
      else results.append(FL.responseTable.render(form, rows, state, { refresh, openDetail: (row) => openDetail(form, row, refresh), remove: (row) => removeOne(form, row, refresh) }));
    }

    const filters = filterBar(form, state, refresh, () => {
      clear(container);
      mount(container, formId);
    });
    const tabs = h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Response views' },
      tabButton(state, 'table', 'Table', 'table', () => { refresh(); syncTabs(); }),
      tabButton(state, 'summary', 'Summary', 'chart', () => { refresh(); syncTabs(); }));
    function syncTabs() {
      tabs.querySelectorAll('button').forEach((button) => {
        const on = button.dataset.tab === state.tab;
        button.classList.toggle('is-on', on);
        button.setAttribute('aria-selected', String(on));
      });
    }
    clear(container).append(h('div', { class: 'responses scroll-view' },
      h('div', { class: 'responses-inner' },
        h('div', { class: 'responses-head' }, tabs, countLine, h('div', { class: 'responses-actions' }, exportButton, clearButton)),
        filters,
        results)));
    refresh();
  }

  function tabButton(state, id, label, iconName, after) {
    return h('button', {
      class: `segment${state.tab === id ? ' is-on' : ''}`,
      type: 'button',
      role: 'tab',
      'data-tab': id,
      'aria-selected': String(state.tab === id),
      onclick: () => { state.tab = id; after(); },
    }, icon(iconName, 15), label);
  }

  function filterBar(form, state, refresh, redraw) {
    const sources = allFields(form).filter(isQuestion);
    const ruleSlot = h('div', { class: 'filter-rule' });

    function paintRule() {
      FL.util.keepFocus(ruleSlot, () => {
        clear(ruleSlot).append(FL.ruleRow.render({
          form,
          rule: state.rule,
          sources,
          fk: 'filter',
          onChange: (patch, structural) => {
            Object.assign(state.rule, patch);
            if (structural) paintRule();
            state.limit = PAGE_SIZE;
            refresh();
          },
          removeLabel: 'Clear question filter',
          onRemove: state.rule.fieldId ? () => {
            state.rule = { fieldId: '', op: 'equals', value: '' };
            paintRule();
            refresh();
          } : null,
        }));
      });
    }
    paintRule();

    const dateInput = (key, label) => h('label', { class: 'filter-date' }, h('span', null, label), h('input', {
      class: 'input', type: 'date', value: state[key],
      oninput: (event) => { state[key] = event.target.value; state.limit = PAGE_SIZE; refresh(); },
    }));
    const search = h('div', { class: 'search-box' }, icon('search', 15), h('input', {
      class: 'input', type: 'search', placeholder: 'Search answers', 'aria-label': 'Search answers', value: state.search,
      oninput: (event) => { state.search = event.target.value; state.limit = PAGE_SIZE; refresh(); },
    }));
    return h('div', { class: 'filter-bar' }, search, ruleSlot, dateInput('from', 'From'), dateInput('to', 'To'),
      h('button', {
        class: 'link-button', type: 'button',
        onclick: () => {
          Object.assign(state, { search: '', from: '', to: '', rule: { fieldId: '', op: 'equals', value: '' }, limit: PAGE_SIZE });
          redraw();
        },
      }, 'Clear filters'));
  }

  function exportCsv(form, state) {
    const rows = selectedRows(form, state);
    const name = `${slugify(form.title)}-responses-${isoDate(new Date())}.csv`;
    FL.util.download(name, FL.csv.responsesToCsv(form, rows), 'text/csv;charset=utf-8');
    FL.ui.toast(`Exported ${plural(rows.length, 'response')} to ${name}.`);
  }

  function deleteShown(form, state, refresh) {
    const rows = selectedRows(form, state);
    const restore = FL.store.deleteResponses(form.id, rows.map((row) => row.id));
    refresh();
    FL.app.syncTopbar();
    FL.ui.toast(`Deleted ${plural(rows.length, 'response')}.`, { undo: () => { restore(); afterRestore(refresh); } });
  }

  function removeOne(form, row, refresh) {
    const restore = FL.store.deleteResponses(form.id, [row.id]);
    refresh();
    FL.app.syncTopbar();
    FL.ui.toast('Deleted the response.', { undo: () => { restore(); afterRestore(refresh); } });
  }

  function afterRestore(refresh) {
    refresh();
    FL.app.syncTopbar();
  }

  function openDetail(form, row, refresh) {
    const questions = allFields(form).filter(isQuestion);
    const list = h('dl', { class: 'detail-list' }, questions.map((field) => {
      const text = displayValue(field, row.answers[field.id]);
      return [h('dt', null, field.label), h('dd', { class: text ? '' : 'is-blank' }, text || 'Not answered')];
    }));
    const dialog = FL.ui.modal({
      title: `Response from ${formatDateTime(row.submittedAt)}`,
      body: list,
      footer: [
        h('button', { class: 'btn is-danger', type: 'button', onclick: () => { dialog.close(); removeOne(form, row, refresh); } }, icon('trash'), 'Delete response'),
        h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Close'),
      ],
    });
  }

  function emptyState(form) {
    return h('div', { class: 'empty-state' },
      h('p', { class: 'empty-title' }, 'No responses yet'),
      h('p', null, 'Share the form, or fill it in from its share link, and responses will appear here.'),
      h('button', { class: 'btn', type: 'button', onclick: () => FL.share.open(form) }, icon('share'), 'Share form'));
  }

  return { mount };
})();
