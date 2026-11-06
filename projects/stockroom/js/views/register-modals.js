// Register dialogs: variant choice, discounts, payment, sale complete, hold and resume.
SR.registerModals = (function () {
  const { h, btn, field, input, segmented, openModal, toast, clear } = SR.ui;
  const { format, parse, parsePercent, plain } = SR.money;
  const { computeCart, discountAmount, quickTenders } = SR.pricing;

  /** Large buttons for each variant. Number keys pick them, because hands are already on the keyboard. */
  function chooseVariant(product, qty, onPick) {
    const variants = SR.catalog.activeVariants(product);
    const pick = (variant) => { modal.close(); onPick({ product, variant }, qty); };
    const body = h('div', {
      class: 'variant-grid',
      onKeydown: (e) => {
        const index = Number(e.key) - 1;
        if (variants[index]) { e.preventDefault(); pick(variants[index]); }
      },
    }, variants.map((variant, i) => h('button', { type: 'button', class: 'variant-choice', onClick: () => pick(variant) },
      h('span', { class: 'variant-key' }, String(i + 1)),
      h('span', { class: 'variant-name' }, variant.name),
      h('span', { class: 'variant-price' }, format(variant.priceCents)),
      h('span', { class: 'variant-stock' }, variant.stock > 0 ? `${variant.stock} on hand` : 'Out of stock'),
      h('span', { class: 'variant-sku' }, variant.sku))));
    const modal = openModal({ title: product.name, size: 'md', body, onClose: focusSearch });
    return modal;
  }

  const focusSearch = () => SR.views.register.focusSearch();

  /** Shared percent-or-amount editor. Returns its element and a read() that validates. */
  function discountEditor({ current, baseCents, onPreview }) {
    let type = current ? current.type : 'percent';
    const valueInput = input({
      inputmode: 'decimal', autocomplete: 'off',
      value: current ? (current.type === 'percent' ? String(current.value / 100) : plain(current.value)) : '',
      onInput: () => onPreview && onPreview(),
    });
    const valueField = field('Discount value', valueInput);
    const quick = h('div', { class: 'chip-row' }, [5, 10, 15, 20, 25].map((pct) => h('button', {
      type: 'button', class: 'chip',
      onClick: () => { setType('percent'); valueInput.value = String(pct); valueInput.focus(); if (onPreview) onPreview(); },
    }, `${pct}%`)));
    const typeHolder = h('div');
    const setType = (next) => {
      type = next;
      clear(typeHolder).appendChild(segmented('Discount type', [{ value: 'percent', label: 'Percent' }, { value: 'amount', label: 'Amount' }], type, (v) => { type = v; if (onPreview) onPreview(); }));
    };
    setType(type);

    function read() {
      const text = valueInput.value.trim();
      if (!text) return { discount: null };
      const value = type === 'percent' ? parsePercent(text) : parse(text);
      if (value === null) return { error: type === 'percent' ? 'Enter a percent from 0 to 100.' : 'Enter a valid amount.' };
      if (type === 'amount' && value > baseCents()) return { error: `That is more than the ${format(baseCents())} it applies to.` };
      return { discount: value ? { type, value } : null };
    }
    return { el: h('div', { class: 'stack' }, typeHolder, valueField, quick), read, setError: valueField.setError, input: valueInput };
  }

  function editLine(state, index, commit) {
    const line = state.cart.lines[index];
    const { product, variant } = SR.catalog.lookup(state, line.variantId);
    const priceInput = input({ inputmode: 'decimal', value: plain(line.unitPriceCents), autocomplete: 'off', onInput: () => preview() });
    const priceField = field('Unit price', priceInput, { hint: `List price ${format(variant.priceCents)}` });
    const previewEl = h('div', { class: 'modal-sum', dataset: { testid: 'line-preview' } });
    const priceNow = () => parse(priceInput.value);
    const editor = discountEditor({ current: line.discount, baseCents: () => (priceNow() || 0) * line.qty, onPreview: () => preview() });

    function preview() {
      const price = priceNow();
      const read = editor.read();
      clear(previewEl);
      if (price === null || read.error) { previewEl.textContent = 'Line total updates when the values are valid.'; return; }
      const gross = price * line.qty;
      const off = discountAmount(gross, read.discount);
      previewEl.append(`${line.qty} x ${format(price)} less ${format(off)}: `, h('strong', null, format(gross - off)));
    }

    function save() {
      const price = priceNow();
      const read = editor.read();
      priceField.setError(price === null ? 'Enter a valid price.' : '');
      editor.setError(read.error || '');
      if (price === null || read.error) return;
      line.unitPriceCents = price;
      line.discount = read.discount;
      modal.close();
      commit();
    }

    const modal = openModal({
      title: `Edit line: ${SR.catalog.displayName(product, variant)}`,
      size: 'sm',
      body: h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); save(); } }, priceField, editor.el, previewEl, h('button', { type: 'submit', hidden: true })),
      footer: [btn('Cancel', { onClick: () => modal.close() }), btn('Apply', { kind: 'primary', onClick: save })],
      initialFocus: editor.input,
      onClose: focusSearch,
    });
    preview();
  }

  function editOrderDiscount(state, commit) {
    const baseCents = () => computeCart({ lines: state.cart.lines, orderDiscount: null }, state.settings.taxRateBp).netCents;
    const previewEl = h('div', { class: 'modal-sum', dataset: { testid: 'order-preview' } });
    const editor = discountEditor({ current: state.cart.orderDiscount, baseCents, onPreview: () => preview() });

    function preview() {
      const read = editor.read();
      clear(previewEl);
      if (read.error) { previewEl.textContent = 'Saving updates when the value is valid.'; return; }
      previewEl.append(`Takes ${format(discountAmount(baseCents(), read.discount))} off ${format(baseCents())}, before tax.`);
    }

    function save() {
      const read = editor.read();
      editor.setError(read.error || '');
      if (read.error) return;
      state.cart.orderDiscount = read.discount;
      modal.close();
      commit();
    }

    const modal = openModal({
      title: 'Order discount',
      size: 'sm',
      body: h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); save(); } }, editor.el, previewEl, h('button', { type: 'submit', hidden: true })),
      footer: [btn('Cancel', { onClick: () => modal.close() }), btn('Apply', { kind: 'primary', onClick: save })],
      initialFocus: editor.input,
      onClose: focusSearch,
    });
    preview();
  }

  function finishSale(state, payment, commit) {
    const sale = SR.sales.complete(state, state.cart, payment);
    state.cart = SR.cart.emptyCart();
    commit();
    saleComplete(state, sale);
  }

  function payCash(state, commit) {
    const totalCents = computeCart(state.cart, state.settings.taxRateBp).totalCents;
    const changeValue = h('div', { class: 'change-value', dataset: { testid: 'change-due' } }, format(0));
    const tendered = input({
      inputmode: 'decimal', autocomplete: 'off', placeholder: plain(totalCents), 'aria-label': 'Cash tendered',
      onInput: () => updateChange(),
    });
    const tenderedField = field('Cash tendered', tendered, { hint: 'Leave blank for the exact amount.' });

    function tenderedCents() {
      return tendered.value.trim() === '' ? totalCents : parse(tendered.value);
    }

    function updateChange() {
      const value = tenderedCents();
      tenderedField.setError('');
      changeValue.textContent = value !== null && value >= totalCents ? format(value - totalCents) : format(0);
    }

    function complete() {
      const value = tenderedCents();
      if (value === null) { tenderedField.setError('Enter a valid amount.'); return; }
      if (value < totalCents) { tenderedField.setError(`That is ${format(totalCents - value)} short of the total.`); return; }
      modal.close();
      finishSale(state, { method: 'cash', tenderedCents: value }, commit);
    }

    const quick = h('div', { class: 'tender-grid' },
      h('button', { type: 'button', class: 'tender', onClick: () => { tendered.value = ''; complete(); } }, 'Exact'),
      quickTenders(totalCents).map((cents) => h('button', { type: 'button', class: 'tender', onClick: () => { tendered.value = plain(cents); updateChange(); tendered.focus(); } }, format(cents))));

    const modal = openModal({
      title: 'Cash payment',
      size: 'sm',
      body: h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); complete(); } },
        h('div', { class: 'pay-due' }, h('span', null, 'Total due'), h('strong', { dataset: { testid: 'pay-total' } }, format(totalCents))),
        tenderedField, quick,
        h('div', { class: 'pay-due change' }, h('span', null, 'Change due'), changeValue),
        h('button', { type: 'submit', hidden: true })),
      footer: [btn('Cancel', { onClick: () => modal.close() }), btn('Complete sale', { kind: 'primary', size: 'lg', onClick: complete, hotkey: 'Enter' })],
      initialFocus: tendered,
      onClose: focusSearch,
    });
  }

  function payCard(state, commit) {
    const totalCents = computeCart(state.cart, state.settings.taxRateBp).totalCents;
    const record = () => {
      modal.close();
      finishSale(state, { method: 'card' }, commit);
    };
    const confirm = btn('Record card sale', { kind: 'primary', size: 'lg', onClick: record, hotkey: 'Enter' });
    const modal = openModal({
      title: 'Card payment',
      size: 'sm',
      body: h('div', { class: 'stack' },
        h('div', { class: 'pay-due' }, h('span', null, 'Total due'), h('strong', null, format(totalCents))),
        h('p', { class: 'notice', dataset: { testid: 'card-note' } }, 'Stockroom does not process payments. This only records the sale as paid by card, so take the money on your own terminal first.')),
      footer: [btn('Cancel', { onClick: () => modal.close() }), confirm],
      initialFocus: confirm,
      onClose: focusSearch,
    });
  }

  /** Shown after every sale. Change stays in view while the drawer is open. */
  function saleComplete(state, sale) {
    SR.receipt.prepare(state, sale);
    const next = btn('New sale', { kind: 'primary', size: 'lg', onClick: () => modal.close(), hotkey: 'Enter' });
    const isCash = sale.payment.method === 'cash';
    const modal = openModal({
      title: `Sale ${sale.number} complete`,
      size: 'receipt',
      body: h('div', { class: 'stack' },
        isCash ? h('div', { class: 'pay-due change' }, h('span', null, 'Change due'), h('strong', { dataset: { testid: 'complete-change' } }, format(sale.payment.changeCents))) : null,
        h('div', { class: 'receipt-paper' }, SR.receipt.build(state, sale))),
      footer: [btn('Print receipt', { iconName: 'print', onClick: () => SR.receipt.print(state, sale) }), next],
      initialFocus: next,
      onClose: focusSearch,
    });
  }

  function holdSale(state, commit) {
    const labelInput = input({ placeholder: 'Blue jacket, gone for the van', maxlength: 80, autocomplete: 'off' });
    const save = () => {
      SR.cart.hold(state, labelInput.value);
      modal.close();
      commit();
      toast('Sale on hold. Press F10 to resume it.');
    };
    const modal = openModal({
      title: 'Hold this sale',
      size: 'sm',
      body: h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); save(); } },
        field('Note for this sale (optional)', labelInput), h('button', { type: 'submit', hidden: true })),
      footer: [btn('Cancel', { onClick: () => modal.close() }), btn('Hold sale', { kind: 'primary', onClick: save, hotkey: 'Enter' })],
      initialFocus: labelInput,
      onClose: focusSearch,
    });
  }

  function heldList(state, commit) {
    const list = h('div', { class: 'held-list' });
    const paint = () => {
      clear(list);
      if (!state.held.length) {
        list.appendChild(SR.ui.emptyState('No sales on hold', 'Hold a sale to serve the next customer, then resume it here.'));
        return;
      }
      state.held.forEach((record, i) => {
        const totals = computeCart(record.cart, state.settings.taxRateBp);
        const units = record.cart.lines.reduce((a, l) => a + l.qty, 0);
        const resume = () => {
          const { displaced } = SR.cart.resume(state, record.id);
          modal.close();
          commit();
          if (displaced) toast('Your open sale went on hold so this one could resume.');
        };
        const remove = () => {
          const index = state.held.indexOf(record);
          state.held.splice(index, 1);
          commit();
          paint();
          toast(`Held sale ${record.number} deleted`, {
            undo: () => {
              state.held.splice(Math.min(index, state.held.length), 0, record);
              commit();
              if (list.isConnected) paint();
            },
          });
        };
        list.appendChild(h('div', { class: 'held-row' },
          h('div', { class: 'held-info' },
            h('div', { class: 'held-title' }, record.label || `Held sale ${record.number}`),
            h('div', { class: 'muted' }, `${units} ${units === 1 ? 'item' : 'items'}, held at ${SR.util.formatTime(record.at)}, ${SR.util.formatDate(record.at)}`)),
          h('div', { class: 'held-total' }, format(totals.totalCents)),
          btn('Resume', { kind: 'primary', iconName: 'resume', onClick: resume, 'data-first': i === 0 ? 'true' : null }),
          SR.ui.iconBtn('trash', `Delete held sale ${record.number}`, remove)));
      });
    };
    const modal = openModal({ title: 'Sales on hold', size: 'md', body: list, onClose: focusSearch });
    paint();
    const first = list.querySelector('[data-first]');
    if (first) first.focus();
  }

  return { chooseVariant, editLine, editOrderDiscount, payCash, payCard, saleComplete, holdSale, heldList };
})();
