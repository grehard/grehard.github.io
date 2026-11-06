// The product list and the add/edit form with its variant table.
SR.views.products = (function () {
  const { h, btn, clear, field, input, select, cellInput, openModal, pageHeader, pill, dataTable, emptyState, download, toast, iconBtn } = SR.ui;
  const { format, plain, parse, formatMargin } = SR.money;
  const { parseWhole } = SR.util;

  const filters = { query: '', category: 'all', status: 'all' };
  let list = null;
  const state = () => SR.store.state;

  function supplierName(id) {
    const supplier = state().suppliers.find((s) => s.id === id);
    return supplier ? supplier.name : 'No supplier';
  }

  function stockCell(variant) {
    if (variant.stock <= 0) return h('span', { class: 'stock-cell' }, pill(`${variant.stock} out`, 'bad'));
    if (SR.catalog.isLow(variant)) return h('span', { class: 'stock-cell' }, pill(`${variant.stock} low`, 'warn'));
    return String(variant.stock);
  }

  function filteredProducts() {
    let rows = filters.query ? SR.catalog.searchProducts(state(), filters.query) : SR.catalog.activeProducts(state());
    if (filters.category !== 'all') rows = rows.filter((p) => p.category === filters.category);
    if (filters.status === 'low') rows = rows.filter((p) => SR.catalog.activeVariants(p).some(SR.catalog.isLow));
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** One table row per variant; the first row of each product carries its name and actions. */
  function flatten(products) {
    const rows = [];
    for (const product of products) {
      SR.catalog.activeVariants(product).forEach((variant, i) => rows.push({ product, variant, first: i === 0 }));
    }
    return rows;
  }

  function paint() {
    if (!list) return;
    clear(list);
    const products = filteredProducts();
    const rows = flatten(products);
    list.appendChild(h('p', { class: 'list-summary', role: 'status' }, `${products.length} products, ${rows.length} variants`));
    list.appendChild(dataTable({
      caption: 'Products',
      rows,
      rowClass: (r) => (r.first ? 'row-first' : 'row-sub'),
      empty: emptyState('No products found', 'Try a different search, or add a product.', btn('Add product', { kind: 'primary', iconName: 'plus', onClick: () => productForm(null) })),
      columns: [
        {
          label: 'Product',
          render: (r) => (r.first ? h('div', null, h('button', { type: 'button', class: 'link strong', onClick: () => productForm(r.product) }, r.product.name)) : ''),
        },
        { label: 'Variant', render: (r) => (r.variant.name === 'Standard' ? '' : r.variant.name) },
        { label: 'SKU', render: (r) => h('button', { type: 'button', class: 'link mono', title: 'Show stock history', onClick: () => SR.app.go(`inventory/ledger/${encodeURIComponent(r.variant.sku)}`) }, r.variant.sku) },
        { label: 'Category', render: (r) => (r.first ? r.product.category : '') },
        { label: 'Supplier', render: (r) => (r.first ? supplierName(r.product.supplierId) : '') },
        { label: 'Price', align: 'right', render: (r) => format(r.variant.priceCents) },
        { label: 'Avg. cost', align: 'right', render: (r) => format(r.variant.costCents) },
        { label: 'Margin', align: 'right', render: (r) => formatMargin(r.variant.priceCents - r.variant.costCents, r.variant.priceCents) },
        { label: 'On hand', align: 'right', render: (r) => stockCell(r.variant) },
        { label: 'Reorder at', align: 'right', render: (r) => r.variant.reorderPoint },
        {
          label: 'Actions',
          render: (r) => (r.first ? h('div', { class: 'row-actions' },
            iconBtn('edit', `Edit ${r.product.name}`, () => productForm(r.product)),
            iconBtn('trash', `Delete ${r.product.name}`, () => deleteProduct(r.product))) : ''),
        },
      ],
    }));
  }

  function deleteProduct(product) {
    product.deletedAt = Date.now();
    SR.app.commit();
    toast(`Deleted ${product.name}. Sales history keeps its records.`, {
      undo: () => {
        delete product.deletedAt;
        SR.app.commit();
      },
    });
  }

  function variantRow(variant, onRemove) {
    const isNew = !variant.id;
    const cell = (name, attrs) => cellInput({ 'aria-label': `${name} for variant`, autocomplete: 'off', ...attrs });
    const fields = {
      name: cell('Name', { value: variant.name === 'Standard' ? '' : variant.name, placeholder: 'e.g. 6 in' }),
      sku: cell('SKU', { value: variant.sku, class: 'input mono' }),
      barcode: cell('Barcode', { value: variant.barcode || '', inputmode: 'numeric', class: 'input mono' }),
      price: cell('Price', { value: isNew && !variant.priceCents ? '' : plain(variant.priceCents), inputmode: 'decimal', class: 'input num-input' }),
      cost: cell('Unit cost', { value: isNew && !variant.costCents ? '' : plain(variant.costCents), inputmode: 'decimal', class: 'input num-input' }),
      stock: isNew ? cell('Opening stock', { value: String(variant.stock || 0), inputmode: 'numeric', class: 'input num-input' }) : null,
      reorderPoint: cell('Reorder point', { value: String(variant.reorderPoint), inputmode: 'numeric', class: 'input num-input' }),
      reorderQty: cell('Reorder quantity', { value: String(variant.reorderQty), inputmode: 'numeric', class: 'input num-input' }),
    };
    const removeBtn = iconBtn('trash', 'Remove this variant', () => onRemove(row));
    const removeError = h('div', { class: 'field-error', role: 'alert', hidden: true });
    const tr = h('tr', null,
      h('td', null, fields.name), h('td', null, fields.sku), h('td', null, fields.barcode), h('td', null, fields.price), h('td', null, fields.cost),
      h('td', { class: 'num' }, isNew ? fields.stock : h('span', { class: 'cell-static', title: 'Change stock with an adjustment or a PO receipt' }, String(variant.stock))),
      h('td', null, fields.reorderPoint), h('td', null, fields.reorderQty), h('td', null, removeBtn, removeError));
    const row = {
      tr, fields, variant, removeError,
      read: () => ({
        id: variant.id || null,
        name: fields.name.input.value,
        sku: fields.sku.input.value,
        barcode: fields.barcode.input.value,
        priceCents: parse(fields.price.input.value),
        costCents: parse(fields.cost.input.value),
        stock: isNew ? parseWhole(fields.stock.input.value) : variant.stock,
        reorderPoint: parseWhole(fields.reorderPoint.input.value),
        reorderQty: parseWhole(fields.reorderQty.input.value),
      }),
    };
    return row;
  }

  const blankVariant = () => ({ id: null, name: '', sku: '', barcode: '', priceCents: 0, costCents: 0, stock: 0, reorderPoint: 5, reorderQty: 6 });

  function productForm(product) {
    const isEdit = !!product;
    const nameInput = input({ value: isEdit ? product.name : '', maxlength: 120, autocomplete: 'off' });
    const categoryInput = input({ value: isEdit ? product.category : '', maxlength: 60, autocomplete: 'off', list: 'category-options' });
    const categoryList = h('datalist', { id: 'category-options' }, SR.catalog.categories(state()).map((c) => h('option', { value: c })));
    const supplierSelect = select([{ value: '', label: 'No supplier' }, ...state().suppliers.map((s) => ({ value: s.id, label: s.name }))], isEdit ? product.supplierId || '' : '');
    const taxable = h('input', { type: 'checkbox', id: 'product-taxable', checked: isEdit ? product.taxable : true });
    const nameField = field('Product name', nameInput);
    const categoryField = field('Category', categoryInput);
    const variantsError = h('div', { class: 'field-error', role: 'alert', hidden: true });
    const tbody = h('tbody');
    let rows = [];

    const addRow = (variant) => {
      const row = variantRow(variant, removeRow);
      rows.push(row);
      tbody.appendChild(row.tr);
      return row;
    };

    function removeRow(row) {
      if (row.variant.id && row.variant.stock !== 0) {
        row.removeError.textContent = 'Adjust stock to 0 first.';
        row.removeError.hidden = false;
        return;
      }
      rows = rows.filter((r) => r !== row);
      row.tr.remove();
    }

    (isEdit ? SR.catalog.activeVariants(product) : [blankVariant()]).forEach(addRow);

    function showErrors(errors) {
      nameField.setError(errors.name);
      categoryField.setError(errors.category);
      variantsError.textContent = errors.variants || '';
      variantsError.hidden = !errors.variants;
      rows.forEach((row, i) => {
        for (const key of ['name', 'sku', 'price', 'cost', 'reorderPoint', 'reorderQty', 'stock']) {
          if (row.fields[key]) row.fields[key].setError(errors[`variant.${i}.${key}`]);
        }
      });
      const firstBad = modal.el.querySelector('[aria-invalid="true"]');
      if (firstBad) firstBad.focus();
    }

    function save() {
      const draft = {
        id: isEdit ? product.id : null,
        name: nameInput.value,
        category: categoryInput.value,
        supplierId: supplierSelect.value,
        taxable: taxable.checked,
        variants: rows.map((r) => r.read()),
      };
      const errors = SR.catalog.validateProduct(state(), draft);
      showErrors(errors);
      if (Object.keys(errors).length) return;
      const saved = SR.catalog.saveProduct(state(), draft);
      modal.close();
      SR.app.commit();
      toast(`${isEdit ? 'Saved' : 'Added'} ${saved.name}`);
    }

    const modal = openModal({
      title: isEdit ? `Edit ${product.name}` : 'Add product',
      size: 'xl',
      body: h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); save(); } },
        h('div', { class: 'form-grid' }, nameField, categoryField, field('Supplier', supplierSelect),
          h('label', { class: 'check-field', for: 'product-taxable' }, taxable, 'Charge sales tax')),
        categoryList,
        h('div', { class: 'stack-tight' },
          h('h3', null, 'Variants'),
          h('p', { class: 'muted' }, isEdit
            ? 'Average cost updates itself as stock is received. Change on-hand counts with a stock adjustment.'
            : 'One row is fine for a product that only comes one way. Leave its name empty.'),
          h('div', { class: 'table-wrap' }, h('table', { class: 'table table-form' },
            h('thead', null, h('tr', null, ['Name', 'SKU', 'Barcode', 'Price', 'Unit cost', isEdit ? 'On hand' : 'Opening stock', 'Reorder at', 'Reorder qty', ''].map((t) => h('th', null, t)))),
            tbody)),
          variantsError,
          btn('Add variant', { size: 'sm', iconName: 'plus', onClick: () => addRow(blankVariant()).fields.name.input.focus() })),
        h('button', { type: 'submit', hidden: true })),
      footer: [btn('Cancel', { onClick: () => modal.close() }), btn(isEdit ? 'Save product' : 'Add product', { kind: 'primary', onClick: save })],
      initialFocus: nameInput,
    });
  }

  function mount(root) {
    const debounced = SR.util.debounce(paint, 100);
    const search = input({ type: 'search', placeholder: 'Name, SKU or barcode', value: filters.query, onInput: (e) => { filters.query = e.target.value; debounced(); } });
    const categoryOptions = [{ value: 'all', label: 'All categories' }, ...SR.catalog.categories(state()).map((c) => ({ value: c, label: c }))];
    const category = select(categoryOptions, filters.category, { onChange: (e) => { filters.category = e.target.value; paint(); } });
    const status = select([{ value: 'all', label: 'All stock levels' }, { value: 'low', label: 'Low or out of stock' }], filters.status, { onChange: (e) => { filters.status = e.target.value; paint(); } });
    list = h('div', { class: 'list' });
    root.append(
      pageHeader('Products', 'Prices, costs, suppliers and reorder points for everything in the shop.', [
        btn('Export products CSV', { iconName: 'download', onClick: () => download('stockroom-products.csv', SR.csv.products(state()), 'text/csv') }),
        btn('Add product', { kind: 'primary', iconName: 'plus', onClick: () => productForm(null) }),
      ]),
      h('div', { class: 'toolbar' }, field('Search products', search, { class: 'grow' }), field('Category', category), field('Stock level', status)),
      list);
    paint();
  }

  return { mount, unmount: () => { list = null; }, refresh: paint };
})();
