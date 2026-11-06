// Labelled inputs with inline errors, plus the product picker used by stock forms.
(function () {
  const { h, clear } = SR.ui;
  let fieldCount = 0;

  /** Wraps a control with a label and an error slot. The returned element has setError(message). */
  function field(labelText, control, { hint, class: extra } = {}) {
    const id = control.id || `field-${(fieldCount += 1)}`;
    control.id = id;
    const errorId = `${id}-error`;
    const error = h('div', { class: 'field-error', id: errorId, role: 'alert', hidden: true });
    const wrap = h('div', { class: `field${extra ? ` ${extra}` : ''}` },
      h('label', { for: id }, labelText), control, hint ? h('div', { class: 'field-hint' }, hint) : null, error);
    wrap.setError = (message) => markError(control, error, message);
    return wrap;
  }

  function markError(control, errorEl, message) {
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
    if (message) {
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', errorEl.id);
    } else {
      control.removeAttribute('aria-invalid');
      control.removeAttribute('aria-describedby');
    }
  }

  /** A cell control with its own error slot, for inputs in tables that use an aria-label. */
  function cellInput(attrs) {
    const control = h('input', { type: 'text', class: 'input', ...attrs });
    control.id = `field-${(fieldCount += 1)}`;
    const error = h('div', { class: 'field-error', id: `${control.id}-error`, role: 'alert', hidden: true });
    const wrap = h('div', { class: 'cell-field' }, control, error);
    wrap.input = control;
    wrap.setError = (message) => markError(control, error, message);
    return wrap;
  }

  const input = (attrs) => h('input', { type: 'text', class: 'input', ...attrs });
  const textarea = (attrs) => h('textarea', { class: 'input', rows: 2, ...attrs });

  function select(options, value, attrs = {}) {
    return h('select', { class: 'input', ...attrs }, options.map((opt) => h('option', { value: opt.value, selected: opt.value === value }, opt.label)));
  }

  /** A row of mutually exclusive buttons, exposed as a radio group. */
  function segmented(label, options, value, onChange) {
    const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
    const paint = (current) => {
      clear(group);
      options.forEach((opt) => {
        group.appendChild(h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(opt.value === current), class: opt.value === current ? 'on' : null,
          onClick: () => { paint(opt.value); onChange(opt.value); group.querySelector('[aria-checked="true"]').focus(); },
        }, opt.label));
      });
    };
    paint(value);
    return group;
  }

  /**
   * Searchable product picker with a listbox. Results render inline, not floating, so they
   * can't be clipped by a scrolling modal. onPick receives { product, variant }.
   */
  function variantPicker({ label, placeholder = 'Search name or SKU', onPick, keepOpen = false, describe }) {
    const listId = `picker-${(fieldCount += 1)}`;
    const list = h('div', { class: 'picker-list', id: listId, role: 'listbox', 'aria-label': `${label} results`, hidden: true });
    let results = [];
    let active = 0;
    const search = input({
      placeholder, role: 'combobox', autocomplete: 'off', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-autocomplete': 'list',
      onInput: () => refresh(),
      onFocus: () => { if (search.value) refresh(); },
      onKeydown: onKey,
    });

    function refresh() {
      const query = search.value.trim();
      results = query ? SR.catalog.searchVariants(SR.store.state, query, 8) : [];
      active = 0;
      paint(query);
    }

    function paint(query) {
      clear(list);
      list.hidden = !query;
      search.setAttribute('aria-expanded', String(!!query));
      if (query && !results.length) list.appendChild(h('div', { class: 'picker-none' }, 'No matching products'));
      results.forEach((row, i) => {
        const id = `${listId}-${i}`;
        list.appendChild(h('button', {
          type: 'button', id, role: 'option', tabindex: '-1', class: `picker-option${i === active ? ' active' : ''}`, 'aria-selected': String(i === active),
          onClick: () => choose(row),
        },
        h('span', { class: 'picker-name' }, SR.catalog.displayName(row.product, row.variant)),
        h('span', { class: 'picker-meta' }, describe ? describe(row) : `${row.variant.sku}, ${row.variant.stock} on hand`)));
      });
      if (results[active]) search.setAttribute('aria-activedescendant', `${listId}-${active}`);
      else search.removeAttribute('aria-activedescendant');
    }

    function choose(row) {
      search.value = keepOpen ? '' : SR.catalog.displayName(row.product, row.variant);
      results = [];
      paint('');
      onPick(row);
      if (keepOpen) search.focus();
    }

    function onKey(event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!results.length) return;
        active = (active + (event.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length;
        paint(search.value.trim());
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (results[active]) choose(results[active]);
      }
    }

    const wrap = field(label, search);
    wrap.appendChild(list);
    wrap.input = search;
    return wrap;
  }

  Object.assign(SR.ui, { field, cellInput, input, textarea, select, segmented, variantPicker });
})();
