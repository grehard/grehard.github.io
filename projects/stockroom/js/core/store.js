// Holds the one state object, persists it to localStorage, and checks anything loaded from
// storage or a backup file before the app trusts it. If storage is blocked the app keeps
// working in memory and Settings says so.
SR.store = (function () {
  const DATA_KEY = 'stockroom:data:v1';
  const THEME_KEY = 'stockroom:theme';
  const FORMAT_VERSION = 1;

  const api = { state: null, persistent: true, loadNotice: null };

  function emptyState() {
    return {
      version: FORMAT_VERSION,
      settings: { shopName: '', address: '', phone: '', taxRateBp: 0, floatCents: 0, receiptFooter: '' },
      counters: { id: 0, sale: 10001, refund: 2001, po: 1001, adjustment: 501, held: 1 },
      suppliers: [],
      products: [],
      ledger: [],
      sales: [],
      refunds: [],
      purchaseOrders: [],
      closes: [],
      held: [],
      cart: { lines: [], orderDiscount: null },
    };
  }

  const nextId = (state, prefix) => `${prefix}${(state.counters.id += 1)}`;

  function nextNumber(state, counter) {
    const value = state.counters[counter];
    state.counters[counter] = value + 1;
    return value;
  }

  const isInt = (v) => Number.isSafeInteger(v);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  function validateCart(cart, where, known, errors) {
    if (!isObj(cart) || !Array.isArray(cart.lines)) { errors.push(`${where} is not a valid cart.`); return; }
    cart.lines.forEach((line, i) => {
      if (!isObj(line) || !known.has(line.variantId)) { errors.push(`${where} line ${i + 1} refers to an unknown product.`); return; }
      if (!isInt(line.qty) || line.qty < 1 || !isInt(line.unitPriceCents) || line.unitPriceCents < 0) errors.push(`${where} line ${i + 1} has an invalid quantity or price.`);
    });
  }

  function validateProducts(data, errors) {
    const known = new Set();
    data.products.forEach((product, p) => {
      if (!isObj(product) || typeof product.name !== 'string' || !Array.isArray(product.variants)) { errors.push(`Product ${p + 1} is malformed.`); return; }
      product.variants.forEach((variant) => {
        const fine = isObj(variant) && typeof variant.id === 'string' && typeof variant.sku === 'string'
          && [variant.priceCents, variant.costCents, variant.stock, variant.reorderPoint, variant.reorderQty].every(isInt);
        if (!fine) errors.push(`"${product.name}" has an invalid variant.`);
        else known.add(variant.id);
      });
    });
    return known;
  }

  function validateRecords(data, known, errors) {
    data.ledger.forEach((entry, i) => {
      if (!isObj(entry) || !known.has(entry.variantId) || !isInt(entry.delta) || !isInt(entry.balance) || !isInt(entry.at)) errors.push(`Ledger row ${i + 1} is invalid.`);
    });
    data.sales.forEach((sale, i) => {
      const fine = isObj(sale) && typeof sale.number === 'string' && isInt(sale.at) && isInt(sale.totalCents) && isObj(sale.payment) && Array.isArray(sale.lines)
        && sale.lines.every((l) => isObj(l) && isInt(l.qty) && isInt(l.netCents) && isInt(l.taxCents) && isInt(l.unitCostCents) && isInt(l.returnedQty));
      if (!fine) errors.push(`Sale ${i + 1} is invalid.`);
    });
    data.refunds.forEach((refund, i) => {
      if (!isObj(refund) || !isInt(refund.at) || !isInt(refund.totalCents) || !Array.isArray(refund.lines)) errors.push(`Refund ${i + 1} is invalid.`);
    });
    data.purchaseOrders.forEach((po, i) => {
      const fine = isObj(po) && ['draft', 'ordered', 'partial', 'received'].includes(po.status) && Array.isArray(po.lines) && Array.isArray(po.receipts)
        && po.lines.every((l) => isObj(l) && known.has(l.variantId) && isInt(l.qty) && isInt(l.receivedQty) && isInt(l.unitCostCents));
      if (!fine) errors.push(`Purchase order ${i + 1} is invalid.`);
    });
    data.closes.forEach((close, i) => {
      if (!isObj(close) || !SR.util.isDateKey(close.date) || !isInt(close.countedCents) || !isInt(close.expectedCents)) errors.push(`Cash count ${i + 1} is invalid.`);
    });
    data.held.forEach((held, i) => validateCart(held && held.cart, `Held sale ${i + 1}`, known, errors));
    validateCart(data.cart, 'The open cart', known, errors);
  }

  /** Returns a list of problems, empty when the data is safe to use. */
  function validate(data) {
    const errors = [];
    if (!isObj(data)) return ['The file does not contain a Stockroom data object.'];
    if (data.version !== FORMAT_VERSION) errors.push(`Unsupported data version: ${String(data.version)}.`);
    for (const key of ['suppliers', 'products', 'ledger', 'sales', 'refunds', 'purchaseOrders', 'closes', 'held']) {
      if (!Array.isArray(data[key])) errors.push(`Missing list: ${key}.`);
    }
    if (!isObj(data.settings) || !isInt(data.settings.taxRateBp) || data.settings.taxRateBp < 0) errors.push('Settings are missing or have an invalid tax rate.');
    if (!isObj(data.counters) || !isInt(data.counters.id) || !isInt(data.counters.sale)) errors.push('Numbering counters are missing.');
    if (errors.length) return errors;
    const known = validateProducts(data, errors);
    validateRecords(data, known, errors);
    return errors.slice(0, 12);
  }

  function readRaw(key) {
    try { return window.localStorage.getItem(key); } catch (e) { api.persistent = false; return null; }
  }

  function writeRaw(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function save() {
    if (api.state) api.persistent = writeRaw(DATA_KEY, JSON.stringify(api.state));
  }

  const seedState = () => SR.seed.build(Date.now());

  function load() {
    const raw = readRaw(DATA_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (!validate(parsed).length) { api.state = parsed; return; }
      } catch (e) { /* falls through to the notice and the seed below */ }
      api.loadNotice = 'Saved data could not be read, so the demo data was loaded instead.';
    }
    api.state = seedState();
    save();
  }

  function replaceState(next) {
    api.state = next;
    save();
  }

  /** Puts the demo data back. Returns the previous data as text so the reset can be undone. */
  function resetDemo() {
    const previous = JSON.stringify(api.state);
    replaceState(seedState());
    return previous;
  }

  function backupJson() {
    return JSON.stringify({ app: 'stockroom', exportedAt: new Date().toISOString(), data: api.state });
  }

  /** Parses a backup file's text. Returns { data } or { errors }, leaving current data alone. */
  function parseBackup(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { errors: ['This file is not valid JSON.'] };
    }
    if (!isObj(parsed) || parsed.app !== 'stockroom' || !isObj(parsed.data)) return { errors: ['This file is not a Stockroom backup.'] };
    const errors = validate(parsed.data);
    return errors.length ? { errors } : { data: parsed.data };
  }

  const loadTheme = () => readRaw(THEME_KEY);
  const saveTheme = (value) => writeRaw(THEME_KEY, value);

  return Object.assign(api, { emptyState, nextId, nextNumber, validate, load, save, replaceState, resetDemo, backupJson, parseBackup, loadTheme, saveTheme });
})();
