// Reusable items that can be dropped into any invoice or quote.
(function () {
  const BC = window.BC;
  const { h, icon } = BC.dom;
  const { exporter, money: moneyLib, store, ui } = BC;
  const { money } = ui;
  const view = { search: '', sort: { key: 'name', dir: 1 } };

  function itemModal(existing) {
    const item = existing || {};
    const name = ui.field({ label: 'Name', value: item.name || '', required: true });
    const description = ui.field({ label: 'Description', value: item.description || '', hint: 'Added as the detail line on documents.' });
    const price = ui.field({ label: 'Unit price', inputmode: 'decimal', value: existing ? moneyLib.centsToText(item.unitCents) : '' });
    const tax = ui.field({ label: 'Tax %', inputmode: 'decimal', value: existing ? moneyLib.percentToText(item.taxBp) : '20' });

    const save = () => {
      let ok = true;
      const cents = moneyLib.parseCents(price.value);
      const bp = moneyLib.parsePercent(tax.value);
      if (!name.value.trim()) { name.setError('Enter a name for this item.'); ok = false; }
      if (cents === null) { price.setError('Enter a price with up to 2 decimals, like 95.00.'); ok = false; }
      else if (cents > moneyLib.MAX_UNIT_CENTS) { price.setError('The price can be at most 9,999,999.99.'); ok = false; }
      if (bp === null || bp > 10000) { tax.setError('Enter a percentage from 0 to 100.'); ok = false; }
      if (!ok) { ui.focusFirstError(form); return; }
      dialog.close();
      const saved = store.saveRecord('items', { name: name.value.trim(), description: description.value.trim(), unitCents: cents, taxBp: bp }, item.id);
      ui.toast(`${saved.name} saved.`);
    };

    const form = h('form', { class: 'form-grid', novalidate: true, onsubmit: (event) => { event.preventDefault(); save(); } },
      h('div', { class: 'span-2' }, name.el),
      h('div', { class: 'span-2' }, description.el),
      price.el, tax.el,
      h('button', { type: 'submit', hidden: true, tabindex: -1 }));
    const dialog = ui.modal({
      title: existing ? `Edit ${item.name}` : 'New item',
      content: form,
      footer: [ui.button('Cancel', null, () => dialog.close()), ui.button('Save item', null, save, 'btn-primary')],
    });
  }

  function table(rows, redraw) {
    const header = (label, key, numeric) => ui.sortHeader(label, key, view.sort, redraw, numeric);
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        header('Name', 'name'),
        h('th', { scope: 'col' }, 'Description'),
        header('Unit price', 'unitCents', true),
        header('Tax', 'taxBp', true),
        h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', {}, rows.map((item) => h('tr', {},
        h('td', { class: 'strong cell-long' }, item.name),
        h('td', { class: 'muted cell-long' }, item.description),
        h('td', { class: 'num' }, money(item.unitCents)),
        h('td', { class: 'num' }, `${moneyLib.percentToText(item.taxBp)}%`),
        h('td', { class: 'row-actions' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Edit ${item.name}`, onclick: () => itemModal(item) }, icon('edit', 15)),
          h('button', {
            class: 'icon-btn',
            type: 'button',
            'aria-label': `Delete ${item.name}`,
            onclick: () => ui.undoable(`${item.name} deleted.`, () => store.deleteRecord('items', item.id)),
          }, icon('trash', 15))))))));
  }

  BC.views.catalogue = function catalogueView() {
    const host = h('div', {});
    const all = store.state.items;
    function redraw() {
      const q = view.search.trim().toLowerCase();
      const key = view.sort.key;
      const value = (item) => (key === 'name' ? item.name.toLowerCase() : item[key]);
      const rows = all.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(q))
        .sort((a, b) => (value(a) === value(b) ? a.name.localeCompare(b.name) : (value(a) < value(b) ? -1 : 1) * view.sort.dir));
      if (!all.length) host.replaceChildren(ui.emptyState('The catalogue is empty', 'Save the services and products you bill most often.', ui.button('New item', 'plus', () => itemModal(), 'btn-primary')));
      else if (!rows.length) host.replaceChildren(ui.emptyState('No items match', 'Try a different search.'));
      else host.replaceChildren(table(rows, redraw));
    }
    redraw();
    return h('div', { class: 'page' },
      ui.pageHeader('Catalogue', 'Reusable items for invoices and quotes', [
        ui.button('Export CSV', 'download', () => { exporter.catalogue(); ui.toast('Catalogue exported to CSV.'); }),
        ui.button('New item', 'plus', () => itemModal(), 'btn-primary'),
      ]),
      h('div', { class: 'toolbar' }, ui.searchBox('Search catalogue', view.search, (value) => { view.search = value; redraw(); })),
      host);
  };
})();
