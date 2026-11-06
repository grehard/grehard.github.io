// The sortable responses table. It scrolls inside its own container on narrow screens.
FL.responseTable = (function () {
  const { h, formatDateTime } = FL.util;
  const { icon } = FL.icons;
  const { allFields, isQuestion, displayValue } = FL.fields;
  const PAGE_SIZE = 50;

  function headerCell(label, key, state, refresh) {
    const active = state.sortKey === key;
    const direction = state.sortDir === 'asc' ? 'ascending' : 'descending';
    return h('th', { scope: 'col', 'aria-sort': active ? direction : 'none' },
      h('button', {
        class: `th-sort${active ? ' is-active' : ''}`,
        type: 'button',
        title: `Sort by ${label}`,
        onclick: () => {
          if (active) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          else { state.sortKey = key; state.sortDir = key === 'submitted' ? 'desc' : 'asc'; }
          refresh();
        },
      }, h('span', { class: 'th-text' }, label), active ? icon(state.sortDir === 'asc' ? 'up' : 'down', 13) : null));
  }

  function bodyRow(questions, row, handlers) {
    const cells = questions.map((field) => {
      const text = displayValue(field, row.answers[field.id]);
      return h('td', { title: text.length > 40 ? text : null, class: text ? null : 'is-blank' }, text);
    });
    return h('tr', { 'data-response': row.id },
      h('th', { scope: 'row', class: 'cell-date' },
        h('button', { class: 'link-button', type: 'button', title: 'View this response', onclick: () => handlers.openDetail(row) }, formatDateTime(row.submittedAt))),
      cells,
      h('td', { class: 'cell-actions' },
        h('button', { class: 'btn-icon is-danger', type: 'button', 'aria-label': `Delete response from ${formatDateTime(row.submittedAt)}`, onclick: () => handlers.remove(row) }, icon('trash'))));
  }

  function render(form, rows, state, handlers) {
    const questions = allFields(form).filter(isQuestion);
    const shown = rows.slice(0, state.limit);
    const more = rows.length - shown.length;
    return h('div', { class: 'table-block' },
      h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Responses table' },
        h('table', { class: 'responses-table' },
          h('thead', null, h('tr', null,
            headerCell('Submitted', 'submitted', state, handlers.refresh),
            questions.map((field) => headerCell(field.label, field.id, state, handlers.refresh)),
            h('th', { scope: 'col', class: 'cell-actions' }, h('span', { class: 'sr-only' }, 'Actions')))),
          h('tbody', null, shown.map((row) => bodyRow(questions, row, handlers))))),
      more > 0 ? h('button', {
        class: 'btn table-more', type: 'button',
        onclick: () => { state.limit += PAGE_SIZE; handlers.refresh(); },
      }, `Show ${Math.min(more, PAGE_SIZE).toLocaleString('en-US')} more of ${more.toLocaleString('en-US')}`) : null);
  }

  return { render };
})();
