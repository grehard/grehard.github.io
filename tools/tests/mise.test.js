// Feature tests for Mise. They drive the real UI; expected values are the ones a cook would check by hand.
const fs = require('fs');
const os = require('os');
const path = require('path');

const nav = async (page, hash) => {
  await page.evaluate((target) => { location.hash = target; }, hash);
  await page.waitForTimeout(60);
};

const section = async (page, name) => {
  await page.click(`#nav-${name}`);
  await page.waitForTimeout(60);
};

const text = (page, selector) => page.locator(selector).first().innerText();

async function ingredientLines(page) {
  return page.locator('#ingredient-list .ingredient').evaluateAll((rows) => rows.map((row) => row.innerText.replace(/\s+/g, ' ').trim()));
}

/** Pastes lines into a new recipe and returns the parsed rows as plain objects. */
async function parseInEditor(page, lines) {
  await nav(page, '#/recipes/new');
  await page.fill('#paste-box', lines.join('\n'));
  await page.click('#parse-lines');
  return page.locator('.ingredient-row').evaluateAll((rows) => rows.map((row) => ({
    qty: row.querySelector('.row-qty').value,
    unit: row.querySelector('.row-unit').value,
    name: row.querySelector('.row-name').value,
    note: row.querySelector('.row-note').value,
    aisle: row.querySelector('.row-aisle').value,
  })));
}

/** Creates a one-ingredient-list recipe through the editor and returns to its page. */
async function createRecipe(page, title, lines, servings = 1) {
  await parseInEditor(page, lines);
  await page.fill('#recipe-title', title);
  await page.fill('#recipe-servings', String(servings));
  await page.fill('#recipe-steps', 'Mix everything together.');
  await page.click('#save-recipe');
  await page.waitForSelector('#ingredient-list');
}

/** Empties the seeded week, manual items and pantry so a grocery test sees only its own numbers. */
async function emptyWeekAndPantry(page) {
  await nav(page, '#/planner');
  if (await page.locator('#clear-week').count()) await page.click('#clear-week');
  await nav(page, '#/groceries');
  for (;;) {
    const removeManual = page.locator('.grocery-item button[aria-label^="Delete"]');
    if (!(await removeManual.count())) break;
    await removeManual.first().click();
  }
  await nav(page, '#/pantry');
  for (;;) {
    const remove = page.locator('.pantry-row button[aria-label^="Delete"]');
    if (!(await remove.count())) break;
    await remove.first().click();
  }
}

async function planThisWeek(page, title, servings) {
  await nav(page, '#/planner');
  await page.locator('.slot[data-meal="dinner"] .slot-add').first().click();
  await page.fill('#picker-search', title);
  await page.locator('.picker-row', { hasText: title }).first().click();
  if (servings) {
    await page.locator('.entry', { hasText: title }).first().click();
    await page.fill('#entry-servings', String(servings));
    await page.click('#entry-save');
  }
}

async function groceryRows(page) {
  return page.locator('.grocery-item label').evaluateAll((labels) => labels.map((label) => label.innerText.replace(/\s+/g, ' ').trim()));
}

