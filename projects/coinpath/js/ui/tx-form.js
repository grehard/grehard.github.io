// Add and edit form for transactions, in a modal. Also supplies the option lists
// shared with the recurring rule form.
(function () {
  const ns = window.Coinpath;
  const { el, button, select, field, validate, segmented, uid } = ns.Dom;
  const { Money, Dates, Overlays, Store } = ns;

  const TYPES = [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }];

  function accountOptions(state) {
    return state.accounts.map((a) => ({ value: a.id, label: a.name }));
  }

  function categoryOptions(state, kind) {
    return [{ value: '', label: 'Uncategorized' }].concat(state.categories.filter((c) => c.kind === kind).map((c) => ({ value: c.id, label: c.name })));
  }

  function replaceOptions(selectNode, options, value) {
    selectNode.textContent = '';
    options.forEach((o) => selectNode.appendChild(el('option', { value: o.value }, o.label)));
    selectNode.value = value;
    if (selectNode.selectedIndex < 0) selectNode.selectedIndex = 0;
  }

  function amountError(input) {
    const cents = Money.parse(input.value);
    if (!input.value.trim()) return 'Enter an amount.';
    if (cents === null) return 'Enter a number, such as 42.50.';
    if (cents <= 0) return 'Enter an amount above zero. The type sets the direction.';
    return cents > Money.MAX_CENTS ? 'The largest amount is 9,999,999,999.99.' : '';
  }

  /** The type, amount, account and category controls both forms share. */
  function movementFields(state, source) {
    const firstOther = state.accounts.find((a) => a.id !== source.accountId);
    const amount = el('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off', placeholder: '0.00', value: source.amountCents ? Money.toDecimal(source.amountCents) : '' });
    const account = select(accountOptions(state), source.accountId);
    const toAccount = select(accountOptions(state), source.toAccountId || (firstOther && firstOther.id));
    const category = select(categoryOptions(state, source.type === 'income' ? 'income' : 'expense'), source.categoryId);
    const accountField = field('Account', account);
    const toField = field('To account', toAccount);
    const categoryField = field('Category', category);

    const sync = (type) => {
      const isTransfer = type === 'transfer';
      toField.hidden = !isTransfer;
      categoryField.hidden = isTransfer;
      accountField.querySelector('label').textContent = isTransfer ? 'From account' : 'Account';
      if (!isTransfer) replaceOptions(category, categoryOptions(state, type), category.value);
    };
    const type = segmented('Type', uid('type'), TYPES, source.type, sync);
    sync(source.type);

    return {
      type, amount, account, toAccount, category, accountField, toField, categoryField,
      errors() {
        const isTransfer = type.getValue() === 'transfer';
        return [[amount, amountError(amount)], [toAccount, isTransfer && toAccount.value === account.value ? 'Choose a different account to transfer to.' : '']];
      },
      values() {
        const kind = type.getValue();
        const isTransfer = kind === 'transfer';
        return {
          type: kind, amountCents: Money.parse(amount.value), accountId: account.value,
          toAccountId: isTransfer ? toAccount.value : null, categoryId: isTransfer ? null : category.value || null,
        };
      },
    };
  }

  function dateError(input) {
    return Dates.isValid(input.value) ? '' : 'Enter a valid date.';
  }

  function noAccountsNotice(modal) {
    modal.body.appendChild(el('p', null, 'Add an account first, then come back to record this.'));
    modal.footer.append(button('Cancel', { onClick: modal.close }), button('Go to accounts', {
      variant: 'btn-primary',
      onClick: () => { modal.close(); ns.App.navigate('accounts'); },
    }));
  }

  function saveTransaction(existing, values) {
    const verb = values.type === 'transfer' ? 'transfer' : values.type;
    if (existing) {
      ns.App.commit((state) => {
        const tx = state.transactions.find((t) => t.id === existing.id);
        if (tx) Object.assign(tx, values);
      }, { toast: 'Saved changes to this ' + verb, undo: true });
      return;
    }
    ns.App.commit((state) => {
      state.transactions.push(Object.assign({ id: Store.newId('t'), seq: state.nextSeq, recurringId: null }, values));
      state.nextSeq += 1;
    }, { toast: 'Added ' + verb + ' of ' + ns.App.money(values.amountCents), undo: true });
  }

  function deleteTransaction(tx) {
    ns.App.commit((state) => {
      state.transactions = state.transactions.filter((t) => t.id !== tx.id);
    }, { toast: 'Deleted ' + (tx.payee || 'transaction'), undo: true });
  }

  /** Opens the form. Pass tx to edit, or defaults like { type, accountId } to add. */
  function open(tx, defaults) {
    const state = ns.App.state;
    const modal = Overlays.openModal({ title: tx ? 'Edit transaction' : 'Add transaction' });
    if (!state.accounts.length) { noAccountsNotice(modal); return; }
    const source = tx || Object.assign({ type: 'expense', amountCents: 0, accountId: state.accounts[0].id, toAccountId: null, categoryId: '', date: Dates.today(), payee: '', notes: '' }, defaults);
    const move = movementFields(state, source);
    const date = el('input', { type: 'date', value: source.date, required: true });
    const payee = el('input', { type: 'text', maxLength: 120, value: source.payee, placeholder: 'Who or what was this for?' });
    const notes = el('textarea', { rows: 2, maxLength: 300, value: source.notes });

    const submit = (event) => {
      event.preventDefault();
      const isTransfer = move.type.getValue() === 'transfer';
      const ok = validate(move.errors().concat([
        [date, dateError(date)],
        [payee, !isTransfer && !payee.value.trim() ? 'Enter a description.' : ''],
      ]));
      if (!ok) return;
      const values = Object.assign(move.values(), {
        date: date.value, payee: payee.value.trim() || 'Transfer', notes: notes.value.trim(),
      });
      modal.close();
      saveTransaction(tx, values);
    };

    const form = el('form', { id: 'tx-form', noValidate: true, onSubmit: submit },
      move.type,
      el('div', { class: 'form-row' }, field('Amount', move.amount), field('Date', date)),
      field('Description', payee),
      el('div', { class: 'form-row' }, move.accountField, move.toField, move.categoryField),
      field('Notes', notes));
    modal.body.appendChild(form);
    modal.footer.append(
      tx ? el('button', { type: 'button', class: 'btn btn-danger-quiet push-left', onClick: () => { modal.close(); deleteTransaction(tx); } }, 'Delete') : '',
      button('Cancel', { onClick: modal.close }),
      el('button', { type: 'submit', class: 'btn btn-primary', form: 'tx-form' }, tx ? 'Save changes' : 'Add transaction'));
    move.amount.focus();
  }

  ns.TxForm = { open, deleteTransaction, movementFields, amountError, dateError, accountOptions };
})();
