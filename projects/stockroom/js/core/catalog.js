// Products and variants: lookups, search, validation and editing.
// Deleting is a soft delete, because sales and ledger rows must keep pointing at real variants.
SR.catalog = (function () {
  const indexes = new WeakMap();

  function index(state) {
    let map = indexes.get(state);
    if (!map) {
      map = new Map();
      for (const product of state.products) {
        for (const variant of product.variants) map.set(variant.id, { product, variant });
      }
      indexes.set(state, map);
    }
    return map;
  }

  const invalidate = (state) => indexes.delete(state);
  const lookup = (state, variantId) => index(state).get(variantId) || null;
  const activeProducts = (state) => state.products.filter((p) => !p.deletedAt);
  const activeVariants = (product) => product.variants.filter((v) => !v.deletedAt);

  function allActiveVariants(state) {
    const rows = [];
    for (const product of activeProducts(state)) {
      for (const variant of activeVariants(product)) rows.push({ product, variant });
    }
    return rows;
  }

  function categories(state) {
    return [...new Set(activeProducts(state).map((p) => p.category))].sort((a, b) => a.localeCompare(b));
  }

  /** Full display name. The variant name is left out when the product only comes one way. */
  function displayName(product, variant) {
    return variant.name && variant.name !== 'Standard' ? `${product.name}, ${variant.name}` : product.name;
  }

  function lineName(line) {
    return line.variant && line.variant !== 'Standard' ? `${line.name}, ${line.variant}` : line.name;
  }

  function findByCode(state, code) {
    const wanted = String(code).trim().toLowerCase();
    if (!wanted) return null;
    for (const row of allActiveVariants(state)) {
      if (row.variant.sku.toLowerCase() === wanted || (row.variant.barcode && row.variant.barcode.toLowerCase() === wanted)) return row;
    }
    return null;
  }

  const tokensOf = (query) => String(query).toLowerCase().split(/\s+/).filter(Boolean);

  function searchProducts(state, query) {
    const tokens = tokensOf(query);
    return activeProducts(state).filter((product) => {
      const hay = [product.name, product.category, ...activeVariants(product).flatMap((v) => [v.name, v.sku, v.barcode || ''])]
        .join(' ').toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }

  function searchVariants(state, query, limit = 12) {
    const tokens = tokensOf(query);
    const rows = [];
    for (const row of allActiveVariants(state)) {
      const hay = `${row.product.name} ${row.variant.name} ${row.variant.sku} ${row.variant.barcode || ''} ${row.product.category}`.toLowerCase();
      if (tokens.every((t) => hay.includes(t))) rows.push(row);
      if (rows.length >= limit) break;
    }
    return rows;
  }

  /** Checks a product draft. Returns a map of error messages keyed by field path. */
  function validateProduct(state, draft) {
    const errors = {};
    if (!draft.name.trim()) errors.name = 'Enter a product name.';
    if (!draft.category.trim()) errors.category = 'Enter a category.';
    if (!draft.variants.length) errors.variants = 'A product needs at least one variant.';
    const seen = new Set();
    draft.variants.forEach((variant, i) => {
      const key = (field) => `variant.${i}.${field}`;
      const sku = variant.sku.trim().toLowerCase();
      if (!sku) errors[key('sku')] = 'SKU is required.';
      else if (/\s/.test(sku)) errors[key('sku')] = 'No spaces in a SKU.';
      else if (seen.has(sku)) errors[key('sku')] = 'Used twice here.';
      else {
        const other = findByCode(state, sku);
        if (other && other.variant.id !== variant.id) errors[key('sku')] = `Already used by ${other.product.name}.`;
      }
      seen.add(sku);
      if (draft.variants.length > 1 && !variant.name.trim()) errors[key('name')] = 'Name each variant.';
      if (variant.priceCents === null) errors[key('price')] = 'Enter a valid price.';
      if (variant.costCents === null) errors[key('cost')] = 'Enter a valid cost.';
      if (variant.reorderPoint === null || variant.reorderPoint > 99999) errors[key('reorderPoint')] = 'Whole number.';
      if (variant.reorderQty === null || variant.reorderQty < 1 || variant.reorderQty > 99999) errors[key('reorderQty')] = 'At least 1.';
      if (!variant.id && (variant.stock === null || variant.stock > 99999)) errors[key('stock')] = 'Whole number.';
    });
    return errors;
  }

  /**
   * Creates or updates a product from a validated draft. New variants post an opening
   * ledger entry, so the ledger accounts for every unit from its first day.
   */
  function saveProduct(state, draft, at = Date.now()) {
    let product = draft.id ? state.products.find((p) => p.id === draft.id) : null;
    if (!product) {
      product = { id: SR.store.nextId(state, 'p'), variants: [] };
      state.products.push(product);
    }
    product.name = draft.name.trim();
    product.category = draft.category.trim();
    product.supplierId = draft.supplierId || null;
    product.taxable = !!draft.taxable;
    const keep = new Set(draft.variants.filter((v) => v.id).map((v) => v.id));
    for (const variant of product.variants) {
      if (!keep.has(variant.id) && !variant.deletedAt) variant.deletedAt = at;
    }
    for (const input of draft.variants) {
      const fields = {
        name: input.name.trim() || 'Standard',
        sku: input.sku.trim(),
        barcode: (input.barcode || '').trim(),
        priceCents: input.priceCents,
        costCents: input.costCents,
        reorderPoint: input.reorderPoint,
        reorderQty: input.reorderQty,
      };
      if (input.id) {
        Object.assign(product.variants.find((v) => v.id === input.id), fields);
      } else {
        const variant = { id: SR.store.nextId(state, 'v'), ...fields, lastCostCents: input.costCents, stock: 0 };
        product.variants.push(variant);
        invalidate(state);
        if (input.stock) {
          SR.inventory.post(state, { variantId: variant.id, delta: input.stock, reason: 'opening', unitCostCents: variant.costCents, at });
        }
      }
    }
    invalidate(state);
    return product;
  }

  const isLow = (variant) => variant.stock <= variant.reorderPoint;

  return {
    index, invalidate, lookup, activeProducts, activeVariants, allActiveVariants, categories, displayName, lineName,
    findByCode, searchProducts, searchVariants, validateProduct, saveProduct, isLow,
  };
})();
