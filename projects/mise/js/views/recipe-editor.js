// Create and edit recipes, including paste-to-parse for ingredient lists.
Mise.Views.recipeEditor = (() => {
  const { h, icon, field, setFieldError, selectOptions } = Mise.Dom;
  const { format, parseRange } = Mise.Fractions;
  const Store = Mise.Store;

  const UNIT_OPTIONS = [['', 'no unit'], ...Mise.Units.ALL_UNITS.map((unit) => [unit, unit])];
  const AISLE_OPTIONS = Mise.Aisles.LIST.map((aisle) => [aisle, aisle]);
  const LIMITS = { servings: [1, 100], prepMin: [0, 2880], cookMin: [0, 2880] };

  let rows = [];
  let rowHost = null;
  let nextRowId = 1;

  function qtyText(ingredient) {
    if (ingredient.qty === null) return '';
    const low = format(ingredient.qty);
    return ingredient.qtyMax ? `${low}-${format(ingredient.qtyMax)}` : low;
  }

  function toRow(ingredient) {
    return { rowId: nextRowId++, original: ingredient, text: qtyText(ingredient), unit: ingredient.unit, name: ingredient.name, aisle: ingredient.aisle, note: ingredient.note || '' };
  }

  function blankRow() {
    return toRow({ qty: null, qtyMax: null, unit: '', name: '', aisle: 'Other', note: '' });
  }

  function removeRow(row) {
    rows = rows.filter((candidate) => candidate !== row);
    if (!rows.length) rows = [blankRow()];
    drawRows();
  }

  function rowEditor(row, index) {
    const position = index + 1;
    return h('div', { class: 'ingredient-row', 'data-row': row.rowId },
      h('div', { class: 'row-field qty' },
        h('label', { for: `qty-${row.rowId}` }, 'Qty'),
        h('input', { id: `qty-${row.rowId}`, class: 'row-qty', type: 'text', value: row.text, inputmode: 'text', 'aria-label': `Quantity for ingredient ${position}`, oninput: (event) => { row.text = event.target.value; } })),
      h('div', { class: 'row-field unit' },
        h('label', { for: `unit-${row.rowId}` }, 'Unit'),
        h('select', { id: `unit-${row.rowId}`, class: 'row-unit', 'aria-label': `Unit for ingredient ${position}`, onchange: (event) => { row.unit = event.target.value; } }, selectOptions(UNIT_OPTIONS, row.unit))),
      h('div', { class: 'row-field name' },
        h('label', { for: `name-${row.rowId}` }, 'Ingredient'),
        h('input', {
          id: `name-${row.rowId}`,
          class: 'row-name',
          type: 'text',
          value: row.name,
          'aria-label': `Name of ingredient ${position}`,
          oninput: (event) => { row.name = event.target.value; },
          onchange: (event) => suggestAisle(row, event.target),
        })),
      h('div', { class: 'row-field note' },
        h('label', { for: `note-${row.rowId}` }, 'Note'),
        h('input', { id: `note-${row.rowId}`, class: 'row-note', type: 'text', value: row.note, 'aria-label': `Note for ingredient ${position}`, oninput: (event) => { row.note = event.target.value; } })),
      h('div', { class: 'row-field aisle-col' },
        h('label', { for: `aisle-${row.rowId}` }, 'Aisle'),
        h('select', { id: `aisle-${row.rowId}`, class: 'row-aisle', 'aria-label': `Aisle for ingredient ${position}`, onchange: (event) => { row.aisle = event.target.value; row.aisleChosen = true; } }, selectOptions(AISLE_OPTIONS, row.aisle))),
      h('button', { type: 'button', class: 'icon-btn row-remove', 'aria-label': `Remove ingredient ${position}`, onclick: () => removeRow(row) }, icon('trash', 16)));
  }

  // A newly named ingredient gets a likely aisle, unless the cook already picked one.
  function suggestAisle(row, input) {
    if (row.aisleChosen || !row.name.trim()) return;
    row.aisle = Mise.Aisles.guess(row.name);
    const select = input.closest('.ingredient-row').querySelector('.row-aisle');
    select.value = row.aisle;
  }

  function drawRows() {
    rowHost.replaceChildren(...rows.map(rowEditor));
  }

  function parsePasted(textarea, status) {
    const { items, failed } = Mise.IngredientParser.parseLines(textarea.value);
    if (!items.length && !failed.length) {
      status.className = 'parse-status error';
      status.textContent = 'Paste at least one ingredient line first.';
      return;
    }
    rows = [...rows.filter((row) => row.name.trim()), ...items.map(toRow)];
    if (!rows.length) rows = [blankRow()];
    drawRows();
    textarea.value = failed.join('\n');
    status.className = `parse-status ${failed.length ? 'error' : ''}`;
    status.textContent = failed.length
      ? `Added ${items.length}. Could not read ${failed.length}: fix the lines left above, or add them by hand.`
      : `Added ${items.length} ${items.length === 1 ? 'ingredient' : 'ingredients'}. Check them below.`;
  }

  function pastePanel() {
    const textarea = h('textarea', { id: 'paste-box', rows: 5, placeholder: '1 1/2 cups flour\n2 large eggs, beaten\n3 cloves garlic, minced' });
    const status = h('p', { class: 'parse-status', id: 'parse-status', role: 'status' });
    return h('div', { class: 'paste-panel' },
      field('Paste ingredient lines', textarea, { hint: 'One per line. Mise reads the quantity, unit, name and notes, and guesses the aisle.' }),
      h('div', { class: 'form-actions' },
        h('button', { type: 'button', class: 'btn', id: 'parse-lines', onclick: () => parsePasted(textarea, status) }, 'Parse lines'),
        status));
  }

  function numberInput(id, value, min, max) {
    return h('input', { id, type: 'number', value, min, max, inputmode: 'numeric' });
  }

  function readRow(row, errors) {
    const name = row.name.trim();
    const hasContent = name || row.text.trim();
    if (!hasContent) return null;
    const input = rowHost.querySelector(`[data-row="${row.rowId}"]`);
    const qtyField = input.querySelector('.row-qty');
    const nameField = input.querySelector('.row-name');
    qtyField.removeAttribute('aria-invalid');
    nameField.removeAttribute('aria-invalid');
    if (!name) {
      nameField.setAttribute('aria-invalid', 'true');
      errors.push({ control: nameField, message: `Ingredient with quantity "${row.text.trim()}" needs a name.` });
      return null;
    }
    const amount = readAmount(row);
    if (amount === false) {
      qtyField.setAttribute('aria-invalid', 'true');
      errors.push({ control: qtyField, message: `"${row.text.trim()}" isn't a quantity for ${name}. Try 1 1/2, 0.5 or 1-2.` });
      return null;
    }
    return { ...amount, unit: row.unit, name, aisle: row.aisle, note: row.note.trim() };
  }

  // Unedited text keeps the exact stored number, so 1/3 doesn't drift through its display form.
  function readAmount(row) {
    const text = row.text.trim();
    if (!text) return { qty: null, qtyMax: null };
    if (text === qtyText(row.original)) return { qty: row.original.qty, qtyMax: row.original.qtyMax };
    const parsed = parseRange(text);
    if (!parsed || !(parsed.qty > 0) || parsed.qty > 100000) return false;
    return parsed;
  }

  function checkNumber(control, label, min, max, errors) {
    const value = Number(control.value);
    const invalid = control.value.trim() === '' || !Number.isFinite(value) || value < min || value > max;
    const message = invalid ? `${label} must be a number from ${min} to ${max.toLocaleString('en-US')}.` : '';
    setFieldError(control, message);
    if (invalid) errors.push({ control, message });
    return Math.round(value);
  }

  function readForm(form, errors) {
    const title = form.querySelector('#recipe-title');
    const steps = form.querySelector('#recipe-steps');
    const titleText = title.value.trim();
    setFieldError(title, titleText ? '' : 'Give the recipe a title.');
    if (!titleText) errors.push({ control: title, message: 'Give the recipe a title.' });

    const ingredients = rows.map((row) => readRow(row, errors)).filter(Boolean);
    if (!ingredients.length && !errors.some((error) => error.control.closest('.ingredient-row'))) {
      errors.push({ control: rowHost.querySelector('.row-name'), message: 'Add at least one ingredient.' });
    }

    const stepList = steps.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    setFieldError(steps, stepList.length ? '' : 'Add at least one step.');
    if (!stepList.length) errors.push({ control: steps, message: 'Add at least one step.' });

    return {
      title: titleText,
      blurb: form.querySelector('#recipe-blurb').value.trim(),
      servings: checkNumber(form.querySelector('#recipe-servings'), 'Servings', ...LIMITS.servings, errors),
      prepMin: checkNumber(form.querySelector('#recipe-prep'), 'Prep time', ...LIMITS.prepMin, errors),
      cookMin: checkNumber(form.querySelector('#recipe-cook'), 'Cook time', ...LIMITS.cookMin, errors),
      tags: form.querySelector('#recipe-tags').value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      ingredients,
      steps: stepList,
      nutrition: Object.fromEntries(Mise.Nutrition.FIELDS.map(({ key, label }) => [key, checkNumber(form.querySelector(`#nutrition-${key}`), label, 0, 99999, errors)])),
    };
  }

  function showErrors(summary, errors) {
    summary.hidden = !errors.length;
    summary.replaceChildren(
      h('p', null, errors.length === 1 ? 'One thing to fix before saving:' : `${errors.length} things to fix before saving:`),
      h('ul', null, errors.slice(0, 6).map(({ message }) => h('li', null, message))));
    if (errors.length) errors[0].control.focus();
  }

  function saveRecipe(form, summary, existing) {
    const errors = [];
    const values = readForm(form, errors);
    showErrors(summary, errors);
    if (errors.length) return;
    const id = existing ? existing.id : Store.newId();
    Store.update((state) => {
      if (existing) state.recipes = state.recipes.map((recipe) => (recipe.id === id ? { ...values, id } : recipe));
      else state.recipes.push({ ...values, id });
    });
    Mise.Toast.show(existing ? 'Recipe saved.' : 'Recipe added.');
    location.hash = `#/recipes/${encodeURIComponent(id)}`;
  }

  function nutritionFields(values) {
    return h('fieldset', { class: 'nutrition-fields' },
      h('legend', null, 'Nutrition per serving'),
      h('div', { class: 'form-grid five' }, Mise.Nutrition.FIELDS.map(({ key, label, unit }) => field(`${label} (${unit})`, numberInput(`nutrition-${key}`, values.nutrition[key], 0, 99999)))));
  }

  function blankRecipe() {
    return { title: '', blurb: '', servings: 4, prepMin: 10, cookMin: 20, tags: [], ingredients: [], steps: [], nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 } };
  }

  function render({ id }) {
    const existing = id ? Store.recipeById(id) : null;
    if (id && !existing) return Mise.Views.recipeDetail.render({ id });
    const values = existing || blankRecipe();
    rows = values.ingredients.length ? values.ingredients.map(toRow) : [];
    rowHost = h('div', { class: 'ingredient-rows', id: 'ingredient-rows' });
    if (!rows.length) rows = [blankRow()];
    drawRows();

    const summary = h('div', { class: 'error-summary', id: 'form-errors', role: 'alert', hidden: true });
    const backHref = existing ? `#/recipes/${encodeURIComponent(existing.id)}` : '#/recipes';
    const form = h('form', {
      class: 'editor',
      novalidate: true,
      onsubmit: (event) => { event.preventDefault(); saveRecipe(form, summary, existing); },
    },
    summary,
    h('div', { class: 'form-grid two' },
      field('Title', h('input', { id: 'recipe-title', type: 'text', value: values.title, maxlength: 140 })),
      field('Tags', h('input', { id: 'recipe-tags', type: 'text', value: values.tags.join(', ') }), { hint: 'Separate with commas: dinner, quick, vegetarian' })),
    field('Short description', h('input', { id: 'recipe-blurb', type: 'text', value: values.blurb, maxlength: 220 })),
    h('div', { class: 'form-grid three' },
      field('Servings', numberInput('recipe-servings', values.servings, 1, 100)),
      field('Prep time (minutes)', numberInput('recipe-prep', values.prepMin, 0, 2880)),
      field('Cook time (minutes)', numberInput('recipe-cook', values.cookMin, 0, 2880))),
    h('section', { class: 'editor-section' },
      h('h2', null, 'Ingredients'),
      pastePanel(),
      rowHost,
      h('button', { type: 'button', class: 'text-btn', id: 'add-row', onclick: () => { rows.push(blankRow()); drawRows(); rowHost.querySelector(`[data-row="${rows[rows.length - 1].rowId}"] .row-qty`).focus(); } }, icon('plus', 14), 'Add ingredient')),
    h('section', { class: 'editor-section' },
      h('h2', null, 'Method'),
      field('Steps, one per line', h('textarea', { id: 'recipe-steps', rows: 8, value: values.steps.join('\n') }), { hint: 'Cook mode offers a timer for any time you mention, such as "simmer for 20 minutes".' })),
    nutritionFields(values),
    h('div', { class: 'form-actions sticky' },
      h('button', { type: 'submit', class: 'btn primary', id: 'save-recipe' }, existing ? 'Save changes' : 'Save recipe'),
      h('a', { class: 'btn', href: backHref }, 'Cancel')));

    return h('div', { class: 'view editor-view' },
      h('a', { class: 'back-link', href: backHref }, icon('left', 14), existing ? existing.title : 'Recipes'),
      h('h1', null, existing ? 'Edit recipe' : 'New recipe'),
      form);
  }

  return { render };
})();
