// One recipe, laid out like a cookbook page, with the serving scaler.
Mise.Views.recipeDetail = (() => {
  const { h, icon, keepFocus } = Mise.Dom;
  const { scaledIngredient, factorFor } = Mise.Scaling;
  const Store = Mise.Store;
  const MIN_SERVINGS = 1;
  const MAX_SERVINGS = 100;

  // Chosen serving counts survive moving between this page and cook mode.
  const chosenServings = new Map();

  function servingsFor(recipe) {
    return chosenServings.get(recipe.id) || recipe.servings;
  }

  function clampServings(value, fallback) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number) || number < MIN_SERVINGS) return fallback;
    return Math.min(MAX_SERVINGS, number);
  }

  function ingredientRow(ingredient, factor) {
    const shown = scaledIngredient(ingredient, factor);
    return h('li', { class: 'ingredient' },
      h('span', { class: 'ingredient-amount' }, shown.amount),
      h('span', { class: 'ingredient-name' }, shown.name, shown.note ? h('span', { class: 'ingredient-note' }, `, ${shown.note}`) : null));
  }

  function ingredientList(recipe) {
    const factor = factorFor(recipe, servingsFor(recipe));
    return recipe.ingredients.map((ingredient) => ingredientRow(ingredient, factor));
  }

  function scaler(recipe, listHost) {
    const setServings = (value) => {
      chosenServings.set(recipe.id, value);
      input.value = value;
      keepFocus(() => listHost.replaceChildren(...ingredientList(recipe)));
      resetBtn.hidden = value === recipe.servings;
    };
    const input = h('input', {
      id: 'servings',
      type: 'number',
      min: MIN_SERVINGS,
      max: MAX_SERVINGS,
      inputmode: 'numeric',
      value: servingsFor(recipe),
      onchange: (event) => setServings(clampServings(event.target.value, servingsFor(recipe))),
    });
    const resetBtn = h('button', {
      type: 'button',
      class: 'text-btn',
      id: 'servings-reset',
      hidden: servingsFor(recipe) === recipe.servings,
      onclick: () => setServings(recipe.servings),
    }, `Back to ${recipe.servings}`);
    return h('div', { class: 'scaler' },
      h('label', { for: 'servings' }, 'Servings'),
      h('div', { class: 'stepper' },
        h('button', { type: 'button', class: 'icon-btn', id: 'servings-down', 'aria-label': 'Fewer servings', onclick: () => setServings(Math.max(MIN_SERVINGS, servingsFor(recipe) - 1)) }, icon('minus', 16)),
        input,
        h('button', { type: 'button', class: 'icon-btn', id: 'servings-up', 'aria-label': 'More servings', onclick: () => setServings(Math.min(MAX_SERVINGS, servingsFor(recipe) + 1)) }, icon('plus', 16))),
      resetBtn);
  }

  function nutritionTable(recipe) {
    return h('section', { class: 'nutrition-card' },
      h('h2', null, 'Per serving'),
      h('dl', { class: 'nutrition-list' }, Mise.Nutrition.FIELDS.map((field) => h('div', null,
        h('dt', null, field.label),
        h('dd', null, `${recipe.nutrition[field.key].toLocaleString('en-US')} ${field.unit}`)))));
  }

  function removeRecipe(recipe) {
    Store.update(() => Store.deleteRecipe(recipe.id), `Deleted ${recipe.title}.`);
    location.hash = '#/recipes';
  }

  function actions(recipe) {
    return h('div', { class: 'recipe-actions' },
      h('a', { class: 'btn primary', href: `#/cook/${encodeURIComponent(recipe.id)}`, id: 'start-cooking' }, icon('pot', 16), 'Cook'),
      h('button', { type: 'button', class: 'btn', id: 'add-to-plan', onclick: () => Mise.PlanModals.addToPlan(recipe) }, icon('calendar', 16), 'Add to plan'),
      h('a', { class: 'btn', href: `#/recipes/${encodeURIComponent(recipe.id)}/edit`, id: 'edit-recipe' }, icon('edit', 16), 'Edit'),
      h('button', { type: 'button', class: 'btn', id: 'delete-recipe', onclick: () => removeRecipe(recipe) }, icon('trash', 16), 'Delete'));
  }

  function timeLine(recipe) {
    const parts = [];
    if (recipe.prepMin) parts.push(`Prep ${recipe.prepMin} min`);
    if (recipe.cookMin) parts.push(`Cook ${recipe.cookMin} min`);
    parts.push(`Total ${Mise.RecipeFilter.totalTime(recipe)} min`);
    return parts.join(' · ');
  }

  function notFound() {
    return h('div', { class: 'view' },
      h('div', { class: 'empty' },
        h('h1', null, 'Recipe not found'),
        h('p', null, 'It may have been deleted.'),
        h('a', { class: 'btn', href: '#/recipes' }, 'Back to recipes')));
  }

  function render({ id }) {
    const recipe = Store.recipeById(id);
    if (!recipe) return notFound();
    const listHost = h('ul', { class: 'ingredient-list plain-list', id: 'ingredient-list' }, ingredientList(recipe));
    return h('div', { class: 'view recipe-page' },
      h('a', { class: 'back-link', href: '#/recipes' }, icon('left', 14), 'Recipes'),
      h('header', { class: 'recipe-head' },
        h('h1', null, recipe.title),
        recipe.blurb ? h('p', { class: 'recipe-blurb' }, recipe.blurb) : null,
        h('p', { class: 'recipe-meta' }, timeLine(recipe)),
        recipe.tags.length ? h('p', { class: 'recipe-tags' }, recipe.tags.join(', ')) : null,
        actions(recipe)),
      h('div', { class: 'recipe-columns' },
        h('section', { class: 'recipe-ingredients' },
          h('h2', null, 'Ingredients'),
          scaler(recipe, listHost),
          listHost),
        h('div', { class: 'recipe-right' },
          h('section', { class: 'recipe-method' },
            h('h2', null, 'Method'),
            h('ol', { class: 'method-list' }, recipe.steps.map((step) => h('li', null, step)))),
          nutritionTable(recipe))));
  }

  return { render, servingsFor };
})();
