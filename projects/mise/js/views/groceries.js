// The week's grocery list, grouped by aisle, with check-off, manual items and printing.
Mise.Views.groceries = (() => {
  const { h, icon, field, setFieldError, selectOptions } = Mise.Dom;
  const { todayKey, mondayOf, weekLabel } = Mise.Dates;
  const { buildList, groupByAisle, addToStock } = Mise.Grocery;
  const { parseLine } = Mise.IngredientParser;
  const { formatAmount } = Mise.Units;
  const Store = Mise.Store;
  const AISLE_OPTIONS = Mise.Aisles.LIST.map((aisle) => [aisle, aisle]);

  function checkedFor(week) {
    return Store.state.checked[week] || {};
  }

  function manualFor(week) {
    return Store.state.manual[week] || [];
  }

  function toggleChecked(week, key, isChecked) {
    Store.update((state) => {
      state.checked[week] = state.checked[week] || {};
      if (isChecked) state.checked[week][key] = true;
      else delete state.checked[week][key];
    });
  }

  function manualKey(item) {
    return `manual:${item.id}`;
  }

  function manualAmount(item) {
    return formatAmount(item.qty, item.unit, item.qtyMax);
  }

  function checkRow(week, key, { amount, name, details, actions, id }) {
    const isChecked = !!checkedFor(week)[key];
    const inputId = id || `check-${key.replace(/[^a-z0-9]+/gi, '-')}`;
    return h('li', { class: `grocery-item ${isChecked ? 'is-checked' : ''}`, 'data-item': key },
      h('input', {
        type: 'checkbox',
        id: inputId,
        'data-fk': inputId,
        checked: isChecked,
        onchange: (event) => toggleChecked(week, key, event.target.checked),
      }),
      h('div', { class: 'grocery-text' },
        h('label', { for: inputId },
          amount ? h('span', { class: 'grocery-amount' }, amount, ' ') : null,
          h('span', { class: 'grocery-name' }, name)),
        details),
      actions || null);
  }

  function sourceText(sources) {
    const shown = sources.slice(0, 2).join(', ');
    return sources.length > 2 ? `${shown} and ${sources.length - 2} more` : shown;
  }

  function recipeDetails(item) {
    const lines = [];
    if (item.pantryNote) lines.push(h('p', { class: 'grocery-pantry' }, item.pantryNote));
    if (item.fractionNote) lines.push(h('p', { class: 'grocery-source' }, item.fractionNote));
    lines.push(h('p', { class: 'grocery-source', title: item.sources.join(', ') }, sourceText(item.sources)));
    return lines;
  }

  function recipeItem(week, item) {
    return checkRow(week, item.key, { amount: item.amountText, name: item.name, details: recipeDetails(item) });
  }

  function manualItem(week, item) {
    const key = manualKey(item);
    return checkRow(week, key, {
      amount: manualAmount(item),
      name: item.name,
      details: h('p', { class: 'grocery-source' }, 'Added by you'),
      id: `check-manual-${item.id}`,
      actions: h('div', { class: 'item-actions no-print' },
        h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Edit ${item.name}`, 'data-fk': `edit-${item.id}`, onclick: () => editManual(week, item) }, icon('edit', 15)),
        h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Delete ${item.name}`, 'data-fk': `delete-${item.id}`, onclick: () => deleteManual(week, item) }, icon('trash', 15))),
    });
  }

  function deleteManual(week, item) {
    Store.update((state) => {
      state.manual[week] = manualFor(week).filter((candidate) => candidate.id !== item.id);
      if (state.checked[week]) delete state.checked[week][manualKey(item)];
    }, `Removed ${item.name}.`);
  }

  function parseManual(text) {
    const parsed = parseLine(text);
    return parsed && !parsed.error ? parsed : null;
  }

  function editManual(week, item) {
    Mise.Modal.open({
      title: 'Edit item',
      content: (close) => {
        const lineInput = h('input', { type: 'text', id: 'manual-edit-text', value: [manualAmount(item), item.name].filter(Boolean).join(' ') });
        const aisleSelect = h('select', { id: 'manual-edit-aisle' }, selectOptions(AISLE_OPTIONS, item.aisle));
        const submit = (event) => {
          event.preventDefault();
          const parsed = parseManual(lineInput.value);
          setFieldError(lineInput, parsed ? '' : 'Enter an item, such as 2 lemons.');
          if (!parsed) return;
          close();
          Store.update(() => {
            const target = manualFor(week).find((candidate) => candidate.id === item.id);
            if (target) Object.assign(target, { qty: parsed.qty, qtyMax: parsed.qtyMax, unit: parsed.unit, name: parsed.name, aisle: aisleSelect.value });
          });
        };
        return h('form', { class: 'modal-form', novalidate: true, onsubmit: submit },
          field('Item', lineInput),
          field('Aisle', aisleSelect),
          h('div', { class: 'form-actions' },
            h('button', { type: 'submit', class: 'btn primary', id: 'manual-edit-save' }, 'Save'),
            h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel')));
      },
    });
  }

  function addManual(week, input) {
    const parsed = parseManual(input.value);
    setFieldError(input, parsed ? '' : 'Enter an item, such as 2 lemons.');
    if (!parsed) { input.focus(); return; }
    Store.update((state) => {
      state.manual[week] = [...manualFor(week), { id: Store.newId(), qty: parsed.qty, qtyMax: parsed.qtyMax, unit: parsed.unit, name: parsed.name, aisle: parsed.aisle }];
    });
    const next = document.getElementById('manual-input');
    if (next) next.focus();
  }

  function addForm(week) {
    const input = h('input', { type: 'text', id: 'manual-input', 'data-fk': 'manual-input', placeholder: 'e.g. 2 lemons or paper towels', autocomplete: 'off' });
    return h('form', { class: 'manual-form no-print', novalidate: true, onsubmit: (event) => { event.preventDefault(); addManual(week, input); } },
      field('Add an item', input),
      h('button', { type: 'submit', class: 'btn', id: 'manual-add' }, icon('plus', 16), 'Add'));
  }

  function moveCheckedToPantry(week, items, manual) {
    const checked = checkedFor(week);
    const bought = items.filter((item) => !item.covered && checked[item.key]);
    const boughtManual = manual.filter((item) => checked[manualKey(item)]);
    Store.update((state) => {
      bought.forEach((item) => {
        state.pantry = item.amounts.length
          ? addToStock(state.pantry, item, Store.newId)
          : [...state.pantry, { id: Store.newId(), name: item.name, qty: null, unit: '', aisle: item.aisle }];
      });
      boughtManual.forEach((item) => {
        state.pantry = [...state.pantry, { id: Store.newId(), name: item.name, qty: item.qtyMax || item.qty, unit: item.unit, aisle: item.aisle }];
      });
      state.manual[week] = manual.filter((item) => !checked[manualKey(item)]);
      state.checked[week] = {};
    }, `Moved ${bought.length + boughtManual.length} ${bought.length + boughtManual.length === 1 ? 'item' : 'items'} to the pantry.`);
  }

  function aisleSections(week, items, manual) {
    const rows = [
      ...items.filter((item) => !item.covered).map((item) => ({ ...item, render: () => recipeItem(week, item) })),
      ...manual.map((item) => ({ ...item, render: () => manualItem(week, item) })),
    ];
    return groupByAisle(rows).map(({ aisle, items: aisleItems }) => h('section', { class: 'aisle', 'data-aisle': aisle },
      h('h2', null, aisle),
      h('ul', { class: 'plain-list' }, aisleItems.map((item) => item.render()))));
  }

  function coveredSection(items) {
    const covered = items.filter((item) => item.covered);
    if (!covered.length) return null;
    return h('details', { class: 'covered no-print', id: 'covered' },
      h('summary', null, `Already in your pantry (${covered.length})`),
      h('ul', { class: 'plain-list covered-list' }, covered.map((item) => h('li', { 'data-covered': item.key },
        h('span', { class: 'grocery-name' }, item.name),
        h('span', { class: 'grocery-source' }, item.pantryNote)))));
  }

  function headActions(week, items, manual, checkedCount) {
    return h('div', { class: 'head-actions no-print' },
      checkedCount ? h('button', { type: 'button', class: 'btn', id: 'to-pantry', onclick: () => moveCheckedToPantry(week, items, manual) }, 'Move checked to pantry') : null,
      checkedCount ? h('button', { type: 'button', class: 'btn', id: 'uncheck-all', onclick: () => Store.update((state) => { state.checked[week] = {}; }) }, 'Uncheck all') : null,
      h('button', { type: 'button', class: 'btn', id: 'print-list', onclick: () => window.print() }, icon('print', 16), 'Print'));
  }

  function summaryLine(toBuy, covered, checkedCount) {
    const parts = [`${toBuy} to buy`];
    if (checkedCount) parts.push(`${checkedCount} checked`);
    if (covered) parts.push(`${covered} in the pantry`);
    return parts.join(' · ');
  }

  function emptyList(week) {
    return h('div', { class: 'empty', id: 'grocery-empty' },
      h('h2', null, 'Nothing to buy yet'),
      h('p', null, 'Plan some meals for this week, or add an item above.'),
      h('a', { class: 'btn', href: `#/planner/${week}` }, 'Go to the planner'));
  }

  function render({ week: weekParam }) {
    const week = mondayOf(weekParam || todayKey());
    Mise.App.rememberWeek(week);
    const items = buildList(Store.mealsInWeek(week), Store.state.pantry);
    const manual = manualFor(week);
    const toBuy = items.filter((item) => !item.covered).length + manual.length;
    const checked = checkedFor(week);
    const liveKeys = new Set([...items.filter((item) => !item.covered).map((item) => item.key), ...manual.map(manualKey)]);
    const checkedCount = Object.keys(checked).filter((key) => liveKeys.has(key)).length;

    return h('div', { class: 'view groceries-view' },
      h('div', { class: 'view-head' },
        h('div', { class: 'view-title-row' },
          h('h1', { id: 'grocery-title' }, h('span', { class: 'print-only' }, 'Groceries, '), weekLabel(week)),
          h('div', { class: 'no-print' }, Mise.Views.planner.weekNav(week, '#/groceries'))),
        headActions(week, items, manual, checkedCount)),
      h('p', { class: 'grocery-summary', id: 'grocery-summary' }, summaryLine(toBuy, items.length - (toBuy - manual.length), checkedCount)),
      addForm(week),
      toBuy ? h('div', { class: 'aisles', id: 'aisles' }, aisleSections(week, items, manual)) : (items.length ? null : emptyList(week)),
      coveredSection(items));
  }

  return { render };
})();
