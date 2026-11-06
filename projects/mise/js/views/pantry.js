// The pantry: what's already in the house, which the grocery list subtracts.
Mise.Views.pantry = (() => {
  const { h, icon, field, setFieldError, selectOptions } = Mise.Dom;
  const { formatAmount } = Mise.Units;
  const { parseLine } = Mise.IngredientParser;
  const Store = Mise.Store;
  const AISLE_OPTIONS = Mise.Aisles.LIST.map((aisle) => [aisle, aisle]);
  const UNIT_OPTIONS = [['', 'no unit'], ...Mise.Units.ALL_UNITS.map((unit) => [unit, unit])];

  let query = '';
  let listHost = null;

  function stockText(item) {
    return item.qty === null ? 'Always stocked' : formatAmount(item.qty, item.unit);
  }

  function deleteItem(item) {
    Store.update((state) => {
      state.pantry = state.pantry.filter((candidate) => candidate.id !== item.id);
    }, `Removed ${item.name} from the pantry.`);
  }

  function parseQty(text) {
    const trimmed = text.trim();
    if (!trimmed) return { qty: null };
    const parsed = Mise.Fractions.parse(trimmed);
    if (!(parsed > 0) || parsed > 100000) return { error: 'Enter an amount above zero, or leave blank for always stocked.' };
    return { qty: parsed };
  }

  function editItem(item) {
    Mise.Modal.open({
      title: `Edit ${item.name}`,
      content: (close) => {
        const name = h('input', { type: 'text', id: 'pantry-edit-name', value: item.name });
        const qty = h('input', { type: 'text', id: 'pantry-edit-qty', value: item.qty === null ? '' : Mise.Fractions.format(item.qty) });
        const unit = h('select', { id: 'pantry-edit-unit' }, selectOptions(UNIT_OPTIONS, item.unit));
        const aisle = h('select', { id: 'pantry-edit-aisle' }, selectOptions(AISLE_OPTIONS, item.aisle));
        const original = Mise.Fractions.format(item.qty || 0);
        const submit = (event) => {
          event.preventDefault();
          const amount = qty.value.trim() === original ? { qty: item.qty } : parseQty(qty.value);
          setFieldError(name, name.value.trim() ? '' : 'Enter a name.');
          setFieldError(qty, amount.error || '');
          if (!name.value.trim() || amount.error) return;
          close();
          Store.update((state) => {
            const target = state.pantry.find((candidate) => candidate.id === item.id);
            if (target) Object.assign(target, { name: name.value.trim(), qty: amount.qty, unit: amount.qty === null ? '' : unit.value, aisle: aisle.value });
          });
        };
        return h('form', { class: 'modal-form', novalidate: true, onsubmit: submit },
          field('Name', name),
          h('div', { class: 'form-grid two' },
            field('Amount', qty, { hint: 'Blank means always stocked.' }),
            field('Unit', unit)),
          field('Aisle', aisle),
          h('div', { class: 'form-actions' },
            h('button', { type: 'submit', class: 'btn primary', id: 'pantry-edit-save' }, 'Save'),
            h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel')));
      },
    });
  }

  function row(item) {
    return h('li', { class: 'pantry-row', 'data-pantry': item.id },
      h('span', { class: 'pantry-name' }, item.name),
      h('span', { class: `pantry-stock ${item.qty === null ? 'staple' : ''}` }, stockText(item)),
      h('div', { class: 'item-actions' },
        h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Edit ${item.name}`, 'data-fk': `pantry-edit-${item.id}`, onclick: () => editItem(item) }, icon('edit', 15)),
        h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Delete ${item.name}`, onclick: () => deleteItem(item) }, icon('trash', 15))));
  }

  function listContent() {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const items = Store.state.pantry.filter((item) => terms.every((term) => item.name.toLowerCase().includes(term)));
    if (!Store.state.pantry.length) {
      return [h('div', { class: 'empty' }, h('h2', null, 'The pantry is empty'), h('p', null, 'Add what you already have, and the grocery list will leave it off.'))];
    }
    if (!items.length) return [h('div', { class: 'empty' }, h('h2', null, 'Nothing matches'), h('p', null, 'Try a different search.'))];
    return Mise.Grocery.groupByAisle(items.map((item) => ({ ...item }))).map(({ aisle, items: rows }) => h('section', { class: 'aisle' },
      h('h2', null, aisle),
      h('ul', { class: 'plain-list' }, rows.map(row))));
  }

  function addItem(input) {
    const parsed = input.value.trim() ? parseLine(input.value) : null;
    const usable = parsed && !parsed.error;
    setFieldError(input, usable ? '' : 'Enter an item, such as 2 cups rice, or just salt.');
    if (!usable) { input.focus(); return; }
    const qty = parsed.qtyMax || parsed.qty;
    Store.update((state) => {
      state.pantry.push({ id: Store.newId(), name: parsed.name, qty, unit: qty === null ? '' : parsed.unit, aisle: parsed.aisle });
    });
    const next = document.getElementById('pantry-input');
    if (next) next.focus();
  }

  function render() {
    const input = h('input', { type: 'text', id: 'pantry-input', 'data-fk': 'pantry-input', placeholder: 'e.g. 2 cups rice, or just salt', autocomplete: 'off' });
    const search = h('input', {
      type: 'search',
      id: 'pantry-search',
      value: query,
      autocomplete: 'off',
      oninput: (event) => {
        query = event.target.value;
        listHost.replaceChildren(...listContent());
      },
    });
    listHost = h('div', { class: 'aisles', id: 'pantry-list' }, listContent());
    return h('div', { class: 'view pantry-view' },
      h('div', { class: 'view-head' }, h('h1', null, 'Pantry')),
      h('p', { class: 'view-lead' }, 'Amounts here come off the grocery list. Leave the amount out for things you never run out of.'),
      h('div', { class: 'pantry-tools' },
        h('form', { class: 'manual-form', novalidate: true, onsubmit: (event) => { event.preventDefault(); addItem(input); } },
          field('Add to pantry', input),
          h('button', { type: 'submit', class: 'btn', id: 'pantry-add' }, icon('plus', 16), 'Add')),
        field('Search the pantry', search, { className: 'pantry-search' })),
      listHost);
  }

  return { render };
})();
