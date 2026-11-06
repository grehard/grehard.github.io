// Shop details, tax rate, exports, backup and restore, and the demo data reset.
SR.views.settings = (function () {
  const { h, btn, clear, field, input, textarea, pageHeader, confirmModal, toast, download, icon } = SR.ui;
  const { plain, parse, parsePercent } = SR.money;
  const state = () => SR.store.state;

  let holder = null;

  function shopForm() {
    const s = state().settings;
    const name = input({ value: s.shopName, maxlength: 80, autocomplete: 'off' });
    const address = input({ value: s.address, maxlength: 120, autocomplete: 'off' });
    const phone = input({ value: s.phone, maxlength: 40, autocomplete: 'off' });
    const tax = input({ value: String(s.taxRateBp / 100), inputmode: 'decimal', autocomplete: 'off' });
    const float = input({ value: plain(s.floatCents), inputmode: 'decimal', autocomplete: 'off' });
    const footer = textarea({ value: s.receiptFooter, maxlength: 200 });
    const nameField = field('Shop name', name);
    const taxField = field('Sales tax rate (%)', tax, { hint: 'Applies to new sales. Past sales keep the rate they were rung at.' });
    const floatField = field('Default opening float', float);

    function save(event) {
      event.preventDefault();
      const bp = parsePercent(tax.value);
      const floatCents = parse(float.value);
      nameField.setError(name.value.trim() ? '' : 'Enter a shop name.');
      taxField.setError(bp === null ? 'Enter a rate from 0 to 100, with up to 2 decimals.' : '');
      floatField.setError(floatCents === null ? 'Enter a valid amount.' : '');
      if (!name.value.trim() || bp === null || floatCents === null) return;
      Object.assign(s, { shopName: name.value.trim(), address: address.value.trim(), phone: phone.value.trim(), taxRateBp: bp, floatCents, receiptFooter: footer.value.trim() });
      SR.app.commit();
      toast('Shop details saved');
    }

    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, 'Shop details')),
      h('form', { class: 'stack', onSubmit: save },
        h('div', { class: 'form-grid' }, nameField, field('Phone', phone)),
        field('Address', address),
        h('div', { class: 'form-grid' }, taxField, floatField),
        field('Receipt footer', footer),
        h('div', null, h('button', { type: 'submit', class: 'btn btn-primary' }, h('span', { class: 'btn-label' }, 'Save details')))));
  }

  function dataPanel() {
    const problems = h('div', { class: 'restore-errors', role: 'alert', hidden: true, dataset: { testid: 'restore-errors' } });
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', id: 'restore-file', class: 'sr-only', onChange: onFile });

    function showProblems(errors) {
      clear(problems);
      problems.hidden = !errors.length;
      if (errors.length) problems.append(h('p', { class: 'strong' }, 'That file was not restored. Your data has not changed.'), h('ul', null, errors.map((e) => h('li', null, e))));
    }

    function onFile(event) {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = () => showProblems(['The file could not be read.']);
      reader.onload = () => {
        const parsed = SR.store.parseBackup(String(reader.result));
        if (parsed.errors) { showProblems(parsed.errors); return; }
        showProblems([]);
        confirmModal({
          title: 'Restore this backup?',
          message: `This replaces everything in Stockroom with the file "${file.name}": ${parsed.data.products.length} products and ${parsed.data.sales.length} sales.`,
          confirmLabel: 'Restore backup',
          danger: true,
          onConfirm: () => {
            const previous = JSON.stringify(state());
            SR.store.replaceState(parsed.data);
            SR.app.commit();
            toast('Backup restored', { undo: () => restoreSnapshot(previous) });
          },
        });
      };
      reader.readAsText(file);
    }

    const stamp = () => SR.util.dateKey(Date.now());
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, 'Your data')),
      h('div', { class: 'stack' },
        h('p', { class: SR.store.persistent ? 'muted' : 'notice', dataset: { testid: 'storage-status' } }, SR.store.persistent
          ? 'Everything is saved in this browser. Nothing is sent anywhere.'
          : 'This browser is blocking storage, so changes last only until this page closes. Export a backup to keep them.'),
        h('div', { class: 'button-row' },
          btn('Back up to JSON', { iconName: 'download', onClick: () => download(`stockroom-backup-${stamp()}.json`, SR.store.backupJson(), 'application/json') }),
          h('label', { for: 'restore-file', class: 'btn btn-default', tabindex: '0', role: 'button', onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } },
            icon('upload'), h('span', { class: 'btn-label' }, 'Restore from JSON')),
          fileInput),
        problems,
        h('div', { class: 'button-row' },
          btn('Export products CSV', { iconName: 'download', onClick: () => download('stockroom-products.csv', SR.csv.products(state()), 'text/csv') }),
          btn('Export sales CSV', { iconName: 'download', onClick: () => download('stockroom-sales.csv', SR.csv.sales(state()), 'text/csv') })),
        h('hr', { class: 'rule' }),
        h('div', { class: 'stack-tight' },
          h('h3', null, 'Demo data'),
          h('p', { class: 'muted' }, 'Puts back the sample shop, with 60 days of history ending today. Your changes are replaced, and you can undo it straight after.'),
          h('div', null, btn('Reset demo data', { kind: 'danger', onClick: askReset })))));
  }

  function restoreSnapshot(text) {
    SR.store.replaceState(JSON.parse(text));
    SR.app.commit();
  }

  function askReset() {
    confirmModal({
      title: 'Reset demo data?',
      message: 'This replaces all products, sales, orders and counts with the sample shop.',
      confirmLabel: 'Reset demo data',
      danger: true,
      onConfirm: () => {
        const previous = SR.store.resetDemo();
        SR.app.commit();
        toast('Demo data restored', { undo: () => restoreSnapshot(previous) });
      },
    });
  }

  function aboutPanel() {
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, 'About payments')),
      h('p', { class: 'muted' }, 'Stockroom has no payment processing. Cash is recorded with change due. Card is only a label on the sale record: take the money on your own terminal.'));
  }

  function refresh() {
    if (!holder) return;
    clear(holder);
    holder.append(shopForm(), dataPanel(), aboutPanel());
  }

  function mount(root) {
    holder = h('div', { class: 'settings-grid' });
    root.append(pageHeader('Settings', 'Shop details, tax, exports and backups.'), holder);
    refresh();
  }

  return { mount, unmount: () => { holder = null; }, refresh };
})();
