// Read view for one invoice or quote: the paper document, its status actions and its payments.
(function () {
  const BC = window.BC;
  const { h, icon } = BC.dom;
  const { calc, dates, money: moneyLib, store, ui, paper } = BC;
  const { money } = ui;
  const METHODS = ['Bank transfer', 'Card', 'Cash', 'Cheque', 'Other'];

  const basePath = (kind) => (kind === 'quote' ? '#/quotes' : '#/invoices');

  function paymentModal(invoice, existing) {
    const info = calc.summarize(invoice, dates.today());
    const limit = info.balance + (existing ? existing.amountCents : 0);
    const date = ui.field({ label: 'Date received', type: 'date', value: existing ? existing.date : dates.today() });
    const amount = ui.field({ label: 'Amount', inputmode: 'decimal', value: moneyLib.centsToText(existing ? existing.amountCents : info.balance), hint: `Up to ${money(limit)}` });
    const method = ui.field({ label: 'Method', as: 'select', value: existing ? existing.method : METHODS[0], choices: METHODS.map((m) => ({ value: m, label: m })) });
    const note = ui.field({ label: 'Note', value: existing ? existing.note : '', placeholder: 'Reference or remark' });
    const form = h('form', { class: 'form-grid', novalidate: true, onsubmit: (event) => { event.preventDefault(); save(); } },
      amount.el, date.el, method.el, note.el, h('button', { type: 'submit', hidden: true, tabindex: -1 }));
    const dialog = ui.modal({
      title: existing ? 'Edit payment' : `Record payment on ${invoice.number}`,
      content: form,
      footer: [
        ui.button('Cancel', null, () => dialog.close()),
        ui.button(existing ? 'Save payment' : 'Record payment', null, save, 'btn-primary'),
      ],
    });

    function save() {
      const cents = moneyLib.parseCents(amount.value);
      let ok = true;
      if (cents === null || cents <= 0) { amount.setError('Enter an amount above zero, like 250.00.'); ok = false; }
      else if (cents > limit) { amount.setError(`This is more than the ${money(limit)} still owed.`); ok = false; }
      if (!dates.isValid(date.value)) { date.setError('Enter a valid date.'); ok = false; }
      else if (date.value > dates.today()) { date.setError('A payment date cannot be in the future.'); ok = false; }
      if (!ok) { ui.focusFirstError(form); return; }
      dialog.close();
      store.savePayment(invoice.id, { date: date.value, amountCents: cents, method: method.value, note: note.value.trim() }, existing && existing.id);
      ui.toast(existing ? 'Payment updated.' : `Payment of ${money(cents)} recorded.`);
    }
  }

  function paymentsPanel(invoice, info) {
    const list = invoice.payments.length
      ? h('ul', { class: 'payment-list' }, invoice.payments.map((payment) => h('li', {},
        h('div', { class: 'payment-main' },
          h('span', { class: 'strong' }, money(payment.amountCents)),
          h('span', { class: 'muted' }, `${dates.format(payment.date)}${payment.method ? ', ' + payment.method : ''}`),
          payment.note && h('span', { class: 'muted cell-long' }, payment.note)),
        h('div', { class: 'payment-actions' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Edit payment of ${money(payment.amountCents)}`, onclick: () => paymentModal(invoice, payment) }, icon('edit', 15)),
          h('button', {
            class: 'icon-btn',
            type: 'button',
            'aria-label': `Delete payment of ${money(payment.amountCents)}`,
            onclick: () => ui.undoable('Payment deleted.', () => store.deletePayment(invoice.id, payment.id)),
          }, icon('trash', 15))))))
      : h('p', { class: 'muted panel-empty' }, invoice.status === 'draft' ? 'Mark this invoice as sent to record payments.' : 'No payments recorded yet.');
    return h('section', { class: 'panel' },
      h('header', { class: 'panel-head' }, h('h2', {}, 'Payments'), h('span', { class: 'panel-note' }, `${money(info.paid)} of ${money(info.totals.total)}`)),
      list);
  }

  function removeDoc(doc) {
    const label = doc.kind === 'quote' ? 'Quote' : 'Invoice';
    ui.undoable(`${label} ${doc.number} deleted.`, () => {
      location.hash = basePath(doc.kind);
      store.deleteDocument(doc.kind, doc.id);
    });
  }

  function duplicate(doc) {
    const copy = store.duplicateDocument(doc.kind, doc.id);
    location.hash = `${basePath(doc.kind)}/${copy.id}/edit`;
    ui.toast(`Duplicated as ${copy.number}.`);
  }

  function invoiceActions(invoice, info) {
    const actions = [];
    if (invoice.status === 'draft') {
      actions.push(ui.button('Mark as sent', 'send', () => { store.setStatus('invoice', invoice.id, 'sent'); ui.toast(`${invoice.number} marked as sent.`); }, 'btn-primary'));
    } else if (info.balance > 0) {
      actions.push(ui.button('Record payment', 'money', () => paymentModal(invoice), 'btn-primary'));
    }
    if (invoice.status === 'sent' && !invoice.payments.length) {
      actions.push(ui.button('Back to draft', 'back', () => store.setStatus('invoice', invoice.id, 'draft')));
    }
    return actions;
  }

  function quoteActions(quote) {
    const actions = [];
    const setStatus = (status) => () => store.setStatus('quote', quote.id, status);
    if (quote.status !== 'converted') {
      actions.push(ui.button('Convert to invoice', 'invoice', () => {
        const invoice = store.convertQuote(quote.id);
        location.hash = `#/invoices/${invoice.id}`;
        ui.toast(`${quote.number} converted to ${invoice.number}.`);
      }, 'btn-primary'));
    }
    if (quote.status === 'draft') actions.push(ui.button('Mark as sent', 'send', setStatus('sent')));
    if (quote.status === 'sent') {
      actions.push(ui.button('Mark accepted', 'check', setStatus('accepted')));
      actions.push(ui.button('Mark declined', 'close', setStatus('declined')));
    }
    if (quote.status === 'accepted' || quote.status === 'declined') actions.push(ui.button('Back to sent', 'back', setStatus('sent')));
    return actions;
  }

  function statusLine(doc, status, info) {
    if (doc.kind === 'quote') {
      if (status === 'expired') return `Expired ${dates.format(doc.dueDate)}`;
      return `Valid until ${dates.format(doc.dueDate)}`;
    }
    if (status === 'overdue') return `${info.daysLate} day${info.daysLate === 1 ? '' : 's'} late${doc.payments.length ? ', part paid' : ''}`;
    if (status === 'paid') return 'Paid in full';
    if (status === 'draft') return 'Not sent yet';
    return `Due ${dates.format(doc.dueDate)}`;
  }

  function linkedDocument(doc) {
    const target = doc.kind === 'invoice' ? doc.quoteId && store.findDoc('quote', doc.quoteId) : doc.invoiceId && store.findDoc('invoice', doc.invoiceId);
    if (!target) return null;
    const label = doc.kind === 'invoice' ? 'Created from quote ' : 'Converted to invoice ';
    return h('p', { class: 'summary-link' }, label, h('a', { href: `${basePath(target.kind)}/${target.id}` }, target.number));
  }

  function summaryPanel(doc, info, status) {
    const isInvoice = doc.kind === 'invoice';
    const primary = isInvoice ? invoiceActions(doc, info) : quoteActions(doc);
    return h('section', { class: 'panel summary' },
      h('div', { class: 'summary-top' }, ui.badge(status), h('span', { class: 'muted' }, statusLine(doc, status, info))),
      h('p', { class: 'summary-label' }, isInvoice ? 'Balance due' : 'Quote total'),
      h('p', { class: 'summary-value', 'data-testid': 'summary-value' }, money(isInvoice ? info.balance : info.totals.total)),
      linkedDocument(doc),
      primary.length > 0 && h('div', { class: 'summary-primary' }, primary),
      h('div', { class: 'summary-tools' },
        ui.button('Print or PDF', 'print', () => window.print()),
        ui.linkButton('Edit', 'edit', `${basePath(doc.kind)}/${doc.id}/edit`),
        ui.button('Duplicate', 'copy', () => duplicate(doc)),
        ui.button('Delete', 'trash', () => removeDoc(doc), 'btn-quiet-danger')));
  }

  BC.views.documentDetail = function documentDetail(kind, id) {
    const doc = store.findDoc(kind, id);
    const label = kind === 'quote' ? 'Quotes' : 'Invoices';
    const back = { href: basePath(kind), label };
    if (!doc) {
      return h('div', { class: 'page' }, ui.pageHeader('Not found', null, null, back),
        ui.emptyState('This document no longer exists', 'It may have been deleted.', ui.linkButton(`Back to ${label.toLowerCase()}`, null, basePath(kind))));
    }
    const today = dates.today();
    const info = kind === 'invoice' ? calc.summarize(doc, today) : { totals: calc.totals(doc), paid: 0, balance: 0, daysLate: 0 };
    const status = kind === 'invoice' ? info.status : calc.quoteStatus(doc, today);
    const client = store.findClient(doc.clientId);
    return h('div', { class: 'page' },
      h('div', { class: 'no-print' },
        ui.pageHeader(doc.number, store.clientName(doc.clientId), null, back)),
      h('div', { class: 'detail-grid' },
        h('div', { class: 'detail-doc' },
          paper.frame(paper.documentSheet(doc, { profile: store.state.profile, client }))),
        h('aside', { class: 'detail-side no-print' },
          summaryPanel(doc, info, status),
          kind === 'invoice' && paymentsPanel(doc, info))));
  };
})();
