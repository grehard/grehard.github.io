// Checks data from localStorage or an imported file. Bad records are dropped and described, so
// corrupt storage can't crash the app and a bad import can report exactly what is wrong.
Mise.Validate = (() => {
  const MEALS = ['breakfast', 'lunch', 'dinner'];
  const MAX_QTY = 100000;

  const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const isText = (value) => typeof value === 'string' && value.trim().length > 0;
  const text = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

  function wholeNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function quantity(value) {
    return typeof value === 'number' && value > 0 && value <= MAX_QTY ? value : null;
  }

  function cleanAisle(value) {
    return Mise.Aisles.LIST.includes(value) ? value : null;
  }

  function cleanIngredient(raw) {
    if (!isObject(raw) || !isText(raw.name)) return null;
    const qty = quantity(raw.qty);
    const qtyMax = quantity(raw.qtyMax);
    return {
      qty,
      qtyMax: qty !== null && qtyMax > qty ? qtyMax : null,
      unit: Mise.Units.ALL_UNITS.includes(raw.unit) ? raw.unit : '',
      name: raw.name.trim(),
      note: text(raw.note),
      aisle: cleanAisle(raw.aisle) || Mise.Aisles.guess(raw.name),
    };
  }

  function cleanNutrition(raw) {
    const source = isObject(raw) ? raw : {};
    return Object.fromEntries(Mise.Nutrition.FIELDS.map(({ key }) => [key, wholeNumber(source[key], 0, 99999, 0)]));
  }

  function cleanRecipe(raw, label, issues) {
    if (!isObject(raw)) { issues.push(`${label} is not a recipe.`); return null; }
    if (!isText(raw.id) || !isText(raw.title)) { issues.push(`${label} needs an id and a title.`); return null; }
    const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients.map(cleanIngredient).filter(Boolean) : [];
    const steps = Array.isArray(raw.steps) ? raw.steps.filter(isText) : [];
    if (!ingredients.length) { issues.push(`"${raw.title}" has no readable ingredients.`); return null; }
    if (!steps.length) { issues.push(`"${raw.title}" has no steps.`); return null; }
    return {
      id: raw.id,
      title: raw.title.trim(),
      blurb: text(raw.blurb),
      servings: wholeNumber(raw.servings, 1, 100, 4),
      prepMin: wholeNumber(raw.prepMin, 0, 2880, 0),
      cookMin: wholeNumber(raw.cookMin, 0, 2880, 0),
      tags: Array.isArray(raw.tags) ? raw.tags.filter(isText).map((tag) => tag.trim().toLowerCase()) : [],
      ingredients,
      steps,
      nutrition: cleanNutrition(raw.nutrition),
    };
  }

  function cleanRecipes(raw, issues) {
    if (!Array.isArray(raw)) { issues.push('The file has no list of recipes.'); return []; }
    const seen = new Set();
    return raw.map((recipe, index) => cleanRecipe(recipe, `Recipe ${index + 1}`, issues)).filter((recipe) => {
      if (!recipe || seen.has(recipe.id)) return false;
      seen.add(recipe.id);
      return true;
    });
  }

  function cleanEntry(raw, recipeIds) {
    if (!isObject(raw) || !isText(raw.id) || !recipeIds.has(raw.recipeId)) return null;
    return { id: raw.id, recipeId: raw.recipeId, servings: wholeNumber(raw.servings, 1, 100, 4) };
  }

  function cleanPlan(raw, recipeIds, issues) {
    const plan = {};
    if (raw !== undefined && !isObject(raw)) { issues.push('The meal plan is not in the expected format.'); return plan; }
    Object.entries(raw || {}).forEach(([key, day]) => {
      if (!Mise.Dates.fromKey(key) || !isObject(day)) return;
      plan[key] = {};
      MEALS.forEach((meal) => {
        plan[key][meal] = Array.isArray(day[meal]) ? day[meal].map((entry) => cleanEntry(entry, recipeIds)).filter(Boolean) : [];
      });
    });
    return plan;
  }

  function cleanPantryItem(raw) {
    if (!isObject(raw) || !isText(raw.id) || !isText(raw.name)) return null;
    return {
      id: raw.id,
      name: raw.name.trim(),
      qty: quantity(raw.qty),
      unit: Mise.Units.ALL_UNITS.includes(raw.unit) ? raw.unit : '',
      aisle: cleanAisle(raw.aisle) || Mise.Aisles.guess(raw.name),
    };
  }

  function cleanPantry(raw, issues) {
    if (raw !== undefined && !Array.isArray(raw)) { issues.push('The pantry is not a list.'); return []; }
    return (raw || []).map(cleanPantryItem).filter(Boolean);
  }

  function cleanManualItem(raw) {
    if (!isObject(raw) || !isText(raw.id) || !isText(raw.name)) return null;
    const ingredient = cleanIngredient(raw);
    return { id: raw.id, qty: ingredient.qty, qtyMax: ingredient.qtyMax, unit: ingredient.unit, name: ingredient.name, aisle: ingredient.aisle };
  }

  function cleanManual(raw) {
    const manual = {};
    if (!isObject(raw)) return manual;
    Object.entries(raw).forEach(([week, items]) => {
      if (Mise.Dates.fromKey(week) && Array.isArray(items)) manual[week] = items.map(cleanManualItem).filter(Boolean);
    });
    return manual;
  }

  function cleanChecked(raw) {
    const checked = {};
    if (!isObject(raw)) return checked;
    Object.entries(raw).forEach(([week, keys]) => {
      if (!Mise.Dates.fromKey(week) || !isObject(keys)) return;
      checked[week] = Object.fromEntries(Object.keys(keys).filter((key) => keys[key] === true).map((key) => [key, true]));
    });
    return checked;
  }

  /** Returns { state, issues }. `state` holds everything readable; `issues` lists what wasn't. */
  function cleanState(raw) {
    const issues = [];
    if (!isObject(raw)) return { state: null, issues: ['The file is not a Mise export.'] };
    const recipes = cleanRecipes(raw.recipes, issues);
    const recipeIds = new Set(recipes.map((recipe) => recipe.id));
    return {
      issues,
      state: {
        recipes,
        plan: cleanPlan(raw.plan, recipeIds, issues),
        pantry: cleanPantry(raw.pantry, issues),
        manual: cleanManual(raw.manual),
        checked: cleanChecked(raw.checked),
        onHand: Array.isArray(raw.onHand) ? raw.onHand.filter(isText) : [],
      },
    };
  }

  return { cleanState, cleanIngredient, cleanRecipe, MEALS };
})();
