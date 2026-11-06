// A one-minute walk through Mise: paste a recipe, plan it, shop for it, cook it.
const project = {
  name: 'Mise',
  tagline: 'Recipe box, weekly meal planner and smart grocery list',
  scope: ['Recipes with paste-to-parse ingredients', 'Weekly planner with drag and drop', 'Grocery list that combines units and subtracts pantry', 'Step-by-step cook mode with timers'],
  accent: '#b23a26',
};

const PASTED = ['1 1/2 cups flour', '2 tbsp olive oil', '3 garlic cloves, minced', '2 (14 oz) cans crushed tomatoes', '1/4 cup basil leaves'].join('\n');
const STEPS = 'Warm the oil and cook the garlic for 1 minute.\nAdd the tomatoes and simmer for 20 minutes.\nStir the flour into a little water, then into the sauce. Finish with basil.';

async function run(d) {
  const { page } = d;

  await d.caption('A recipe box with 16 original recipes, filtered by tag, time or ingredients on hand.', 1700);
  await d.click('.chip:has-text("vegetarian")', { hold: 250 });
  await d.click('.chip:has-text("30 min")', { hold: 400 });

  await d.click('#new-recipe', { hold: 250 });
  await d.caption('Paste an ingredient list as plain text and Mise reads it into structured rows.', 300);
  await d.type('#recipe-title', 'Sunday tomato sauce', { delay: 18, hold: 100 });
  await d.move('#paste-box', 300);
  await page.fill('#paste-box', PASTED);
  await d.wait(800);
  await d.click('#parse-lines', { hold: 200 });
  await page.locator('#ingredient-rows').scrollIntoViewIfNeeded();
  await d.caption('Quantity, unit, name, notes and aisle are all filled in and still editable.', 2100);
  await page.fill('#recipe-steps', STEPS);
  await page.fill('#nutrition-calories', '240');
  await d.click('#save-recipe', { hold: 400 });

  await d.caption('The serving scaler keeps fractions a cook can measure: ¼ cup becomes 6 tbsp.', 300);
  await d.click('#servings-up', { hold: 250 });
  await d.click('#servings-up', { hold: 1300 });

  await d.click('#nav-planner', { hold: 300 });
  await d.caption('Drag a recipe onto the week. Tapping + on any meal does the same on a phone.', 200);
  const shelfItem = page.locator('.shelf-item', { hasText: 'Sunday tomato sauce' });
  await shelfItem.scrollIntoViewIfNeeded();
  await d.drag(shelfItem, page.locator('.slot[data-meal="lunch"]').nth(5), { ms: 800 });
  await d.wait(600);
  await d.poster();

  await d.scroll(520, null, 500);
  await d.caption('Daily and weekly nutrition totals follow the plan, per person.', 2000);
  await d.scroll(-520, null, 400);

  await d.click('#to-groceries', { hold: 300 });
  await d.caption('The grocery list adds up the whole week and groups it by aisle.', 1800);
  await d.move('.grocery-item:has-text("olive oil")', 400);
  await d.caption('Olive oil from 11 recipes adds up across tbsp and cups, minus ½ cup in the pantry.', 2400);
  await d.click('.grocery-item:has-text("olive oil") input', { hold: 200 });
  await d.type('#manual-input', 'paper towels', { delay: 20, hold: 100 });
  await d.press('Enter', 300);
  await d.click('#to-pantry', { hold: 500 });
  await d.caption('Checked items move to the pantry and the list updates. It also prints cleanly.', 2300);

  await page.evaluate(() => { location.hash = '#/cook/red-lentil-soup'; });
  await d.wait(300);
  await d.caption('Cook mode shows one step at a time and offers a timer for each time it finds.', 200);
  await d.click('.step-timer', { hold: 500 });
  await d.click('#cook-next', { hold: 300 });
  await d.click('#cook-next', { hold: 300 });
  await d.click('.step-timer', { hold: 700 });
  await d.caption('Two timers run side by side while you cook. Everything is saved in the browser.', 2400);
}

module.exports = { ...project, run };
