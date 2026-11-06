// The recipe box: search, filters and the card grid.
Mise.Views = Mise.Views || {};

Mise.Views.recipes = (() => {
  const { h, icon, keepFocus, selectOptions } = Mise.Dom;
  const { totalTime, allTags, apply } = Mise.RecipeFilter;
  const Store = Mise.Store;

  const TIME_OPTIONS = [[null, 'Any'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour']];
  const filters = { query: '', tags: new Set(), maxTime: null, usePantry: false, maxMissing: null, sort: 'name' };
  let filtersOpen = false;
  let resultsHost = null;
  let filterHost = null;

  function currentFilters() {
    return { ...filters, onHand: Store.state.onHand };
  }

  function activeCount() {
    return filters.tags.size + (filters.maxTime ? 1 : 0) + (filters.usePantry ? 1 : 0) + Store.state.onHand.length;
  }

  function refresh() {
    keepFocus(() => {
      if (filterHost) filterHost.replaceChildren(...filterPanel());
      if (resultsHost) resultsHost.replaceChildren(...results());
    });
  }

  function clearFilters() {
    filters.query = '';
    filters.tags.clear();
    filters.maxTime = null;
    filters.usePantry = false;
    filters.maxMissing = null;
    Store.update((state) => { state.onHand = []; });
    const search = document.getElementById('recipe-search');
    if (search) search.value = '';
  }

  function toggleTag(tag) {
    if (filters.tags.has(tag)) filters.tags.delete(tag);
    else filters.tags.add(tag);
    refresh();
  }

  function chip(label, pressed, onclick, fk) {
    return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(pressed), 'data-fk': fk, onclick }, label);
  }

  function tagSection() {
    return h('section', { class: 'filter-group' },
      h('h2', { class: 'filter-title' }, 'Tags'),
      h('div', { class: 'chips' }, allTags(Store.state.recipes).map((tag) => chip(tag, filters.tags.has(tag), () => toggleTag(tag), `tag-${tag}`))));
  }

  function timeSection() {
    return h('section', { class: 'filter-group' },
      h('h2', { class: 'filter-title' }, 'Ready within'),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Ready within' }, TIME_OPTIONS.map(([value, label]) => chip(label, filters.maxTime === value, () => {
        filters.maxTime = value;
        refresh();
      }, `time-${value}`))));
  }

  function addOnHand(input) {
    const name = input.value.trim();
    if (!name) return;
    Store.update((state) => {
      const known = state.onHand.some((item) => Mise.Names.key(item) === Mise.Names.key(name));
      if (!known) state.onHand.push(name);
    });
    const next = document.getElementById('onhand-input');
    if (next) { next.value = ''; next.focus(); }
  }

  function removeOnHand(name) {
    Store.update((state) => { state.onHand = state.onHand.filter((item) => item !== name); });
  }

  function onHandChips() {
    if (!Store.state.onHand.length) return null;
    return h('ul', { class: 'chips plain-list' }, Store.state.onHand.map((name) => h('li', null,
      h('button', { type: 'button', class: 'chip removable', 'aria-label': `Remove ${name}`, 'data-fk': `onhand-${name}`, onclick: () => removeOnHand(name) }, name, icon('close', 13)))));
  }

  function onHandSection() {
    const input = h('input', { id: 'onhand-input', type: 'text', placeholder: 'e.g. chickpeas', autocomplete: 'off', 'data-fk': 'onhand-input' });
    const missingSelect = h('select', {
      id: 'max-missing',
      'data-fk': 'max-missing',
      onchange: (event) => {
        filters.maxMissing = event.target.value === '' ? null : Number(event.target.value);
        refresh();
      },
    }, selectOptions([['', 'Any number'], ['0', 'None'], ['1', '1 or fewer'], ['2', '2 or fewer'], ['3', '3 or fewer']], filters.maxMissing === null ? '' : String(filters.maxMissing)));

    return h('section', { class: 'filter-group' },
      h('h2', { class: 'filter-title' }, 'Ingredients on hand'),
      h('form', {
        class: 'inline-form',
        onsubmit: (event) => { event.preventDefault(); addOnHand(input); },
      },
      h('label', { class: 'sr-only', for: 'onhand-input' }, 'Ingredient you have'),
      input,
      h('button', { type: 'submit', class: 'btn', id: 'onhand-add' }, 'Add')),
      onHandChips(),
      h('label', { class: 'check-row' },
        h('input', {
          type: 'checkbox',
          id: 'use-pantry',
          'data-fk': 'use-pantry',
          checked: filters.usePantry,
          onchange: (event) => { filters.usePantry = event.target.checked; refresh(); },
        }),
        'Count my pantry'),
      h('div', { class: 'field compact' }, h('label', { for: 'max-missing' }, 'Missing ingredients'), missingSelect));
  }

  function filterPanel() {
    return [tagSection(), timeSection(), onHandSection(),
      activeCount() || filters.query ? h('button', { type: 'button', class: 'text-btn', id: 'clear-filters', onclick: clearFilters }, 'Clear all filters') : null,
    ].filter(Boolean);
  }

  function cardMeta(recipe) {
    return h('p', { class: 'card-meta' },
      `${totalTime(recipe)} min`, h('span', { 'aria-hidden': 'true' }, ' · '),
      `Serves ${recipe.servings}`, h('span', { 'aria-hidden': 'true' }, ' · '),
      `${recipe.nutrition.calories} kcal`);
  }

  function matchLine(match) {
    if (!match) return null;
    const text = match.missing.length === 0 ? 'You have everything' : `Missing ${match.missing.length}: ${match.missing.slice(0, 3).join(', ')}${match.missing.length > 3 ? ' and more' : ''}`;
    return h('p', { class: `card-match ${match.missing.length === 0 ? 'complete' : ''}` }, `${match.have} of ${match.total} on hand. ${text}`);
  }

  function card({ recipe, match }) {
    return h('article', { class: 'recipe-card' },
      h('h2', { class: 'card-title' }, h('a', { href: `#/recipes/${encodeURIComponent(recipe.id)}` }, recipe.title)),
      recipe.blurb ? h('p', { class: 'card-blurb' }, recipe.blurb) : null,
      matchLine(match),
      h('div', { class: 'card-foot' },
        h('div', null, cardMeta(recipe), h('p', { class: 'card-tags' }, recipe.tags.slice(0, 4).join(', '))),
        h('button', {
          type: 'button',
          class: 'icon-btn on-card',
          'aria-label': `Add ${recipe.title} to plan`,
          title: 'Add to plan',
          onclick: () => Mise.PlanModals.addToPlan(recipe),
        }, icon('calendar'))));
  }

  function results() {
    const found = apply(Store.state.recipes, currentFilters(), Store.state.pantry);
    const onHandActive = filters.usePantry || Store.state.onHand.length > 0;
    const summary = h('div', { class: 'results-head' },
      h('p', { class: 'results-count', id: 'results-count', 'aria-live': 'polite' }, found.length === 1 ? '1 recipe' : `${found.length} recipes`),
      onHandActive
        ? h('p', { class: 'hint' }, 'Sorted by fewest missing')
        : h('div', { class: 'sort' },
          h('label', { for: 'recipe-sort' }, 'Sort'),
          h('select', {
            id: 'recipe-sort',
            'data-fk': 'recipe-sort',
            onchange: (event) => { filters.sort = event.target.value; refresh(); },
          }, selectOptions([['name', 'A to Z'], ['time', 'Quickest'], ['calories', 'Lightest']], filters.sort))));
    if (!found.length) {
      return [summary, h('div', { class: 'empty' },
        h('h2', null, 'No recipes match'),
        h('p', null, 'Try fewer filters, or add a recipe of your own.'),
        h('button', { type: 'button', class: 'btn', onclick: clearFilters }, 'Clear all filters'))];
    }
    return [summary, h('div', { class: 'recipe-grid' }, found.map(card))];
  }

  function toggleFilters(event) {
    filtersOpen = !filtersOpen;
    event.currentTarget.setAttribute('aria-expanded', String(filtersOpen));
    filterHost.classList.toggle('open', filtersOpen);
  }

  function render() {
    filterHost = h('div', { class: `filter-panel ${filtersOpen ? 'open' : ''}`, id: 'filter-panel' }, filterPanel());
    resultsHost = h('div', { class: 'results' }, results());
    return h('div', { class: 'view recipes-view' },
      h('div', { class: 'view-head' },
        h('h1', null, 'Recipes'),
        h('a', { class: 'btn primary', href: '#/recipes/new', id: 'new-recipe' }, icon('plus', 16), 'New recipe')),
      h('div', { class: 'recipes-layout' },
        h('aside', { class: 'filters', 'aria-label': 'Filter recipes' },
          h('div', { class: 'search-box' },
            icon('search', 16),
            h('label', { class: 'sr-only', for: 'recipe-search' }, 'Search recipes'),
            h('input', {
              type: 'search',
              id: 'recipe-search',
              placeholder: 'Search title or ingredient',
              value: filters.query,
              autocomplete: 'off',
              oninput: (event) => {
                filters.query = event.target.value;
                resultsHost.replaceChildren(...results());
              },
            })),
          h('button', { type: 'button', class: 'btn filters-toggle', 'aria-expanded': String(filtersOpen), 'aria-controls': 'filter-panel', onclick: toggleFilters }, 'Filters'),
          filterHost),
        resultsHost));
  }

  return { render };
})();
