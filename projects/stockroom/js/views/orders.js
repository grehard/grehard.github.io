// Purchase orders: list, draft editor, order details and goods receipt.
SR.views.orders = (function () {
  const { h, btn, clear, field, input, select, textarea, cellInput, variantPicker, openModal, pageHeader, pill, dataTable, emptyState, toast, iconBtn } = SR.ui;
  const { format, parse, plain } = SR.money;
  const { parseWhole, formatDate } = SR.util;
  const P = SR.purchasing;

  const view = { tab: 'orders', status: 'open', query: '' };
  let content = null;
  let tabsEl = null;
  const state = () => SR.store.state;

  const STATUS_TONES = { draft: 'neutral', ordered: 'info', partial: 'warn', received: 'good' };
  const statusPill = (po) => pill(P.STATUS_LABELS[po.status] + (po.closedShort ? ', closed short' : ''), STATUS_TONES[po.status]);
  const supplierOf = (po) => state().suppliers.find((s) => s.id === po.supplierId);
  const supplierName = (po) => (supplierOf(po) ? supplierOf(po).name : 'Deleted supplier');

  function matchesOrder(po) {
    if (view.status === 'open' && po.status === 'received') return false;
    if (view.status !== 'open' && view.status !== 'all' && po.status !== view.status) return false;
    if (!view.query) return true;
    const names = po.lines.map((l) => { const f = SR.catalog.lookup(state(), l.variantId); return `${f.product.name} ${f.variant.sku}`; }).join(' ');
    const hay = `${po.number} ${supplierName(po)} ${names}`.toLowerCase();
    return view.query.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
  }

  function orderTable() {
    const rows = state().purchaseOrders.filter(matchesOrder).sort((a, b) => b.createdAt - a.createdAt);
    return dataTable({
      caption: 'Purchase orders',
      rows,
      pageSize: 40,
      empty: emptyState('No purchase orders here', 'Change the filter, or start a new order.', btn('New purchase order', { kind: 'primary', iconName: 'plus', onClick: () => draftEditor(null) })),
      columns: [
        { label: 'Order', render: (po) => h('button', { type: 'button', class: 'link strong', onClick: () => openOrder(po) }, po.number) },
        { label: 'Supplier', render: supplierName },
        { label: 'Status', render: statusPill },
        { label: 'Created', render: (po) => formatDate(po.createdAt) },
        { label: 'Lines', align: 'right', render: (po) => po.lines.length },
        { label: 'Received', align: 'right', render: (po) => { const t = P.lineTotals(po); return `${t.receivedUnits} of ${t.orderedUnits}`; } },
        { label: 'Value', align: 'right', render: (po) => format(P.lineTotals(po).totalCents) },
      ],
    });
  }

  function paintOrdersTab() {
    const holder = h('div');
    const paintTable = () => { clear(holder).appendChild(orderTable()); };
    const debounced = SR.util.debounce(paintTable, 100);
    content.append(
      h('div', { class: 'toolbar' },
        field('Search orders', input({ type: 'search', value: view.query, placeholder: 'Order number, supplier or product', onInput: (e) => { view.query = e.target.value; debounced(); } }), { class: 'grow' }),
        field('Status', select([
          { value: 'open', label: 'Open orders' }, { value: 'all', label: 'All orders' }, { value: 'draft', label: 'Draft' }, { value: 'ordered', label: 'Ordered' },
          { value: 'partial', label: 'Partially received' }, { value: 'received', label: 'Received' },
        ], view.status, { onChange: (e) => { view.status = e.target.value; paintTable(); } }))),
      holder);
    paintTable();
  }

  /** The order's detail: lines, receipts so far, and the actions its status allows. */
  function openOrder(po) {
    const totals = P.lineTotals(po);
    const lineRows = po.lines.map((line) => ({ line, found: SR.catalog.lookup(state(), line.variantId) }));
    const refresh = (next) => { modal.close(); SR.app.commit(); if (next) next(); };
    const actions = [];
    if (po.status === 'draft') {
      actions.push(btn('Delete draft', { kind: 'danger-quiet', iconName: 'trash', onClick: () => deleteDraft(po, modal) }));
      actions.push(btn('Edit draft', { iconName: 'edit', onClick: () => { modal.close(); draftEditor(po); } }));
      actions.push(btn('Mark as ordered', {
        kind: 'primary',
        onClick: () => {
          if (!po.lines.length) { toast('Add a product to this draft first.', { tone: 'bad' }); return; }
          P.markOrdered(po);
          refresh(() => { toast(`${po.number} marked as ordered. Stock changes when goods arrive.`); openOrder(po); });
        },
      }));
    }
    if (po.status === 'ordered') {
      actions.push(btn('Back to draft', { onClick: () => { P.backToDraft(po); refresh(() => openOrder(po)); } }));
    }
    if (po.status === 'partial') {
      actions.push(btn('Close short', {
        onClick: () => {
          P.closeShort(po);
          refresh(() => { toast(`${po.number} closed. Remaining units are no longer expected.`); openOrder(po); });
        },
      }));
    }
    if (po.status === 'ordered' || po.status === 'partial') {
      actions.push(btn('Receive goods', { kind: 'primary', onClick: () => { modal.close(); receiveModal(po); } }));
    }
    const modal = openModal({
      title: `${po.number}, ${supplierName(po)}`,
      size: 'lg',
      body: h('div', { class: 'stack' },
        h('div', { class: 'po-meta' }, statusPill(po),
          h('span', { class: 'muted' }, `Created ${formatDate(po.createdAt)}`),
          po.orderedAt ? h('span', { class: 'muted' }, `Ordered ${formatDate(po.orderedAt)}`) : null,
          h('span', { class: 'muted' }, `Value ${format(totals.totalCents)}`)),
        po.note ? h('p', { class: 'muted' }, po.note) : null,
        dataTable({
          caption: `Lines on ${po.number}`,
          rows: lineRows,
          empty: emptyState('No lines yet', 'Edit this draft to add products.'),
          columns: [
            { label: 'Product', render: (r) => SR.catalog.displayName(r.found.product, r.found.variant) },
            { label: 'SKU', render: (r) => h('span', { class: 'mono' }, r.found.variant.sku) },
            { label: 'Ordered', align: 'right', render: (r) => r.line.qty },
            { label: 'Received', align: 'right', render: (r) => r.line.receivedQty },
            { label: 'Still due', align: 'right', render: (r) => (po.closedShort ? 0 : P.outstanding(r.line)) },
            { label: 'Unit cost', align: 'right', render: (r) => format(r.line.unitCostCents) },
            { label: 'Line total', align: 'right', render: (r) => format(r.line.qty * r.line.unitCostCents) },
          ],
        }),
        po.receipts.length ? h('div', { class: 'stack-tight' }, h('h3', null, 'Receipts'),
          po.receipts.map((receipt) => h('p', { class: 'muted' }, `${SR.util.formatDateTime(receipt.at)}: ${receipt.lines.map((l) => `${l.qty} x ${SR.catalog.lookup(state(), l.variantId).variant.sku} at ${format(l.unitCostCents)}`).join(', ')}`))) : null),
      footer: actions.length ? actions : null,
    });
    return modal;
  }

  function deleteDraft(po, modal) {
    const list = state().purchaseOrders;
    const index = list.indexOf(po);
    list.splice(index, 1);
    modal.close();
    SR.app.commit();
    toast(`Draft ${po.number} deleted`, {
      undo: () => {
        list.splice(index, 0, po);
        SR.app.commit();
      },
    });
  }

  /** Each line shows the live effect on weighted-average cost before anything is posted. */
  function receiveModal(po) {
    const problem = h('div', { class: 'field-error', role: 'alert', hidden: true });
    const rows = po.lines.map((line, lineIndex) => {
      const { product, variant } = SR.catalog.lookup(state(), line.variantId);
      const left = P.outstanding(line);
      const avg = h('td', { class: 'num', dataset: { testid: 'new-average' } });
      const qty = cellInput({ inputmode: 'numeric', value: String(left), disabled: left === 0, 'aria-label': `Quantity received of ${product.name}`, onInput: () => update() });
      const cost = cellInput({ inputmode: 'decimal', value: plain(line.unitCostCents), disabled: left === 0, 'aria-label': `Unit cost of ${product.name}`, onInput: () => update() });
      const read = () => ({
        lineIndex,
        qty: qty.input.value.trim() === '' ? 0 : parseWhole(qty.input.value),
        unitCostCents: parse(cost.input.value),
      });
      const update = () => {
        const { qty: q, unitCostCents: c } = read();
        avg.textContent = q && c !== null ? format(SR.inventory.weightedAverageCost(variant.stock, variant.costCents, q, c)) : format(variant.costCents);
      };
      update();
      const cells = h('tr', null,
        h('td', null, h('div', null, SR.catalog.displayName(product, variant)), h('div', { class: 'muted mono' }, variant.sku)),
        h('td', { class: 'num' }, left),
        h('td', { class: 'num' }, variant.stock),
        h('td', { class: 'num' }, format(variant.costCents)),
        h('td', null, qty),
        h('td', null, cost),
        avg);
      return { cells, read, qty };
    });

    function submit() {
      const entries = rows.map((r) => r.read());
      const error = P.validateReceipt(po, entries);
      if (error) {
        problem.textContent = error;
        problem.hidden = false;
        return;
      }
      const posted = P.receive(state(), po, entries);
      modal.close();
      SR.app.commit();
      const units = posted.reduce((a, l) => a + l.qty, 0);
      toast(`Received ${units} ${units === 1 ? 'unit' : 'units'}. ${po.number} is now ${P.STATUS_LABELS[po.status].toLowerCase()}.`);
      openOrder(po);
    }

    const modal = openModal({
      title: `Receive goods: ${po.number}`,
      size: 'xl',
      body: h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); submit(); } },
        h('p', { class: 'muted' }, 'Enter what actually arrived. Anything less leaves the order partially received. New average cost is worked out from the stock on hand now.'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table table-form' },
          h('thead', null, h('tr', null, h('th', null, 'Product'), h('th', { class: 'num' }, 'Still due'), h('th', { class: 'num' }, 'On hand'), h('th', { class: 'num' }, 'Avg. cost'), h('th', null, 'Receive'), h('th', null, 'Unit cost'), h('th', { class: 'num' }, 'New avg.'))),
          h('tbody', null, rows.map((r) => r.cells)))),
        problem,
        h('button', { type: 'submit', hidden: true })),
      footer: [btn('Cancel', { onClick: () => modal.close() }), btn('Post receipt', { kind: 'primary', onClick: submit })],
    });
    const firstOpen = rows.find((r) => !r.qty.input.disabled);
    if (firstOpen) { firstOpen.qty.input.focus(); firstOpen.qty.input.select(); }
  }

  function draftEditor(po) {
    const isEdit = !!po;
    const supplier = select([{ value: '', label: 'Choose a supplier' }, ...state().suppliers.map((s) => ({ value: s.id, label: s.name }))], isEdit ? po.supplierId : '');
    const supplierField = field('Supplier', supplier);
    const note = textarea({ value: isEdit ? po.note : '', maxlength: 200 });
    const tbody = h('tbody');
    const linesError = h('div', { class: 'field-error', role: 'alert', hidden: true });
    const totalEl = h('div', { class: 'modal-sum', dataset: { testid: 'po-total' } });
    let rows = [];

    function refreshTotal() {
      const cents = rows.reduce((sum, r) => {
        const line = r.read();
        return sum + (line.qty && line.unitCostCents !== null ? line.qty * line.unitCostCents : 0);
      }, 0);
      totalEl.textContent = `Order value ${format(cents)}`;
    }

    function addLine({ variantId, qty, unitCostCents }) {
      const existing = rows.find((r) => r.variantId === variantId);
      if (existing) { existing.qty.input.focus(); existing.qty.input.select(); return; }
      const { product, variant } = SR.catalog.lookup(state(), variantId);
      const name = SR.catalog.displayName(product, variant);
      const qtyCell = cellInput({ inputmode: 'numeric', value: String(qty), 'aria-label': `Quantity of ${name}`, onInput: refreshTotal });
      const costCell = cellInput({ inputmode: 'decimal', value: plain(unitCostCents), 'aria-label': `Unit cost of ${name}`, onInput: refreshTotal });
      const row = {
        variantId, qty: qtyCell, cost: costCell,
        read: () => ({ variantId, qty: parseWhole(qtyCell.input.value), unitCostCents: parse(costCell.input.value) }),
      };
      row.tr = h('tr', null,
        h('td', null, h('div', null, name), h('div', { class: 'muted mono' }, `${variant.sku}, ${variant.stock} on hand`)),
        h('td', null, qtyCell), h('td', null, costCell),
        h('td', null, iconBtn('trash', `Remove ${name}`, () => {
          rows = rows.filter((r) => r !== row);
          row.tr.remove();
          refreshTotal();
        })));
      rows.push(row);
      tbody.appendChild(row.tr);
      refreshTotal();
    }

    if (isEdit) po.lines.forEach(addLine);

    const picker = variantPicker({
      label: 'Add a product',
      keepOpen: true,
      onPick: ({ variant, product }) => {
        addLine({ variantId: variant.id, qty: variant.reorderQty, unitCostCents: variant.lastCostCents || variant.costCents });
        if (!supplier.value && product.supplierId) supplier.value = product.supplierId;
      },
    });

    function save() {
      const draft = { supplierId: supplier.value, lines: rows.map((r) => r.read()), note: note.value };
      const errors = P.validateDraft(draft);
      supplierField.setError(errors.supplier);
      linesError.textContent = errors.lines || '';
      linesError.hidden = !errors.lines;
      rows.forEach((r, i) => {
        r.qty.setError(errors[`line.${i}.qty`]);
        r.cost.setError(errors[`line.${i}.cost`]);
      });
      if (Object.keys(errors).length) return;
      let target = po;
      if (isEdit) P.updateDraft(po, draft);
      else target = P.createDraft(state(), draft);
      modal.close();
      SR.app.commit();
      toast(`Saved draft ${target.number}`);
      openOrder(target);
    }

    const modal = openModal({
      title: isEdit ? `Edit draft ${po.number}` : 'New purchase order',
      size: 'lg',
      body: h('div', { class: 'stack' },
        supplierField,
        picker,
        h('div', { class: 'table-wrap' }, h('table', { class: 'table table-form' },
          h('thead', null, h('tr', null, h('th', null, 'Product'), h('th', null, 'Quantity'), h('th', null, 'Unit cost'), h('th', null, ''))),
          tbody)),
        linesError, totalEl, field('Note (optional)', note)),
      footer: [btn('Cancel', { onClick: () => modal.close() }), btn('Save draft', { kind: 'primary', onClick: save })],
      initialFocus: isEdit ? picker.input : supplier,
    });
    refreshTotal();
  }

  function supplierForm(supplier) {
    const isEdit = !!supplier;
    const values = supplier || { name: '', contact: '', email: '', phone: '', leadDays: 3 };
    const name = input({ value: values.name, maxlength: 120, autocomplete: 'off' });
    const contact = input({ value: values.contact, maxlength: 80, autocomplete: 'off' });
    const email = input({ value: values.email, type: 'email', maxlength: 120, autocomplete: 'off' });
    const phone = input({ value: values.phone, maxlength: 40, autocomplete: 'off' });
    const lead = input({ value: String(values.leadDays), inputmode: 'numeric', autocomplete: 'off' });
    const nameField = field('Supplier name', name);
    const emailField = field('Email', email);
    const leadField = field('Lead time in days', lead);

    function save() {
      const leadDays = parseWhole(lead.value);
      const badEmail = email.value.trim() && !/^[^@\s]+@[^@\s]+$/.test(email.value.trim());
      nameField.setError(name.value.trim() ? '' : 'Enter a supplier name.');
      emailField.setError(badEmail ? 'Enter a valid email address.' : '');
      leadField.setError(leadDays === null || leadDays > 365 ? 'Enter a number of days up to 365.' : '');
      if (!name.value.trim() || badEmail || leadDays === null || leadDays > 365) return;
      const fields = { name: name.value.trim(), contact: contact.value.trim(), email: email.value.trim(), phone: phone.value.trim(), leadDays };
      if (isEdit) Object.assign(supplier, fields);
      else state().suppliers.push({ id: SR.store.nextId(state(), 'sup'), ...fields });
      modal.close();
      SR.app.commit();
      toast(`${isEdit ? 'Saved' : 'Added'} ${fields.name}`);
    }

    const modal = openModal({
      title: isEdit ? `Edit ${supplier.name}` : 'Add supplier',
      size: 'sm',
      body: h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); save(); } },
        nameField, field('Contact', contact), emailField, field('Phone', phone), leadField, h('button', { type: 'submit', hidden: true })),
      footer: [btn('Cancel', { onClick: () => modal.close() }), btn(isEdit ? 'Save supplier' : 'Add supplier', { kind: 'primary', onClick: save })],
    });
  }

  /** A supplier in use can't go, since products and orders would be left pointing at nothing. */
  function deleteSupplier(supplier) {
    const used = SR.catalog.activeProducts(state()).filter((p) => p.supplierId === supplier.id).length;
    const orders = state().purchaseOrders.filter((po) => po.supplierId === supplier.id).length;
    if (used || orders) {
      toast(`${supplier.name} still has ${used} products and ${orders} orders, so it can't be deleted.`, { tone: 'bad' });
      return;
    }
    const list = state().suppliers;
    const index = list.indexOf(supplier);
    list.splice(index, 1);
    SR.app.commit();
    toast(`Deleted ${supplier.name}`, {
      undo: () => {
        list.splice(index, 0, supplier);
        SR.app.commit();
      },
    });
  }

  function paintSuppliersTab() {
    const productCount = (id) => SR.catalog.activeProducts(state()).filter((p) => p.supplierId === id).length;
    const openValue = (id) => state().purchaseOrders
      .filter((po) => po.supplierId === id && (po.status === 'ordered' || po.status === 'partial'))
      .reduce((a, po) => a + po.lines.reduce((sum, l) => sum + P.outstanding(l) * l.unitCostCents, 0), 0);
    content.appendChild(dataTable({
      caption: 'Suppliers',
      rows: state().suppliers,
      empty: emptyState('No suppliers yet', 'Add a supplier to start ordering stock.'),
      columns: [
        { label: 'Supplier', render: (s) => h('button', { type: 'button', class: 'link strong', onClick: () => supplierForm(s) }, s.name) },
        { label: 'Contact', render: (s) => s.contact },
        { label: 'Email', render: (s) => s.email },
        { label: 'Phone', render: (s) => s.phone },
        { label: 'Lead time', align: 'right', render: (s) => `${s.leadDays} days` },
        { label: 'Products', align: 'right', render: (s) => productCount(s.id) },
        { label: 'Still due', align: 'right', render: (s) => format(openValue(s.id)) },
        {
          label: 'Actions',
          render: (s) => h('div', { class: 'row-actions' },
            iconBtn('edit', `Edit ${s.name}`, () => supplierForm(s)),
            iconBtn('trash', `Delete ${s.name}`, () => deleteSupplier(s))),
        },
      ],
    }));
  }

  function paintTabs() {
    clear(tabsEl);
    [['orders', 'Purchase orders'], ['suppliers', `Suppliers (${state().suppliers.length})`]].forEach(([key, label]) => {
      tabsEl.appendChild(h('button', {
        type: 'button', role: 'tab', class: `tab${view.tab === key ? ' on' : ''}`, 'aria-selected': String(view.tab === key),
        onClick: () => { view.tab = key; refresh(); },
      }, label));
    });
  }

  function refresh() {
    if (!content) return;
    paintTabs();
    clear(content);
    if (view.tab === 'orders') paintOrdersTab();
    else paintSuppliersTab();
  }

  function mount(root) {
    tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Purchasing views' });
    content = h('div', { class: 'list', role: 'tabpanel' });
    root.append(
      pageHeader('Purchase orders', 'Order from suppliers, then receive what arrives. Stock and average cost update on receipt.', [
        btn('Add supplier', { iconName: 'plus', onClick: () => supplierForm(null) }),
        btn('New purchase order', { kind: 'primary', iconName: 'plus', onClick: () => draftEditor(null) }),
      ]),
      tabsEl, content);
    refresh();
  }

  return { mount, unmount: () => { content = null; }, refresh, openOrder };
})();
