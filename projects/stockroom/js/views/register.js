// The register: catalog on the left, the open sale on the right. Built for speed, so focus
// keeps returning to the search field, where a scanner or keyboard entry lands.
SR.views.register = (function () {
  const { h, btn, icon, iconBtn, clear, toast, hasFinePointer } = SR.ui;
  const { format, formatPercent } = SR.money;
  const modals = SR.registerModals;

  const ui = { category: 'All', query: '', selected: -1, highlight: 0, error: '', showCart: false };
  let els = null;

  const state = () => SR.store.state;
  const cartLines = () => state().cart.lines;

  function commit({ keepFocus } = {}) {
    SR.app.commit({ skipView: true });
    refresh();
    if (!keepFocus && !SR.ui.modalOpen()) focusSearch();
  }

  function focusSearch() {
    if (els && hasFinePointer()) els.search.focus();
  }

  function setError(message) {
    ui.error = message;
    if (!els) return;
    els.error.textContent = message;
    els.error.hidden = !message;
  }

  function addRow(row, qty = 1) {
    ui.selected = SR.cart.add(state(), row, qty);
    setError('');
    commit();
    scrollSelectedIntoView();
  }

  /** Enter on the search field: an exact SKU or barcode wins, then the highlighted tile. */
  function submitEntry() {
    const { qty, code } = SR.cart.parseEntry(els.search.value);
    if (!code) return;
    const exact = SR.catalog.findByCode(state(), code);
    if (exact) {
      clearQuery();
      addRow(exact, qty);
      return;
    }
    const matches = currentProducts();
    const chosen = matches[Math.min(ui.highlight, matches.length - 1)];
    if (ui.query && chosen) {
      clearQuery();
      pickProduct(chosen, qty);
      return;
    }
    setError(`Nothing matches "${code}". Check the code or search by name.`);
    els.search.select();
  }

  function pickProduct(product, qty = 1) {
    const variants = SR.catalog.activeVariants(product);
    if (variants.length === 1) addRow({ product, variant: variants[0] }, qty);
    else modals.chooseVariant(product, qty, addRow);
  }

  function clearQuery() {
    els.search.value = '';
    ui.query = '';
    ui.highlight = 0;
    renderGrid();
    renderTabs();
  }

  function currentProducts() {
    const query = SR.cart.parseEntry(ui.query).code;
    if (query) return SR.catalog.searchProducts(state(), query);
    const all = SR.catalog.activeProducts(state());
    return ui.category === 'All' ? all : all.filter((p) => p.category === ui.category);
  }

  function renderTabs() {
    const names = ['All', ...SR.catalog.categories(state())];
    if (!names.includes(ui.category)) ui.category = 'All';
    clear(els.tabs);
    names.forEach((name) => {
      const active = !ui.query && ui.category === name;
      els.tabs.appendChild(h('button', {
        type: 'button', role: 'tab', class: `reg-tab${active ? ' on' : ''}`, 'aria-selected': String(active),
        onClick: () => { ui.category = name; clearQuery(); setError(''); focusSearch(); },
      }, name));
    });
  }

  function tileStock(variants) {
    const stock = variants.reduce((a, v) => a + Math.max(0, v.stock), 0);
    if (stock === 0) return h('span', { class: 'tile-stock out' }, 'Out of stock');
    const lowCount = variants.filter(SR.catalog.isLow).length;
    if (!lowCount) return h('span', { class: 'tile-stock' }, `${stock} on hand`);
    const label = variants.length === 1 ? `${stock} left, low` : `${stock} on hand, ${lowCount} low`;
    return h('span', { class: 'tile-stock low' }, label);
  }

  function tilePrice(variants) {
    const prices = variants.map((v) => v.priceCents);
    const min = Math.min(...prices);
    return variants.length > 1 && Math.max(...prices) !== min ? `from ${format(min)}` : format(min);
  }

  function renderGrid() {
    const products = currentProducts();
    const highlight = ui.query ? Math.min(ui.highlight, products.length - 1) : -1;
    clear(els.grid);
    if (!products.length) {
      els.grid.appendChild(SR.ui.emptyState(
        ui.query ? 'No products match that search' : 'No products yet',
        ui.query ? 'Search by name, SKU, barcode or category.' : 'Add products to start selling.',
        ui.query ? null : btn('Add products', { kind: 'primary', onClick: () => SR.app.go('products') })));
      return;
    }
    products.forEach((product, i) => {
      const variants = SR.catalog.activeVariants(product);
      if (!variants.length) return;
      const single = variants.length === 1 && variants[0].name === 'Standard';
      els.grid.appendChild(h('button', {
        type: 'button', class: `tile${i === highlight ? ' highlight' : ''}`, onClick: () => { setError(''); pickProduct(product); },
      },
      h('span', { class: 'tile-name' }, product.name),
      h('span', { class: 'tile-sub' }, single ? variants[0].sku : `${variants.length} ${variants.length === 1 ? 'option' : 'options'}`),
      h('span', { class: 'tile-foot' }, h('span', { class: 'tile-price' }, tilePrice(variants)), tileStock(variants))));
    });
    const hot = els.grid.querySelector('.tile.highlight');
    if (hot) hot.scrollIntoView({ block: 'nearest' });
  }

  function qtyStepper(line, index, name) {
    const change = (delta) => (event) => {
      event.stopPropagation();
      ui.selected = index;
      const next = line.qty + delta;
      if (next <= 0) { removeLine(index); return; }
      SR.cart.setQty(state(), index, next);
      commit();
    };
    const qtyInput = h('input', {
      class: 'qty-input', type: 'text', inputmode: 'numeric', value: String(line.qty), 'aria-label': `Quantity of ${name}`, autocomplete: 'off',
      onClick: (e) => { e.stopPropagation(); e.target.select(); },
      onKeydown: (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.target.blur();
      },
      onChange: (e) => {
        const value = SR.util.parseWhole(e.target.value);
        if (value === null) {
          e.target.value = String(line.qty);
          return;
        }
        if (value === 0) removeLine(index);
        else { SR.cart.setQty(state(), index, value); commit(); }
      },
    });
    return h('div', { class: 'qty', role: 'group', 'aria-label': `Quantity of ${name}` },
      h('button', { type: 'button', class: 'qty-btn', 'aria-label': `One less ${name}`, onClick: change(-1) }, icon('minus', 16)),
      qtyInput,
      h('button', { type: 'button', class: 'qty-btn', 'aria-label': `One more ${name}`, onClick: change(1) }, icon('plus', 16)));
  }

  function removeLine(index) {
    const lines = cartLines();
    const removed = lines[index];
    const found = SR.catalog.lookup(state(), removed.variantId);
    SR.cart.remove(state(), index);
    ui.selected = Math.min(index, lines.length - 1);
    commit();
    toast(`Removed ${SR.catalog.displayName(found.product, found.variant)}`, {
      undo: () => {
        cartLines().splice(Math.min(index, cartLines().length), 0, removed);
        ui.selected = index;
        commit();
      },
      ms: 5000,
    });
  }

  function discountNote(line, row) {
    if (!row.lineDiscountCents) return null;
    const label = line.discount.type === 'percent' ? formatPercent(line.discount.value) : 'Amount';
    return h('span', { class: 'line-discount' }, `${label} off, ${format(-row.lineDiscountCents)}`);
  }

  function renderLine(line, index, row) {
    const { product, variant } = SR.catalog.lookup(state(), line.variantId);
    const name = SR.catalog.displayName(product, variant);
    const selected = index === ui.selected;
    const select = () => { ui.selected = index; renderCart(); focusSearch(); };
    const short = line.qty > variant.stock;
    const repriced = line.unitPriceCents !== variant.priceCents;
    return h('li', { class: `line${selected ? ' selected' : ''}`, dataset: { testid: 'cart-line', sku: variant.sku }, onClick: select },
      h('div', { class: 'line-main' },
        h('button', { type: 'button', class: 'line-name', 'aria-pressed': String(selected) }, name),
        h('div', { class: 'line-sub' },
          h('span', { class: repriced ? 'line-repriced' : null }, `${format(line.unitPriceCents)} each`),
          discountNote(line, row),
          product.taxable ? null : h('span', null, 'No tax')),
        short ? h('div', { class: 'line-warn' }, `Only ${Math.max(0, variant.stock)} in stock`) : null),
      qtyStepper(line, index, name),
      h('div', { class: 'line-total', dataset: { testid: 'line-total' } }, format(row.grossCents - row.lineDiscountCents)),
      selected ? h('div', { class: 'line-actions' },
        btn('Edit price or discount', { size: 'sm', iconName: 'tag', hotkey: 'F3', onClick: (e) => { e.stopPropagation(); modals.editLine(state(), index, commit); } }),
        btn('Remove', { size: 'sm', iconName: 'trash', hotkey: 'Del', onClick: (e) => { e.stopPropagation(); removeLine(index); } })) : null);
  }

  function totalRow(label, value, testId, cls) {
    return h('div', { class: `total-row${cls ? ` ${cls}` : ''}` }, h('span', null, label), h('span', { dataset: { testid: testId } }, format(value)));
  }

  function orderDiscountLabel(discount) {
    if (!discount) return 'Order discount';
    return discount.type === 'percent' ? `Order discount, ${formatPercent(discount.value)}` : 'Order discount';
  }

  function renderCart() {
    const lines = cartLines();
    const { cart, settings, held } = state();
    const totals = SR.pricing.computeCart(cart, settings.taxRateBp);
    if (ui.selected >= lines.length) ui.selected = lines.length - 1;
    const units = lines.reduce((a, l) => a + l.qty, 0);
    const hasLines = lines.length > 0;

    clear(els.lines);
    if (!hasLines) {
      els.lines.appendChild(h('li', { class: 'cart-empty' },
        h('p', { class: 'empty-title' }, 'No items yet'),
        h('p', null, 'Scan or type a SKU, or tap a product. Type 3*POT-TC6 to add three at once.')));
    }
    lines.forEach((line, i) => els.lines.appendChild(renderLine(line, i, totals.lines[i])));

    clear(els.totals);
    els.totals.append(
      totalRow('Subtotal', totals.subtotalCents, 'subtotal'),
      totals.lineDiscountCents ? totalRow('Line discounts', -totals.lineDiscountCents, 'line-discounts') : '',
      totals.orderDiscountCents ? totalRow(orderDiscountLabel(cart.orderDiscount), -totals.orderDiscountCents, 'order-discount') : '',
      totalRow(`Tax ${formatPercent(settings.taxRateBp)}`, totals.taxCents, 'tax'),
      totalRow('Total', totals.totalCents, 'total', 'grand'));

    els.count.textContent = hasLines ? `${units} ${units === 1 ? 'item' : 'items'}` : '';
    for (const button of [els.discountBtn, els.holdBtn, els.cashBtn, els.cardBtn, els.clearBtn]) button.disabled = !hasLines;
    els.heldLabel.textContent = held.length ? `Held (${held.length})` : 'Held';
    els.phoneBar.querySelector('.phone-bar-text').textContent = hasLines ? `${units} ${units === 1 ? 'item' : 'items'}, ${format(totals.totalCents)}` : 'No items';
    els.root.classList.toggle('show-cart', ui.showCart);
  }

  function scrollSelectedIntoView() {
    const el = els && els.lines.querySelector('.line.selected');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function refresh() {
    if (!els) return;
    renderTabs();
    renderGrid();
    renderCart();
  }

  function clearCart() {
    const previous = state().cart;
    state().cart = SR.cart.emptyCart();
    ui.selected = -1;
    commit();
    toast('Sale cleared', {
      undo: () => {
        state().cart = previous;
        commit();
      },
    });
  }

  const actions = {
    lineDiscount() { if (cartLines()[ui.selected]) modals.editLine(state(), ui.selected, commit); },
    orderDiscount() { if (cartLines().length) modals.editOrderDiscount(state(), commit); },
    cash() { if (cartLines().length) modals.payCash(state(), commit); },
    card() { if (cartLines().length) modals.payCard(state(), commit); },
    hold() { if (cartLines().length) modals.holdSale(state(), commit); },
    held() { modals.heldList(state(), commit); },
  };

  const SHORTCUTS = { F3: actions.lineDiscount, F4: actions.orderDiscount, F7: actions.cash, F8: actions.card, F9: actions.hold, F10: actions.held };

  function moveSelection(delta) {
    const count = cartLines().length;
    if (!count) return;
    ui.selected = Math.max(0, Math.min(count - 1, (ui.selected < 0 ? 0 : ui.selected + delta)));
    renderCart();
    scrollSelectedIntoView();
  }

  function changeSelectedQty(delta) {
    const line = cartLines()[ui.selected];
    if (!line) return;
    if (line.qty + delta <= 0) removeLine(ui.selected);
    else { SR.cart.setQty(state(), ui.selected, line.qty + delta); commit(); }
  }

  /** Cart keys share the search field: when it is empty there is nothing else they could mean. */
  function handleCartKey(event) {
    if (event.key === 'ArrowDown') moveSelection(1);
    else if (event.key === 'ArrowUp') moveSelection(-1);
    else if (event.key === '+' || event.key === '=') changeSelectedQty(1);
    else if (event.key === '-') changeSelectedQty(-1);
    else if (event.key === 'Delete' && cartLines()[ui.selected]) removeLine(ui.selected);
    else return false;
    event.preventDefault();
    return true;
  }

  function onSearchKey(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitEntry();
    } else if (event.key === 'Escape') {
      clearQuery();
      setError('');
    } else if (!ui.query) {
      if (handleCartKey(event)) event.stopPropagation();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const count = currentProducts().length;
      if (count) ui.highlight = (ui.highlight + (event.key === 'ArrowDown' ? 1 : count - 1)) % count;
      renderGrid();
    }
  }

  /** Register-wide keys, routed here by the app while no modal is open. */
  function onKey(event) {
    if (event.key === 'F2') {
      event.preventDefault();
      focusSearch();
      els.search.select();
      return;
    }
    if (SHORTCUTS[event.key]) {
      event.preventDefault();
      SHORTCUTS[event.key]();
      return;
    }
    const target = event.target;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (handleCartKey(event)) return;
    // A scanner fires keys wherever focus happens to be, so send printable keys to the search field.
    if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) focusSearch();
  }

  function keyLegend() {
    const items = [['F2', 'Search'], ['Enter', 'Add'], ['↑↓', 'Select line'], ['+ −', 'Quantity'], ['Del', 'Remove'], ['F3', 'Line price'], ['F4', 'Order discount'], ['F7', 'Cash'], ['F8', 'Card'], ['F9', 'Hold'], ['F10', 'Held']];
    return h('div', { class: 'reg-keys', 'aria-label': 'Keyboard shortcuts' }, items.map(([key, label]) => h('span', { class: 'reg-key' }, h('kbd', null, key), label)));
  }

  function buildSkeleton(root) {
    const search = h('input', {
      id: 'reg-search', class: 'reg-search-input', type: 'text', placeholder: 'Search, or scan a SKU or barcode', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Search products or enter a SKU',
      onInput: (e) => { ui.query = e.target.value; ui.highlight = 0; setError(''); renderTabs(); renderGrid(); },
      onKeydown: onSearchKey,
    });
    const error = h('div', { class: 'reg-error', role: 'alert', hidden: true });
    const tabs = h('div', { class: 'reg-tabs', role: 'tablist', 'aria-label': 'Product categories' });
    const grid = h('div', { class: 'reg-grid', role: 'tabpanel', 'aria-label': 'Products' });
    const lines = h('ul', { class: 'lines', 'aria-label': 'Items in this sale' });
    const totals = h('div', { class: 'totals' });
    const count = h('span', { class: 'cart-count' });
    const heldLabel = h('span', { class: 'btn-label' }, 'Held');
    const phoneBar = h('button', { type: 'button', class: 'phone-bar', onClick: () => { ui.showCart = true; renderCart(); } },
      h('span', { class: 'phone-bar-text' }), h('span', { class: 'phone-bar-go' }, 'View sale'));

    const clearBtn = btn('Clear', { size: 'sm', onClick: clearCart });
    const discountBtn = btn('Discount', { iconName: 'tag', hotkey: 'F4', onClick: actions.orderDiscount, class: 'reg-action' });
    const holdBtn = btn('Hold', { iconName: 'pause', hotkey: 'F9', onClick: actions.hold, class: 'reg-action' });
    const heldBtn = h('button', { type: 'button', class: 'btn btn-default reg-action', onClick: actions.held }, icon('resume'), heldLabel, h('kbd', null, 'F10'));
    const cashBtn = btn('Cash', { kind: 'primary', iconName: 'cash', hotkey: 'F7', onClick: actions.cash, class: 'reg-pay' });
    const cardBtn = btn('Card', { kind: 'pay-alt', iconName: 'card', hotkey: 'F8', onClick: actions.card, class: 'reg-pay' });

    const layout = h('div', { class: 'reg' },
      h('section', { class: 'reg-catalog', 'aria-label': 'Catalog' },
        h('div', { class: 'reg-search' }, icon('search', 20), search, h('kbd', null, 'F2')),
        error, tabs, grid, keyLegend(), phoneBar),
      h('aside', { class: 'reg-cart', 'aria-label': 'Current sale' },
        h('div', { class: 'cart-head' },
          iconBtn('back', 'Back to products', () => { ui.showCart = false; renderCart(); }, { class: 'phone-only' }),
          h('h1', null, 'Current sale'), count, clearBtn),
        lines,
        h('div', { class: 'cart-foot' },
          totals,
          h('div', { class: 'reg-actions' }, discountBtn, holdBtn, heldBtn),
          h('div', { class: 'reg-pays' }, cashBtn, cardBtn))));
    root.appendChild(layout);
    return { root: layout, search, error, tabs, grid, lines, totals, count, heldLabel, phoneBar, clearBtn, discountBtn, holdBtn, cashBtn, cardBtn };
  }

  function mount(root) {
    els = buildSkeleton(root);
    els.search.value = ui.query;
    ui.selected = cartLines().length - 1;
    refresh();
    setError('');
    focusSearch();
  }

  function unmount() {
    els = null;
  }

  return { mount, unmount, refresh, onKey, focusSearch, fullBleed: true };
})();
