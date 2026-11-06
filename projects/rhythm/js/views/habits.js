// Habits list: search, reorder (drag or buttons), edit, archive, restore and delete.
(function (R) {
  'use strict';
  const { h, icon, iconButton, plural } = R.dom;
  const Sel = R.Select;
  const Store = R.Store;
  const { withUndo } = R.overlays;
  const WHEN_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };

  const viewState = { filter: 'active', query: '' };

  function archive(habit) {
    withUndo(`Archived ${habit.name}.`, () => Store.setArchived(habit.id, true));
  }

  function restore(habit) {
    withUndo(`Restored ${habit.name}.`, () => Store.setArchived(habit.id, false));
  }

  function remove(habit) {
    withUndo(`Deleted ${habit.name} and its history.`, () => Store.deleteHabit(habit.id));
  }

  function move(ids, index, delta) {
    const next = [...ids];
    const [id] = next.splice(index, 1);
    next.splice(index + delta, 0, id);
    Store.reorderActive(next);
  }

  const middleOf = (el) => { const box = el.getBoundingClientRect(); return box.top + box.height / 2; };

  /**
   * Live-reorders rows under the pointer and commits on release. Works for touch through pointer events.
   * Neighbours move around the dragged row, because moving the row itself would release pointer capture.
   */
  function startDrag(event, row) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const list = row.parentElement;
    const rowsBefore = [...list.children];
    handle.setPointerCapture(event.pointerId);
    row.classList.add('is-dragging');

    const onMove = (e) => {
      let prev = row.previousElementSibling;
      while (prev && e.clientY < middleOf(prev)) {
        list.insertBefore(prev, row.nextElementSibling);
        prev = row.previousElementSibling;
      }
      let next = row.nextElementSibling;
      while (next && e.clientY > middleOf(next)) {
        list.insertBefore(next, row);
        next = row.nextElementSibling;
      }
    };
    const finish = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', cancel);
      row.classList.remove('is-dragging');
      const order = [...list.children].map((el) => el.dataset.habit);
      if (order.join() !== rowsBefore.map((el) => el.dataset.habit).join()) Store.reorderActive(order);
    };
    const cancel = () => { rowsBefore.forEach((el) => list.appendChild(el)); finish(); };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', cancel);
  }

  function metaLine(habit) {
    const parts = [
      WHEN_LABEL[habit.timeOfDay],
      R.Schedule.describe(habit.schedule, Sel.weekStart()),
      Sel.describeGoal(habit),
    ];
    if (habit.reminder) parts.push(`Reminder ${habit.reminder}`);
    if (habit.archivedOn) parts.push(`Archived ${R.Dates.formatShort(habit.archivedOn)}`);
    return parts.join(' · ');
  }

  function row(habit, index, ids, canReorder) {
    const { streaks } = Sel.info(habit);
    const li = h('li', { class: 'manage-row', data: { habit: habit.id } });
    const reorder = canReorder ? [
      h('button', { type: 'button', class: 'btn-icon drag-handle', 'aria-label': `Drag to reorder ${habit.name}`, title: 'Drag to reorder', tabindex: '-1',
        onPointerdown: (e) => startDrag(e, li) }, icon('grip')),
    ] : null;
    const orderButtons = canReorder ? h('div', { class: 'order-buttons' },
      iconButton('up', `Move ${habit.name} up`, () => move(ids, index, -1), { disabled: index === 0, data: { fk: `up-${habit.id}` } }),
      iconButton('down', `Move ${habit.name} down`, () => move(ids, index, 1), { disabled: index === ids.length - 1, data: { fk: `down-${habit.id}` } })) : null;
    const actions = habit.archivedOn
      ? iconButton('restore', `Restore ${habit.name}`, () => restore(habit))
      : iconButton('archive', `Archive ${habit.name}`, () => archive(habit));
    li.append(...[
      reorder && reorder[0],
      h('div', { class: 'row-main' },
        h('a', { class: 'row-name', href: `#/habit/${encodeURIComponent(habit.id)}` }, habit.name),
        h('span', { class: 'row-meta' }, metaLine(habit))),
      h('dl', { class: 'mini-stats' },
        h('div', {}, h('dt', {}, 'Current'), h('dd', {}, Sel.formatStreak(habit, streaks.current))),
        h('div', {}, h('dt', {}, 'Best'), h('dd', {}, Sel.formatStreak(habit, streaks.best)))),
      h('div', { class: 'row-actions' },
        orderButtons,
        iconButton('edit', `Edit ${habit.name}`, () => R.ui.openHabitForm(habit), { data: { fk: `edit-${habit.id}` } }),
        actions,
        iconButton('trash', `Delete ${habit.name}`, () => remove(habit), { class: 'btn-danger' })),
    ].filter(Boolean));
    return li;
  }

  function matchList(habits) {
    const query = viewState.query.trim().toLowerCase();
    return query ? habits.filter((habit) => habit.name.toLowerCase().includes(query)) : habits;
  }

  function renderList(container) {
    const pool = viewState.filter === 'active' ? Sel.activeHabits() : Sel.archivedHabits();
    const shown = matchList(pool);
    const canReorder = viewState.filter === 'active' && !viewState.query.trim() && pool.length > 1;
    const ids = shown.map((habit) => habit.id);
    let message = null;
    if (!shown.length) {
      message = viewState.query.trim() ? `No habits match "${viewState.query.trim()}".`
        : viewState.filter === 'active' ? 'No active habits. Add one to get started.' : 'Archived habits appear here, with their history kept.';
    }
    container.replaceChildren(message
      ? h('div', { class: 'empty' }, h('p', { class: 'muted' }, message))
      : h('ul', { class: 'manage-list' }, shown.map((habit, i) => row(habit, i, ids, canReorder))));
  }

  function render() {
    const listBox = h('div', {});
    const active = Sel.activeHabits().length;
    const archived = Sel.archivedHabits().length;
    const refresh = () => renderList(listBox);
    refresh();
    return h('div', { class: 'view view-habits' },
      h('header', { class: 'view-head' },
        h('div', {}, h('h1', {}, 'Habits'), h('p', { class: 'muted' }, `${plural(active, 'active habit')}, ${archived} archived`)),
        h('button', { type: 'button', class: 'btn btn-primary', data: { fk: 'add-habit' }, onClick: () => R.ui.openHabitForm(null) }, icon('plus', 16), 'Add habit')),
      h('div', { class: 'toolbar' },
        h('div', { class: 'search' }, icon('search', 16),
          h('input', { type: 'search', 'aria-label': 'Search habits', placeholder: 'Search habits', value: viewState.query, data: { fk: 'habit-search' },
            onInput: (e) => { viewState.query = e.target.value; refresh(); } })),
        R.forms.segmented('Show', [{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }], viewState.filter,
          (value) => { viewState.filter = value; refresh(); }, { name: 'habit-filter', compact: true })),
      listBox);
  }

  R.views = R.views || {};
  R.views.habits = { render, title: 'Habits' };
})(window.Rhythm);
