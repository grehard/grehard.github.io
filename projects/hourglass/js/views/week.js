// Week timesheet: projects down the side, days across, every cell editable. A cell edit changes real entries.
(function (HG) {
  'use strict';
  const { h, icon } = HG;
  const T = HG.time;
  const C = HG.calc;
  const addedRows = new Map();

  function weekData(state, days) {
    const rows = new Map();
    const dayTotals = new Map(days.map((d) => [d, 0]));
    const ensure = (id) => { if (!rows.has(id)) rows.set(id, { projectId: id, cells: new Map() }); return rows.get(id); };
    state.entries.forEach((entry) => {
      days.forEach((day) => {
        const ms = C.msInDay(entry, day);
        if (!ms) return;
        const row = ensure(entry.projectId);
        row.cells.set(day, (row.cells.get(day) || 0) + ms);
        dayTotals.set(day, dayTotals.get(day) + ms);
      });
    });
    return { rows, dayTotals, ensure };
  }

  function weekMoney(state, days) {
    const f = { ...HG.report.defaultFilters(state), from: days[0], to: days[6], billable: 'yes' };
    return HG.report.compute(state, f).totals;
  }

  function sortRows(rows, state) {
    const maps = C.lookups(state);
    const labelOf = (row) => {
      const project = maps.project.get(row.projectId);
      const client = project ? maps.client.get(project.clientId) : null;
      return `${client ? client.name : '￿'} ${project ? project.name : '￿'}`;
    };
    return [...rows.values()].sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
  }

  /** Applies a typed cell value. Whatever it does, the toast can undo it. */
  function commitCell(input, projectId, day) {
    const shown = input.dataset.shown;
    const typed = input.value.trim();
    if (typed === shown) { input.removeAttribute('aria-invalid'); return; }
    const ms = T.parseDuration(typed);
    const messageNode = document.getElementById('week-message');
    if (ms === null || ms > 24 * T.HOUR) {
      input.setAttribute('aria-invalid', 'true');
      messageNode.textContent = ms === null
        ? `"${typed.slice(0, 20)}" isn't a duration. Try 1:30, 1.5 or 90m.`
        : "A cell can't hold more than 24 hours.";
      messageNode.hidden = false;
      return;
    }
    messageNode.hidden = true;
    input.removeAttribute('aria-invalid');
    const { state } = HG.store;
    const project = state.projects.find((p) => p.id === projectId) || null;
    const billable = project ? project.billable : state.settings.defaultBillable;
    const before = HG.budget.alerts(state, Date.now());
    const result = C.setCellTotal({
      entries: state.entries, projectId, day, targetMs: ms, newId: () => HG.store.newId('e'),
      makeEntry: (start, end) => ({ id: HG.store.newId('e'), description: 'Timesheet entry', projectId, tagIds: [], billable, start, end, focus: false }),
    });
    const name = project ? project.name : 'No project';
    HG.ui.undoable(`${name}, ${T.shortWeekday(day)} ${T.dayOfMonth(day)}: ${shown || '0:00'} changed to ${T.duration(ms)}`, (s) => { s.entries = result.entries; });
    if (result.overlapped) HG.ui.toast('That day was too full to fit this time without overlapping another entry.', { kind: 'alert' });
    HG.timer.announceBudgets(before);
  }

  function moveFocus(input, rowDelta, colDelta) {
    const row = Number(input.dataset.row) + rowDelta;
    const col = Number(input.dataset.col) + colDelta;
    const target = document.querySelector(`.ts-cell[data-row="${row}"][data-col="${col}"]`);
    if (target) { target.focus(); target.select(); }
  }

  function cellInput(row, rowIndex, day, colIndex, projectName) {
    const ms = row.cells.get(day) || 0;
    const shown = ms ? T.duration(ms) : '';
    const key = `cell-${rowIndex}-${colIndex}`;
    const input = h('input', {
      type: 'text', inputmode: 'text', class: 'ts-cell', value: shown, 'data-shown': shown, 'data-row': rowIndex, 'data-col': colIndex, 'data-fk': key,
      'data-project': row.projectId || '', 'data-day': day, 'aria-label': `${projectName}, ${T.longDate(day)}`, autocomplete: 'off',
      onfocus: (e) => e.target.select(),
      onchange: (e) => commitCell(e.target, row.projectId, day),
      onkeydown: (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); moveFocus(input, 1, 0); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(input, 1, 0); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(input, -1, 0); }
        else if (e.key === 'ArrowLeft' && input.selectionStart === 0) moveFocus(input, 0, -1);
        else if (e.key === 'ArrowRight' && input.selectionEnd === input.value.length) moveFocus(input, 0, 1);
        else if (e.key === 'Escape') { input.value = shown; input.removeAttribute('aria-invalid'); input.blur(); }
      },
    });
    return h('td', { class: day === T.today() ? 'is-today' : null }, input);
  }

  function rowLabel(row, state, maps) {
    const project = maps.project.get(row.projectId);
    const client = project ? maps.client.get(project.clientId) : null;
    return h('th', { scope: 'row', class: 'ts-project' },
      h('div', { class: 'ts-project-inner' }, HG.ui.dot(project ? project.color : null),
        h('div', { class: 'ts-project-text' },
          h('span', { class: 'ts-project-name', title: project ? project.name : 'No project' }, project ? project.name : 'No project'),
          client && h('span', { class: 'ts-client', title: client.name }, client.name))));
  }

  function addRowControl(state, weekKey, shownIds) {
    const available = state.projects.filter((p) => !shownIds.has(p.id));
    if (!available.length) return null;
    const select = h('select', { id: 'week-add-row', 'aria-label': 'Add project row', onchange: (e) => {
      if (!e.target.value) return;
      const extra = addedRows.get(weekKey) || new Set();
      extra.add(e.target.value);
      addedRows.set(weekKey, extra);
      HG.app.render();
    } }, h('option', { value: '' }, 'Add project row'),
    available.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => h('option', { value: p.id }, p.name)));
    return select;
  }

  function render(params) {
    const { state } = HG.store;
    const anchor = params[0] && !Number.isNaN(T.dayStart(params[0])) ? params[0] : T.today();
    const weekKey = T.weekStart(anchor, state.settings.weekStart);
    const days = Array.from({ length: 7 }, (_, i) => T.addDays(weekKey, i));
    const data = weekData(state, days);
    (addedRows.get(weekKey) || new Set()).forEach((id) => { if (state.projects.some((p) => p.id === id)) data.ensure(id); });
    const rows = sortRows(data.rows, state);
    const maps = C.lookups(state);
    const totals = weekMoney(state, days);
    const allMs = days.reduce((sum, d) => sum + data.dayTotals.get(d), 0);
    const today = T.today();

    const headRow = h('tr', null, h('th', { scope: 'col', class: 'ts-project' }, 'Project'),
      days.map((d) => h('th', { scope: 'col', class: `ts-day${d === today ? ' is-today' : ''}` }, h('span', { class: 'ts-weekday' }, T.shortWeekday(d)), h('span', { class: 'ts-date' }, T.shortDate(d)))),
      h('th', { scope: 'col', class: 'ts-total' }, 'Total'));

    const bodyRows = rows.map((row, rowIndex) => {
      const project = maps.project.get(row.projectId);
      const name = project ? project.name : 'No project';
      const rowMs = days.reduce((sum, d) => sum + (row.cells.get(d) || 0), 0);
      return h('tr', { 'data-row-project': name }, rowLabel(row, state, maps),
        days.map((d, colIndex) => cellInput(row, rowIndex, d, colIndex, name)),
        h('td', { class: 'ts-total' }, T.duration(rowMs)));
    });

    const footRow = h('tr', { id: 'week-totals' }, h('th', { scope: 'row', class: 'ts-project' }, 'Total'),
      days.map((d) => h('td', { class: `ts-foot${d === today ? ' is-today' : ''}`, 'data-day-total': d }, T.duration(data.dayTotals.get(d)))),
      h('td', { class: 'ts-total', id: 'week-grand-total' }, T.duration(allMs)));

    const rounding = state.settings.roundingMinutes
      ? `Billing rounds each entry ${state.settings.roundingMode === 'nearest' ? 'to the nearest' : 'up to the next'} ${state.settings.roundingMinutes} minutes.`
      : 'Billing uses exact time.';

    return h('div', { class: 'week-view' },
      h('div', { class: 'view-head' },
        h('div', { class: 'date-nav' },
          h('a', { class: 'icon-btn', href: `#/week/${T.addDays(weekKey, -7)}`, 'aria-label': 'Previous week', title: 'Previous week', id: 'week-prev' }, icon('left')),
          h('a', { class: 'icon-btn', href: `#/week/${T.addDays(weekKey, 7)}`, 'aria-label': 'Next week', title: 'Next week', id: 'week-next' }, icon('right')),
          h('h1', { id: 'week-title' }, T.rangeLabel(days[0], days[6])),
          weekKey !== T.weekStart(today, state.settings.weekStart) && h('a', { class: 'btn', href: '#/week' }, 'This week')),
        h('div', { class: 'stats' },
          HG.ui.stat('Tracked', T.duration(allMs)),
          HG.ui.stat('Billable', T.duration(totals.billableMs), { id: 'week-billable' }),
          HG.ui.stat('Amount', C.money(C.toCents(totals.exact), state.settings.currency), { id: 'week-amount' })),
        h('a', { class: 'btn', id: 'week-print', href: `#/print/${days[0]}/${days[6]}` }, icon('print'), 'Print timesheet')),
      h('p', { class: 'field-error', id: 'week-message', role: 'alert', hidden: true }),
      h('div', { class: 'panel ts-wrap', tabindex: '0', role: 'group', 'aria-label': 'Timesheet grid' },
        h('table', { class: 'ts-table', id: 'timesheet' }, h('thead', null, headRow), h('tbody', null, bodyRows), h('tfoot', null, footRow))),
      rows.length === 0 && HG.ui.emptyState('No time this week', 'Add a project row, then type hours into any day.'),
      h('div', { class: 'week-foot' },
        addRowControl(state, weekKey, new Set(rows.map((r) => r.projectId))),
        h('p', { class: 'hint' }, `Cells show tracked time. Type 1:30, 1.5 or 90m, and clear a cell to remove its time. ${rounding}`)));
  }

  HG.views = HG.views || {};
  HG.views.week = { render };
})(window.HG);
