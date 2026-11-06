// Small pieces of card display shared by the board, table, calendar and detail panel.
const Parts = (() => {
  const { h, icon } = Dom;

  function initials(name) {
    const words = name.trim().split(/\s+/);
    const first = words[0] ? words[0][0] : '?';
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  function avatar(member) {
    if (!member) return h('span', { class: 'avatar avatar-empty', title: 'Unassigned', 'aria-label': 'Unassigned' });
    return h('span', { class: 'avatar', style: `background:${member.color}`, title: member.name, 'aria-label': member.name }, initials(member.name));
  }

  function priorityBars(priorityId) {
    const p = Model.priority(priorityId);
    const bars = [1, 2, 3, 4].map((n) => h('span', { class: n <= p.bars ? 'on' : '' }));
    return h('span', { class: `priority-bars priority-${p.id}`, title: `${p.label} priority`, role: 'img', 'aria-label': `${p.label} priority` }, bars);
  }

  function labelTag(label) {
    return h('span', { class: 'label-tag' }, h('span', { class: 'label-dot', style: `background:${label.color}` }), label.name);
  }

  function dueBadge(project, card, today) {
    if (!card.due) return null;
    const overdue = Model.isOverdue(project, card, today);
    const isToday = card.due === today && !Model.isFinished(project, card.id);
    const className = `due-badge${overdue ? ' is-overdue' : ''}${isToday ? ' is-today' : ''}`;
    const text = isToday ? 'Today' : Dates.formatShort(card.due);
    return h('span', { class: className, title: overdue ? `Overdue, was due ${Dates.formatLong(card.due)}` : `Due ${Dates.formatLong(card.due)}` },
      icon(overdue ? 'alert' : 'clock', 13), text);
  }

  function checklistBadge(card) {
    const { done, total } = Model.checklistProgress(card);
    if (!total) return null;
    return h('span', { class: `check-badge${done === total ? ' is-complete' : ''}`, title: `${done} of ${total} checklist items done` }, icon('list', 13), `${done}/${total}`);
  }

  function emptyState(title, detail, action) {
    return h('div', { class: 'empty-state' }, h('p', { class: 'empty-title' }, title), detail ? h('p', null, detail) : null, action || null);
  }

  return { initials, avatar, priorityBars, labelTag, dueBadge, checklistBadge, emptyState };
})();
