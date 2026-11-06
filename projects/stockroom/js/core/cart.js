// The open sale on the register, and sales put on hold. The cart lives in state so it
// survives a reload mid-sale.
SR.cart = (function () {
  const MAX_QTY = 9999;

  const emptyCart = () => ({ lines: [], orderDiscount: null });

  /** Adds units of a variant, merging into its existing line. Returns the line's index. */
  function add(state, { product, variant }, qty = 1) {
    const lines = state.cart.lines;
    const existing = lines.findIndex((l) => l.variantId === variant.id);
    if (existing >= 0) {
      lines[existing].qty = Math.min(MAX_QTY, lines[existing].qty + qty);
      return existing;
    }
    lines.push({ variantId: variant.id, qty: Math.min(MAX_QTY, qty), unitPriceCents: variant.priceCents, taxable: product.taxable, discount: null });
    return lines.length - 1;
  }

  function setQty(state, index, qty) {
    if (qty <= 0) state.cart.lines.splice(index, 1);
    else state.cart.lines[index].qty = Math.min(MAX_QTY, qty);
  }

  const remove = (state, index) => state.cart.lines.splice(index, 1)[0];

  /** Parses scanner or keyboard entry such as "3*POT-TC6" into a quantity and a code. */
  function parseEntry(text) {
    const match = /^\s*(\d{1,4})\s*[*x]\s*(\S.*?)\s*$/i.exec(text);
    if (match && Number(match[1]) > 0) return { qty: Number(match[1]), code: match[2] };
    return { qty: 1, code: text.trim() };
  }

  /** Puts the open cart on hold. Returns the held record. */
  function hold(state, label, at = Date.now()) {
    const record = {
      id: SR.store.nextId(state, 'h'),
      number: SR.store.nextNumber(state, 'held'),
      at,
      label: label.trim(),
      cart: state.cart,
    };
    state.held.push(record);
    state.cart = emptyCart();
    return record;
  }

  /** Resumes a held sale. Whatever is in the open cart goes on hold first, so nothing is lost. */
  function resume(state, heldId) {
    const index = state.held.findIndex((h) => h.id === heldId);
    if (index < 0) return null;
    const [record] = state.held.splice(index, 1);
    const displaced = state.cart.lines.length ? hold(state, 'Set aside when resuming another sale') : null;
    state.cart = record.cart;
    return { record, displaced };
  }

  return { MAX_QTY, emptyCart, add, setQty, remove, parseEntry, hold, resume };
})();
