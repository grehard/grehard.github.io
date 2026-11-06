// Nutrition totals for the plan. Counts one serving of each planned meal: what one person eats,
// however many servings are being cooked.
Mise.Nutrition = (() => {
  const FIELDS = [
    { key: 'calories', label: 'Calories', unit: 'kcal' },
    { key: 'protein', label: 'Protein', unit: 'g' },
    { key: 'carbs', label: 'Carbs', unit: 'g' },
    { key: 'fat', label: 'Fat', unit: 'g' },
    { key: 'fiber', label: 'Fiber', unit: 'g' },
  ];
  const MEALS = ['breakfast', 'lunch', 'dinner'];

  function zero() {
    return Object.fromEntries(FIELDS.map((field) => [field.key, 0]));
  }

  function addTo(total, nutrition) {
    FIELDS.forEach(({ key }) => { total[key] += (nutrition && nutrition[key]) || 0; });
  }

  function dayTotals(dayPlan, recipesById) {
    const total = zero();
    const byMeal = {};
    let planned = false;
    MEALS.forEach((meal) => {
      byMeal[meal] = 0;
      ((dayPlan && dayPlan[meal]) || []).forEach((entry) => {
        const recipe = recipesById.get(entry.recipeId);
        if (!recipe) return;
        planned = true;
        addTo(total, recipe.nutrition);
        byMeal[meal] += recipe.nutrition.calories || 0;
      });
    });
    return { total, byMeal, planned };
  }

  /** Totals for each day, the week, and an average across days with something planned. */
  function weekTotals(plan, days, recipesById) {
    const perDay = days.map((day) => ({ ...day, ...dayTotals(plan[day.key], recipesById) }));
    const week = zero();
    perDay.forEach((day) => addTo(week, day.total));
    const plannedDays = perDay.filter((day) => day.planned).length;
    const average = Object.fromEntries(FIELDS.map(({ key }) => [key, plannedDays ? Math.round(week[key] / plannedDays) : 0]));
    return { perDay, week, average, plannedDays };
  }

  return { FIELDS, MEALS, dayTotals, weekTotals };
})();
