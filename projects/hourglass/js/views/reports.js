// Reports: filters at the top, totals, two charts, a summary table and the matching entries.
(function (HG) {
  'use strict';
  const { h, icon } = HG;
  const T = HG.time;
  const C = HG.calc;
  const R = HG.report;
  const MAX_STACKS = 7;
  const ENTRY_PAGE = 100;
  const BILLABLE_COLOR = '#C2470A';
  const NON_BILLABLE_COLOR = '#8C897F';
  let filters = null;
  let entryLimit = ENTRY_PAGE;

  function current() {
    if (!filters) filters = R.defaultFilters(HG.store.state);
    return filters;
  }

  function setFilter(change) {
    Object.assign(current(), change);
    entryLimit = ENTRY_PAGE;
    HG.app.render();
  }

  /** Opens the report scoped to one project, used by the Projects page. */
  function showProject(projectId) {
    const { state } = HG.store;
    const starts = state.entries.filter((e) => e.projectId === projectId).map((e) => e.start);
    const from = starts.length ? T.dayKey(Math.min(...starts)) : T.today();
    filters = { ...R.defaultFilters(state), preset: 'all', from, to: T.today(), projectId };
    entryLimit = ENTRY_PAGE;
    location.hash = '#/reports';
  }

  function resetFilters() {
    filters = null;
    entryLimit = ENTRY_PAGE;
  }

  const PRESETS = [
    ['week', 'This week'], ['last-week', 'Last week'], ['month', 'This month'], ['last-month', 'Last month'],
    ['days-30', 'Last 30 days'], ['days-90', 'Last 90 days'], ['custom', 'Custom range'],
  ];

  function applyPreset(preset) {
    if (preset === 'custom') { setFilter({ preset }); return; }
    setFilter({ preset, ...R.presetRange(preset, T.today(), HG.store.state.settings.weekStart) });
  }

  function filterBar(state, f) {
    const opt = (value, label, selected) => h('option', { value, selected: value === selected }, label);
    const visibleProjects = state.projects.filter((p) => f.clientId === 'all' || (p.clientId || 'none') === f.clientId);
    const select = (id, label, value, options, onChange) => HG.ui.field(label, h('select', { id, 'data-fk': id, onchange: (e) => onChange(e.target.value) }, options));
    const dateChange = (key) => (e) => { if (e.target.value) setFilter({ [key]: e.target.value, preset: 'custom' }); };
    const presetOptions = PRESETS.map(([value, label]) => opt(value, label, f.preset));
    if (f.preset === 'all') presetOptions.unshift(opt('all', 'All time', f.preset));
    return h('form', { class: 'filters', id: 'report-filters', onsubmit: (e) => e.preventDefault(), 'aria-label': 'Report filters' },
      select('filter-preset', 'Period', f.preset, presetOptions, applyPreset),
      HG.ui.field('From', h('input', { type: 'date', id: 'filter-from', 'data-fk': 'filter-from', value: f.from, onchange: dateChange('from') })),
      HG.ui.field('To', h('input', { type: 'date', id: 'filter-to', 'data-fk': 'filter-to', value: f.to, onchange: dateChange('to') })),
      select('filter-client', 'Client', f.clientId, [opt('all', 'All clients', f.clientId), opt('none', 'No client', f.clientId),
        state.clients.map((c) => opt(c.id, c.name, f.clientId))], (clientId) => setFilter({ clientId, projectId: 'all' })),
      select('filter-project', 'Project', f.projectId, [opt('all', 'All projects', f.projectId), opt('none', 'No project', f.projectId),
        visibleProjects.map((p) => opt(p.id, p.name, f.projectId))], (projectId) => setFilter({ projectId })),
      select('filter-tag', 'Tag', f.tagId, [opt('all', 'All tags', f.tagId), state.tags.map((t) => opt(t.id, t.name, f.tagId))], (tagId) => setFilter({ tagId })),
      select('filter-billable', 'Billable', f.billable, [opt('all', 'All', f.billable), opt('yes', 'Billable', f.billable), opt('no', 'Non-billable', f.billable)], (billable) => setFilter({ billable })),
      HG.ui.field('Search', h('input', { type: 'search', id: 'filter-search', 'data-fk': 'filter-search', value: f.search, placeholder: 'Description',
        oninput: (e) => { Object.assign(current(), { search: e.target.value }); entryLimit = ENTRY_PAGE; HG.app.render(); } })));
  }

  function groupToggle(f) {
    const button = (value, label) => h('button', { type: 'button', class: 'seg-btn', id: `group-${value}`, 'aria-pressed': String(f.groupBy === value), 'data-fk': `group-${value}`, onclick: () => setFilter({ groupBy: value }) }, label);
    return h('div', { class: 'segmented', role: 'group', 'aria-label': 'Group by' }, button('project', 'By project'), button('day', 'By day'));
  }

  /** Top projects keep their own color. The rest fold into "Other", so a stack never needs a ninth color. */
  function stackSeries(report) {
    const groups = R.groupByProject(report.rows, HG.store.state);
    const top = groups.slice(0, MAX_STACKS);
    const series = top.map((g) => ({ key: g.key, name: g.label, color: g.color }));
    if (groups.length > MAX_STACKS) series.push({ key: '__other', name: 'Other projects', color: HG.charts.OTHER_COLOR });
    const keys = new Set(top.map((g) => g.key));
    return { series, keyOf: (line) => (keys.has(line.entry.projectId || 'none') ? line.entry.projectId || 'none' : '__other') };
  }

  function bucketize(report, f, state) {
    const buckets = R.buckets(f, state.settings.weekStart).map((b) => ({ ...b, lines: [] }));
    let index = 0;
    report.rows.slice().sort((a, b) => (a.day < b.day ? -1 : 1)).forEach((line) => {
      while (index < buckets.length - 1 && line.day > buckets[index].to) index++;
      buckets[index].lines.push(line);
    });
    return buckets;
  }

  const hoursAxis = (value) => `${Math.round(value * 10) / 10}h`;
  const durationOf = (hours) => T.duration(hours * T.HOUR);

  function bucketTitle(b) {
    return b.kind === 'day' ? T.longDate(b.key) : T.rangeLabel(b.from, b.to);
  }

  function hoursChart(report, f, state) {
    const buckets = bucketize(report, f, state);
    const byBillable = f.groupBy === 'day';
    const stack = stackSeries(report);
    const series = byBillable
      ? [{ key: 'yes', name: 'Billable', color: BILLABLE_COLOR }, { key: 'no', name: 'Non-billable', color: NON_BILLABLE_COLOR }]
      : stack.series;
    const keyOf = byBillable ? (line) => (line.entry.billable ? 'yes' : 'no') : stack.keyOf;
    const items = buckets.map((b) => {
      const sums = new Map();
      b.lines.forEach((line) => sums.set(keyOf(line), (sums.get(keyOf(line)) || 0) + line.roundedMs));
      const segments = series.map((one) => {
        const hours = (sums.get(one.key) || 0) / T.HOUR;
        return { color: one.color, name: one.name, value: hours, display: durationOf(hours) };
      });
      return { label: b.label, title: bucketTitle(b), segments, total: segments.reduce((sum, seg) => sum + seg.value, 0) };
    });
    const totalText = T.duration(report.totals.roundedMs);
    return { legend: HG.charts.legend(series), slot: HG.charts.responsive((width) => HG.charts.columns(width, {
      items, format: hoursAxis, ariaLabel: `Hours per ${buckets[0] ? buckets[0].kind : 'day'}, ${totalText} in total. The same numbers are in the table below.`,
    })) };
  }

  function projectBars(report, state) {
    const groups = R.groupByProject(report.rows, state);
    const currency = state.settings.currency;
    const items = groups.map((g) => {
      const amount = C.money(C.toCents(g.exact), currency);
      const hours = T.duration(g.roundedMs);
      return {
        label: g.label, color: g.color, value: g.roundedMs, valueShort: hours, valueText: g.exact ? `${hours} · ${amount}` : hours,
        tip: [{ color: g.color, value: hours, label: 'hours' }, { value: amount, label: 'billable amount' }],
      };
    });
    return HG.charts.responsive((width) => HG.charts.bars(width, { items, ariaLabel: `Hours for ${groups.length} projects. The same numbers are in the table below.` }));
  }

  function amountLine(report, f, state) {
    const buckets = bucketize(report, f, state);
    const currency = state.settings.currency;
    let running = 0;
    const points = buckets.map((b) => {
      b.lines.forEach((line) => { running += line.exact; });
      const cents = C.toCents(running);
      return { label: b.label, title: bucketTitle(b), value: cents / 100, display: C.money(cents, currency) };
    });
    const axis = (value) => (value >= 10000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value)));
    return HG.charts.responsive((width) => HG.charts.line(width, {
      points, format: axis, color: BILLABLE_COLOR, ariaLabel: `Running total of billable amount, reaching ${points.length ? points[points.length - 1].display : 'zero'}.`,
    }));
  }

  function summaryTable(report, f, state) {
    const currency = state.settings.currency;
    const total = report.totals.roundedMs || 1;
    return h('div', { class: 'table-wrap', tabindex: '0', role: 'group', 'aria-label': 'Summary table' },
      h('table', { class: 'data-table', id: 'report-table' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, f.groupBy === 'day' ? 'Day' : 'Project'),
          h('th', { scope: 'col', class: 'num' }, 'Tracked'), h('th', { scope: 'col', class: 'num' }, 'Rounded'),
          h('th', { scope: 'col', class: 'num' }, 'Billable'), h('th', { scope: 'col', class: 'num' }, 'Amount'),
          h('th', { scope: 'col', class: 'num' }, 'Share'))),
        h('tbody', null, report.groups.map((g) => h('tr', { 'data-group': g.label },
          h('td', null, h('div', { class: 'cell-label' }, g.color && HG.ui.dot(g.color), h('span', null, g.label, g.sublabel && h('span', { class: 'cell-sub' }, g.sublabel)))),
          h('td', { class: 'num' }, T.duration(g.rawMs)), h('td', { class: 'num' }, T.duration(g.roundedMs)), h('td', { class: 'num' }, T.duration(g.billableMs)),
          h('td', { class: 'num' }, C.money(C.toCents(g.exact), currency)), h('td', { class: 'num' }, `${Math.round((g.roundedMs / total) * 100)}%`)))),
        h('tfoot', null, h('tr', { id: 'report-total-row' }, h('th', { scope: 'row' }, 'Total'),
          h('td', { class: 'num' }, T.duration(report.totals.rawMs)), h('td', { class: 'num' }, T.duration(report.totals.roundedMs)),
          h('td', { class: 'num' }, T.duration(report.totals.billableMs)), h('td', { class: 'num' }, C.money(C.toCents(report.totals.exact), currency)),
          h('td', { class: 'num' }, report.groups.length ? '100%' : '0%')))));
  }

  function entriesTable(report, state) {
    const maps = C.lookups(state);
    const rows = report.rows.slice().reverse();
    const shown = rows.slice(0, entryLimit);
    return h('div', null,
      h('div', { class: 'table-wrap', tabindex: '0', role: 'group', 'aria-label': 'Matching entries' },
        h('table', { class: 'data-table', id: 'report-entries' },
          h('thead', null, h('tr', null, ['Date', 'Time', 'Description', 'Project'].map((label) => h('th', { scope: 'col' }, label)),
            h('th', { scope: 'col', class: 'num' }, 'Rounded'), h('th', { scope: 'col', class: 'num' }, 'Amount'), h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Actions')))),
          h('tbody', null, shown.map((line) => {
            const info = HG.ui.projectLabel(state, line.entry, maps);
            const name = line.entry.description || 'Untitled entry';
            return h('tr', null,
              h('td', { class: 'nowrap' }, T.shortDate(line.day)),
              h('td', { class: 'nowrap' }, `${T.timeOfDay(line.start)} to ${T.timeOfDay(line.end)}`),
              h('td', { class: 'cell-wide' }, name),
              h('td', null, h('div', { class: 'cell-label' }, HG.ui.dot(info.color), h('span', null, info.project))),
              h('td', { class: 'num' }, T.duration(line.roundedMs)),
              h('td', { class: 'num' }, line.entry.billable ? C.money(C.toCents(line.exact), state.settings.currency) : '-'),
              h('td', null, HG.ui.iconButton('edit', `Edit ${name}`, () => HG.entryForm.open({ entry: line.entry }))));
          })))),
      rows.length > shown.length && h('button', { type: 'button', class: 'btn show-more', onclick: () => { entryLimit += ENTRY_PAGE * 5; HG.app.render(); } }, `Show more (${rows.length - shown.length} left)`));
  }

  function exportCsv(state, report, f) {
    HG.dom.downloadFile(`hourglass-report-${f.from}-to-${f.to}.csv`, 'text/csv;charset=utf-8', HG.exporter.toCsv(state, report.rows));
    HG.ui.toast(`Exported ${report.rows.length} rows to CSV`);
  }

  function render() {
    const { state } = HG.store;
    const f = current();
    const report = R.compute(state, f);
    const { totals } = report;
    const currency = state.settings.currency;
    const roundingNote = state.settings.roundingMinutes
      ? `Each entry is rounded ${state.settings.roundingMode === 'nearest' ? 'to the nearest' : 'up to the next'} ${state.settings.roundingMinutes} minutes.`
      : 'No rounding is applied. Change this in Settings.';
    const hasData = report.rows.length > 0;
    const hours = hasData && hoursChart(report, f, state);
    const invalidRange = f.from > f.to;

    return h('div', { class: 'reports-view' },
      h('div', { class: 'view-head' },
        h('h1', null, 'Reports'),
        h('p', { class: 'hint head-note' }, `${T.rangeLabel(f.from < f.to ? f.from : f.to, f.from < f.to ? f.to : f.from)}. ${roundingNote}`),
        h('div', { class: 'head-actions' },
          groupToggle(f),
          h('button', { type: 'button', class: 'btn', id: 'report-csv', disabled: !hasData, onclick: () => exportCsv(state, report, f) }, icon('download'), 'CSV'),
          h('a', { class: 'btn', id: 'report-print', href: `#/print/${f.from}/${f.to}`, onclick: () => HG.views.print.useClient(f.clientId) }, icon('print'), 'Print'))),
      filterBar(state, f),
      invalidRange && h('p', { class: 'field-error', role: 'alert' }, 'The start of the period is after its end.'),
      h('div', { class: 'stat-row', id: 'report-totals' },
        HG.ui.stat('Tracked', T.duration(totals.rawMs), { id: 'total-tracked' }),
        HG.ui.stat('Rounded', T.duration(totals.roundedMs), { id: 'total-rounded' }),
        HG.ui.stat('Billable', T.duration(totals.billableMs), { id: 'total-billable' }),
        HG.ui.stat('Non-billable', T.duration(totals.roundedMs - totals.billableMs), { id: 'total-nonbillable' }),
        HG.ui.stat('Billable amount', C.money(C.toCents(totals.exact), currency), { id: 'total-amount', class: 'stat stat-strong' })),
      hasData
        ? [
          h('div', { class: 'chart-grid' },
            h('section', { class: 'panel chart-panel', 'aria-label': 'Hours over time' },
              h('h2', null, f.groupBy === 'day' ? 'Hours per day, billable and non-billable' : 'Hours per day, by project'), hours.legend, hours.slot),
            h('section', { class: 'panel chart-panel', 'aria-label': f.groupBy === 'day' ? 'Running billable total' : 'Hours by project' },
              h('h2', null, f.groupBy === 'day' ? 'Billable amount, running total' : 'Hours and amount by project'),
              f.groupBy === 'day' ? amountLine(report, f, state) : projectBars(report, state))),
          h('section', { class: 'panel', 'aria-label': 'Summary' }, summaryTable(report, f, state)),
          h('section', { class: 'panel', 'aria-label': 'Entries' },
            h('h2', { class: 'panel-title' }, `Entries (${report.entries})`), entriesTable(report, state)),
        ]
        : h('section', { class: 'panel' }, HG.ui.emptyState('No time matches these filters', 'Widen the period or clear a filter to see results.',
          h('button', { type: 'button', class: 'btn', id: 'report-clear', onclick: () => { resetFilters(); HG.app.render(); } }, 'Clear filters'))));
  }

  HG.views = HG.views || {};
  HG.views.reports = { render, showProject, resetFilters };
})(window.HG);
