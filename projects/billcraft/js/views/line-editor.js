// Editable list of line items. Reordering works by dragging the handle (mouse or touch),
// by arrow keys on the handle, or with the move buttons.
(function () {
  const BC = window.BC;
  const { h, icon, uid } = BC.dom;
  const { money: moneyLib, calc } = BC;

  // A line row keeps raw text while typing, so half-typed values like "12." aren't rewritten.
  function toTextLine(line) {
    return {
      id: line.id || uid('l'),
      description: line.description || '',
      qty: moneyLib.qtyToText(line.qtyMilli),
      unit: moneyLib.centsToText(line.unitCents),
      tax: moneyLib.percentToText(line.taxBp),
    };
  }

  function parseLine(text) {
    return {
      id: text.id,
      description: text.description.trim(),
      qtyMilli: moneyLib.parseQty(text.qty),
      unitCents: moneyLib.parseCents(text.unit),
      taxBp: moneyLib.parsePercent(text.tax),
    };
  }

  // Invalid numbers count as zero in the live preview. Saving reports them properly.
  function previewLine(text) {
    const parsed = parseLine(text);
    return {
      ...parsed,
      qtyMilli: Math.min(parsed.qtyMilli || 0, moneyLib.MAX_QTY_MILLI),
      unitCents: Math.min(parsed.unitCents || 0, moneyLib.MAX_UNIT_CENTS),
      taxBp: Math.min(parsed.taxBp || 0, 10000),
    };
  }

  function lineErrors(text) {
    const parsed = parseLine(text);
    const errors = {};
    if (!parsed.description) errors.description = 'Add a description.';
    if (parsed.qtyMilli === null) errors.qty = 'Quantity must be a number with up to 3 decimals.';
    else if (parsed.qtyMilli > moneyLib.MAX_QTY_MILLI) errors.qty = 'Quantity can be at most 99,999.';
    if (parsed.unitCents === null) errors.unit = 'Price must be a number with up to 2 decimals.';
    else if (parsed.unitCents > moneyLib.MAX_UNIT_CENTS) errors.unit = 'Price can be at most 9,999,999.99.';
    if (parsed.taxBp === null) errors.tax = 'Tax must be a percentage with up to 2 decimals.';
    else if (parsed.taxBp > 10000) errors.tax = 'Tax cannot be above 100%.';
    return errors;
  }

  BC.lineEditor = function lineEditor(lines, options) {
    const { onChange, formatAmount } = options;
    const list = h('div', { class: 'line-list' });
    const rows = new Map();

    const indexOf = (id) => lines.findIndex((line) => line.id === id);

    function move(id, to) {
      const from = indexOf(id);
      if (from < 0 || to < 0 || to >= lines.length || from === to) return false;
      const [line] = lines.splice(from, 1);
      lines.splice(to, 0, line);
      syncOrder();
      onChange();
      return true;
    }

    function syncOrder() {
      lines.forEach((line, i) => {
        const row = rows.get(line.id);
        if (list.children[i] !== row.el) list.insertBefore(row.el, list.children[i] || null);
        row.relabel(i);
      });
    }

    function remove(id) {
      const index = indexOf(id);
      lines.splice(index, 1);
      rows.get(id).el.remove();
      rows.delete(id);
      syncOrder();
      onChange();
      const next = lines[Math.min(index, lines.length - 1)];
      if (next) rows.get(next.id).focusDescription();
    }

    // Listens on window: moving a row in the DOM would drop pointer capture held by its handle.
    function startDrag(event, line, row) {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      row.classList.add('is-dragging');
      const onMove = (moveEvent) => {
        const target = lines.findIndex((other) => {
          const box = rows.get(other.id).el.getBoundingClientRect();
          return moveEvent.clientY < box.top + box.height / 2;
        });
        const current = indexOf(line.id);
        let destination = target === -1 ? lines.length - 1 : target;
        if (destination > current && target !== -1) destination -= 1;
        move(line.id, destination);
      };
      const onEnd = () => {
        row.classList.remove('is-dragging');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    }

    function buildRow(line) {
      const number = (key, label, extra) => {
        const errorNode = h('p', { class: 'field-error', hidden: true });
        const input = h('input', {
          type: 'text',
          inputmode: 'decimal',
          value: line[key],
          class: `line-input line-${key}`,
          oninput: (event) => { line[key] = event.target.value; setError(key, ''); onChange(); },
        });
        const labelNode = h('label', {}, h('span', { class: 'line-label' }, label), input, extra);
        return { key, input, errorNode, labelNode, baseLabel: label };
      };
      const description = h('textarea', {
        class: 'line-description',
        rows: 1,
        placeholder: 'Description. Further lines appear as detail.',
        oninput: (event) => { line.description = event.target.value; grow(); setError('description', ''); onChange(); },
      });
      description.value = line.description;
      const grow = () => { description.rows = Math.min(5, description.value.split('\n').length); };
      grow();
      const descriptionError = h('p', { class: 'field-error', hidden: true });
      const qty = number('qty', 'Qty');
      const unit = number('unit', 'Unit price');
      const tax = number('tax', 'Tax %');
      const amount = h('output', { class: 'line-amount' });
      const fields = { description: { input: description, errorNode: descriptionError }, qty, unit, tax };

      function setError(key, message) {
        const f = fields[key];
        f.errorNode.textContent = message || '';
        f.errorNode.hidden = !message;
        if (message) f.input.setAttribute('aria-invalid', 'true');
        else f.input.removeAttribute('aria-invalid');
      }

      const handle = h('button', {
        class: 'icon-btn line-grip',
        type: 'button',
        onpointerdown: (event) => startDrag(event, line, el),
        onkeydown: (event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          move(line.id, indexOf(line.id) + (event.key === 'ArrowUp' ? -1 : 1));
          handle.focus();
        },
      }, icon('grip'));
      const up = h('button', { class: 'icon-btn', type: 'button', onclick: () => move(line.id, indexOf(line.id) - 1) }, icon('up', 15));
      const down = h('button', { class: 'icon-btn', type: 'button', onclick: () => move(line.id, indexOf(line.id) + 1) }, icon('down', 15));
      const del = h('button', { class: 'icon-btn', type: 'button', onclick: () => remove(line.id) }, icon('trash', 15));

      const el = h('div', { class: 'line-row', 'data-line': line.id },
        h('div', { class: 'line-top' }, handle, description, h('div', { class: 'line-tools' }, up, down, del)),
        descriptionError,
        h('div', { class: 'line-numbers' }, qty.labelNode, unit.labelNode, tax.labelNode, h('div', { class: 'line-total' }, h('span', { class: 'line-label' }, 'Amount'), amount)),
        qty.errorNode, unit.errorNode, tax.errorNode);

      return {
        el,
        setError,
        focusDescription: () => description.focus(),
        focusFirstError: () => {
          const bad = el.querySelector('[aria-invalid="true"]');
          if (bad) bad.focus();
        },
        setAmount: (text) => { amount.textContent = text; },
        relabel: (i) => {
          const n = i + 1;
          description.setAttribute('aria-label', `Description, line ${n}`);
          qty.input.setAttribute('aria-label', `Quantity, line ${n}`);
          unit.input.setAttribute('aria-label', `Unit price, line ${n}`);
          tax.input.setAttribute('aria-label', `Tax percent, line ${n}`);
          amount.setAttribute('aria-label', `Amount, line ${n}`);
          handle.setAttribute('aria-label', `Reorder line ${n}. Drag, or use the up and down arrow keys.`);
          up.setAttribute('aria-label', `Move line ${n} up`);
          down.setAttribute('aria-label', `Move line ${n} down`);
          del.setAttribute('aria-label', `Remove line ${n}`);
          up.disabled = i === 0;
          down.disabled = i === lines.length - 1;
        },
      };
    }

    function addLine(line, focus) {
      const text = toTextLine(line);
      lines.push(text);
      const row = buildRow(text);
      rows.set(text.id, row);
      list.appendChild(row.el);
      syncOrder();
      if (focus) row.focusDescription();
    }

    // The untouched starter row gets out of the way when real content arrives.
    function dropStarterRow() {
      const only = lines.length === 1 ? parseLine(lines[0]) : null;
      if (only && !only.description && !only.unitCents) {
        rows.get(only.id).el.remove();
        rows.delete(only.id);
        lines.length = 0;
      }
    }

    const initial = lines.splice(0, lines.length);
    initial.forEach((line) => addLine(line, false));

    return {
      el: list,
      add: (line, focus) => { addLine(line, focus); onChange(); },
      addReplacingStarter: (line) => { dropStarterRow(); addLine(line, false); onChange(); },
      refreshAmounts: () => {
        lines.forEach((line) => rows.get(line.id).setAmount(formatAmount(calc.lineNet(previewLine(line)))));
      },
      // Shows errors on each row. Returns true when every line is valid.
      validate: () => {
        let firstBad = null;
        lines.forEach((line) => {
          const errors = lineErrors(line);
          const row = rows.get(line.id);
          ['description', 'qty', 'unit', 'tax'].forEach((key) => row.setError(key, errors[key] || ''));
          if (!firstBad && Object.keys(errors).length) firstBad = row;
        });
        if (firstBad) firstBad.focusFirstError();
        return !firstBad;
      },
    };
  };

  BC.lineEditor.parseLine = parseLine;
  BC.lineEditor.previewLine = previewLine;
})();
