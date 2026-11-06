// Invoice and quote editor. The form holds a private draft and the preview redraws on every keystroke.
// Nothing reaches the store until Save, and only then is a number taken.
(function () {
  const BC = window.BC;
  const { h, icon, uid } = BC.dom;
  const { calc, dates, money: moneyLib, store, ui, paper } = BC;
  const { money } = ui;
  const TERMS_DAYS = [0, 7, 14, 30, 45, 60, 90];

  function termChoices(kind) {
    const label = (days) => {
      if (kind === 'quote') return `${days} days`;
      return days === 0 ? 'Due on receipt' : `Net ${days}`;
    };
    const days = kind === 'quote' ? TERMS_DAYS.filter((d) => d > 0) : TERMS_DAYS;
    return [...days.map((d) => ({ value: String(d), label: label(d) })), { value: 'custom', label: 'Custom date' }];
  }

  function termValue(kind, days) {
    if (days === null || days === undefined) return 'custom';
    return termChoices(kind).some((c) => c.value === String(days)) ? String(days) : 'custom';
  }

  function discountText(discount) {
    if (discount.type === 'percent') return moneyLib.percentToText(discount.value);
    if (discount.type === 'fixed') return moneyLib.centsToText(discount.value);
    return '';
  }

  function blankDoc(kind, query) {
    const profile = store.state.profile;
    const client = query.client ? store.findClient(query.client) : null;
    const defaultDays = kind === 'quote' ? 30 : (client ? client.paymentDays : profile.paymentDays);
    const issueDate = dates.today();
    return {
      clientId: client ? client.id : '',
      issueDate,
      termsDays: defaultDays,
      dueDate: dates.addDays(issueDate, defaultDays),
      lines: [{ id: uid('l'), description: '', qtyMilli: 1000, unitCents: 0, taxBp: 2000 }],
      discount: { type: 'none', value: 0 },
      notes: '',
      terms: kind === 'quote' ? 'Prices are valid until the date shown.' : profile.terms,
    };
  }

  function catalogueModal(onPick) {
    const items = store.state.items;
    const host = h('div', { class: 'picker-list' });
    let query = '';
    const pick = (item) => { dialog.close(); onPick(item); };
    const redraw = () => {
      const matches = items.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(query));
      host.replaceChildren(...(matches.length
        ? matches.map((item) => h('button', { class: 'picker-row', type: 'button', onclick: () => pick(item) },
          h('span', { class: 'picker-main' }, h('span', { class: 'strong' }, item.name), item.description && h('span', { class: 'muted' }, item.description)),
          h('span', { class: 'picker-price' }, money(item.unitCents), h('span', { class: 'muted' }, `Tax ${moneyLib.percentToText(item.taxBp)}%`))))
        : [ui.emptyState(items.length ? 'No items match' : 'The catalogue is empty', items.length ? 'Try another search.' : 'Add reusable items on the Catalogue page.')]));
    };
    redraw();
    const dialog = ui.modal({
      title: 'Add from catalogue',
      content: h('div', { class: 'picker' }, ui.searchBox('Search catalogue', '', (value) => { query = value.toLowerCase(); redraw(); }), host),
    });
  }

  BC.views.documentEditor = function documentEditor(kind, id, query) {
    const isQuote = kind === 'quote';
    const existing = id ? store.findDoc(kind, id) : null;
    const base = isQuote ? '#/quotes' : '#/invoices';
    const noun = isQuote ? 'quote' : 'invoice';
    if (id && !existing) {
      return h('div', { class: 'page' }, ui.emptyState('This document no longer exists', 'It may have been deleted.', ui.linkButton('Go back', null, base)));
    }
    const start = existing ? store.clone(existing) : blankDoc(kind, query);
    const number = existing ? existing.number : store.peekNumber(kind);
    const lines = start.lines.map((line) => line);
    let dirty = false;

    const clientField = ui.field({ label: 'Client', as: 'select', value: start.clientId, onChange: onClientChange, choices: clientChoices() });
    const issueField = ui.field({ label: 'Issue date', type: 'date', value: start.issueDate, onInput: recalcDue });
    const termsField = ui.field({ label: isQuote ? 'Valid for' : 'Payment terms', as: 'select', value: termValue(kind, start.termsDays), choices: termChoices(kind), onChange: recalcDue });
    const dueField = ui.field({ label: isQuote ? 'Valid until' : 'Due date', type: 'date', value: start.dueDate, onInput: onDueEdited });
    const discountType = ui.field({
      label: 'Discount',
      as: 'select',
      value: start.discount.type,
      choices: [{ value: 'none', label: 'No discount' }, { value: 'percent', label: 'Percentage' }, { value: 'fixed', label: 'Fixed amount' }],
      onChange: () => { syncDiscount(); touched(); },
    });
    const discountValue = ui.field({ label: 'Discount value', inputmode: 'decimal', value: discountText(start.discount), onInput: touched });
    const notesField = ui.field({ label: 'Notes', as: 'textarea', rows: 2, value: start.notes, onInput: touched, placeholder: 'Shown on the document' });
    const termsText = ui.field({ label: 'Terms', as: 'textarea', rows: 2, value: start.terms, onInput: touched });
    const lineHint = h('p', { class: 'field-error', hidden: true });
    const errorSummary = h('div', { class: 'form-alert', role: 'alert', hidden: true });
    const totalStrip = h('dl', { class: 'editor-totals' });

    const lineEditor = BC.lineEditor(lines, { onChange: touched, formatAmount: money });
    const previewFrame = paper.frame(h('div'));

    function clientChoices() {
      return [{ value: '', label: 'Choose a client' }, ...store.state.clients.map((c) => ({ value: c.id, label: c.name }))];
    }

    function syncDiscount() {
      const type = discountType.value;
      discountValue.el.hidden = type === 'none';
      discountValue.el.querySelector('label').textContent = type === 'percent' ? 'Discount percent' : `Discount amount`;
      discountValue.setError('');
    }

    function onClientChange() {
      const client = store.findClient(clientField.value);
      clientField.setError('');
      if (client && !isQuote) {
        const value = termValue(kind, client.paymentDays);
        termsField.input.value = value;
      }
      recalcDue();
    }

    function recalcDue() {
      const days = termsField.value;
      if (days !== 'custom' && dates.isValid(issueField.value)) {
        dueField.input.value = dates.addDays(issueField.value, Number(days));
        dueField.setError('');
      }
      touched();
    }

    function onDueEdited() {
      termsField.input.value = 'custom';
      touched();
    }

    function parseDiscount() {
      const type = discountType.value;
      if (type === 'none') return { type: 'none', value: 0 };
      const parser = type === 'percent' ? moneyLib.parsePercent : moneyLib.parseCents;
      return { type, value: parser(discountValue.value) };
    }

    function previewDoc() {
      const discount = parseDiscount();
      const issueOk = dates.isValid(issueField.value);
      const dueOk = dates.isValid(dueField.value);
      return {
        kind,
        number,
        clientId: clientField.value,
        issueDate: issueOk ? issueField.value : dates.today(),
        dueDate: dueOk ? dueField.value : dates.today(),
        termsDays: termsField.value === 'custom' ? null : Number(termsField.value),
        lines: lines.map(BC.lineEditor.previewLine),
        discount: { type: discount.type, value: Math.max(0, Math.min(discount.value || 0, discount.type === 'percent' ? 10000 : moneyLib.MAX_TOTAL_CENTS)) },
        notes: notesField.value,
        terms: termsText.value,
        payments: existing ? existing.payments : [],
      };
    }

    function refresh() {
      const doc = previewDoc();
      lineEditor.refreshAmounts();
      previewFrame.update(paper.documentSheet(doc, { profile: store.state.profile, client: store.findClient(doc.clientId) }));
      const t = calc.totals(doc);
      const row = (label, value, cls) => h('div', { class: cls || null }, h('dt', {}, label), h('dd', {}, value));
      totalStrip.replaceChildren(
        row('Subtotal', money(t.subtotal)),
        row('Discount', t.discount ? `-${money(t.discount)}` : money(0)),
        row('Tax', money(t.tax)),
        row('Total', money(t.total), 'editor-grand'));
    }

    function touched() {
      if (!dirty) {
        dirty = true;
        BC.app.setGuard(() => dirty);
      }
      errorSummary.hidden = true;
      refresh();
    }

    function validate() {
      let ok = true;
      const fail = (fieldRef, message) => { fieldRef.setError(message); ok = false; };
      if (!store.findClient(clientField.value)) fail(clientField, 'Choose who this is for.');
      if (!dates.isValid(issueField.value)) fail(issueField, 'Enter a valid issue date.');
      if (!dates.isValid(dueField.value)) fail(dueField, `Enter a valid ${isQuote ? 'expiry' : 'due'} date.`);
      else if (dates.isValid(issueField.value) && dueField.value < issueField.value) fail(dueField, `The ${isQuote ? 'expiry' : 'due'} date cannot be before the issue date.`);
      lineHint.textContent = '';
      lineHint.hidden = true;
      if (!lines.length) { lineHint.textContent = 'Add at least one line item.'; lineHint.hidden = false; ok = false; }
      if (!lineEditor.validate()) ok = false;
      const doc = previewDoc();
      const t = calc.totals(doc);
      const discount = parseDiscount();
      if (discount.type !== 'none') {
        if (discount.value === null) fail(discountValue, 'Enter a number, like 10 or 150.00.');
        else if (discount.type === 'percent' && discount.value > 10000) fail(discountValue, 'A percentage discount cannot be above 100.');
        else if (discount.type === 'fixed' && discount.value > t.subtotal) fail(discountValue, `The discount cannot be more than the subtotal of ${money(t.subtotal)}.`);
      }
      if (t.total > moneyLib.MAX_TOTAL_CENTS) { errorSummary.textContent = 'This total is too large to store. Reduce the quantities or prices.'; errorSummary.hidden = false; ok = false; }
      const paid = existing && !isQuote ? calc.paidAmount(existing) : 0;
      if (paid > t.total) { errorSummary.textContent = `The total cannot be lower than the ${money(paid)} already paid. Remove a payment first.`; errorSummary.hidden = false; ok = false; }
      return ok;
    }

    function save() {
      if (!validate()) {
        if (errorSummary.hidden) { errorSummary.textContent = 'Check the highlighted fields.'; errorSummary.hidden = false; }
        ui.focusFirstError(form);
        return;
      }
      const preview = previewDoc();
      const fields = {
        clientId: preview.clientId,
        issueDate: preview.issueDate,
        termsDays: preview.termsDays,
        dueDate: preview.dueDate,
        lines: lines.map((line) => ({ ...BC.lineEditor.parseLine(line), description: line.description.trim() })),
        discount: preview.discount,
        notes: preview.notes.trim(),
        terms: preview.terms.trim(),
      };
      dirty = false;
      BC.app.setGuard(null);
      const saved = store.saveDocument(kind, fields, id);
      location.hash = `${base}/${saved.id}`;
      ui.toast(`${saved.number} saved.`);
    }

    function addClient() {
      BC.views.clientModal(null, (client) => {
        clientField.input.replaceChildren(...clientChoices().map((c) => h('option', { value: c.value }, c.label)));
        clientField.input.value = client.id;
        onClientChange();
      });
    }

    function addFromCatalogue() {
      catalogueModal((item) => {
        const description = item.description ? `${item.name}\n${item.description}` : item.name;
        lineEditor.addReplacingStarter({ id: uid('l'), description, qtyMilli: 1000, unitCents: item.unitCents, taxBp: item.taxBp });
      });
    }

    const form = h('form', { class: 'editor-form', novalidate: true, onsubmit: (event) => { event.preventDefault(); save(); } },
      errorSummary,
      h('section', { class: 'editor-section' },
        h('div', { class: 'field-with-action' }, clientField.el,
          h('button', { class: 'btn', type: 'button', onclick: addClient }, icon('plus'), 'New client')),
        h('div', { class: 'form-row-3' }, issueField.el, termsField.el, dueField.el)),
      h('section', { class: 'editor-section' },
        h('h2', {}, 'Line items'),
        lineEditor.el,
        lineHint,
        h('div', { class: 'line-add' },
          ui.button('Add line', 'plus', () => lineEditor.add({ id: uid('l'), description: '', qtyMilli: 1000, unitCents: 0, taxBp: 2000 }, true)),
          ui.button('Add from catalogue', 'catalogue', addFromCatalogue))),
      h('section', { class: 'editor-section' },
        h('div', { class: 'form-row-2' }, discountType.el, discountValue.el),
        totalStrip),
      h('section', { class: 'editor-section' }, notesField.el, termsText.el),
      h('button', { type: 'submit', hidden: true, tabindex: -1 }));

    const layout = h('div', { class: 'editor-grid is-edit' },
      form,
      h('section', { class: 'editor-preview', 'aria-label': 'Live preview' }, previewFrame));
    const setMode = (value) => {
      layout.classList.toggle('is-edit', value === 'edit');
      layout.classList.toggle('is-preview', value === 'preview');
      modeEdit.setAttribute('aria-pressed', String(value === 'edit'));
      modePreview.setAttribute('aria-pressed', String(value === 'preview'));
      if (value === 'preview') previewFrame.fit();
    };
    const modeEdit = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'true', onclick: () => setMode('edit') }, 'Edit');
    const modePreview = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onclick: () => setMode('preview') }, 'Preview');

    syncDiscount();
    refresh();

    const cancelHref = existing ? `${base}/${existing.id}` : base;
    const page = h('div', { class: 'page page-editor' },
      ui.pageHeader(existing ? `Edit ${existing.number}` : `New ${noun}`, existing ? store.clientName(existing.clientId) : `Will be numbered ${number} when saved`, [
        ui.linkButton('Cancel', null, cancelHref),
        h('button', { class: 'btn btn-primary', type: 'button', id: 'save-document', onclick: save }, icon('check'), `Save ${noun}`),
      ]),
      h('div', { class: 'editor-mode', role: 'group', 'aria-label': 'Editor view' }, modeEdit, modePreview),
      layout);
    // The form holds unsaved input, so store changes elsewhere must not redraw over it.
    page.keepOnCommit = true;
    return page;
  };
})();
