// CSV writers for products, sales and the stock ledger.
SR.csv = (function () {
  const { plain } = SR.money;
  const { dateKey, clockTime } = SR.util;

  /** A leading = + - or @ in a text cell would run as a formula in a spreadsheet, so it gets neutralised. */
  function textCell(value) {
    const text = String(value === null || value === undefined ? '' : value);
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  }

  function quote(cell) {
    const text = String(cell);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  const encode = (rows) => `${rows.map((row) => row.map(quote).join(',')).join('\r\n')}\r\n`;

  function products(state) {
    const rows = [['Product', 'Variant', 'SKU', 'Barcode', 'Category', 'Supplier', 'Taxable', 'Price', 'Unit cost', 'On hand', 'Reorder point', 'Reorder quantity']];
    for (const { product, variant } of SR.catalog.allActiveVariants(state)) {
      const supplier = state.suppliers.find((s) => s.id === product.supplierId);
      rows.push([
        textCell(product.name), textCell(variant.name), textCell(variant.sku), textCell(variant.barcode), textCell(product.category),
        textCell(supplier ? supplier.name : ''), product.taxable ? 'yes' : 'no',
        plain(variant.priceCents), plain(variant.costCents), variant.stock, variant.reorderPoint, variant.reorderQty,
      ]);
    }
    return encode(rows);
  }

  function sales(state) {
    const rows = [['Sale', 'Date', 'Time', 'Payment', 'SKU', 'Product', 'Variant', 'Category', 'Quantity', 'Unit price', 'Line discount', 'Order discount', 'Net', 'Tax', 'Unit cost', 'Returned quantity']];
    for (const sale of state.sales) {
      for (const line of sale.lines) {
        rows.push([
          sale.number, dateKey(sale.at), clockTime(sale.at), sale.payment.method, textCell(line.sku), textCell(line.name), textCell(line.variant), textCell(line.category),
          line.qty, plain(line.unitPriceCents), plain(line.lineDiscountCents), plain(line.orderDiscountCents), plain(line.netCents), plain(line.taxCents),
          plain(line.unitCostCents), line.returnedQty,
        ]);
      }
    }
    return encode(rows);
  }

  function ledger(state, entries) {
    const rows = [['Date', 'Time', 'SKU', 'Product', 'Variant', 'Reason', 'Reference', 'Change', 'Balance', 'Unit cost', 'Note']];
    for (const entry of entries) {
      const found = SR.catalog.lookup(state, entry.variantId);
      rows.push([
        dateKey(entry.at), clockTime(entry.at),
        textCell(found ? found.variant.sku : ''), textCell(found ? found.product.name : ''), textCell(found ? found.variant.name : ''),
        SR.inventory.reasonLabel(entry.reason), textCell(entry.ref), entry.delta, entry.balance, plain(entry.unitCostCents), textCell(entry.note),
      ]);
    }
    return encode(rows);
  }

  return { products, sales, ledger };
})();
