// Currency, appearance, categories, and everything to do with moving data in and out.
(function () {
  const ns = window.Coinpath;
  const { el, button, iconButton, select, field, validate, swatch, pageHead } = ns.Dom;
  const { Money, Overlays, Store, Exporter } = ns;

  // Validated categorical palette; see the README for how it was chosen.
  const PALETTE = [
    ['#2a78d6', 'Blue'], ['#eb6834', 'Orange'], ['#1baf7a', 'Aqua'], ['#eda100', 'Yellow'],
    ['#e87ba4', 'Pink'], ['#008300', 'Green'], ['#6250d6', 'Violet'], ['#e34948', 'Red'],
  ];

  function section(title, description, ...content) {
    return el('section', { class: 'card settings-section', 'aria-label': title },
      el('div', { class: 'card-head' }, el('h2', null, title)),
      description && el('p', { class: 'muted-line' }, description),
      content);
  }

  function nextColor(state, kind) {
    const used = state.categories.filter((c) => c.kind === kind).map((c) => c.color);
    const free = PALETTE.find((p) => !used.includes(p[0]));
    return free ? free[0] : PALETTE[0][0];
  }

  function colorPicker(value) {
    const name = ns.Dom.uid('color');
    const fieldset = el('fieldset', { class: 'color-picker' }, el('legend', { class: 'field-label' }, 'Color'),
      el('div', { class: 'color-row' }, PALETTE.map((p) => el('label', { class: 'color-option', title: p[1] },
        el('input', { type: 'radio', name, value: p[0], checked: p[0] === value, 'aria-label': p[1] }),
        el('span', { class: 'color-dot', style: 'background:' + p[0] })))));
    fieldset.getValue = () => fieldset.querySelector('input:checked').value;
    return fieldset;
  }

  function openCategoryForm(category, kind) {
    const state = ns.App.state;
    const modal = Overlays.openModal({ title: category ? 'Edit category' : 'Add ' + kind + ' category' });
    const name = el('input', { type: 'text', maxLength: 40, value: category ? category.name : '' });
    const colors = colorPicker(category ? category.color : nextColor(state, kind));
    const nameError = () => {
      const wanted = name.value.trim().toLowerCase();
      if (!wanted) return 'Enter a name.';
      const taken = state.categories.some((c) => c.kind === kind && c.name.toLowerCase() === wanted && (!category || c.id !== category.id));
      return taken ? 'This category already exists.' : '';
    };
    const submit = (event) => {
      event.preventDefault();
      if (!validate([[name, nameError()]])) return;
      const values = { name: name.value.trim(), color: colors.getValue() };
      modal.close();
      ns.App.commit((s) => {
        if (category) Object.assign(s.categories.find((c) => c.id === category.id), values);
        else s.categories.push(Object.assign({ id: Store.newId('c'), kind }, values));
      }, { toast: (category ? 'Saved ' : 'Added ') + values.name, undo: true });
    };
    modal.body.appendChild(el('form', { id: 'category-form', noValidate: true, onSubmit: submit }, field('Category name', name), colors));
    modal.footer.append(button('Cancel', { onClick: modal.close }),
      el('button', { type: 'submit', class: 'btn btn-primary', form: 'category-form' }, category ? 'Save changes' : 'Add category'));
    name.focus();
  }

  function removeCategory(category) {
    ns.App.commit((s) => {
      s.categories = s.categories.filter((c) => c.id !== category.id);
      s.budgets = s.budgets.filter((b) => b.categoryId !== category.id);
      const clear = (item) => { if (item.categoryId === category.id) item.categoryId = null; };
      s.transactions.forEach(clear);
      s.recurring.forEach(clear);
    }, { toast: 'Deleted ' + category.name + '. Its transactions are now uncategorized.', undo: true });
  }

  function categoryList(state, kind) {
    const rows = state.categories.filter((c) => c.kind === kind);
    const counts = (id) => state.transactions.filter((t) => t.categoryId === id).length;
    return el('div', { class: 'category-group' },
      el('div', { class: 'category-group-head' },
        el('h3', null, kind === 'expense' ? 'Expense categories' : 'Income categories'),
        button('Add', { icon: 'plus', variant: 'btn-small', onClick: () => openCategoryForm(null, kind) })),
      rows.length ? el('ul', { class: 'category-list' }, rows.map((c) => el('li', { 'data-category': c.name },
        swatch(c.color),
        el('span', { class: 'category-name', title: c.name }, c.name),
        el('span', { class: 'category-count' }, counts(c.id).toLocaleString('en-US')),
        iconButton('edit', 'Edit ' + c.name, () => openCategoryForm(c, kind)),
        iconButton('trash', 'Delete ' + c.name, () => removeCategory(c)))))
        : el('p', { class: 'muted-line' }, 'None yet.'));
  }

  function currencySection(state) {
    const currency = select(Money.CURRENCIES.map((c) => ({ value: c.code, label: c.code + ' – ' + c.label })), state.currency, {
      onChange: () => {
        const code = currency.value;
        ns.App.commit((s) => { s.currency = code; }, { toast: 'Currency set to ' + code, undo: true });
      },
    });
    return section('Currency', 'Changes how amounts are labelled. Stored amounts are not converted.', field('Display currency', currency));
  }

  function appearanceSection() {
    const theme = select([{ value: 'system', label: 'Match this device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], ns.Theme.choice(), {
      onChange: () => { ns.Theme.set(theme.value); ns.App.refreshShell(); },
    });
    return section('Appearance', null, field('Theme', theme));
  }

  function importBackup(file, showError) {
    file.text().then((text) => {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error('This file is not valid JSON.');
      }
      const next = Store.sanitize(parsed);
      Overlays.confirmModal({
        title: 'Replace all data with this backup?',
        message: 'It holds ' + next.accounts.length + ' accounts and ' + next.transactions.length + ' transactions. Your current data will be replaced.',
        confirmLabel: 'Replace data',
        danger: true,
        onConfirm: () => ns.App.replaceState(next, 'Backup restored'),
      });
      showError('');
    }).catch((err) => showError(err.message));
  }

  function dataSection(state) {
    const error = el('p', { class: 'form-error', role: 'alert', hidden: true, 'data-import-error': '' });
    const showError = (message) => { error.textContent = message; error.hidden = !message; };
    const backupInput = el('input', {
      type: 'file', accept: '.json,application/json',
      onChange: () => {
        const file = backupInput.files[0];
        if (file) importBackup(file, showError);
        backupInput.value = '';
      },
    });
    const notice = !Store.isPersistent() && el('p', { class: 'form-error' }, 'This browser is blocking storage, so changes last only until you close this page. Export a backup to keep them.');
    return section('Data', 'Everything stays in this browser. Export a backup to keep a copy or move it elsewhere.',
      notice,
      el('div', { class: 'button-row' },
        button('Import CSV', { icon: 'upload', onClick: () => ns.ImportFlow.open() }),
        button('Export all as CSV', { icon: 'download', onClick: () => { Exporter.downloadCsv(state, state.transactions); Overlays.showToast('Exported ' + state.transactions.length + ' transactions as CSV'); } }),
        button('Export JSON backup', { icon: 'download', onClick: () => { Exporter.downloadJson(state); Overlays.showToast('Exported a JSON backup'); } })),
      field('Restore a JSON backup', backupInput, { hint: 'Replaces all current data. You can undo right after.' }),
      error,
      el('div', { class: 'button-row danger-row' },
        button('Reset demo data', { onClick: ns.App.confirmReset }),
        button('Clear all data', { variant: 'btn-danger-quiet', onClick: confirmClear })));
  }

  function confirmClear() {
    Overlays.confirmModal({
      title: 'Clear all data?',
      message: 'This removes every account, transaction, budget and rule so you can start with your own numbers. Your categories stay.',
      confirmLabel: 'Clear data',
      danger: true,
      onConfirm: () => {
        const state = ns.App.state;
        ns.App.replaceState(Store.sanitize({ currency: state.currency, categories: state.categories, accounts: [], transactions: [] }), 'All data cleared');
      },
    });
  }

  function render(container) {
    const state = ns.App.state;
    container.append(
      pageHead('Settings'),
      el('div', { class: 'settings-grid' },
        el('div', { class: 'settings-column' }, currencySection(state), appearanceSection(), dataSection(state)),
        el('div', { class: 'settings-column' },
          section('Categories', 'Deleting a category keeps its transactions and marks them uncategorized.', categoryList(state, 'expense'), categoryList(state, 'income')))));
  }

  ns.Views = ns.Views || {};
  ns.Views.settings = { title: 'Settings', render };
})();
