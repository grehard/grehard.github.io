// Turning a cart into a permanent sale record, and refunding against that record.
// Lines snapshot names and costs so reports stay correct after a product is edited or deleted.
SR.sales = (function () {
  const { computeCart, refundShare } = SR.pricing;

  function buildSaleLines(state, cart, totals) {
    return cart.lines.map((line, i) => {
      const { product, variant } = SR.catalog.lookup(state, line.variantId);
      const row = totals.lines[i];
      return {
        variantId: variant.id,
        productId: product.id,
        name: product.name,
        variant: variant.name,
        sku: variant.sku,
        category: product.category,
        taxable: !!line.taxable,
        qty: line.qty,
        unitPriceCents: line.unitPriceCents,
        discount: line.discount || null,
        lineDiscountCents: row.lineDiscountCents,
        orderDiscountCents: row.orderDiscountCents,
        netCents: row.netCents,
        taxCents: row.taxCents,
        unitCostCents: variant.costCents,
        returnedQty: 0,
      };
    });
  }

  /** Records a sale and posts one ledger row per line. Throws if the payment does not cover it. */
  function complete(state, cart, payment, at = Date.now()) {
    if (!cart.lines.length) throw new Error('The cart is empty.');
    const taxRateBp = state.settings.taxRateBp;
    const totals = computeCart(cart, taxRateBp);
    const tenderedCents = payment.method === 'cash' ? payment.tenderedCents : totals.totalCents;
    if (tenderedCents < totals.totalCents) throw new Error('Tendered amount does not cover the total.');
    const number = `S-${SR.store.nextNumber(state, 'sale')}`;
    const sale = {
      id: number,
      number,
      at,
      lines: buildSaleLines(state, cart, totals),
      orderDiscount: cart.orderDiscount || null,
      taxRateBp,
      subtotalCents: totals.subtotalCents,
      lineDiscountCents: totals.lineDiscountCents,
      orderDiscountCents: totals.orderDiscountCents,
      netCents: totals.netCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      payment: { method: payment.method, tenderedCents, changeCents: tenderedCents - totals.totalCents },
    };
    state.sales.push(sale);
    for (const line of sale.lines) {
      SR.inventory.post(state, { variantId: line.variantId, delta: -line.qty, reason: 'sale', ref: number, unitCostCents: line.unitCostCents, at });
    }
    return sale;
  }

  /** Works out a refund without changing anything. Used by the refund screen and by refund(). */
  function previewRefund(sale, requests) {
    const lines = [];
    const errors = [];
    for (const request of requests) {
      const line = sale.lines[request.lineIndex];
      if (!line) { errors.push('That line is not on this sale.'); continue; }
      if (request.qty === 0) continue;
      const remaining = line.qty - line.returnedQty;
      if (!Number.isInteger(request.qty) || request.qty < 0 || request.qty > remaining) {
        errors.push(`${line.name}: you can return up to ${remaining}.`);
        continue;
      }
      lines.push({
        lineIndex: request.lineIndex,
        variantId: line.variantId,
        productId: line.productId,
        name: line.name,
        variant: line.variant,
        sku: line.sku,
        category: line.category,
        qty: request.qty,
        restock: !!request.restock,
        netCents: refundShare(line.netCents, line.qty, line.returnedQty, request.qty),
        taxCents: refundShare(line.taxCents, line.qty, line.returnedQty, request.qty),
        // Cost only comes back out of cost of goods when the item really returns to the shelf.
        costReversedCents: request.restock ? line.unitCostCents * request.qty : 0,
      });
    }
    if (!lines.length && !errors.length) errors.push('Enter a quantity to return on at least one line.');
    const netCents = lines.reduce((a, l) => a + l.netCents, 0);
    const taxCents = lines.reduce((a, l) => a + l.taxCents, 0);
    return { lines, errors, netCents, taxCents, totalCents: netCents + taxCents };
  }

  /** Records a refund. Restocked lines return at their original sale cost, blended into the average. */
  function refund(state, saleId, { lines: requests, method, reason, at = Date.now() }) {
    const sale = state.sales.find((s) => s.id === saleId);
    if (!sale) throw new Error('Sale not found.');
    const preview = previewRefund(sale, requests);
    if (preview.errors.length) throw new Error(preview.errors[0]);
    const number = `R-${SR.store.nextNumber(state, 'refund')}`;
    const record = {
      id: number, number, saleId, saleNumber: sale.number, at, method, reason: reason || '',
      lines: preview.lines, netCents: preview.netCents, taxCents: preview.taxCents, totalCents: preview.totalCents,
    };
    state.refunds.push(record);
    for (const line of preview.lines) {
      sale.lines[line.lineIndex].returnedQty += line.qty;
      if (line.restock) {
        SR.inventory.receiveIntoStock(state, {
          variantId: line.variantId, qty: line.qty, unitCostCents: sale.lines[line.lineIndex].unitCostCents,
          reason: 'refund', ref: number, note: `Return against ${sale.number}`, at,
        });
      }
    }
    return record;
  }

  const refundsFor = (state, saleId) => state.refunds.filter((r) => r.saleId === saleId);

  function refundStatus(sale) {
    const returned = sale.lines.reduce((a, l) => a + l.returnedQty, 0);
    if (!returned) return 'none';
    return returned === sale.lines.reduce((a, l) => a + l.qty, 0) ? 'full' : 'partial';
  }

  return { complete, previewRefund, refund, refundsFor, refundStatus };
})();
