// Week grid: see a whole week at a glance and backfill past days. Arrow keys move between cells.
(function (R) {
  'use strict';
  const { h, icon, iconButton, button } = R.dom;
  const D = R.Dates;
  const Sel = R.Select;
  const Store = R.Store;

  const STATUS_TEXT = {
    done: 'done', partial: 'partly done', skipped: 'skipped', rest: 'not needed',
    due: 'not logged yet', open: 'not logged', missed: 'not logged', before: 'before the start date',
  };

  /** Yes/no habits cycle empty, done, skipped. Measurable habits open the exact-value dialog. */
  function activateCell(habit, date) {
    if (habit.target.type === 'count') { R.ui.openLogDialog(habit, date); return; }
    const entry = Store.logFor(habit.id)[date];
    if (!entry) Store.setEntry(habit.id, date, { value: 1 });
    else if (entry.skipped) Store.setEntry(habit.id, date, null);
    else Store.setEntry(habit.id, date, { skipped: true });
  }

  function cellContent(habit, status, entry) {
    if (status === 'skipped') return icon('skip', 15);
    if (status === 'rest' || status === 'before') return h('span', { class: 'cell-dot' });
    if (habit.target.type === 'count' && entry && entry.value) return h('span', { class: 'cell-value' }, Sel.formatValue(entry.value));
    if (status === 'done') return icon('check', 16);
    return null;
  }

  function cell(habit, date, rowIndex, colIndex) {
    const status = Sel.dayStatus(habit, date);
    if (status === 'future') return h('td', { class: 'grid-cell', role: 'gridcell' }, h('span', { class: 'cell cell-future' }));
    const entry = Store.logFor(habit.id)[date];
    const detail = entry && entry.value && habit.target.type === 'count' ? `, ${Sel.formatValue(entry.value)} of ${Sel.describeGoal(habit)}` : '';
    return h('td', { class: 'grid-cell', role: 'gridcell' },
      h('button', {
        type: 'button',
        class: `cell cell-${status}`,
        tabindex: '-1',
        title: `${habit.name}, ${D.formatWeekday(date)}: ${STATUS_TEXT[status]}${detail}`,
        'aria-label': `${habit.name}, ${D.formatWeekday(date)}: ${STATUS_TEXT[status]}${detail}`,
        data: { row: rowIndex, col: colIndex, date, fk: `cell-${habit.id}-${date}` },
        onClick: () => activateCell(habit, date),
      }, cellContent(habit, status, entry)));
  }

  function moveFocus(event) {
    const steps = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
    const from = event.target.closest('button.cell');
    if (!steps || !from) return;
    event.preventDefault();
    const grid = event.currentTarget;
    const next = grid.querySelector(`button.cell[data-row="${+from.dataset.row + steps[0]}"][data-col="${+from.dataset.col + steps[1]}"]`);
    if (next) focusCell(grid, next);
  }

  function focusCell(grid, target) {
    grid.querySelectorAll('button.cell[tabindex="0"]').forEach((b) => b.setAttribute('tabindex', '-1'));
    target.setAttribute('tabindex', '0');
    target.focus();
  }

  function dayHeader(date, today) {
    return h('th', { scope: 'col', class: date === today ? 'col-today' : '' },
      h('span', { class: 'col-day' }, D.dayShort(D.weekday(date))),
      h('span', { class: 'col-date' }, D.dayOfMonth(date)));
  }

  function habitRow(habit, days, rowIndex, weekFrom, today) {
    const { done, expected } = R.Stats.weekProgress(habit, Sel.info(habit).log, weekFrom, today, Sel.weekStart());
    const { current } = Sel.info(habit).streaks;
    return h('tr', { data: { habit: habit.id } },
      h('th', { scope: 'row', class: 'grid-name' },
        h('a', { href: `#/habit/${encodeURIComponent(habit.id)}`, title: habit.name }, habit.name),
        h('span', { class: 'row-meta' }, R.Schedule.describe(habit.schedule, Sel.weekStart()))),
      days.map((date, i) => cell(habit, date, rowIndex, i)),
      h('td', { class: 'grid-num', data: { testid: 'week-progress' } }, expected ? `${done} of ${expected}` : '-'),
      h('td', { class: 'grid-num', data: { testid: 'week-streak' } }, Sel.formatStreak(habit, current)));
  }

  function legend() {
    const item = (cls, text, content) => h('span', { class: 'legend-item' }, h('span', { class: `cell cell-static ${cls}` }, content), text);
    return h('div', { class: 'grid-legend', 'aria-hidden': 'true' },
      item('cell-done', 'Done', icon('check', 13)),
      item('cell-partial', 'Part done', null),
      item('cell-skipped', 'Skipped', icon('skip', 12)),
      item('cell-rest', 'Not needed', h('span', { class: 'cell-dot' })),
      item('cell-open', 'Not logged', null));
  }

  function grid(habits, days, weekFrom, today) {
    const table = h('table', { class: 'week-grid', role: 'grid', 'aria-label': `Habits for ${D.formatRange(days[0], days[6])}`, onKeydown: moveFocus },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', class: 'grid-name' }, 'Habit'),
        days.map((date) => dayHeader(date, today)),
        h('th', { scope: 'col', class: 'grid-num' }, 'Week'),
        h('th', { scope: 'col', class: 'grid-num' }, 'Streak'))),
      h('tbody', {}, habits.map((habit, i) => habitRow(habit, days, i, weekFrom, today))));
    const entry = table.querySelector(`button.cell[data-date="${today}"]`) || table.querySelector('button.cell');
    if (entry) entry.setAttribute('tabindex', '0');
    return table;
  }

  /** On a narrow screen the grid scrolls, so bring today's column into view on arrival. */
  function revealToday(scroller, today) {
    requestAnimationFrame(() => {
      const cellEl = scroller.querySelector(`button.cell[data-date="${today}"]`);
      if (!cellEl || scroller.scrollLeft) return;
      const overflow = cellEl.getBoundingClientRect().right - scroller.getBoundingClientRect().right;
      if (overflow > 0) scroller.scrollLeft = overflow + 12;
    });
  }

  function render(params) {
    const today = Sel.today();
    const weekStart = Sel.weekStart();
    const anchor = D.isValid(params[0]) && params[0] <= today ? params[0] : today;
    const weekFrom = D.startOfWeek(anchor, weekStart);
    const days = D.eachDay(weekFrom, D.addDays(weekFrom, 6));
    const isCurrent = weekFrom === D.startOfWeek(today, weekStart);
    const nextWeek = D.addDays(weekFrom, 7);
    const habits = Sel.activeHabits();
    const scroller = h('div', { class: 'scroll-x', data: { scrollKey: 'week-grid' } }, habits.length ? grid(habits, days, weekFrom, today) : null);
    if (isCurrent) revealToday(scroller, today);

    return h('div', { class: 'view view-week' },
      h('header', { class: 'view-head' },
        h('div', {}, h('h1', {}, D.formatRange(days[0], days[6])),
          h('p', { class: 'muted' }, 'Click any past day to fill it in. Yes or no habits cycle through done, skipped and empty.')),
        h('div', { class: 'head-actions' },
          iconButton('left', 'Previous week', () => { location.hash = `#/week/${D.addDays(weekFrom, -7)}`; }, { data: { fk: 'week-prev' } }),
          button('This week', () => { location.hash = '#/week'; }, { disabled: isCurrent, data: { fk: 'week-now' } }),
          iconButton('right', 'Next week', () => { location.hash = `#/week/${nextWeek}`; }, { disabled: isCurrent, data: { fk: 'week-next' } }))),
      habits.length
        ? h('div', { class: 'card card-flush' }, scroller)
        : h('div', { class: 'empty' }, h('h2', {}, 'No active habits'), h('p', { class: 'muted' }, 'Add a habit and it will appear in this grid.'),
          h('button', { type: 'button', class: 'btn btn-primary', onClick: () => R.ui.openHabitForm(null) }, icon('plus', 16), 'Add habit')),
      habits.length ? legend() : null);
  }

  R.views = R.views || {};
  R.views.week = { render, title: 'Week' };
})(window.Rhythm);
