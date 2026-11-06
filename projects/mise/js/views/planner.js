// The weekly planner: a seven-day grid, a recipe shelf to drag from, and week navigation.
Mise.Views.planner = (() => {
  const { h, icon, keepFocus } = Mise.Dom;
  const { addDays, todayKey, mondayOf, weekDays, weekLabel } = Mise.Dates;
  const { MEALS } = Mise.Validate;
  const { mealLabel } = Mise.PlanModals;
  const Store = Mise.Store;

  let shelfQuery = '';
  let shelfScroll = 0;
  let shownMonday = null;

  function entriesIn(dayKey, meal) {
    return (Store.state.plan[dayKey] && Store.state.plan[dayKey][meal]) || [];
  }

  function entryButton(entry) {
    const recipe = Store.recipeById(entry.recipeId);
    if (!recipe) return null;
    return h('button', {
      type: 'button',
      class: 'entry',
      'data-drag': `entry:${entry.id}`,
      'data-drag-label': recipe.title,
      'data-fk': `entry-${entry.id}`,
      title: recipe.title,
      onclick: () => Mise.PlanModals.editEntry(entry.id),
    },
    h('span', { class: 'entry-title' }, recipe.title),
    h('span', { class: 'entry-meta' }, `${entry.servings} ${entry.servings === 1 ? 'serving' : 'servings'}`));
  }

  function slot(day, meal, column, row) {
    const label = `${mealLabel(meal)}, ${day.long}`;
    return h('div', {
      class: 'slot',
      style: `grid-column:${column};grid-row:${row}`,
      'data-drop': 'slot',
      'data-day': day.key,
      'data-meal': meal,
      role: 'group',
      'aria-label': label,
    },
    h('span', { class: 'slot-label' }, mealLabel(meal)),
    h('div', { class: 'slot-entries' }, entriesIn(day.key, meal).map(entryButton)),
    h('button', {
      type: 'button',
      class: 'slot-add',
      'aria-label': `Add to ${label}`,
      'data-fk': `add-${day.key}-${meal}`,
      onclick: () => Mise.PlanModals.pickForSlot(day.key, meal),
    }, icon('plus', 14)));
  }

  function dayHeader(day, column, calories) {
    const isToday = day.key === todayKey();
    return h('div', { class: `day-head ${isToday ? 'today' : ''}`, style: `grid-column:${column};grid-row:1` },
      h('span', { class: 'day-name' }, day.short, ' ', h('span', { class: 'day-date' }, day.date)),
      h('span', { class: 'day-kcal' }, calories ? `${calories.toLocaleString('en-US')} kcal` : ''));
  }

  function dayColumn(day, index) {
    const column = index + 2;
    const { total } = Mise.Nutrition.dayTotals(Store.state.plan[day.key], Store.recipesById());
    return h('div', { class: `day ${day.key === todayKey() ? 'is-today' : ''}`, 'data-day-column': day.key },
      dayHeader(day, column, total.calories),
      MEALS.map((meal, row) => slot(day, meal, column, row + 2)));
  }

  function weekGrid(days) {
    return h('div', { class: 'week-grid', id: 'week-grid' },
      MEALS.map((meal, row) => h('div', { class: 'row-label', style: `grid-column:1;grid-row:${row + 2}`, 'aria-hidden': 'true' }, mealLabel(meal))),
      days.map(dayColumn));
  }

  // Picking a date from the shelf starts in the week on screen, not always this one.
  function defaultDay() {
    return shownMonday === mondayOf(todayKey()) ? todayKey() : shownMonday;
  }

  function shelfItems() {
    const terms = shelfQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const recipes = Store.state.recipes
      .filter((recipe) => terms.every((term) => `${recipe.title} ${recipe.tags.join(' ')}`.toLowerCase().includes(term)))
      .sort((a, b) => a.title.localeCompare(b.title));
    if (!recipes.length) return [h('li', { class: 'hint shelf-empty' }, 'No recipes match.')];
    return recipes.map((recipe) => h('li', null, h('button', {
      type: 'button',
      class: 'shelf-item',
      'data-drag': `recipe:${recipe.id}`,
      'data-drag-label': recipe.title,
      'data-recipe': recipe.id,
      onclick: () => Mise.PlanModals.addToPlan(recipe, { day: defaultDay() }),
    }, recipe.title)));
  }

  function shelf() {
    const list = h('ul', { class: 'shelf-list plain-list', id: 'shelf-list', onscroll: (event) => { shelfScroll = event.target.scrollTop; } }, shelfItems());
    queueMicrotask(() => { list.scrollTop = shelfScroll; });
    return h('aside', { class: 'shelf', 'aria-label': 'Recipes to plan' },
      h('h2', null, 'Recipes'),
      h('p', { class: 'hint shelf-hint' }, 'Drag onto a meal, or click to pick a date.'),
      h('label', { class: 'sr-only', for: 'shelf-search' }, 'Find a recipe to plan'),
      h('input', {
        type: 'search',
        id: 'shelf-search',
        placeholder: 'Find a recipe',
        value: shelfQuery,
        autocomplete: 'off',
        oninput: (event) => {
          shelfQuery = event.target.value;
          list.replaceChildren(...shelfItems());
        },
      }),
      list);
  }

  function handleDrop(dragValue, target) {
    const [kind, id] = [dragValue.slice(0, dragValue.indexOf(':')), dragValue.slice(dragValue.indexOf(':') + 1)];
    const { day, meal } = target.dataset;
    if (kind === 'recipe') {
      const recipe = Store.recipeById(id);
      if (recipe) keepFocus(() => Mise.PlanModals.addEntry(day, meal, id, recipe.servings));
      return;
    }
    const found = Store.findEntry(id);
    if (found) Mise.PlanModals.moveEntry(id, day, meal, found.entry.servings);
  }

  function clearWeek(days) {
    Store.update(() => {
      days.forEach((day) => { delete Store.state.plan[day.key]; });
    }, 'Cleared the week.');
  }

  function weekHasMeals(days) {
    return days.some((day) => MEALS.some((meal) => entriesIn(day.key, meal).length));
  }

  function weekNav(monday, basePath) {
    const isCurrent = monday === mondayOf(todayKey());
    return h('div', { class: 'week-nav' },
      h('a', { class: 'icon-btn bordered', href: `${basePath}/${addDays(monday, -7)}`, id: 'prev-week', 'aria-label': 'Previous week', title: 'Previous week' }, icon('left', 16)),
      h('a', { class: 'icon-btn bordered', href: `${basePath}/${addDays(monday, 7)}`, id: 'next-week', 'aria-label': 'Next week', title: 'Next week' }, icon('right', 16)),
      isCurrent ? null : h('a', { class: 'btn', href: `${basePath}/${mondayOf(todayKey())}`, id: 'this-week' }, 'This week'));
  }

  function render({ week }) {
    const monday = mondayOf(week || todayKey());
    shownMonday = monday;
    Mise.App.rememberWeek(monday);
    const days = weekDays(monday);
    const hasMeals = weekHasMeals(days);
    const grid = weekGrid(days);
    const layout = h('div', { class: 'planner-layout' }, shelf(), h('div', { class: 'grid-wrap' }, grid));
    Mise.Drag.attach(layout, handleDrop);
    return h('div', { class: 'view planner-view' },
      h('div', { class: 'view-head' },
        h('div', { class: 'view-title-row' },
          h('h1', { id: 'week-title' }, weekLabel(monday)),
          weekNav(monday, '#/planner')),
        h('div', { class: 'head-actions' },
          hasMeals ? h('button', { type: 'button', class: 'btn', id: 'clear-week', onclick: () => clearWeek(days) }, 'Clear week') : null,
          h('a', { class: 'btn primary', href: `#/groceries/${monday}`, id: 'to-groceries' }, icon('basket', 16), 'Grocery list'))),
      hasMeals ? null : h('p', { class: 'week-empty', id: 'week-empty' }, 'Nothing planned this week yet. Drag a recipe onto a meal, or press + on any meal to choose one.'),
      layout,
      Mise.Views.nutritionPanel.render(days));
  }

  return { render, weekNav };
})();
