// Shows an ingredient at a chosen number of servings.
Mise.Scaling = (() => {
  const { formatAmount, scaleAmount } = Mise.Units;
  const { forCount } = Mise.Names;

  /** Returns display strings for one ingredient, e.g. { amount: "1½ cups", name: "flour", note: "" }. */
  function scaledIngredient(ingredient, factor) {
    const scaled = scaleAmount(ingredient.qty, ingredient.unit, ingredient.qtyMax, factor);
    const bareCount = scaled.qty !== null && !scaled.unit;
    return {
      amount: formatAmount(scaled.qty, scaled.unit, scaled.qtyMax),
      name: bareCount ? forCount(ingredient.name, scaled.qtyMax || scaled.qty) : ingredient.name,
      note: ingredient.note || '',
    };
  }

  function factorFor(recipe, servings) {
    return servings / recipe.servings;
  }

  return { scaledIngredient, factorFor };
})();
