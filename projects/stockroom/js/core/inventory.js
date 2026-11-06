// The stock ledger is append-only: every unit that moves gets a row with its signed change
// and the running balance. Variant.stock is only ever changed through post().
SR.inventory = (function () {
  const { mulDiv } = SR.money;

  const REASONS = {
    opening: 'Opening balance',
    sale: 'Sale',
    refund: 'Refund, restocked',
    receipt: 'PO receipt',
    damaged: 'Damaged',
    shrinkage: 'Shrinkage or theft',
    plant_loss: 'Plant loss',
    count: 'Stock count correction',
    found: 'Found stock',
    own_use: 'Used in shop',
    other: 'Other',
  };
  const ADJUST_REASONS = ['damaged', 'shrinkage', 'plant_loss', 'count', 'found', 'own_use', 'other'];

  function post(state, { variantId, delta, reason, ref = '', note = '', unitCostCents, at = Date.now() }) {
    const found = SR.catalog.lookup(state, variantId);
    if (!found) throw new Error(`Unknown variant ${variantId}`);
    found.variant.stock += delta;
    const entry = {
      id: SR.store.nextId(state, 'l'),
      at,
      variantId,
      delta,
      balance: found.variant.stock,
      reason,
      ref,
      note,
      unitCostCents: unitCostCents === undefined ? found.variant.costCents : unitCostCents,
    };
    state.ledger.push(entry);
    return entry;
  }

  /**
   * New weighted-average unit cost after stock comes in, rounded half up to the cent. With
   * nothing on hand (or an oversold negative count) the old average covers no units, so the
   * incoming cost wins.
   */
  function weightedAverageCost(onHand, currentCostCents, qty, unitCostCents) {
    if (qty <= 0) return currentCostCents;
    if (onHand <= 0) return unitCostCents;
    return mulDiv(onHand * currentCostCents + qty * unitCostCents, 1, onHand + qty);
  }

  /** Brings units in at a cost, blending it into the variant's average before posting. */
  function receiveIntoStock(state, { variantId, qty, unitCostCents, reason, ref, note, at }) {
    const { variant } = SR.catalog.lookup(state, variantId);
    variant.costCents = weightedAverageCost(variant.stock, variant.costCents, qty, unitCostCents);
    return post(state, { variantId, delta: qty, reason, ref, note, unitCostCents, at });
  }

  function validateAdjustment({ variantId, delta, reason }) {
    const errors = {};
    if (!variantId) errors.variant = 'Choose a product.';
    if (delta === null || delta === undefined || delta === 0) errors.qty = 'Enter a change other than zero.';
    else if (Math.abs(delta) > 99999) errors.qty = 'That change is too large.';
    if (!ADJUST_REASONS.includes(reason)) errors.reason = 'Choose a reason.';
    return errors;
  }

  function adjust(state, { variantId, delta, reason, note = '', at = Date.now() }) {
    const number = SR.store.nextNumber(state, 'adjustment');
    return post(state, { variantId, delta, reason, ref: `ADJ-${number}`, note: note.trim(), at });
  }

  /** Units on placed purchase orders that have not arrived yet. */
  function onOrder(state, variantId) {
    let total = 0;
    for (const po of state.purchaseOrders) {
      if (po.status !== 'ordered' && po.status !== 'partial') continue;
      for (const line of po.lines) if (line.variantId === variantId) total += line.qty - line.receivedQty;
    }
    return total;
  }

  function valuation(state) {
    let valueCents = 0;
    let units = 0;
    for (const { variant } of SR.catalog.allActiveVariants(state)) {
      if (variant.stock > 0) {
        valueCents += variant.stock * variant.costCents;
        units += variant.stock;
      }
    }
    return { valueCents, units };
  }

  /** Replays the ledger and lists any variant whose stored stock disagrees with its rows. */
  function reconcile(state) {
    const totals = new Map();
    let brokenBalances = 0;
    for (const entry of state.ledger) {
      const next = (totals.get(entry.variantId) || 0) + entry.delta;
      if (next !== entry.balance) brokenBalances += 1;
      totals.set(entry.variantId, next);
    }
    const mismatched = [];
    for (const { variant } of SR.catalog.index(state).values()) {
      if ((totals.get(variant.id) || 0) !== variant.stock) mismatched.push(variant.sku);
    }
    return { ok: !mismatched.length && !brokenBalances, mismatched, brokenBalances, entries: state.ledger.length };
  }

  const reasonLabel = (reason) => REASONS[reason] || reason;

  return { REASONS, ADJUST_REASONS, post, weightedAverageCost, receiveIntoStock, validateAdjustment, adjust, onOrder, valuation, reconcile, reasonLabel };
})();
