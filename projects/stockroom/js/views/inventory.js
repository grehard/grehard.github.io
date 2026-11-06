// Stock: low-stock alerts with one-click reorder, manual adjustments, and the full ledger.
SR.views.inventory = (function () {
  const { h, btn, clear, field, input, select, textarea, segmented, variantPicker, openModal, pageHeader, pill, dataTable, emptyState, download, toast, statTile } = SR.ui;
  const { format } = SR.money;
  const { formatInt, parseWhole } = SR.util;

  const view = { tab: 'low', query: '', reason: 'all', from: '', to: '' };
  let content = null;
  let statsEl = null;
  let tabsEl = null;
  const state = () => SR.store.state;

  function paintStats() {
    const { valueCents, units } = SR.inventory.valuation(state());
    const check = SR.inventory.reconcile(state());
    clear(statsEl);
    statsEl.append(
      statTile('Stock at cost', format(valueCents), `${formatInt(units)} units on hand`),
      statTile('Low or out', String(SR.purchasing.lowStockRows(state()).length), 'variants at or under reorder point'),
      statTile('On order', formatInt(onOrderTotal()), 'units on placed purchase orders'),
      statTile('Ledger check', check.ok ? 'Reconciled' : `${check.mismatched.length} off`, `${formatInt(check.entries)} rows replayed against on-hand counts`));
  }

  function onOrderTotal() {
    return state().purchaseOrders.reduce((sum, po) => {
      if (po.status !== 'ordered' && po.status !== 'partial') return sum;
      return sum + po.lines.reduce((a, l) => a + SR.purchasing.outstanding(l), 0);
    }, 0);
  }

  function paintTabs() {
    clear(tabsEl);
    const lowCount = SR.purchasing.lowStockRows(state()).length;
    [['low', `Low stock (${lowCount})`], ['ledger', 'Stock ledger']].forEach(([key, label]) => {
      tabsEl.appendChild(h('button', {
        type: 'button', role: 'tab', class: `tab${view.tab === key ? ' on' : ''}`, 'aria-selected': String(view.tab === key),
        onClick: () => { view.tab = key; paintAll(); },
      }, label));
    });
  }

  function reorderOne(row) {
    const result = SR.purchasing.draftReorder(state(), row.variant.id);
    if (result.error) { toast(result.error, { tone: 'bad' }); return; }
    const lineIndex = result.po.lines.length - 1;
    SR.app.commit();
    toast(`${result.qty} x ${row.product.name} added to ${result.created ? 'new draft' : 'draft'} ${result.po.number}`, {
      undo: () => {
        if (result.created) state().purchaseOrders.splice(state().purchaseOrders.indexOf(result.po), 1);
        else result.po.lines.splice(lineIndex, 1);
        SR.app.commit();
      },
    });
  }

  function reorderAll(rows) {
    const eligible = rows.filter((r) => r.suggestedQty > 0 && !r.draft && r.product.supplierId);
    const touched = new Set();
    for (const row of eligible) touched.add(SR.purchasing.draftReorder(state(), row.variant.id).po.number);
    SR.app.commit();
    toast(`Added ${eligible.length} lines to ${touched.size} draft ${touched.size === 1 ? 'order' : 'orders'}`);
  }

  function reorderCell(row) {
    if (row.draft) return h('button', { type: 'button', class: 'link', onClick: () => SR.views.orders.openOrder(row.draft) }, `On draft ${row.draft.number}`);
    if (row.suggestedQty <= 0) return h('span', { class: 'muted' }, 'Covered by open orders');
    return btn(`Draft reorder of ${row.suggestedQty}`, { size: 'sm', 'aria-label': `Draft reorder of ${row.suggestedQty} for ${SR.catalog.displayName(row.product, row.variant)}`, onClick: () => reorderOne(row) });
  }

  function paintLow() {
    const rows = SR.purchasing.lowStockRows(state());
    const eligible = rows.filter((r) => r.suggestedQty > 0 && !r.draft && r.product.supplierId);
    content.append(
      h('div', { class: 'section-bar' },
        h('p', { class: 'muted' }, 'Suggested quantities are in whole reorder lots, enough to clear the reorder point after what is already on order.'),
        eligible.length ? btn(`Draft all (${eligible.length})`, { kind: 'primary', onClick: () => reorderAll(rows) }) : null),
      dataTable({
        caption: 'Low stock',
        rows,
        empty: emptyState('Nothing is low', 'Every product is above its reorder point.'),
        columns: [
          { label: 'Product', render: (r) => h('span', { class: 'strong' }, SR.catalog.displayName(r.product, r.variant)) },
          { label: 'SKU', render: (r) => h('span', { class: 'mono' }, r.variant.sku) },
          { label: 'Supplier', render: (r) => (r.supplier ? r.supplier.name : pill('No supplier', 'warn')) },
          { label: 'On hand', align: 'right', render: (r) => (r.variant.stock <= 0 ? pill(String(r.variant.stock), 'bad') : pill(String(r.variant.stock), 'warn')) },
          { label: 'Reorder at', align: 'right', render: (r) => r.variant.reorderPoint },
          { label: 'On order', align: 'right', render: (r) => r.onOrderUnits },
          { label: 'Reorder', render: reorderCell },
        ],
      }));
  }

  function ledgerRows() {
    const tokens = view.query.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = [];
    for (let i = state().ledger.length - 1; i >= 0; i--) {
      const entry = state().ledger[i];
      if (view.reason !== 'all' && entry.reason !== view.reason) continue;
      const key = SR.util.dateKey(entry.at);
      if (view.from && key < view.from) continue;
      if (view.to && key > view.to) continue;
      if (tokens.length) {
        const found = SR.catalog.lookup(state(), entry.variantId);
        const hay = `${found.product.name} ${found.variant.name} ${found.variant.sku} ${entry.ref} ${entry.note}`.toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) continue;
      }
      rows.push(entry);
    }
    return rows;
  }

  function ledgerToolbar() {
    const debounced = SR.util.debounce(paintLedgerTable, 120);
    const reasons = [{ value: 'all', label: 'All movements' }, ...Object.entries(SR.inventory.REASONS).map(([value, label]) => ({ value, label }))];
    return h('div', { class: 'toolbar' },
      field('Search ledger', input({ type: 'search', placeholder: 'Product, SKU, reference or note', value: view.query, onInput: (e) => { view.query = e.target.value; debounced(); } }), { class: 'grow' }),
      field('Reason', select(reasons, view.reason, { onChange: (e) => { view.reason = e.target.value; paintLedgerTable(); } })),
      field('From', input({ type: 'date', value: view.from, onChange: (e) => { view.from = e.target.value; paintLedgerTable(); } })),
      field('To', input({ type: 'date', value: view.to, onChange: (e) => { view.to = e.target.value; paintLedgerTable(); } })),
      h('div', { class: 'toolbar-end' }, btn('Export ledger CSV', { iconName: 'download', onClick: () => download('stockroom-stock-ledger.csv', SR.csv.ledger(state(), ledgerRows()), 'text/csv') })));
  }

  let ledgerHolder = null;

  function paintLedgerTable() {
    if (!ledgerHolder) return;
    clear(ledgerHolder);
    ledgerHolder.appendChild(dataTable({
      caption: 'Stock ledger',
      testId: 'ledger',
      rows: ledgerRows(),
      pageSize: 100,
      empty: emptyState('No ledger rows match', 'Clear the filters to see every stock movement.'),
      columns: [
        { label: 'When', render: (e) => SR.util.formatDateTime(e.at) },
        { label: 'Product', render: (e) => { const f = SR.catalog.lookup(state(), e.variantId); return SR.catalog.displayName(f.product, f.variant); } },
        { label: 'SKU', render: (e) => h('span', { class: 'mono' }, SR.catalog.lookup(state(), e.variantId).variant.sku) },
        { label: 'Reason', render: (e) => SR.inventory.reasonLabel(e.reason) },
        { label: 'Reference', render: (e) => e.ref },
        { label: 'Change', align: 'right', render: (e) => h('span', { class: e.delta > 0 ? 'delta-up' : 'delta-down' }, e.delta > 0 ? `+${e.delta}` : String(e.delta)) },
        { label: 'Balance', align: 'right', render: (e) => h('strong', null, String(e.balance)) },
        { label: 'Unit cost', align: 'right', render: (e) => format(e.unitCostCents) },
        { label: 'Note', render: (e) => h('span', { class: 'cell-clip' }, e.note) },
      ],
    }));
  }

  function paintLedger() {
    ledgerHolder = h('div');
    content.append(ledgerToolbar(), ledgerHolder);
    paintLedgerTable();
  }

  function paintAll() {
    if (!content) return;
    paintStats();
    paintTabs();
    clear(content);
    ledgerHolder = null;
    if (view.tab === 'low') paintLow();
    else paintLedger();
  }

  /** Change by a signed amount, or count to a number and let the app work out the change. */
  function adjustModal(preset) {
    let chosen = preset || null;
    let mode = 'change';
    const qtyInput = input({ inputmode: 'numeric', autocomplete: 'off', onInput: () => preview() });
    const qtyField = field('Change in units', qtyInput, { hint: 'Use a minus sign to remove stock, for example -2.' });
    const reasonSelect = select([{ value: '', label: 'Choose a reason' }, ...SR.inventory.ADJUST_REASONS.map((r) => ({ value: r, label: SR.inventory.reasonLabel(r) }))], '');
    const reasonField = field('Reason', reasonSelect);
    const noteInput = textarea({ maxlength: 200 });
    const previewEl = h('div', { class: 'modal-sum', dataset: { testid: 'adjust-preview' } });
    const picker = variantPicker({ label: 'Product', onPick: (row) => { chosen = row; picker.setError(''); preview(); } });
    if (chosen) picker.input.value = SR.catalog.displayName(chosen.product, chosen.variant);

    function delta() {
      const value = parseWhole(qtyInput.value, { allowNegative: mode === 'change' });
      if (value === null || !chosen) return null;
      return mode === 'change' ? value : value - chosen.variant.stock;
    }

    function preview() {
      clear(previewEl);
      if (!chosen) { previewEl.textContent = 'Choose a product to see its stock.'; return; }
      const change = delta();
      const onHand = chosen.variant.stock;
      if (change === null) previewEl.textContent = `${onHand} on hand now.`;
      else previewEl.append(`On hand ${onHand} becomes `, h('strong', null, String(onHand + change)), ` (${change >= 0 ? '+' : ''}${change}).`);
    }

    function save() {
      const request = { variantId: chosen ? chosen.variant.id : null, delta: delta(), reason: reasonSelect.value, note: noteInput.value };
      const errors = SR.inventory.validateAdjustment(request);
      if (mode === 'count' && request.delta === 0) errors.qty = 'That already matches the count on hand.';
      picker.setError(errors.variant);
      qtyField.setError(errors.qty);
      reasonField.setError(errors.reason);
      if (Object.keys(errors).length) return;
      const entry = SR.inventory.adjust(state(), request);
      modal.close();
      SR.app.commit();
      toast(`${entry.ref}: ${chosen.product.name} now ${entry.balance} on hand`);
    }

    const modeSwitch = segmented('Adjustment type', [{ value: 'change', label: 'Change by' }, { value: 'count', label: 'Count to' }], mode, (value) => {
      mode = value;
      qtyField.querySelector('label').textContent = mode === 'change' ? 'Change in units' : 'Counted on hand';
      const hint = qtyField.querySelector('.field-hint');
      hint.textContent = mode === 'change' ? 'Use a minus sign to remove stock, for example -2.' : 'The ledger records the difference from the current count.';
      preview();
    });

    const modal = openModal({
      title: 'Adjust stock',
      size: 'sm',
      body: h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); save(); } },
        picker, modeSwitch, qtyField, reasonField, field('Note (optional)', noteInput), previewEl, h('button', { type: 'submit', hidden: true })),
      footer: [btn('Cancel', { onClick: () => modal.close() }), btn('Post adjustment', { kind: 'primary', onClick: save })],
      initialFocus: picker.input,
    });
    preview();
  }

  function mount(root, params) {
    if (params[0] === 'ledger') {
      view.tab = 'ledger';
      view.query = params[1] ? decodeURIComponent(params[1]) : view.query;
    }
    statsEl = h('div', { class: 'stats' });
    tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Stock views' });
    content = h('div', { class: 'list', role: 'tabpanel' });
    root.append(
      pageHeader('Inventory', 'What is running low, and every unit that has moved.',
        btn('Adjust stock', { kind: 'primary', iconName: 'edit', onClick: () => adjustModal() })),
      statsEl, tabsEl, content);
    paintAll();
  }

  return { mount, unmount: () => { content = null; ledgerHolder = null; }, refresh: paintAll, adjustModal };
})();
