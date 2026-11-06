// Business profile, numbering and data tools.
(function () {
  const BC = window.BC;
  const { h, icon } = BC.dom;
  const { calc, exporter, money: moneyLib, paper, schema, store, ui } = BC;
  const MAX_LOGO_BYTES = 512 * 1024;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function logoControl(initial) {
    let value = initial;
    const preview = h('div', { class: 'logo-preview' });
    const error = h('p', { class: 'field-error', hidden: true, role: 'alert' });
    const removeBtn = ui.button('Remove', 'trash', () => { value = ''; draw(); });
    const input = h('input', {
      type: 'file',
      accept: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml',
      id: 'logo-file',
      class: 'file-input',
      onchange: async (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
          value = await ui.readImage(file, MAX_LOGO_BYTES);
          error.hidden = true;
          draw();
        } catch (problem) {
          error.textContent = problem.message;
          error.hidden = false;
        }
      },
    });
    function draw() {
      preview.replaceChildren(value ? h('img', { src: value, alt: 'Current logo' }) : h('span', { class: 'muted' }, 'No logo'));
      removeBtn.hidden = !value;
    }
    draw();
    const el = h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Logo'),
      h('div', { class: 'logo-row' }, preview,
        h('div', { class: 'logo-actions' },
          input,
          h('label', { class: 'btn', for: 'logo-file' }, icon('upload'), 'Upload image'),
          removeBtn)),
      h('p', { class: 'field-hint' }, 'PNG, JPEG, GIF, WebP or SVG, up to 512 KB. Stored in this browser with your data.'),
      error);
    return { el, get value() { return value; } };
  }

  function profileForm() {
    const p = store.state.profile;
    const logo = logoControl(p.logo);
    const name = ui.field({ label: 'Business name', value: p.name, required: true, autocomplete: 'organization' });
    const address = ui.field({ label: 'Address', as: 'textarea', rows: 3, value: p.address });
    const taxId = ui.field({ label: 'Tax ID', value: p.taxId });
    const email = ui.field({ label: 'Email', type: 'email', value: p.email });
    const phone = ui.field({ label: 'Phone', value: p.phone });
    const payment = ui.field({ label: 'Payment details', as: 'textarea', rows: 2, value: p.paymentDetails, hint: 'Printed on invoices and statements.' });
    const terms = ui.field({ label: 'Default terms', as: 'textarea', rows: 3, value: p.terms, hint: 'Filled in on each new invoice.' });
    const currency = ui.field({ label: 'Currency', as: 'select', value: p.currency, choices: moneyLib.CURRENCIES.map((c) => ({ value: c, label: c })) });
    const days = ui.field({ label: 'Default payment days', inputmode: 'numeric', value: String(p.paymentDays) });
    const paperSize = ui.field({ label: 'Paper size', as: 'select', value: p.paperSize, choices: [{ value: 'A4', label: 'A4' }, { value: 'Letter', label: 'US Letter' }] });
    const invoicePrefix = ui.field({ label: 'Invoice prefix', value: p.invoicePrefix });
    const nextInvoice = ui.field({ label: 'Next invoice number', inputmode: 'numeric', value: String(store.peekSequence('invoice')) });
    const quotePrefix = ui.field({ label: 'Quote prefix', value: p.quotePrefix });
    const nextQuote = ui.field({ label: 'Next quote number', inputmode: 'numeric', value: String(store.peekSequence('quote')) });

    function checkNext(fieldRef, kind) {
      const value = Number(fieldRef.value);
      const lowest = calc.nextSequence(1, store.collection(kind));
      if (!/^\d+$/.test(fieldRef.value.trim()) || value < 1 || value > 99999999) { fieldRef.setError('Enter a whole number.'); return false; }
      if (value < lowest) { fieldRef.setError(`Must be ${lowest} or higher, because ${lowest - 1} is already in use.`); return false; }
      return true;
    }

    function save() {
      let ok = true;
      if (!name.value.trim()) { name.setError('Enter your business name.'); ok = false; }
      if (email.value.trim() && !EMAIL.test(email.value.trim())) { email.setError('Enter a valid email address.'); ok = false; }
      if (!/^\d+$/.test(days.value.trim()) || Number(days.value) > 365) { days.setError('Enter a whole number of days from 0 to 365.'); ok = false; }
      if (invoicePrefix.value.length > 12) { invoicePrefix.setError('Keep the prefix to 12 characters.'); ok = false; }
      if (quotePrefix.value.length > 12) { quotePrefix.setError('Keep the prefix to 12 characters.'); ok = false; }
      if (!checkNext(nextInvoice, 'invoice')) ok = false;
      if (!checkNext(nextQuote, 'quote')) ok = false;
      if (!ok) { ui.focusFirstError(form); return; }
      store.saveProfile({
        name: name.value.trim(), address: address.value.trim(), taxId: taxId.value.trim(), email: email.value.trim(), phone: phone.value.trim(),
        paymentDetails: payment.value.trim(), terms: terms.value.trim(), currency: currency.value, paymentDays: Number(days.value), paperSize: paperSize.value,
        invoicePrefix: invoicePrefix.value, quotePrefix: quotePrefix.value, nextInvoice: Number(nextInvoice.value), nextQuote: Number(nextQuote.value), logo: logo.value,
      });
      paper.applyPageSize(paperSize.value);
      ui.toast('Settings saved.');
    }

    const form = h('form', { novalidate: true, onsubmit: (event) => { event.preventDefault(); save(); } },
      h('section', { class: 'panel settings-panel' },
        h('header', { class: 'panel-head' }, h('h2', {}, 'Business profile')),
        h('div', { class: 'form-grid' },
          h('div', { class: 'span-2' }, logo.el), h('div', { class: 'span-2' }, name.el), h('div', { class: 'span-2' }, address.el),
          taxId.el, email.el, phone.el, h('div', { class: 'span-2' }, payment.el))),
      h('section', { class: 'panel settings-panel' },
        h('header', { class: 'panel-head' }, h('h2', {}, 'Invoice defaults')),
        h('div', { class: 'form-grid' }, currency.el, days.el, paperSize.el, h('div', { class: 'span-2' }, terms.el))),
      h('section', { class: 'panel settings-panel' },
        h('header', { class: 'panel-head' }, h('h2', {}, 'Numbering')),
        h('div', { class: 'form-grid' }, invoicePrefix.el, nextInvoice.el, quotePrefix.el, nextQuote.el),
        h('p', { class: 'field-hint panel-foot' }, 'Numbers run in sequence. Existing documents keep the number they were given.')),
      h('div', { class: 'settings-save' }, h('button', { class: 'btn btn-primary', type: 'submit', id: 'save-settings' }, icon('check'), 'Save settings')));
    return form;
  }

  function importFile(file, report) {
    report.replaceChildren();
    const fail = (messages) => {
      report.replaceChildren(h('div', { class: 'form-alert', role: 'alert' },
        h('p', { class: 'strong' }, 'Nothing was imported.'),
        h('ul', {}, messages.slice(0, 8).map((message) => h('li', {}, message))),
        messages.length > 8 && h('p', {}, `And ${messages.length - 8} more.`)));
    };
    const reader = new FileReader();
    reader.onerror = () => fail(['The file could not be read.']);
    reader.onload = () => {
      let raw;
      try { raw = JSON.parse(String(reader.result)); } catch (e) { fail(['This file is not valid JSON.']); return; }
      const { state, issues } = schema.validateBackup(raw, store.state.profile);
      if (!state || issues.length) { fail(issues); return; }
      ui.undoable(`Imported ${state.invoices.length} invoices, ${state.quotes.length} quotes and ${state.clients.length} clients.`, () => {
        store.replaceAll(state);
        paper.applyPageSize(state.profile.paperSize);
      });
    };
    reader.readAsText(file);
  }

  function dataPanel() {
    const report = h('div', { class: 'import-report' });
    const input = h('input', {
      type: 'file',
      accept: '.json,application/json',
      id: 'import-file',
      class: 'file-input',
      onchange: (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) importFile(file, report);
      },
    });
    const exportButton = (label, run) => ui.button(label, 'download', () => { run(); ui.toast(`${label} exported.`); });
    return h('section', { class: 'panel settings-panel' },
      h('header', { class: 'panel-head' }, h('h2', {}, 'Your data')),
      h('div', { class: 'data-group' },
        h('h3', {}, 'Export CSV'),
        h('div', { class: 'button-row' },
          exportButton('Invoices', () => exporter.invoices()),
          exportButton('Line items', exporter.lineItems),
          exportButton('Payments', exporter.payments),
          exportButton('Quotes', () => exporter.quotes()),
          exportButton('Clients', exporter.clients),
          exportButton('Catalogue', exporter.catalogue))),
      h('div', { class: 'data-group' },
        h('h3', {}, 'Backup'),
        h('p', { class: 'field-hint' }, 'A JSON file holds everything, including your logo. Importing replaces all current data, with an undo.'),
        h('div', { class: 'button-row' },
          h('button', { class: 'btn', type: 'button', id: 'export-json', onclick: () => { exporter.backup(); ui.toast('Backup exported.'); } }, icon('download'), 'Export JSON'),
          input,
          h('label', { class: 'btn', for: 'import-file' }, icon('upload'), 'Import JSON')),
        report),
      h('div', { class: 'data-group' },
        h('h3', {}, 'Demo data'),
        h('p', { class: 'field-hint' }, 'Replaces everything with the sample studio, clients and invoices.'),
        h('div', { class: 'button-row' }, ui.button('Reset demo data', 'reset', () => BC.app.resetDemo()))));
  }

  BC.views.settings = function settingsView() {
    return h('div', { class: 'page page-narrow' },
      ui.pageHeader('Settings', 'Details shown on every invoice, quote and statement'),
      profileForm(),
      dataPanel());
  };
})();
