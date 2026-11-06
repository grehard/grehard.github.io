# Mise

A recipe box, weekly meal planner and grocery list for home cooks.

Author: Grehard

## Features

- Recipes with structured ingredients (quantity, unit, name, aisle), steps, times, servings, tags and nutrition per serving. Sixteen original recipes are included.
- Paste-to-parse: free-text lines such as `1 1/2 cups flour`, `2 (14 oz) cans crushed tomatoes` or `juice of 1 lemon` become structured rows you can check and correct.
- Serving scaler with fractions a cook can measure.
- Search and filter by tag, time and ingredients on hand, optionally counting the pantry.
- Pantry list, with amounts or "always stocked" staples.
- Weekly planner across breakfast, lunch and dinner, with drag and drop, tap-to-add and previous/next week navigation.
- Grocery list generated from the week: combines the same ingredient across compatible units, subtracts the pantry, groups by aisle, and has check-off, manual items and a print stylesheet.
- Cook mode, one step at a time, with timers offered for times mentioned in each step.
- Daily and weekly nutrition totals, with a hand-built SVG chart and a table.
- JSON export and validated import, light and dark themes, undo for destructive actions.

## Running it

Open `index.html`, or serve the folder with any static server. There is no build step and there are no dependencies.

## How the code is organized

- `js/core/`: logic with no DOM access.
  - `fractions.js`: reads and formats quantities.
  - `units.js`: unit table, conversions, and choosing the clearest unit.
  - `names.js`, `aisles.js`: ingredient identity and aisle guesses.
  - `ingredient-parser.js`: free text to structured ingredient.
  - `scaling.js`, `grocery.js`: scaling, combining and pantry subtraction.
  - `durations.js`, `dates.js`, `nutrition.js`, `recipe-filter.js`: step timers, weeks, totals and search.
- `js/data/`: seed data, validation and the store, which handles persistence, export and undo.
- `js/ui/`: DOM builder, modal and toast, pointer-event drag, timers, theme.
- `js/views/`: one file per screen. `js/app.js` is the hash router.
- `css/`: `base.css` holds tokens and shared controls; the others follow the screens, plus `print.css`.

## Key engineering decisions

- **Base units for adding.** Volume is held in teaspoons and weight in grams. Teaspoons keep US measures whole, so `2 tbsp + 1/4 cup` is exactly 18 before anything is formatted. Amounts are only turned back into a display unit at the end, by choosing what a cook would measure with: 18 tsp is `6 tbsp` because there is no 3/8 cup measure, while 24 tsp is `½ cup`.
- **Incompatible amounts stay visible.** Volume, weight and each counted unit are separate families. `1 cup` and `100 g` of flour show as `1 cup + 100 g` rather than guessing a density. If the pantry holds flour by weight and the recipe wants cups, the list keeps the item and says to check.
- **Parser as small readers.** Each step of the parser reads one thing from the front of the line and returns the rest, which keeps odd cases such as `1 cup plus 2 tablespoons milk` contained. The seed recipes go through the same parser as pasted text.
- **Pointer events for drag and drop.** HTML5 drag doesn't fire on touch screens. One code path serves mouse and touch, with press-and-hold on touch so swipes still scroll. Each slot also has a + button, so dragging is never required.
- **No `innerHTML`.** The DOM helper only creates text nodes from strings, so user text can't become markup.
- **Timers store a finish time.** They stay accurate when a background tab is throttled, and keep running if you leave cook mode.
- **Snapshot undo.** Destructive changes keep a copy of the state before the change, so every undo works the same way.
