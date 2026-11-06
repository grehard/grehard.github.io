// The lane view. Each lane reports its work-in-progress state in the header and,
// when over limit, draws a line inside the list at the point the limit was passed.
const BoardView = (() => {
  const { h, icon, iconButton } = Dom;
  const MAX_TICKS = 12;

  function cardMenuItems(project, cardId) {
    const at = Model.locate(project, cardId);
    const lane = Model.columnById(project, at.columnId);
    const isVisible = (id) => App.isVisible(project, id);
    const canStep = (direction) => !!Model.stepTarget(lane, cardId, direction, isVisible);
    const stepItem = (label, iconName, direction) => ({ label, icon: iconName, disabled: !canStep(direction), onSelect: () => Actions.stepCard(cardId, direction) });
    return [
      { heading: 'Move to' },
      ...project.columns.map((column) => ({
        label: column.name, icon: column.id === lane.id ? 'check' : null, current: column.id === lane.id, disabled: column.id === lane.id,
        onSelect: () => Actions.moveCard(cardId, column.id, null),
      })),
      { separator: true },
      stepItem('Move up', 'up', 'up'),
      stepItem('Move down', 'down', 'down'),
      stepItem('Move to top', 'top', 'top'),
      stepItem('Move to bottom', 'bottom', 'bottom'),
      { separator: true },
      { label: 'Open details', icon: 'edit', onSelect: () => App.openCard(cardId) },
      { label: 'Archive', icon: 'archive', onSelect: () => Actions.archiveCard(cardId) },
      { label: 'Delete', icon: 'trash', danger: true, onSelect: () => Actions.deleteCard(cardId) },
    ];
  }

  function openCardMenu(anchor, cardId) {
    Menu.open(anchor, cardMenuItems(App.project(), cardId), 'Move and manage card');
  }

  function cardElement(project, card, ctx) {
    const key = Model.cardKey(project, card);
    const member = Model.memberById(ctx.state, card.assigneeId);
    const labels = card.labelIds.map((id) => Model.labelById(ctx.state, id)).filter(Boolean);
    const open = h('button', {
      type: 'button', class: 'card-open', 'data-fkey': `card-${card.id}`,
      'aria-label': `${key}: ${card.title}. Press Enter for details, M to move.`,
      onClick: () => App.openCard(card.id),
      onKeydown: (e) => { if (e.key === 'm' || e.key === 'M') { e.preventDefault(); openCardMenu(menuButton, card.id); } },
    }, card.title);
    const menuButton = iconButton('more', `Move to, for ${key}`, () => openCardMenu(menuButton, card.id), {
      class: 'card-menu', 'data-no-drag': true, 'aria-haspopup': 'menu', 'data-fkey': `card-menu-${card.id}`,
    });
    const isOverdue = Model.isOverdue(project, card, ctx.today);
    return h('li', { class: `card${ctx.ui.cardId === card.id ? ' is-open' : ''}${isOverdue ? ' is-overdue' : ''}`, 'data-card-id': card.id },
      h('div', { class: 'card-top' }, h('span', { class: 'card-key' }, key), Parts.priorityBars(card.priority)),
      open,
      menuButton,
      labels.length ? h('div', { class: 'card-labels' }, labels.map(Parts.labelTag)) : null,
      h('div', { class: 'card-meta' }, Parts.dueBadge(project, card, ctx.today), Parts.checklistBadge(card), h('span', { class: 'card-meta-end' }, Parts.avatar(member))));
  }

  function gauge(wip) {
    if (wip.level === 'none') return h('div', { class: 'gauge gauge-none' });
    if (wip.limit > MAX_TICKS) {
      const percent = Math.min(100, Math.round((wip.count / wip.limit) * 100));
      return h('div', { class: 'gauge gauge-bar' }, h('span', { style: `width:${percent}%` }));
    }
    const ticks = [];
    for (let i = 0; i < Math.max(wip.count, wip.limit); i++) {
      const className = i >= wip.limit ? 'tick is-over' : i < wip.count ? 'tick is-filled' : 'tick';
      ticks.push(h('span', { class: className }));
    }
    return h('div', { class: 'gauge' }, ticks);
  }

  function statusText(wip) {
    if (wip.level === 'over') return `${wip.over} over limit`;
    if (wip.level === 'at') return 'At limit';
    if (wip.level === 'under') return `${wip.room} free`;
    return 'No limit';
  }

  function laneMenu(anchor, column, project) {
    const index = project.columns.indexOf(column);
    const lastLane = project.columns.length === 1;
    Menu.open(anchor, [
      { label: 'Add card here', icon: 'plus', onSelect: () => Forms.openCard({ columnId: column.id }) },
      { label: 'Edit lane and limit', icon: 'edit', onSelect: () => Forms.openLane(column.id) },
      { separator: true },
      { label: 'Move lane left', icon: 'left', disabled: index === 0, onSelect: () => Actions.stepColumn(column.id, -1) },
      { label: 'Move lane right', icon: 'right', disabled: index === project.columns.length - 1, onSelect: () => Actions.stepColumn(column.id, 1) },
      { separator: true },
      { label: 'Delete lane', icon: 'trash', danger: true, disabled: lastLane, note: lastLane ? 'Last lane' : null, onSelect: () => Forms.openDeleteLane(column.id) },
    ], `Lane ${column.name}`);
  }

  function laneHeader(column, wip, shownCount, project, filtering) {
    const menuButton = iconButton('more', `Lane actions for ${column.name}`, () => laneMenu(menuButton, column, project), {
      'data-no-drag': true, 'aria-haspopup': 'menu', 'data-fkey': `lane-menu-${column.id}`,
    });
    const count = wip.limit ? `${wip.count} / ${wip.limit}` : String(wip.count);
    return h('header', { class: 'lane-head' },
      h('div', { class: 'lane-title-row' },
        h('h2', { class: 'lane-name', title: column.name }, column.name),
        column.isDone ? h('span', { class: 'lane-done-mark', title: 'Cards here are finished' }, icon('check', 14)) : null,
        h('span', { class: 'lane-count', title: wip.limit ? `${wip.count} cards, limit ${wip.limit}` : `${wip.count} cards` }, count),
        h('span', { class: 'lane-actions' },
          iconButton('plus', `Add card to ${column.name}`, () => Forms.openCard({ columnId: column.id }), { 'data-no-drag': true, 'data-fkey': `lane-add-${column.id}` }),
          menuButton)),
      h('div', { class: 'lane-status-row' },
        gauge(wip),
        h('span', { class: 'lane-status' },
          h('span', { class: 'lane-status-text' }, wip.level === 'over' ? icon('alert', 13) : null, statusText(wip)),
          h('span', { class: 'lane-status-preview' }, icon('alert', 13), 'Drop goes over limit')),
        filtering ? h('span', { class: 'lane-shown' }, `${shownCount} shown`) : null));
  }

  function laneElement(column, project, ctx) {
    const wip = Model.wipState(column.cardIds.length, column.limit);
    const shown = column.cardIds.map((id) => project.cards[id]).filter((card) => ctx.isVisible(card));
    const items = shown.map((card) => cardElement(project, card, ctx));
    // With a filter on, hidden cards make the visual position meaningless, so the line only shows unfiltered.
    if (wip.level === 'over' && !ctx.filtering) {
      items.splice(wip.limit, 0, h('li', { class: 'limit-line', 'aria-hidden': 'true' }, h('span', null, `Limit ${wip.limit}`)));
    }
    if (!shown.length) items.push(h('li', { class: 'lane-empty' }, ctx.filtering ? 'No matching cards' : 'No cards yet'));
    return h('section', { class: `lane wip-${wip.level}`, 'data-column-id': column.id, 'aria-label': column.name },
      laneHeader(column, wip, shown.length, project, ctx.filtering),
      h('ol', { class: 'lane-cards', 'data-scroll-key': `lane-${column.id}` }, items));
  }

  function render(container, ctx) {
    const { project } = ctx;
    const board = h('div', { class: 'board', 'data-scroll-key': 'board' },
      project.columns.map((column) => laneElement(column, project, ctx)),
      h('button', { type: 'button', class: 'add-lane', 'aria-label': 'Add lane', title: 'Add lane', 'data-fkey': 'add-lane', onClick: () => Forms.openLane(null) }, icon('plus'), h('span', { class: 'add-lane-text' }, 'Add lane')));
    container.replaceChildren(board);
  }

  return { render, cardMenuItems, openCardMenu };
})();