module.exports = {
  'first run shows at least 14 seed recipes and a planned week': async ({ page, assert }) => {
    assert.ok(await page.locator('.recipe-card').count() >= 14);
    await section(page, 'planner');
    assert.ok(await page.locator('.entry').count() >= 10, 'seed plan should fill the week');
  },

  'parses free-text ingredient lines into exact structured data': async ({ page, assert }) => {
    const rows = await parseInEditor(page, [
      '1 1/2 cups flour',
      '2 large eggs, beaten',
      '3 garlic cloves, minced',
      '2 (14 oz) cans crushed tomatoes',
      '1½ tbsp. olive oil',
      '250g butter',
      'juice of 1 lemon',
      'a pinch of salt',
      'black pepper to taste',
      '1-2 tsp cumin',
      '1 cup plus 2 tablespoons milk',
    ]);
    assert.deepStrictEqual(rows, [
      { qty: '1½', unit: 'cup', name: 'flour', note: '', aisle: 'Baking' },
      { qty: '2', unit: '', name: 'eggs', note: 'large, beaten', aisle: 'Dairy and eggs' },
      { qty: '3', unit: 'clove', name: 'garlic', note: 'minced', aisle: 'Produce' },
      { qty: '2', unit: 'can', name: 'crushed tomatoes', note: '14 oz', aisle: 'Canned and jarred' },
      { qty: '1½', unit: 'tbsp', name: 'olive oil', note: '', aisle: 'Oils and spices' },
      { qty: '250', unit: 'g', name: 'butter', note: '', aisle: 'Dairy and eggs' },
      { qty: '1', unit: '', name: 'lemon', note: 'juice', aisle: 'Produce' },
      { qty: '1', unit: 'pinch', name: 'salt', note: '', aisle: 'Oils and spices' },
      { qty: '', unit: '', name: 'black pepper', note: 'to taste', aisle: 'Oils and spices' },
      { qty: '1-2', unit: 'tsp', name: 'cumin', note: '', aisle: 'Oils and spices' },
      { qty: '1⅛', unit: 'cup', name: 'milk', note: '', aisle: 'Dairy and eggs' },
    ]);
  },

  'paste reports lines it cannot read and skips headings': async ({ page, assert }) => {
    const rows = await parseInEditor(page, ['For the sauce:', '2 cups', '0 cups rice', '1 onion']);
    assert.deepStrictEqual(rows.map((row) => row.name), ['onion']);
    assert.match(await text(page, '#parse-status'), /Could not read 2/);
    assert.strictEqual(await page.inputValue('#paste-box'), '2 cups\n0 cups rice');
  },

  'recipe form validates and shows errors in the page': async ({ page, assert }) => {
    await nav(page, '#/recipes/new');
    await page.fill('#recipe-servings', '0');
    await page.click('#save-recipe');
    const errors = await text(page, '#form-errors');
    assert.match(errors, /Give the recipe a title/);
    assert.match(errors, /Add at least one ingredient/);
    assert.match(errors, /Add at least one step/);
    assert.match(errors, /Servings must be a number from 1 to 100/);
    assert.ok(page.url().endsWith('#/recipes/new'), 'should stay on the form');

    await parseInEditor(page, ['1 onion']);
    await page.locator('.row-qty').first().fill('lots');
    await page.fill('#recipe-title', 'Onion');
    await page.fill('#recipe-steps', 'Slice.');
    await page.click('#save-recipe');
    assert.match(await text(page, '#form-errors'), /"lots" isn't a quantity for onion/);
  },

  'serving scaler produces sensible fractions': async ({ page, assert }) => {
    await createRecipe(page, 'Scaling check', ['1/3 cup milk', '3/4 cup stock', '1/4 cup oil', '1 tbsp vinegar', '1 1/2 cups rice', '1 egg', '250 g butter', '1/8 tsp nutmeg'], 4);
    assert.deepStrictEqual(await ingredientLines(page), ['⅓ cup milk', '¾ cup stock', '¼ cup oil', '1 tbsp vinegar', '1½ cups rice', '1 egg', '250 g butter', '⅛ tsp nutmeg']);

    await page.click('#servings-down');
    await page.click('#servings-down');
    assert.deepStrictEqual(await ingredientLines(page), ['8 tsp milk', '6 tbsp stock', '2 tbsp oil', '1½ tsp vinegar', '¾ cup rice', '½ egg', '125 g butter', '1 pinch nutmeg']);

    await page.fill('#servings', '12');
    await page.locator('#servings').blur();
    assert.deepStrictEqual(await ingredientLines(page), ['1 cup milk', '2¼ cups stock', '¾ cup oil', '3 tbsp vinegar', '4½ cups rice', '3 eggs', '750 g butter', '⅜ tsp nutmeg']);

    await page.click('#servings-reset');
    assert.strictEqual((await ingredientLines(page))[0], '⅓ cup milk');
  },

  'grocery list combines compatible units exactly': async ({ page, assert }) => {
    await emptyWeekAndPantry(page);
    await createRecipe(page, 'Combine check', [
      '2 tbsp olive oil', '1/4 cup extra-virgin olive oil',
      '1 cup milk', '120 ml milk',
      '8 oz beef', '1 lb beef',
      '3 tsp cumin', '1 tbsp cumin',
      '1 cup flour', '100 g flour',
      '1/2 lemon', '1 lemon',
      '2 cloves garlic', '1 clove garlic',
    ]);
    await planThisWeek(page, 'Combine check');
    await page.click('#to-groceries');
    await page.waitForSelector('#grocery-title');
    assert.deepStrictEqual((await groceryRows(page)).sort(), [
      '1 cup + 100 g flour',
      '1½ cups milk',
      '1½ lb beef',
      '2 lemons',
      '2 tbsp cumin',
      '3 cloves garlic',
      '6 tbsp olive oil',
    ]);
    const lemon = await page.locator('.grocery-item', { hasText: 'lemons' }).innerText();
    assert.match(lemon, /1½ needed/);
  },

  'grocery list subtracts pantry stock across units': async ({ page, assert }) => {
    await emptyWeekAndPantry(page);
    await createRecipe(page, 'Pantry check', ['2 1/2 cups flour', '3 eggs', '1 tsp salt', '1 cup sugar', '3 cups oats', '1/2 cup honey'], 2);
    await planThisWeek(page, 'Pantry check', 4); // Doubled, so the amounts below are 5 cups, 6 eggs, and so on.

    await nav(page, '#/pantry');
    for (const line of ['1 cup flour', '1 dozen eggs', 'salt', '4 tbsp sugar', '2 lb oats']) {
      await page.fill('#pantry-input', line);
      await page.click('#pantry-add');
    }
    await section(page, 'groceries');
    assert.deepStrictEqual((await groceryRows(page)).sort(), ['1 cup honey', '1¾ cups sugar', '4 cups flour', '6 cups oats'].sort());

    const flour = await page.locator('.grocery-item', { hasText: 'flour' }).innerText();
    assert.match(flour, /After 1 cup from the pantry/);
    const oats = await page.locator('.grocery-item', { hasText: 'oats' }).innerText();
    assert.match(oats, /different measure/);

    await page.locator('#covered summary').click();
    assert.match(await text(page, '[data-covered="egg"]'), /Need 6, have 1\s*dozen|Need 6, have 12/);
    assert.match(await text(page, '[data-covered="salt"]'), /always stocked/);
  },

  'check-off and manual items persist after reload, with print styles': async ({ page, assert, reload }) => {
    await section(page, 'groceries');
    await page.fill('#manual-input', '');
    await page.click('#manual-add');
    assert.match(await text(page, '.manual-form .field-error'), /Enter an item/);

    await page.fill('#manual-input', '2 lemons');
    await page.click('#manual-add');
    const manualRow = page.locator('.grocery-item', { hasText: '2 lemons' }).filter({ hasText: 'Added by you' });
    assert.ok(await manualRow.count(), 'manual item appears');
    assert.strictEqual(await manualRow.locator('xpath=ancestor::section').getAttribute('data-aisle'), 'Produce');
    await manualRow.locator('input[type=checkbox]').check();

    await reload();
    const restored = page.locator('.grocery-item', { hasText: '2 lemons' }).filter({ hasText: 'Added by you' });
    assert.ok(await restored.locator('input[type=checkbox]').isChecked(), 'check survives reload');

    await page.emulateMedia({ media: 'print' });
    assert.strictEqual(await page.locator('.app-header').evaluate((el) => getComputedStyle(el).display), 'none');
    assert.strictEqual(await page.locator('#manual-input').isVisible(), false);
    assert.ok(await page.locator('.aisle').first().isVisible());
    await page.emulateMedia({ media: 'screen' });
  },

  'planner drags a recipe into a slot and moves an entry between days': async ({ page, assert }) => {
    await section(page, 'planner');
    await page.click('#clear-week');
    assert.ok(await page.locator('#week-empty').isVisible());

    const slots = page.locator('.slot[data-meal="lunch"]');
    const drag = async (from, to) => {
      const a = await from.boundingBox();
      const b = await to.boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
      await page.mouse.up();
    };
    const shelfItem = page.locator('.shelf-item', { hasText: 'Red lentil soup' });
    await shelfItem.scrollIntoViewIfNeeded();
    await drag(shelfItem, slots.nth(2));
    assert.strictEqual(await slots.nth(2).locator('.entry').count(), 1);
    assert.match(await slots.nth(2).innerText(), /Red lentil soup/);

    await drag(slots.nth(2).locator('.entry'), slots.nth(4));
    assert.strictEqual(await slots.nth(2).locator('.entry').count(), 0);
    assert.match(await slots.nth(4).innerText(), /Red lentil soup/);
  },

  'touch: press and hold drags a meal, while a quick swipe does not': async ({ page, context, assert }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await nav(page, '#/planner');
    const cdp = await context.newCDPSession(page);
    const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });
    const centre = async (locator) => {
      const box = await locator.boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const firstDay = page.locator('.day').first();
    const source = firstDay.locator('.slot[data-meal="breakfast"] .entry');
    const target = firstDay.locator('.slot[data-meal="lunch"]');
    const moved = await source.innerText();
    const from = await centre(source);
    const to = await centre(target);

    await touch('touchStart', from);
    await touch('touchMove', { x: from.x, y: from.y + 40 });
    await touch('touchEnd');
    await page.waitForTimeout(350);
    assert.strictEqual(await firstDay.locator('.slot[data-meal="breakfast"] .entry').count(), 1, 'a swipe must not move the meal');

    await touch('touchStart', from);
    await page.waitForTimeout(350);
    await touch('touchMove', { x: from.x + 4, y: from.y + 10 });
    await touch('touchMove', to);
    await touch('touchEnd');
    await page.waitForTimeout(100);
    assert.strictEqual(await firstDay.locator('.slot[data-meal="breakfast"] .entry').count(), 0);
    assert.ok((await target.innerText()).includes(moved.split('\n')[0]));
  },

  'tap to add, week navigation and removing a meal with undo': async ({ page, assert }) => {
    await section(page, 'planner');
    const title = await text(page, '#week-title');
    await page.click('#next-week');
    await page.waitForTimeout(50);
    assert.notStrictEqual(await text(page, '#week-title'), title);
    await page.click('#next-week');
    await page.waitForTimeout(50);
    assert.strictEqual(await page.locator('.entry').count(), 0);
    assert.ok(await page.locator('#week-empty').isVisible());

    await page.locator('.slot[data-meal="breakfast"] .slot-add').first().click();
    await page.locator('.picker-row', { hasText: 'Baked oats' }).click();
    assert.strictEqual(await page.locator('.entry').count(), 1);

    await page.locator('.entry').first().click();
    await page.click('#entry-remove');
    assert.strictEqual(await page.locator('.entry').count(), 0);
    await page.locator('.toast-undo').click();
    assert.strictEqual(await page.locator('.entry').count(), 1);

    await page.click('#prev-week');
    await page.waitForTimeout(50);
    await page.click('#this-week');
    await page.waitForTimeout(50);
    assert.strictEqual(await text(page, '#week-title'), title);
  },

  'nutrition totals add up for the day and the week': async ({ page, assert }) => {
    await emptyWeekAndPantry(page);
    await createRecipe(page, 'Nutrition check', ['1 onion']);
    await nav(page, '#/recipes');
    await page.click('text=Nutrition check');
    await page.click('#edit-recipe');
    await page.fill('#nutrition-calories', '1000');
    await page.fill('#nutrition-protein', '40');
    await page.click('#save-recipe');
    await page.waitForSelector('#ingredient-list');

    await nav(page, '#/planner');
    const add = async (meal, column) => {
      await page.locator(`.slot[data-meal="${meal}"] .slot-add`).nth(column).click();
      await page.fill('#picker-search', 'Nutrition check');
      await page.locator('.picker-row').first().click();
    };
    await add('breakfast', 0);
    await add('dinner', 0);
    await add('lunch', 1);

    const row = (id) => page.locator(`#nutrition-table tr[data-row="${id}"] td`).allInnerTexts();
    const monday = await page.locator('.slot').first().getAttribute('data-day');
    assert.strictEqual((await row(monday))[0], '2,000');
    assert.strictEqual((await row(monday))[1], '80');
    const week = await row('week-total');
    assert.strictEqual(week[0], '3,000');
    assert.strictEqual(week[1], '120');
    const average = await row('day-average');
    assert.strictEqual(average[0], '1,500');
    assert.match(await page.locator('.day-kcal').first().innerText(), /2,000 kcal/);
  },

  'search and filter by tag, time and ingredients on hand': async ({ page, assert }) => {
    const titles = () => page.locator('.card-title').allInnerTexts();
    await page.fill('#recipe-search', 'salmon');
    assert.deepStrictEqual(await titles(), ['Sheet pan salmon with fennel and potatoes']);
    await page.fill('#recipe-search', '');

    await page.click('.chip:has-text("breakfast")');
    await page.click('.chip:has-text("30 min")');
    const breakfasts = await titles();
    assert.ok(breakfasts.length >= 2 && breakfasts.every(Boolean));
    assert.ok(!breakfasts.includes('Baked oats with pear and cardamom'), '45 minute recipe is filtered out');
    await page.click('#clear-filters');

    await page.fill('#onhand-input', 'chickpeas');
    await page.click('#onhand-add');
    assert.deepStrictEqual(await titles(), ['Olive oil chickpeas with kale and lemon']);
    assert.match(await text(page, '.card-match'), /^1 of 10 on hand/);

    await page.click('#clear-filters');
    await page.check('#use-pantry');
    await page.selectOption('#max-missing', '2');
    assert.ok((await titles()).length < 16);
    assert.strictEqual(await page.locator('#results-count').innerText(), `${(await titles()).length} recipes`);
    await page.selectOption('#max-missing', '');
    await page.fill('#recipe-search', 'nothing matches this at all');
    assert.ok(await page.locator('.empty').isVisible());
  },

  'cook mode steps through a recipe with scaled ingredients and timers': async ({ page, assert }) => {
    await nav(page, '#/recipes/red-lentil-soup');
    await page.click('#servings-up');
    await page.click('#start-cooking');
    await page.waitForSelector('#cook-text');
    assert.strictEqual(await text(page, '#cook-count'), 'Step 1 of 4');
    assert.strictEqual(await page.locator('.cook-side .is-ticked').count(), 0);
    assert.match(await text(page, '.cook-ingredients'), /1¾ cups red lentils/);

    const stepTimer = page.locator('.step-timer').first();
    assert.strictEqual(await stepTimer.innerText(), 'Start 8 min timer');
    await stepTimer.click();
    assert.match(await text(page, '.timer-time'), /^(8:00|7:5\d)$/);
    await page.keyboard.press('ArrowRight');
    assert.strictEqual(await text(page, '#cook-count'), 'Step 2 of 4');

    await page.fill('#timer-minutes', '0');
    await page.fill('#timer-seconds', '0');
    await page.click('#timer-add');
    assert.match(await text(page, '#timer-seconds-error'), /between 1 second and 10 hours/);
    await page.fill('#timer-seconds', '1');
    await page.click('#timer-add');
    await page.waitForSelector('.timer.is-done', { timeout: 4000 });
    assert.match(await page.locator('.toast').innerText(), /Timer done/);

    await page.click('#cook-next');
    await page.click('#cook-next');
    await page.click('#cook-finish');
    await page.waitForSelector('#ingredient-list');
    assert.ok(await page.locator('#timer-pill').isVisible(), 'the running timer stays visible outside cook mode');
  },

  'deleting a recipe can be undone and also clears it from the plan': async ({ page, assert }) => {
    const count = await page.locator('.recipe-card').count();
    await nav(page, '#/planner');
    const planned = await page.locator('.entry', { hasText: 'Red lentil soup' }).count();
    assert.ok(planned > 0);

    await nav(page, '#/recipes/red-lentil-soup');
    await page.click('#delete-recipe');
    await page.waitForSelector('.recipe-grid');
    assert.strictEqual(await page.locator('.recipe-card').count(), count - 1);
    await page.click('.toast-undo');
    assert.strictEqual(await page.locator('.recipe-card').count(), count);
    await nav(page, '#/planner');
    assert.strictEqual(await page.locator('.entry', { hasText: 'Red lentil soup' }).count(), planned);
  },

  'pantry supports add, edit, delete with undo, search and validation': async ({ page, assert, reload }) => {
    await section(page, 'pantry');
    await page.click('#pantry-add');
    assert.match(await text(page, '.manual-form .field-error'), /Enter an item/);

    await page.fill('#pantry-input', '2 cups lentils');
    await page.click('#pantry-add');
    const row = page.locator('.pantry-row', { hasText: 'lentils' });
    assert.match(await row.innerText(), /2 cups/);

    await row.locator('button[aria-label^="Edit"]').click();
    await page.fill('#pantry-edit-qty', 'none');
    await page.click('#pantry-edit-save');
    assert.match(await page.locator('.modal .field-error:visible').first().innerText(), /amount above zero/);
    await page.fill('#pantry-edit-qty', '1 1/2');
    await page.click('#pantry-edit-save');
    assert.match(await row.innerText(), /1½ cups/);

    await reload();
    assert.match(await page.locator('.pantry-row', { hasText: 'lentils' }).innerText(), /1½ cups/);

    await page.locator('.pantry-row', { hasText: 'lentils' }).locator('button[aria-label^="Delete"]').click();
    assert.strictEqual(await page.locator('.pantry-row', { hasText: 'lentils' }).count(), 0);
    await page.click('.toast-undo');
    assert.strictEqual(await page.locator('.pantry-row', { hasText: 'lentils' }).count(), 1);

    await page.fill('#pantry-search', 'soy');
    assert.deepStrictEqual(await page.locator('.pantry-name').allInnerTexts(), ['soy sauce']);
  },

  'a new recipe persists after reload, and can be edited': async ({ page, assert, reload }) => {
    await createRecipe(page, 'Weeknight dal', ['1 cup red lentils', '2 tbsp butter'], 2);
    await reload();
    assert.strictEqual(await text(page, '.recipe-head h1'), 'Weeknight dal');
    assert.deepStrictEqual(await ingredientLines(page), ['1 cup red lentils', '2 tbsp butter']);

    await page.click('#edit-recipe');
    await page.fill('#recipe-title', 'Weeknight dal <b>again</b>');
    await page.click('#save-recipe');
    await page.waitForSelector('#ingredient-list');
    assert.strictEqual(await text(page, '.recipe-head h1'), 'Weeknight dal <b>again</b>', 'user text stays text');
    assert.strictEqual(await page.locator('.recipe-head h1 b').count(), 0);
  },

  'export then import restores the data, and bad files show errors': async ({ page, assert }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mise-test-'));
    await createRecipe(page, 'Export check', ['1 cup rice']);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-data')]);
    const file = path.join(dir, 'export.json');
    await download.saveAs(file);
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(exported.recipes.some((recipe) => recipe.title === 'Export check'));
    assert.deepStrictEqual(exported.recipes.find((recipe) => recipe.title === 'Export check').ingredients[0].qty, 1);

    await page.click('#reset-demo');
    await nav(page, '#/recipes');
    await page.waitForSelector('.recipe-card');
    assert.strictEqual(await page.locator('.card-title', { hasText: 'Export check' }).count(), 0);

    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{ not json');
    await page.setInputFiles('#import-file', bad);
    await page.waitForSelector('#import-errors');
    assert.match(await text(page, '#import-errors'), /not valid JSON/);
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.modal').count(), 0, 'Escape closes the modal');

    const invalid = path.join(dir, 'invalid.json');
    fs.writeFileSync(invalid, JSON.stringify({ recipes: [{ id: 'x', title: 'No ingredients', steps: ['Stir.'] }] }));
    await page.setInputFiles('#import-file', invalid);
    await page.waitForSelector('#import-errors');
    assert.match(await text(page, '#import-errors'), /"No ingredients" has no readable ingredients/);
    await page.keyboard.press('Escape');

    await page.setInputFiles('#import-file', file);
    await page.waitForSelector('#import-summary');
    await page.click('#import-confirm');
    assert.strictEqual(await page.locator('.card-title', { hasText: 'Export check' }).count(), 1);
    fs.rmSync(dir, { recursive: true, force: true });
  },

  'reset demo data restores the seed, and corrupt storage does not crash': async ({ page, assert, reload }) => {
    await section(page, 'pantry');
    const before = await page.locator('.pantry-row').count();
    await page.locator('.pantry-row button[aria-label^="Delete"]').first().click();
    await page.click('#reset-demo');
    assert.strictEqual(await page.locator('.pantry-row').count(), before);
    await page.click('.toast-undo');
    assert.strictEqual(await page.locator('.pantry-row').count(), before - 1);
    await page.click('#reset-demo');

    await page.evaluate(() => localStorage.setItem('mise.data.v1', '{"recipes": "oops"'));
    await reload();
    await section(page, 'recipes');
    assert.ok(await page.locator('.recipe-card').count() >= 14, 'falls back to seed data');

    await page.evaluate(() => localStorage.setItem('mise.data.v1', JSON.stringify({ recipes: [{ id: 'a', title: 'Kept', ingredients: [{ name: 'salt' }, 'junk'], steps: ['Stir.', 5] }, null], plan: 'x', pantry: {} })));
    await reload();
    assert.deepStrictEqual(await page.locator('.card-title').allInnerTexts(), ['Kept']);
  },

  'theme toggle is remembered and dark mode applies': async ({ page, assert, reload }) => {
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await background();
    await page.click('#theme-toggle');
    const dark = await background();
    assert.notStrictEqual(light, dark);
    await reload();
    assert.strictEqual(await background(), dark);
  },

  'works at phone width: planner tap-to-add and no sideways scroll on any screen': async ({ page, assert }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    for (const hash of ['#/recipes', '#/recipes/red-lentil-soup', '#/recipes/new', '#/planner', '#/groceries', '#/pantry', '#/cook/red-lentil-soup']) {
      await nav(page, hash);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `${hash} overflows by ${overflow}px`);
    }
    await nav(page, '#/planner');
    await page.click('#clear-week');
    await page.locator('.slot[data-meal="lunch"] .slot-add').nth(2).click();
    await page.locator('.picker-row').first().click();
    assert.strictEqual(await page.locator('.entry').count(), 1);
  },
};
