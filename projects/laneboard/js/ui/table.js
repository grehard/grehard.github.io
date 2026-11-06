// Every open card in one sortable list. Each sortable header is a button, so sorting works by keyboard.
const TableView = (() => {
  const { h, icon, iconButton } = Dom;

  const COLUMNS = [
    { key: 'key', label: 'Card', sortable: true },
    { key: 'title', label: 'Title', sortable: true },
    { key: 'lane', label: 'Lane', sortable: true },
    { key: 'assignee', label: 'Assignee', sortable: true },
    { key: 'priority', label: 'Priority', sortable: true },
    { key: 'due', label: 'Due', sortable: true },
    { key: 'checklist', label: 'Checklist', sortable: true },
    { key: 'labels', label: 'Labels', sortable: false },
    { key: 'actions', label: 'Actions', sortable: false, hiddenLabel: true },
  ];

  function headerCell(column, sort, onSort) {
    if (!column.sortable) return h('th', { scope: 'col' }, column.hiddenLabel ? h('span', { class: 'sr-only' }, column.label) : column.label);
    const active = sort.key === column.key;
    const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return h('th', { scope: 'col', 'aria-sort': ariaSort, 'data-sort-key': column.key },
      h('button', { type: 'button', class: `sort-btn${active ? ' is-active' : ''}`, 'data-fkey': `sort-${column.key}`, onClick: () => onSort(column.key) },
        column.label, active ? icon(sort.dir === 'asc' ? 'up' : 'down', 13) : null));
  }

  function row(entry, ctx) {
    const { card, column, assignee } = entry;
    const { project, state, today } = ctx;
    const labels = card.labelIds.map((id) => Model.labelById(state, id)).filter(Boolean);
    const progress = Model.checklistProgress(card);
    const menuButton = iconButton('more', `Move to, for ${Model.cardKey(project, card)}`, () => BoardView.openCardMenu(menuButton, card.id), {
      'aria-haspopup': 'menu', 'data-fkey': `row-menu-${card.id}`,
    });
    return h('tr', { class: ctx.ui.cardId === card.id ? 'is-open' : null, 'data-card-id': card.id },
      h('td', { class: 'cell-key' }, Model.cardKey(project, card)),
      h('td', { class: 'cell-title' }, h('button', { type: 'button', class: 'link-btn', 'data-fkey': `row-${card.id}`, onClick: () => App.openCard(card.id) }, card.title)),
      h('td', { class: 'cell-lane' }, column.name),
      h('td', null, assignee ? h('span', { class: 'cell-person' }, Parts.avatar(assignee), assignee.name) : h('span', { class: 'muted' }, 'Unassigned')),
      h('td', { class: 'cell-priority' }, h('span', { class: 'cell-person' }, Parts.priorityBars(card.priority), Model.priority(card.priority).label)),
      h('td', { class: 'cell-due' }, Parts.dueBadge(project, card, today) || h('span', { class: 'muted' }, 'None')),
      h('td', { class: 'cell-check' }, progress.total ? `${progress.done} of ${progress.total}` : h('span', { class: 'muted' }, 'None')),
      h('td', { class: 'cell-labels' }, labels.length ? h('div', { class: 'card-labels' }, labels.map(Parts.labelTag)) : null),
      h('td', { class: 'cell-actions' }, menuButton));
  }

  function buildRows(ctx) {
    const { project, state } = ctx;
    return project.columns.flatMap((column, laneIndex) => column.cardIds
      .map((id) => project.cards[id])
      .filter((card) => ctx.isVisible(card))
      .map((card) => ({ card, column, laneIndex, assignee: Model.memberById(state, card.assigneeId) })));
  }

  function render(container, ctx) {
    const { sort } = ctx.ui;
    const onSort = (key) => {
      if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
      else { sort.key = key; sort.dir = 'asc'; }
      App.renderView();
    };
    const rows = Model.sortRows(buildRows(ctx), sort.key, sort.dir);
    const empty = !rows.length ? Parts.emptyState(ctx.filtering ? 'No cards match these filters.' : 'This project has no open cards.', ctx.filtering ? 'Clear a filter to see more.' : 'Add a card to get started.') : null;
    container.replaceChildren(h('div', { class: 'table-wrap', 'data-scroll-key': 'table', tabindex: '0', role: 'region', 'aria-label': 'Cards table' },
      h('table', { class: 'data-table' },
        h('thead', null, h('tr', null, COLUMNS.map((c) => headerCell(c, sort, onSort)))),
        h('tbody', null, rows.map((r) => row(r, ctx)))),
      empty));
  }

  return { render };
})();
