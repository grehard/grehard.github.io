// Built once and then only updated, so typing in the search box never loses focus to a redraw.
const FilterBar = (() => {
  const { h, icon, select } = Dom;
  let parts = null;

  function replaceOptions(control, options, value) {
    control.replaceChildren(...options.map((o) => h('option', { value: o.value }, o.label)));
    control.value = options.some((o) => o.value === value) ? value : '';
  }

  function build(element, filter) {
    const text = h('input', {
      type: 'search', id: 'filter-text', placeholder: 'Search cards', autocomplete: 'off', 'aria-label': 'Search cards by text',
      onInput: (e) => { filter.text = e.target.value; App.renderFiltered(); },
    });
    const assignee = select([], '', { id: 'filter-assignee', 'aria-label': 'Filter by assignee', onChange: (e) => { filter.assigneeId = e.target.value; App.renderFiltered(); } });
    const label = select([], '', { id: 'filter-label', 'aria-label': 'Filter by label', onChange: (e) => { filter.labelId = e.target.value; App.renderFiltered(); } });
    const overdue = h('input', { type: 'checkbox', id: 'filter-overdue', onChange: (e) => { filter.overdue = e.target.checked; App.renderFiltered(); } });
    const overdueToggle = h('label', { class: 'filter-toggle' }, overdue, icon('alert', 14), 'Overdue');
    const count = h('span', { class: 'filter-count', id: 'filter-count' });
    const clear = h('button', { type: 'button', class: 'link-btn', id: 'filter-clear', onClick: App.clearFilters }, 'Clear filters');
    element.replaceChildren(
      h('div', { class: 'filter-search' }, icon('search', 15), text),
      assignee, label, overdueToggle,
      h('div', { class: 'filter-end' }, count, clear));
    return { text, assignee, label, overdue, overdueToggle, count, clear };
  }

  function render(element, ctx) {
    const { state, ui } = ctx;
    const { filter } = ui;
    if (!parts) parts = build(element, filter);
    if (document.activeElement !== parts.text) parts.text.value = filter.text;
    replaceOptions(parts.assignee, [{ value: '', label: 'All assignees' }, { value: 'none', label: 'Unassigned' }, ...state.team.map((m) => ({ value: m.id, label: m.name }))], filter.assigneeId);
    replaceOptions(parts.label, [{ value: '', label: 'All labels' }, ...state.labels.map((l) => ({ value: l.id, label: l.name }))], filter.labelId);
    parts.overdue.checked = filter.overdue;
    parts.overdueToggle.classList.toggle('is-on', filter.overdue);
    parts.assignee.classList.toggle('is-active', !!filter.assigneeId);
    parts.label.classList.toggle('is-active', !!filter.labelId);
    renderCount(ctx);
  }

  function renderCount(ctx) {
    if (!parts) return;
    const { shown, total } = ctx.counts();
    const noun = total === 1 ? 'card' : 'cards';
    parts.count.textContent = ctx.filtering ? `${shown} of ${total} ${noun}` : `${total} ${noun}`;
    parts.clear.hidden = !ctx.filtering;
  }

  return { render, renderCount };
})();
