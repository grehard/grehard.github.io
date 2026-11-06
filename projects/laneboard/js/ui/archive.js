// Cards set aside from the board. Restoring returns a card to the bottom of its old lane.
const ArchiveView = (() => {
  const { h, icon } = Dom;

  function row(project, card, ctx) {
    const from = card.archivedFrom;
    const lane = from && Model.columnById(project, from.columnId);
    const member = Model.memberById(ctx.state, card.assigneeId);
    const key = Model.cardKey(project, card);
    const detail = from ? `Archived ${Dates.formatStamp(from.at)} from ${from.columnName}` : 'Archived';
    return h('li', { class: `archive-row${ctx.ui.cardId === card.id ? ' is-open' : ''}`, 'data-card-id': card.id },
      h('span', { class: 'card-key' }, key),
      h('div', { class: 'archive-main' },
        h('button', { type: 'button', class: 'link-btn', 'data-fkey': `archive-${card.id}`, onClick: () => App.openCard(card.id) }, card.title),
        h('p', { class: 'archive-detail muted' }, detail, from && !lane ? '. That lane is gone, so it returns to the first lane.' : '')),
      Parts.avatar(member),
      h('div', { class: 'archive-actions' },
        h('button', { type: 'button', class: 'btn btn-small', 'aria-label': `Restore ${key}`, 'data-fkey': `archive-restore-${card.id}`, onClick: () => Actions.restoreCard(card.id) }, icon('undo', 14), 'Restore'),
        h('button', { type: 'button', class: 'btn btn-small btn-danger', 'aria-label': `Delete ${key}`, 'data-fkey': `archive-delete-${card.id}`, onClick: () => Actions.deleteCard(card.id) }, icon('trash', 14), 'Delete')));
  }

  function render(container, ctx) {
    const { project } = ctx;
    const cards = project.archive.map((id) => project.cards[id]).filter((card) => ctx.isVisible(card));
    let content;
    if (cards.length) content = h('ul', { class: 'archive-list' }, cards.map((card) => row(project, card, ctx)));
    else if (project.archive.length) content = Parts.emptyState('No archived cards match these filters.', 'Clear a filter to see more.');
    else content = Parts.emptyState('The archive is empty.', 'Archive a card from its menu or details to keep it out of the way without losing it.');
    container.replaceChildren(h('div', { class: 'archive', 'data-scroll-key': 'archive' }, content));
  }

  return { render };
})();
