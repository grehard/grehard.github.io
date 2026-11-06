// Search and filtering for the recipe box, including "what can I make with what I have".
Mise.RecipeFilter = (() => {
  const Names = Mise.Names;

  function totalTime(recipe) {
    return recipe.prepMin + recipe.cookMin;
  }

  /** Tags in use, most common first. */
  function allTags(recipes) {
    const counts = new Map();
    recipes.forEach((recipe) => recipe.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
  }

  function matchesQuery(recipe, query) {
    const haystack = [recipe.title, recipe.blurb, ...recipe.tags, ...recipe.ingredients.map((item) => item.name)].join(' ').toLowerCase();
    return query.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
  }

  /**
   * How much of a recipe the cook already has. Typed ingredients match loosely ("tomato" counts for
   * "crushed tomatoes"); pantry rows match exactly, the same way the grocery list subtracts them.
   */
  function onHandMatch(recipe, typedKeys, pantryKeys) {
    const missing = [];
    let have = 0;
    recipe.ingredients.forEach((ingredient) => {
      const key = Names.key(ingredient.name);
      if (pantryKeys.has(key) || typedKeys.some((typed) => Names.matches(typed, key))) have += 1;
      else missing.push(ingredient.name);
    });
    return { have, total: recipe.ingredients.length, missing };
  }

  function usesAllTyped(recipe, typedKeys) {
    const keys = recipe.ingredients.map((ingredient) => Names.key(ingredient.name));
    return typedKeys.every((typed) => keys.some((key) => Names.matches(typed, key)));
  }

  const SORTERS = {
    name: (a, b) => a.recipe.title.localeCompare(b.recipe.title),
    time: (a, b) => totalTime(a.recipe) - totalTime(b.recipe) || SORTERS.name(a, b),
    calories: (a, b) => a.recipe.nutrition.calories - b.recipe.nutrition.calories || SORTERS.name(a, b),
    missing: (a, b) => a.match.missing.length - b.match.missing.length || SORTERS.name(a, b),
  };

  /**
   * `filters`: { query, tags: Set, maxTime, onHand: [names], usePantry, maxMissing, sort }.
   * Returns [{ recipe, match }]; `match` is null unless an on-hand filter is active.
   */
  function apply(recipes, filters, pantry) {
    const typedKeys = filters.onHand.map(Names.key);
    const pantryKeys = new Set(filters.usePantry ? pantry.map((item) => Names.key(item.name)) : []);
    const onHandActive = typedKeys.length > 0 || filters.usePantry;

    const results = recipes
      .filter((recipe) => matchesQuery(recipe, filters.query))
      .filter((recipe) => [...filters.tags].every((tag) => recipe.tags.includes(tag)))
      .filter((recipe) => !filters.maxTime || totalTime(recipe) <= filters.maxTime)
      .filter((recipe) => usesAllTyped(recipe, typedKeys))
      .map((recipe) => ({ recipe, match: onHandActive ? onHandMatch(recipe, typedKeys, pantryKeys) : null }))
      .filter(({ match }) => !match || filters.maxMissing === null || match.missing.length <= filters.maxMissing);

    return results.sort(onHandActive ? SORTERS.missing : SORTERS[filters.sort] || SORTERS.name);
  }

  return { totalTime, allTags, apply, onHandMatch };
})();
