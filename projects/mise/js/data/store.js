// The app's single source of truth. Every change goes through update(), which saves and re-renders.
// Destructive changes pass an undo message: the previous state is kept for the undo toast to restore.
Mise.Store = (() => {
  const STORAGE_KEY = 'mise.data.v1';
  const EXPORT_VERSION = 1;
  let state = null;
  let storageWorks = true;
  let onChange = () => {};
  let idCounter = 0;

  function newId() {
    idCounter += 1;
    return `${Date.now().toString(36)}-${idCounter.toString(36)}`;
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function save() {
    storageWorks = writeStorage(STORAGE_KEY, JSON.stringify(state));
  }

  function fromStorage() {
    const stored = readStorage(STORAGE_KEY);
    if (!stored) return null;
    try {
      const { state: clean } = Mise.Validate.cleanState(JSON.parse(stored));
      return clean && clean.recipes.length ? clean : null;
    } catch (error) {
      return null;
    }
  }

  function load() {
    state = fromStorage() || Mise.Seed.build(newId);
    save();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function restore(snapshot) {
    state = snapshot;
    save();
    onChange();
  }

  /**
   * Applies a change. With `undo` set, shows a toast offering to put back the previous state.
   */
  function update(change, undo) {
    const before = undo ? clone(state) : null;
    change(state);
    save();
    onChange();
    if (undo) Mise.Toast.show(undo, { undo: () => restore(before) });
  }

  function recipeById(id) {
    return state.recipes.find((recipe) => recipe.id === id) || null;
  }

  function recipesById() {
    return new Map(state.recipes.map((recipe) => [recipe.id, recipe]));
  }

  /** Every planned meal in a week, as { recipe, servings } for the grocery list. */
  function mealsInWeek(mondayKey) {
    const byId = recipesById();
    const meals = [];
    Mise.Dates.weekDays(mondayKey).forEach((day) => {
      Mise.Validate.MEALS.forEach((meal) => {
        const entries = (state.plan[day.key] && state.plan[day.key][meal]) || [];
        entries.forEach((entry) => {
          if (byId.has(entry.recipeId)) meals.push({ recipe: byId.get(entry.recipeId), servings: entry.servings });
        });
      });
    });
    return meals;
  }

  function dayPlan(key) {
    if (!state.plan[key]) state.plan[key] = { breakfast: [], lunch: [], dinner: [] };
    return state.plan[key];
  }

  function removeEntry(entryId) {
    Object.values(state.plan).forEach((day) => {
      Mise.Validate.MEALS.forEach((meal) => {
        day[meal] = day[meal].filter((entry) => entry.id !== entryId);
      });
    });
  }

  function findEntry(entryId) {
    for (const [dayKey, day] of Object.entries(state.plan)) {
      for (const meal of Mise.Validate.MEALS) {
        const entry = day[meal].find((candidate) => candidate.id === entryId);
        if (entry) return { entry, dayKey, meal };
      }
    }
    return null;
  }

  function deleteRecipe(id) {
    state.recipes = state.recipes.filter((recipe) => recipe.id !== id);
    Object.values(state.plan).forEach((day) => {
      Mise.Validate.MEALS.forEach((meal) => {
        day[meal] = day[meal].filter((entry) => entry.recipeId !== id);
      });
    });
  }

  function exportText() {
    return JSON.stringify({ app: 'mise', version: EXPORT_VERSION, exportedAt: new Date().toISOString(), ...state }, null, 2);
  }

  /** Reads an export file. Returns { state } when usable, otherwise { errors }. */
  function parseImport(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      return { errors: ['The file is not valid JSON.'] };
    }
    const { state: clean, issues } = Mise.Validate.cleanState(raw);
    if (issues.length) return { errors: issues };
    if (!clean.recipes.length) return { errors: ['The file has no recipes.'] };
    return { state: clean };
  }

  function replaceAll(next, undoMessage) {
    update((current) => { Object.assign(current, next); }, undoMessage);
  }

  function resetToSeed() {
    replaceAll(Mise.Seed.build(newId), 'Demo data restored.');
  }

  return {
    get state() { return state; },
    get storageWorks() { return storageWorks; },
    set onChange(listener) { onChange = listener; },
    load, update, newId, readStorage, writeStorage,
    recipeById, recipesById, mealsInWeek, dayPlan, removeEntry, findEntry, deleteRecipe,
    exportText, parseImport, replaceAll, resetToSeed,
  };
})();
