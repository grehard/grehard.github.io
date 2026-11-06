// Builds first-run data with the plan placed around today's date.
Mise.Seed = (() => {
  const { parseLines } = Mise.IngredientParser;
  const { mondayOf, addDays, todayKey } = Mise.Dates;

  // [day of week from Monday, meal, recipe id, servings to cook]
  const THIS_WEEK = [
    [0, 'breakfast', 'yogurt-honey-oats', 2], [0, 'lunch', 'red-lentil-soup', 3], [0, 'dinner', 'lemon-olive-chicken', 4],
    [1, 'breakfast', 'baked-oats-pear', 3], [1, 'lunch', 'tomato-white-bean-toast', 2], [1, 'dinner', 'black-bean-tacos', 4],
    [2, 'breakfast', 'baked-oats-pear', 3], [2, 'lunch', 'red-lentil-soup', 3], [2, 'dinner', 'anchovy-breadcrumb-spaghetti', 4],
    [3, 'breakfast', 'yogurt-honey-oats', 2], [3, 'lunch', 'farro-squash-salad', 3], [3, 'dinner', 'braised-chickpeas-greens', 4],
    [4, 'breakfast', 'skillet-eggs-peppers', 2], [4, 'lunch', 'farro-squash-salad', 3], [4, 'dinner', 'salmon-fennel-potatoes', 4],
    [5, 'breakfast', 'brown-butter-pancakes', 4], [5, 'dinner', 'mushroom-leek-risotto', 4],
    [6, 'breakfast', 'skillet-eggs-peppers', 2], [6, 'dinner', 'beef-barley-stew', 6],
  ];
  const LAST_WEEK = [
    [0, 'dinner', 'sausage-kale-soup', 3], [1, 'lunch', 'sausage-kale-soup', 3], [2, 'dinner', 'ginger-pork-rice-bowl', 4],
    [3, 'breakfast', 'baked-oats-pear', 6], [3, 'dinner', 'tomato-white-bean-toast', 2], [5, 'breakfast', 'brown-butter-pancakes', 4],
    [5, 'dinner', 'beef-barley-stew', 3], [6, 'lunch', 'beef-barley-stew', 3],
  ];
  const NEXT_WEEK = [
    [0, 'dinner', 'ginger-pork-rice-bowl', 4], [1, 'lunch', 'tomato-white-bean-toast', 2], [2, 'dinner', 'sausage-kale-soup', 3],
    [3, 'lunch', 'sausage-kale-soup', 3], [4, 'dinner', 'black-bean-tacos', 4],
  ];

  const PANTRY = [
    ['salt', null, ''], ['black pepper', null, ''], ['olive oil', 1 / 2, 'cup'], ['flour', 3, 'cup'], ['sugar', 2, 'cup'],
    ['rolled oats', 1, 'cup'], ['jasmine rice', 4, 'cup'], ['eggs', 6, ''], ['garlic', 1, 'head'], ['butter', 4, 'tbsp'],
    ['ground cumin', 1 / 4, 'cup'], ['smoked paprika', 2, 'tbsp'], ['soy sauce', 1, 'cup'], ['honey', 1 / 2, 'cup'],
    ['red pepper flakes', 2, 'tbsp'], ['baking powder', 3, 'tbsp'], ['vegetable broth', 4, 'cup'], ['tomato paste', 2, 'tbsp'],
  ];

  function buildRecipe(seed) {
    const { items } = parseLines(seed.ingredients.join('\n'));
    return { ...seed, tags: [...seed.tags], steps: [...seed.steps], nutrition: { ...seed.nutrition }, ingredients: items };
  }

  function addPlanned(plan, monday, rows, newId) {
    rows.forEach(([offset, meal, recipeId, servings]) => {
      const key = addDays(monday, offset);
      plan[key] = plan[key] || { breakfast: [], lunch: [], dinner: [] };
      plan[key][meal].push({ id: newId(), recipeId, servings });
    });
  }

  function buildPantry(newId) {
    return PANTRY.map(([name, qty, unit]) => ({ id: newId(), name, qty, unit, aisle: Mise.Aisles.guess(name) }));
  }

  /** A complete first-run state. `newId` supplies unique ids. */
  function build(newId) {
    const monday = mondayOf(todayKey());
    const plan = {};
    addPlanned(plan, addDays(monday, -7), LAST_WEEK, newId);
    addPlanned(plan, monday, THIS_WEEK, newId);
    addPlanned(plan, addDays(monday, 7), NEXT_WEEK, newId);
    const manual = {
      [monday]: [
        { id: newId(), qty: 1, qtyMax: null, unit: 'bag', name: 'coffee beans', aisle: 'Other' },
        { id: newId(), qty: null, qtyMax: null, unit: '', name: 'dish soap', aisle: 'Other' },
      ],
    };
    return { recipes: Mise.SeedRecipes.map(buildRecipe), plan, pantry: buildPantry(newId), manual, checked: {}, onHand: [] };
  }

  return { build };
})();
