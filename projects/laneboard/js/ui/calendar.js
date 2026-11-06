// Month view of due dates. Wide screens show titles in each day; phones show marks in the grid
// and a readable agenda under it, since a 50px cell can't hold a title.
const CalendarView = (() => {
  const { h, icon, iconButton } = Dom;
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function chip(project, card, today) {
    const overdue = Model.isOverdue(project, card, today);
    const finished = Model.isFinished(project, card.id);
    const className = `cal-chip${overdue ? ' is-overdue' : ''}${finished ? ' is-finished' : ''}`;
    return h('button', { type: 'button', class: className, title: card.title, 'data-fkey': `cal-${card.id}`, onClick: () => App.openCard(card.id) },
      Parts.priorityBars(card.priority), h('span', { class: 'cal-chip-title' }, card.title));
  }

  function dayCell(day, month, cardsByDay, project, today) {
    const cards = cardsByDay.get(day) || [];
    const number = Number(day.slice(8));
    const className = `cal-day${Dates.monthOf(day) !== month ? ' is-outside' : ''}${day === today ? ' is-today' : ''}`;
    return h('td', { class: className, 'data-date': day },
      h('div', { class: 'cal-day-head' },
        h('span', { class: 'cal-date', 'aria-label': Dates.formatLong(day) }, number),
        iconButton('plus', `Add card due ${Dates.formatLong(day)}`, () => Forms.openCard({ due: day }), { class: 'cal-add', 'data-fkey': `cal-add-${day}` })),
      h('div', { class: 'cal-chips' }, cards.map((card) => chip(project, card, today))),
      cards.length ? h('div', { class: 'cal-marks', 'aria-hidden': 'true' }, cards.slice(0, 4).map((card) => h('span', { class: `cal-mark${Model.isOverdue(project, card, today) ? ' is-overdue' : ''}` }))) : null);
  }

  function agenda(month, cards, project, today) {
    const inMonth = cards.filter((card) => Dates.monthOf(card.due) === month).sort((a, b) => a.due.localeCompare(b.due) || a.number - b.number);
    if (!inMonth.length) return h('p', { class: 'cal-agenda muted' }, 'Nothing is due this month.');
    return h('ul', { class: 'cal-agenda' }, inMonth.map((card) => h('li', null,
      h('button', { type: 'button', class: 'agenda-row', onClick: () => App.openCard(card.id) },
        h('span', { class: 'agenda-date' }, Dates.formatShort(card.due)),
        h('span', { class: 'agenda-title' }, card.title),
        Model.isOverdue(project, card, today) ? h('span', { class: 'agenda-flag' }, icon('alert', 13), 'Overdue') : null))));
  }

  function render(container, ctx) {
    const { project, ui, today } = ctx;
    const month = ui.month || Dates.monthOf(today);
    const shown = ctx.visibleCards();
    const dated = shown.filter((card) => card.due);
    const cardsByDay = new Map();
    dated.slice().sort((a, b) => Model.priority(a.priority).rank - Model.priority(b.priority).rank || a.number - b.number).forEach((card) => {
      cardsByDay.set(card.due, [...(cardsByDay.get(card.due) || []), card]);
    });
    const undated = shown.length - dated.length;
    const inMonth = dated.filter((card) => Dates.monthOf(card.due) === month).length;
    const go = (next) => { ui.month = next; App.renderView(); };

    const head = h('div', { class: 'cal-head' },
      iconButton('left', 'Previous month', () => go(Dates.shiftMonth(month, -1)), { 'data-fkey': 'cal-prev' }),
      iconButton('right', 'Next month', () => go(Dates.shiftMonth(month, 1)), { 'data-fkey': 'cal-next' }),
      h('h2', { class: 'cal-month', 'aria-live': 'polite' }, Dates.monthLabel(month)),
      h('button', { type: 'button', class: 'btn btn-small', 'data-fkey': 'cal-today', onClick: () => go(Dates.monthOf(today)) }, 'Today'),
      h('p', { class: 'cal-summary muted' }, `${inMonth} due this month${undated ? `, ${undated} with no due date` : ''}`));

    const table = h('table', { class: 'cal-grid' },
      h('thead', null, h('tr', null, WEEKDAYS.map((d) => h('th', { scope: 'col' }, d)))),
      h('tbody', null, Dates.monthWeeks(month).map((week) => h('tr', null, week.map((day) => dayCell(day, month, cardsByDay, project, today))))));

    container.replaceChildren(h('div', { class: 'calendar', 'data-scroll-key': 'calendar' }, head, table, agenda(month, dated, project, today)));
  }

  return { render };
})();
