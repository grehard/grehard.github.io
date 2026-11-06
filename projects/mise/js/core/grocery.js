// Builds the shopping list: adds up what the week's recipes need, then takes away the pantry.
Mise.Grocery = (() => {
  const { familyOf, toBase, isMetric, best, formatAmount } = Mise.Units;
  const Names = Mise.Names;

  // An amount this small relative to the need is conversion rounding, not something to buy.
  const ROUNDING_RATIO = 0.01;

  function addAmount(amounts, family, base, metric) {
    const existing = amounts.find((amount) => amount.family === family);
    if (existing) {
      existing.base += base;
      existing.metric = existing.metric && metric;
    } else {
      amounts.push({ family, base, metric });
    }
  }

  function newNeed(ingredient) {
    return {
      key: Names.key(ingredient.name),
      name: Names.display(ingredient.name),
      aisle: ingredient.aisle || Mise.Aisles.guess(ingredient.name),
      amounts: [],
      sources: [],
    };
  }

  function addIngredient(need, ingredient, factor) {
    if (ingredient.qty === null || ingredient.qty === undefined) return;
    // A range is shopped at its top end so there is enough either way.
    const qty = Math.max(ingredient.qtyMax || 0, ingredient.qty) * factor;
    addAmount(need.amounts, familyOf(ingredient.unit), toBase(qty, ingredient.unit), isMetric(ingredient.unit));
  }

  /** Adds up ingredients across meals. `meals` is a list of { recipe, servings }. */
  function combine(meals) {
    const needs = new Map();
    meals.forEach(({ recipe, servings }) => {
      const factor = servings / recipe.servings;
      recipe.ingredients.forEach((ingredient) => {
        const key = Names.key(ingredient.name);
        if (!needs.has(key)) needs.set(key, newNeed(ingredient));
        const need = needs.get(key);
        addIngredient(need, ingredient, factor);
        if (!need.sources.includes(recipe.title)) need.sources.push(recipe.title);
      });
    });
    return [...needs.values()];
  }

  function describeAmount(amount) {
    const shown = best(amount.family, amount.base, amount.metric);
    return formatAmount(shown.qty, shown.unit);
  }

  function describeStock(stock) {
    return stock.map((item) => (item.qty === null ? 'always stocked' : formatAmount(item.qty, item.unit))).join(' + ');
  }

  /** What is left to buy of one amount after using matching pantry stock. */
  function subtractStock(amount, stock) {
    const have = stock
      .filter((item) => item.qty !== null && familyOf(item.unit) === amount.family)
      .reduce((total, item) => total + toBase(item.qty, item.unit), 0);
    const left = amount.base - have;
    return { ...amount, base: left <= amount.base * ROUNDING_RATIO ? 0 : left, matched: have > 0 };
  }

  function applyPantry(need, pantry) {
    const stock = pantry.filter((item) => Names.key(item.name) === need.key);
    if (!stock.length) return { ...need, toBuy: need.amounts, covered: false, unmatched: false, stock };
    if (stock.some((item) => item.qty === null)) return { ...need, toBuy: [], covered: true, unmatched: false, stock };

    const results = need.amounts.map((amount) => subtractStock(amount, stock));
    const toBuy = results.filter((amount) => amount.base > 0);
    const unmatched = toBuy.some((amount) => !amount.matched);
    return { ...need, toBuy, covered: toBuy.length === 0, unmatched, stock };
  }

  function roundCountsUp(amount) {
    return amount.family.startsWith('count') ? { ...amount, base: Math.ceil(amount.base - 1e-6) } : amount;
  }

  function nameFor(need, toBuy) {
    const onlyCount = toBuy.length === 1 && toBuy[0].family === 'count' ? toBuy[0] : null;
    return onlyCount ? Names.forCount(need.name, onlyCount.base) : need.name;
  }

  function fractionNote(toBuy) {
    const partial = toBuy.find((amount) => amount.family.startsWith('count') && Math.abs(amount.base - Math.round(amount.base)) > 1e-6);
    return partial ? `${describeAmount(partial)} needed` : '';
  }

  function coveredNote(result, have) {
    if (!result.amounts.length) return have === 'always stocked' ? 'Always stocked' : `Have ${have}`;
    const need = result.amounts.map(describeAmount).join(' + ');
    return have === 'always stocked' ? `Need ${need}, always stocked` : `Need ${need}, have ${have}`;
  }

  function pantryNote(result) {
    if (!result.stock.length) return '';
    const have = describeStock(result.stock);
    if (result.unmatched) return `Pantry has ${have}, in a different measure. Check it's enough.`;
    if (result.covered) return coveredNote(result, have);
    return `After ${have} from the pantry`;
  }

  function toListItem(result) {
    const toBuy = result.toBuy.map(roundCountsUp);
    return {
      key: result.key,
      name: nameFor(result, toBuy),
      aisle: result.aisle,
      amountText: toBuy.map(describeAmount).join(' + '),
      amounts: toBuy,
      covered: result.covered,
      sources: result.sources,
      fractionNote: fractionNote(result.toBuy),
      pantryNote: pantryNote(result),
    };
  }

  /** The finished list: every ingredient, with what's left to buy and why. */
  function buildList(meals, pantry) {
    return combine(meals).map((need) => toListItem(applyPantry(need, pantry)));
  }

  function groupByAisle(items) {
    const byAisle = new Map(Mise.Aisles.LIST.map((aisle) => [aisle, []]));
    items.forEach((item) => {
      byAisle.get(byAisle.has(item.aisle) ? item.aisle : 'Other').push(item);
    });
    return [...byAisle.entries()]
      .filter(([, list]) => list.length)
      .map(([aisle, list]) => ({ aisle, items: list.sort((a, b) => a.name.localeCompare(b.name)) }));
  }

  /** Adds bought amounts to pantry rows, merging into a row of the same kind of measure. */
  function addToStock(pantry, purchase, makeId) {
    const next = pantry.map((item) => ({ ...item }));
    const key = Names.key(purchase.name);
    purchase.amounts.forEach((amount) => {
      const row = next.find((item) => Names.key(item.name) === key && item.qty !== null && familyOf(item.unit) === amount.family);
      const merged = row
        ? best(amount.family, toBase(row.qty, row.unit) + amount.base, isMetric(row.unit) && amount.metric)
        : best(amount.family, amount.base, amount.metric);
      if (row) Object.assign(row, { qty: merged.qty, unit: merged.unit });
      else next.push({ id: makeId(), name: key, qty: merged.qty, unit: merged.unit, aisle: purchase.aisle });
    });
    return next;
  }

  return { combine, buildList, groupByAisle, addToStock, describeAmount };
})();
