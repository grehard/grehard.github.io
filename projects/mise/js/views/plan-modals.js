// The non-drag ways into the planner: tap a slot to choose a recipe, send a recipe to a date,
// and open a planned meal to change its servings, move it or remove it.
Mise.PlanModals = (() => {
  const { h, field, setFieldError, selectOptions } = Mise.Dom;
  const { dayLabel, todayKey, fromKey, weekDays, mondayOf } = Mise.Dates;
  const { MEALS } = Mise.Validate;
  const Store = Mise.Store;
  const MEAL_OPTIONS = MEALS.map((meal) => [meal, meal[0].toUpperCase() + meal.slice(1)]);

  function mealLabel(meal) {
    return meal[0].toUpperCase() + meal.slice(1);
  }

  function addEntry(dayKey, meal, recipeId, servings) {
    Store.update(() => {
      Store.dayPlan(dayKey)[meal].push({ id: Store.newId(), recipeId, servings });
    });
  }

  function readServings(input) {
    const value = Number(input.value);
    const valid = Number.isInteger(value) && value >= 1 && value <= 100;
    setFieldError(input, valid ? '' : 'Servings must be a whole number from 1 to 100.');
    return valid ? value : null;
  }

  // Recipes tagged for the meal come first, so breakfast slots open on breakfast.
  function rankForMeal(recipes, meal, query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matching = recipes.filter((recipe) => terms.every((term) => recipe.title.toLowerCase().includes(term)));
    return matching.sort((a, b) => Number(b.tags.includes(meal)) - Number(a.tags.includes(meal)) || a.title.localeCompare(b.title));
  }

  function pickerRow(recipe, onPick) {
    return h('li', null, h('button', { type: 'button', class: 'picker-row', onclick: () => onPick(recipe) },
      h('span', { class: 'picker-title' }, recipe.title),
      h('span', { class: 'picker-meta' }, `${Mise.RecipeFilter.totalTime(recipe)} min · serves ${recipe.servings}`)));
  }

  /** Tap-to-add: choose a recipe for one meal slot. */
  function pickForSlot(dayKey, meal) {
    Mise.Modal.open({
      title: `${mealLabel(meal)}, ${dayLabel(dayKey)}`,
      content: (close) => {
        const list = h('ul', { class: 'picker-list plain-list', id: 'picker-list' });
        const pick = (recipe) => {
          close();
          addEntry(dayKey, meal, recipe.id, recipe.servings);
          Mise.Toast.show(`Added ${recipe.title}.`);
        };
        const draw = (query) => {
          const rows = rankForMeal([...Store.state.recipes], meal, query).map((recipe) => pickerRow(recipe, pick));
          list.replaceChildren(...(rows.length ? rows : [h('li', { class: 'hint' }, 'No recipes match that search.')]));
        };
        draw('');
        return [
          field('Find a recipe', h('input', { type: 'search', id: 'picker-search', autocomplete: 'off', oninput: (event) => draw(event.target.value) })),
          list,
        ];
      },
    });
  }

  /** Sends a recipe to a chosen date and meal. */
  function addToPlan(recipe, { day = todayKey(), meal = 'dinner' } = {}) {
    Mise.Modal.open({
      title: `Add to plan`,
      content: (close) => {
        const dateInput = h('input', { type: 'date', id: 'plan-date', value: day });
        const mealSelect = h('select', { id: 'plan-meal' }, selectOptions(MEAL_OPTIONS, meal));
        const servings = h('input', { type: 'number', id: 'plan-servings', min: 1, max: 100, value: recipe.servings });
        const submit = (event) => {
          event.preventDefault();
          const dateOk = !!fromKey(dateInput.value);
          setFieldError(dateInput, dateOk ? '' : 'Choose a date.');
          const count = readServings(servings);
          if (!dateOk || count === null) return;
          close();
          addEntry(dateInput.value, mealSelect.value, recipe.id, count);
          Mise.Toast.show(`Added to ${mealSelect.value} on ${dayLabel(dateInput.value)}.`);
        };
        return h('form', { class: 'modal-form', novalidate: true, onsubmit: submit },
          h('p', { class: 'modal-lead' }, recipe.title),
          h('div', { class: 'form-grid two' }, field('Date', dateInput), field('Meal', mealSelect)),
          field('Servings to cook', servings),
          h('div', { class: 'form-actions' },
            h('button', { type: 'submit', class: 'btn primary', id: 'plan-confirm' }, 'Add to plan'),
            h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel')));
      },
    });
  }

  function dayOptions(weekOf) {
    return weekDays(weekOf).map((day) => [day.key, dayLabel(day.key)]);
  }

  function moveEntry(entryId, dayKey, meal, servings) {
    Store.update(() => {
      const found = Store.findEntry(entryId);
      if (!found) return;
      Store.removeEntry(entryId);
      Store.dayPlan(dayKey)[meal].push({ ...found.entry, servings });
    });
  }

  /** A planned meal: change servings, move it within the week, cook it, or remove it. */
  function editEntry(entryId) {
    const found = Store.findEntry(entryId);
    const recipe = found && Store.recipeById(found.entry.recipeId);
    if (!recipe) return;
    Mise.Modal.open({
      title: recipe.title,
      content: (close) => {
        const daySelect = h('select', { id: 'entry-day' }, selectOptions(dayOptions(mondayOf(found.dayKey)), found.dayKey));
        const mealSelect = h('select', { id: 'entry-meal' }, selectOptions(MEAL_OPTIONS, found.meal));
        const servings = h('input', { type: 'number', id: 'entry-servings', min: 1, max: 100, value: found.entry.servings });
        const submit = (event) => {
          event.preventDefault();
          const count = readServings(servings);
          if (count === null) return;
          close();
          moveEntry(entryId, daySelect.value, mealSelect.value, count);
        };
        const remove = () => {
          close();
          Store.update(() => Store.removeEntry(entryId), `Removed ${recipe.title} from the plan.`);
        };
        return h('form', { class: 'modal-form', novalidate: true, onsubmit: submit },
          h('div', { class: 'form-grid two' }, field('Day', daySelect), field('Meal', mealSelect)),
          field('Servings to cook', servings, { hint: `The recipe makes ${recipe.servings}. The grocery list follows this number.` }),
          h('div', { class: 'modal-links' },
            h('a', { href: `#/recipes/${encodeURIComponent(recipe.id)}`, onclick: close }, 'View recipe'),
            h('a', { href: `#/cook/${encodeURIComponent(recipe.id)}`, onclick: close }, 'Cook')),
          h('div', { class: 'form-actions spread' },
            h('button', { type: 'button', class: 'btn', id: 'entry-remove', onclick: remove }, 'Remove from plan'),
            h('div', { class: 'form-actions' },
              h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel'),
              h('button', { type: 'submit', class: 'btn primary', id: 'entry-save' }, 'Save'))));
      },
    });
  }

  return { pickForSlot, addToPlan, editEntry, addEntry, moveEntry, mealLabel };
})();
