// Builds the demo shop by actually running it: 60 days of sales, refunds, stock adjustments,
// purchase orders and drawer counts go through the same functions the UI uses. That is why
// the seeded ledger reconciles to the unit and the costs move the way real ones would.
SR.seed = (function () {
  const HISTORY_DAYS = 60;
  const ADJUSTMENT_NOTES = {
    damaged: ['Dropped in the aisle', 'Crushed in delivery', 'Split packaging'],
    plant_loss: ['Root rot, composted', 'Frost-damaged by the door', 'Too leggy to sell'],
    shrinkage: ['Missing at shelf check'],
    count: ['Shelf count', 'Monthly count'],
    own_use: ['Used for shop repairs'],
    found: ['Found behind the back shelf'],
  };

  /** Small deterministic generator, so every first run tells the same story. */
  function makeRandom(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      int: (min, max) => min + Math.floor(next() * (max - min + 1)),
      chance: (p) => next() < p,
      pick: (list) => list[Math.floor(next() * list.length)],
    };
  }

  function barcodeFor(index) {
    const body = `0614${String(100000 + index * 37).slice(0, 8).padStart(8, '0')}`;
    const sum = body.split('').reduce((acc, ch, i) => acc + Number(ch) * (i % 2 ? 3 : 1), 0);
    return `${body}${(10 - (sum % 10)) % 10}`;
  }

  function loadCatalog(state, at) {
    const { settings, suppliers, products } = SR.seedCatalog;
    Object.assign(state.settings, settings);
    const supplierIds = {};
    for (const { key, ...fields } of suppliers) {
      const supplier = { id: SR.store.nextId(state, 'sup'), ...fields };
      supplierIds[key] = supplier.id;
      state.suppliers.push(supplier);
    }
    let barcodeIndex = 1;
    const popularity = new Map();
    for (const item of products) {
      const product = { id: SR.store.nextId(state, 'p'), name: item.name, category: item.category, supplierId: supplierIds[item.supplier], taxable: item.taxable, variants: [] };
      item.variants.forEach(([name, sku, priceCents, costCents, stock, reorderPoint, reorderQty]) => {
        const variant = {
          id: SR.store.nextId(state, 'v'), name, sku, barcode: barcodeFor(barcodeIndex++), priceCents, costCents,
          lastCostCents: costCents, reorderPoint, reorderQty, stock: 0,
        };
        product.variants.push(variant);
        popularity.set(variant.id, { weight: item.pop, opening: stock, floor: 0 });
      });
      state.products.push(product);
    }
    SR.catalog.invalidate(state);
    for (const [variantId, { opening }] of popularity) {
      SR.inventory.post(state, { variantId, delta: opening * 2, reason: 'opening', note: 'Stock at start of records', at });
    }
    return popularity;
  }

  /** Opening hours for a date: shorter on Sunday. Returned as minutes after midnight. */
  function hoursFor(date) {
    return date.getDay() === 0 ? { open: 600, close: 960 } : { open: 510, close: 1080 };
  }

  function salesPerDay(date, rng) {
    const dow = date.getDay();
    if (dow === 6) return rng.int(24, 34);
    if (dow === 0) return rng.int(12, 19);
    return rng.int(12, 22);
  }

  /** Weighted picker over variants with stock, optionally held to some categories. */
  function pickVariant(state, popularity, rng, categories, exclude) {
    const rows = SR.catalog.allActiveVariants(state).filter(({ product, variant }) => variant.stock > popularity.get(variant.id).floor
      && !exclude.has(variant.id) && (!categories || categories.includes(product.category)));
    const total = rows.reduce((a, r) => a + popularity.get(r.variant.id).weight, 0);
    if (!total) return null;
    let roll = rng.next() * total;
    for (const row of rows) {
      roll -= popularity.get(row.variant.id).weight;
      if (roll <= 0) return row;
    }
    return rows[rows.length - 1];
  }

  function makeCartLine({ product, variant }, qty, discount = null) {
    return { variantId: variant.id, qty, unitPriceCents: variant.priceCents, taxable: product.taxable, discount };
  }

  function buildCart(state, popularity, rng) {
    const lines = [];
    const used = new Set();
    let row = pickVariant(state, popularity, rng, null, used);
    const size = 1 + (rng.chance(0.45) ? 1 : 0) + (rng.chance(0.2) ? 1 : 0) + (rng.chance(0.06) ? 1 : 0);
    while (row && lines.length < size) {
      used.add(row.variant.id);
      const cheap = row.variant.priceCents < 800;
      const available = row.variant.stock - popularity.get(row.variant.id).floor;
      const qty = Math.min(available, cheap && rng.chance(0.35) ? rng.int(2, 4) : 1);
      const discount = rng.chance(0.04) ? { type: 'percent', value: rng.pick([1000, 1500, 2000]) } : null;
      lines.push(makeCartLine(row, qty, discount));
      const pairs = SR.seedCatalog.pairings[row.product.category];
      row = pickVariant(state, popularity, rng, rng.chance(0.6) ? pairs : null, used);
    }
    const orderDiscount = rng.chance(0.05) ? { type: 'percent', value: 1000 } : null;
    return { lines, orderDiscount };
  }

  function tenderFor(total, rng) {
    if (rng.chance(0.2)) return total;
    const step = rng.pick([100, 500, 1000, 2000]);
    return Math.ceil(total / step) * step;
  }

  function ringUpDay(state, popularity, rng, date, nowMs) {
    const { open, close } = hoursFor(date);
    const dayStart = date.getTime();
    const times = [];
    const count = salesPerDay(date, rng);
    for (let i = 0; i < count; i++) times.push(dayStart + rng.int(open, close - 1) * 60000 + rng.int(0, 59) * 1000);
    times.sort((a, b) => a - b);
    for (const at of times) {
      if (at > nowMs) break;
      const cart = buildCart(state, popularity, rng);
      if (!cart.lines.length) continue;
      const total = SR.pricing.computeCart(cart, state.settings.taxRateBp).totalCents;
      const cash = rng.chance(0.3);
      SR.sales.complete(state, cart, cash ? { method: 'cash', tenderedCents: tenderFor(total, rng) } : { method: 'card' }, at);
    }
  }

  /** Now and then a customer brings something back from a recent sale. */
  function maybeRefund(state, rng, date, nowMs) {
    if (!rng.chance(0.4) || state.sales.length < 40) return;
    const sale = state.sales[state.sales.length - rng.int(20, 39)];
    const lineIndex = rng.int(0, sale.lines.length - 1);
    const line = sale.lines[lineIndex];
    if (line.returnedQty >= line.qty) return;
    const at = date.getTime() + rng.int(hoursFor(date).open, hoursFor(date).close - 1) * 60000;
    if (at > nowMs || at <= sale.at) return;
    const reason = rng.pick(['Customer return', 'Wrong size', 'Changed mind', 'Damaged']);
    const restock = reason !== 'Damaged';
    SR.sales.refund(state, sale.id, {
      lines: [{ lineIndex, qty: rng.int(1, line.qty - line.returnedQty), restock }],
      method: sale.payment.method, reason, at,
    });
  }

  function maybeAdjust(state, rng, date, nowMs) {
    if (!rng.chance(0.22)) return;
    const reason = rng.pick(['damaged', 'plant_loss', 'plant_loss', 'shrinkage', 'count', 'own_use', 'found']);
    const candidates = SR.catalog.allActiveVariants(state).filter(({ product, variant }) => variant.stock > 3
      && (reason === 'plant_loss') === (product.category === 'Houseplants'));
    if (!candidates.length) return;
    const { variant } = rng.pick(candidates);
    const delta = reason === 'found' ? 1 : -rng.int(1, 2);
    const at = date.getTime() + rng.int(480, 509) * 60000; // before opening, after deliveries
    if (at <= nowMs) SR.inventory.adjust(state, { variantId: variant.id, delta, reason, note: rng.pick(ADJUSTMENT_NOTES[reason]), at });
  }

  function placeReorders(state, rng, date, dayOffset, pending) {
    const dueBySupplier = new Map();
    for (const row of SR.purchasing.lowStockRows(state)) {
      if (row.suggestedQty <= 0 || !row.product.supplierId) continue;
      if (dayOffset > -25 && SR.seedCatalog.leftShort.includes(row.variant.sku)) continue;
      if (!dueBySupplier.has(row.product.supplierId)) dueBySupplier.set(row.product.supplierId, []);
      dueBySupplier.get(row.product.supplierId).push(row);
    }
    const at = date.getTime() + 9 * 3600000;
    for (const [supplierId, rows] of dueBySupplier) {
      const supplier = state.suppliers.find((s) => s.id === supplierId);
      // A mid-period price rise from suppliers gives weighted-average cost something to do.
      const drift = dayOffset > -30 ? 1.04 : 1;
      const lines = rows.map(({ variant, suggestedQty }) => ({
        variantId: variant.id, qty: suggestedQty * 2, unitCostCents: Math.round(variant.lastCostCents * drift),
      }));
      const po = SR.purchasing.createDraft(state, { supplierId, lines }, at);
      SR.purchasing.markOrdered(po, at);
      pending.push({ po, dueOffset: dayOffset + supplier.leadDays, splitDelivery: rng.chance(0.2) });
    }
  }

  function receivePending(state, date, dayOffset, pending) {
    const at = date.getTime() + 8 * 3600000; // deliveries arrive before the doors open
    for (const item of pending) {
      if (item.dueOffset !== dayOffset) continue;
      const entries = item.po.lines.map((line, lineIndex) => {
        const left = SR.purchasing.outstanding(line);
        const qty = item.splitDelivery ? Math.ceil(left / 2) : left;
        return { lineIndex, qty, unitCostCents: line.unitCostCents };
      });
      SR.purchasing.receive(state, item.po, entries, at);
      if (item.splitDelivery) {
        item.splitDelivery = false;
        item.dueOffset = dayOffset + 2;
      }
    }
  }

  /** Past days get a drawer count that is usually exact and sometimes a little out. */
  function countDrawer(state, rng, key, at) {
    const floatCents = state.settings.floatCents;
    const expected = SR.cashup.expectedCash(floatCents, SR.cashup.daySummary(state, key));
    const miss = rng.chance(0.18) ? rng.pick([-100, -35, -10, -5, 5, 25, 100]) : 0;
    const counts = SR.cashup.breakdown(Math.max(0, expected + miss));
    const note = miss < -50 ? 'Short by a dollar, likely a mis-keyed change' : '';
    SR.cashup.saveClose(state, { date: key, floatCents, counts, note, at });
  }

  /** Leaves one purchase order at each open stage, and a sale on hold. */
  function stageOpenWork(state, nowMs) {
    const { lookupSku, supplierOf } = helpers(state);
    const day = 86400000;
    const pothos = lookupSku('HSP-POT6');
    const planter = lookupSku('POT-GC6');
    const lily = lookupSku('HSP-PL6');
    const partial = SR.purchasing.createDraft(state, {
      supplierId: supplierOf(pothos), note: 'Spring houseplant order',
      lines: [
        { variantId: pothos.variant.id, qty: 12, unitCostCents: 705 },
        { variantId: planter.variant.id, qty: 8, unitCostCents: 830 },
        { variantId: lily.variant.id, qty: 6, unitCostCents: 860 },
      ],
    }, nowMs - 4 * day);
    SR.purchasing.markOrdered(partial, nowMs - 4 * day);
    SR.purchasing.receive(state, partial, [
      { lineIndex: 0, qty: 6, unitCostCents: 705 },
      { lineIndex: 1, qty: 8, unitCostCents: 830 },
      { lineIndex: 2, qty: 0, unitCostCents: 860 },
    ], nowMs - day);

    const gallon = lookupSku('PNT-IG');
    const roller = lookupSku('PNT-RK1');
    const ordered = SR.purchasing.createDraft(state, {
      supplierId: supplierOf(gallon), note: 'Confirmed by phone',
      lines: [
        { variantId: gallon.variant.id, qty: 8, unitCostCents: 2510 },
        { variantId: roller.variant.id, qty: 12, unitCostCents: 605 },
      ],
    }, nowMs - 2 * day);
    SR.purchasing.markOrdered(ordered, nowMs - 2 * day);

    SR.purchasing.draftReorder(state, lookupSku('FAS-WA50').variant.id, nowMs - 3600000);

    const taken = lookupSku('GDN-PM25');
    const hose = lookupSku('GDN-GH50');
    state.held.push({
      id: SR.store.nextId(state, 'h'),
      number: SR.store.nextNumber(state, 'held'),
      at: nowMs - 25 * 60000,
      label: 'Customer fetching the van',
      cart: { lines: [makeCartLine(taken, 2), makeCartLine(hose, 1)], orderDiscount: null },
    });
  }

  function helpers(state) {
    return {
      lookupSku: (sku) => SR.catalog.allActiveVariants(state).find((r) => r.variant.sku === sku),
      supplierOf: (row) => row.product.supplierId,
    };
  }

  const shortTarget = (variant) => Math.max(1, variant.reorderPoint - 2);

  /** Two weeks out, the items the demo leaves short start selling down to just under their reorder point. */
  function sellDownShortItems(state, popularity) {
    for (const sku of SR.seedCatalog.leftShort) {
      const { variant } = helpers(state).lookupSku(sku);
      const entry = popularity.get(variant.id);
      entry.weight *= 4;
      entry.floor = shortTarget(variant);
    }
  }

  /** A final shelf count catches any that sold more slowly than planned, so the alerts always show. */
  function trimShortItems(state, nowMs) {
    for (const sku of SR.seedCatalog.leftShort) {
      const { variant } = helpers(state).lookupSku(sku);
      const target = shortTarget(variant);
      if (variant.stock > target) {
        SR.inventory.adjust(state, {
          variantId: variant.id, delta: target - variant.stock, reason: 'count',
          note: 'Monthly count', at: nowMs - 2 * 3600000,
        });
      }
    }
  }

  function build(nowMs) {
    const state = SR.store.emptyState();
    const rng = makeRandom(20240417);
    const today = SR.util.keyToDate(SR.util.dateKey(nowMs));
    const dateFor = (offset) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const popularity = loadCatalog(state, dateFor(-HISTORY_DAYS - 1).getTime() + 8 * 3600000);
    const pending = [];

    for (let offset = -HISTORY_DAYS; offset <= 0; offset++) {
      const date = dateFor(offset);
      if (offset === -14) sellDownShortItems(state, popularity);
      receivePending(state, date, offset, pending);
      if (date.getDay() === 1 || date.getDay() === 4) placeReorders(state, rng, date, offset, pending);
      maybeAdjust(state, rng, date, nowMs);
      ringUpDay(state, popularity, rng, date, nowMs);
      maybeRefund(state, rng, date, nowMs);
      if (offset < 0) countDrawer(state, rng, SR.util.dateKey(date.getTime()), date.getTime() + hoursFor(date).close * 60000 + 900000);
    }
    stageOpenWork(state, nowMs);
    trimShortItems(state, nowMs);
    state.ledger.sort((a, b) => a.at - b.at);
    rebuildBalances(state);
    return state;
  }

  /** Events inside a day are simulated in blocks, so balances are recomputed in true time order. */
  function rebuildBalances(state) {
    const running = new Map();
    for (const entry of state.ledger) {
      const next = (running.get(entry.variantId) || 0) + entry.delta;
      entry.balance = next;
      running.set(entry.variantId, next);
    }
  }

  return { build, HISTORY_DAYS };
})();
