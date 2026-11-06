// Purchase orders move draft -> ordered -> partial -> received. Stock and weighted-average
// cost change only when goods are received, never when an order is placed.
SR.purchasing = (function () {
  const STATUS_LABELS = { draft: 'Draft', ordered: 'Ordered', partial: 'Partially received', received: 'Received' };

  function lineTotals(po) {
    return po.lines.reduce((acc, line) => ({
      orderedUnits: acc.orderedUnits + line.qty,
      receivedUnits: acc.receivedUnits + line.receivedQty,
      totalCents: acc.totalCents + line.qty * line.unitCostCents,
    }), { orderedUnits: 0, receivedUnits: 0, totalCents: 0 });
  }

  const toLines = (lines) => lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitCostCents: l.unitCostCents, receivedQty: 0 }));

  function createDraft(state, { supplierId, lines = [], note = '' }, at = Date.now()) {
    const number = `PO-${SR.store.nextNumber(state, 'po')}`;
    const po = { id: number, number, supplierId, status: 'draft', createdAt: at, orderedAt: null, note, closedShort: false, lines: toLines(lines), receipts: [] };
    state.purchaseOrders.push(po);
    return po;
  }

  function validateDraft({ supplierId, lines }) {
    const errors = {};
    if (!supplierId) errors.supplier = 'Choose a supplier.';
    if (!lines.length) errors.lines = 'Add at least one product.';
    lines.forEach((line, i) => {
      if (!line.qty || line.qty < 1 || line.qty > 99999) errors[`line.${i}.qty`] = 'At least 1.';
      if (line.unitCostCents === null) errors[`line.${i}.cost`] = 'Enter a cost.';
    });
    return errors;
  }

  function updateDraft(po, { supplierId, lines, note }) {
    po.supplierId = supplierId;
    po.note = note || '';
    po.lines = toLines(lines);
  }

  function markOrdered(po, at = Date.now()) {
    if (po.status !== 'draft') throw new Error('Only a draft can be placed.');
    if (!po.lines.length) throw new Error('This order has no lines.');
    po.status = 'ordered';
    po.orderedAt = at;
  }

  function backToDraft(po) {
    if (po.status !== 'ordered') throw new Error('Only an order with no receipts can go back to draft.');
    po.status = 'draft';
    po.orderedAt = null;
  }

  const outstanding = (line) => line.qty - line.receivedQty;

  /** Checks a receipt. entries: [{ lineIndex, qty, unitCostCents }]. Returns an error string or null. */
  function validateReceipt(po, entries) {
    for (const entry of entries) {
      const line = po.lines[entry.lineIndex];
      if (entry.qty === null || entry.qty < 0) return 'Quantities must be whole numbers.';
      if (entry.qty > outstanding(line)) return `Only ${outstanding(line)} still expected on one of these lines.`;
      if (entry.qty && entry.unitCostCents === null) return 'Enter a valid unit cost.';
    }
    if (!entries.some((e) => e.qty)) return 'Enter a quantity on at least one line.';
    return null;
  }

  /**
   * Receives goods against a PO. Each line blends its landed cost into the weighted average
   * and posts a ledger row. Status follows from what is still outstanding.
   */
  function receive(state, po, entries, at = Date.now()) {
    const error = validateReceipt(po, entries);
    if (error) throw new Error(error);
    const receiptLines = [];
    for (const entry of entries) {
      if (!entry.qty) continue;
      const line = po.lines[entry.lineIndex];
      line.receivedQty += entry.qty;
      const { variant } = SR.catalog.lookup(state, line.variantId);
      SR.inventory.receiveIntoStock(state, {
        variantId: line.variantId, qty: entry.qty, unitCostCents: entry.unitCostCents, reason: 'receipt', ref: po.number, at,
      });
      variant.lastCostCents = entry.unitCostCents;
      receiptLines.push({ variantId: line.variantId, qty: entry.qty, unitCostCents: entry.unitCostCents });
    }
    po.receipts.push({ at, lines: receiptLines });
    po.status = po.lines.every((l) => outstanding(l) === 0) ? 'received' : 'partial';
    return receiptLines;
  }

  /** Accepts that the rest of a partial order will never arrive. */
  function closeShort(po) {
    if (po.status !== 'partial') throw new Error('Only a partially received order can be closed short.');
    po.status = 'received';
    po.closedShort = true;
  }

  /** Rounds up to whole reorder quantities until cover is above the reorder point. */
  function suggestQty(variant, onOrderUnits) {
    const needed = variant.reorderPoint - (variant.stock + onOrderUnits) + 1;
    if (needed <= 0) return 0;
    return Math.ceil(needed / variant.reorderQty) * variant.reorderQty;
  }

  function draftContaining(state, variantId) {
    return state.purchaseOrders.find((po) => po.status === 'draft' && po.lines.some((l) => l.variantId === variantId)) || null;
  }

  function lowStockRows(state) {
    const rows = [];
    for (const { product, variant } of SR.catalog.allActiveVariants(state)) {
      if (!SR.catalog.isLow(variant)) continue;
      const onOrderUnits = SR.inventory.onOrder(state, variant.id);
      rows.push({
        product, variant, onOrderUnits,
        suggestedQty: suggestQty(variant, onOrderUnits),
        draft: draftContaining(state, variant.id),
        supplier: state.suppliers.find((s) => s.id === product.supplierId) || null,
      });
    }
    return rows.sort((a, b) => (a.variant.stock - a.variant.reorderPoint) - (b.variant.stock - b.variant.reorderPoint));
  }

  /**
   * One-click reorder: adds the suggested quantity to this supplier's open draft, starting
   * a new draft if there isn't one. Returns { po, created, qty }, or { error } when it can't.
   */
  function draftReorder(state, variantId, at = Date.now()) {
    const { product, variant } = SR.catalog.lookup(state, variantId);
    if (!product.supplierId) return { error: `${product.name} has no supplier. Set one on the product first.` };
    if (draftContaining(state, variantId)) return { error: `${product.name} is already on a draft order.` };
    const qty = suggestQty(variant, SR.inventory.onOrder(state, variantId));
    if (qty <= 0) return { error: `${product.name} is already covered by open orders.` };
    let po = state.purchaseOrders.find((p) => p.status === 'draft' && p.supplierId === product.supplierId);
    const created = !po;
    if (!po) po = createDraft(state, { supplierId: product.supplierId, note: 'Drafted from low stock alerts' }, at);
    po.lines.push({ variantId, qty, unitCostCents: variant.lastCostCents || variant.costCents, receivedQty: 0 });
    return { po, created, qty };
  }

  return {
    STATUS_LABELS, lineTotals, createDraft, validateDraft, updateDraft, markOrdered, backToDraft, outstanding,
    validateReceipt, receive, closeShort, suggestQty, lowStockRows, draftContaining, draftReorder,
  };
})();
