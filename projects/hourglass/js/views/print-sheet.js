// Printable timesheet. The screen shows a paper preview, and print CSS hides everything around it.
(function (HG) {
  'use strict';
  const { h, icon } = HG;
  const T = HG.time;
  const C = HG.calc;
  let options = { clientId: 'all', billableOnly: false };

  function dayTable(day, lines, state, maps) {
    const currency = state.settings.currency;
    const sumRounded = lines.reduce((sum, l) => sum + l.roundedMs, 0);
    const sumExact = lines.reduce((sum, l) => sum + l.exact, 0);
    return [
      h('tr', { class: 'sheet-day' }, h('th', { colspan: 7, scope: 'rowgroup' }, T.longDate(day))),
      lines.map((line) => {
        const info = HG.ui.projectLabel(state, line.entry, maps);
        return h('tr', { class: 'sheet-line' },
          h('td', { class: 'nowrap' }, `${T.timeOfDay(line.start)} to ${T.timeOfDay(line.end)}`),
          h('td', null, line.entry.description || 'Untitled entry'),
          h('td', null, info.project),
          h('td', { class: 'num' }, T.duration(line.rawMs)),
          h('td', { class: 'num' }, T.duration(line.roundedMs)),
          h('td', { class: 'num' }, line.entry.billable ? C.money(line.rateCents, currency) : '-'),
          h('td', { class: 'num' }, line.entry.billable ? C.money(C.toCents(line.exact), currency) : '-'));
      }),
      h('tr', { class: 'sheet-subtotal' }, h('td', { colspan: 4 }, 'Day total'), h('td', { class: 'num' }, T.duration(sumRounded)), h('td'), h('td', { class: 'num' }, C.money(C.toCents(sumExact), currency))),
    ];
  }

  function render(params) {
    const { state } = HG.store;
    const fallbackFrom = T.weekStart(T.today(), state.settings.weekStart);
    const from = params[0] && !Number.isNaN(T.dayStart(params[0])) ? params[0] : fallbackFrom;
    const to = params[1] && !Number.isNaN(T.dayStart(params[1])) ? params[1] : T.addDays(fallbackFrom, 6);
    const filters = { ...HG.report.defaultFilters(state), from, to, clientId: options.clientId, billable: options.billableOnly ? 'yes' : 'all' };
    const report = HG.report.compute(state, filters);
    const maps = C.lookups(state);
    const client = maps.client.get(options.clientId);
    const currency = state.settings.currency;
    const days = [...new Set(report.rows.map((l) => l.day))].sort();
    const go = (a, b) => { location.hash = `#/print/${a}/${b}`; };
    const rounding = state.settings.roundingMinutes
      ? `Time is billed in ${state.settings.roundingMinutes}-minute increments, rounded ${state.settings.roundingMode === 'nearest' ? 'to the nearest increment' : 'up'} per entry.`
      : 'Time is billed exactly as tracked.';

    return h('div', { class: 'print-view' },
      h('div', { class: 'print-controls no-print' },
        h('div', { class: 'view-head' }, h('h1', null, 'Printable timesheet'),
          h('button', { type: 'button', class: 'btn btn-primary', id: 'print-now', onclick: () => window.print() }, icon('print'), 'Print')),
        h('form', { class: 'filters', onsubmit: (e) => e.preventDefault(), 'aria-label': 'Timesheet options' },
          HG.ui.field('From', h('input', { type: 'date', id: 'print-from', value: from, onchange: (e) => { if (e.target.value) go(e.target.value, to); } })),
          HG.ui.field('To', h('input', { type: 'date', id: 'print-to', value: to, onchange: (e) => { if (e.target.value) go(from, e.target.value); } })),
          HG.ui.field('Client', h('select', { id: 'print-client', onchange: (e) => { options = { ...options, clientId: e.target.value }; HG.app.render(); } },
            h('option', { value: 'all', selected: options.clientId === 'all' }, 'All clients'),
            state.clients.map((c) => h('option', { value: c.id, selected: options.clientId === c.id }, c.name)))),
          h('label', { class: 'check filters-check' }, h('input', { type: 'checkbox', id: 'print-billable', checked: options.billableOnly, onchange: (e) => { options = { ...options, billableOnly: e.target.checked }; HG.app.render(); } }), 'Billable only'))),
      h('article', { class: 'sheet', id: 'timesheet-sheet' },
        h('header', { class: 'sheet-head' },
          h('div', null, h('h2', null, 'Timesheet'), h('p', null, T.rangeLabel(from, to))),
          h('dl', { class: 'sheet-meta' },
            h('div', null, h('dt', null, 'Prepared by'), h('dd', null, state.settings.name || 'Add your name in Settings')),
            h('div', null, h('dt', null, 'Client'), h('dd', null, client ? client.name : 'All clients')))),
        days.length
          ? h('div', { class: 'sheet-table-wrap' }, h('table', { class: 'sheet-table', id: 'sheet-table' },
            h('thead', null, h('tr', null, ['Time', 'Description', 'Project'].map((label) => h('th', { scope: 'col' }, label)),
              ['Tracked', 'Rounded', 'Rate', 'Amount'].map((label) => h('th', { scope: 'col', class: 'num' }, label)))),
            h('tbody', null, days.map((day) => dayTable(day, report.rows.filter((l) => l.day === day), state, maps)))))
          : HG.ui.emptyState('No time in this period', 'Pick another period above.'),
        h('div', { class: 'sheet-totals', id: 'sheet-totals' },
          h('div', null, h('span', null, 'Tracked'), h('strong', null, T.duration(report.totals.rawMs))),
          h('div', null, h('span', null, 'Billable hours'), h('strong', null, T.duration(report.totals.billableMs))),
          h('div', null, h('span', null, 'Amount due'), h('strong', { id: 'sheet-amount' }, C.money(C.toCents(report.totals.exact), currency)))),
        h('p', { class: 'sheet-note' }, rounding),
        h('div', { class: 'sheet-sign' }, h('div', null, 'Approved by'), h('div', null, 'Date'))));
  }

  /** Lets the report's Print button carry its client filter across. */
  function useClient(clientId) {
    const known = HG.store.state.clients.some((c) => c.id === clientId);
    options = { ...options, clientId: known ? clientId : 'all' };
  }

  HG.views = HG.views || {};
  HG.views.print = { render, useClient };
})(window.HG);
