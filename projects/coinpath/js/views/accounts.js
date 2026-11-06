// Accounts and their balances, with net worth split into what's owned and owed.
(function () {
  const ns = window.Coinpath;
  const { el, button, iconButton, select, field, validate, tile, pageHead, emptyState } = ns.Dom;
  const { Dates, Ledger, Money, Overlays, Store } = ns;

  const TYPE_LABELS = { checking: 'Checking', savings: 'Savings', credit: 'Credit card', cash: 'Cash', investment: 'Investment' };

  function typeOptions() {
    return Store.ACCOUNT_TYPES.map((type) => ({ value: type, label: TYPE_LABELS[type] }));
  }

  function openingError(input) {
    if (!input.value.trim()) return '';
    return Money.parse(input.value) === null ? 'Enter a number, such as 1250.00 or -300.00.' : '';
  }

  function openForm(account) {
    const state = ns.App.state;
    const modal = Overlays.openModal({ title: account ? 'Edit account' : 'Add account' });
    const name = el('input', { type: 'text', maxLength: 60, value: account ? account.name : '' });
    const type = select(typeOptions(), account ? account.type : 'checking');
    const opening = el('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off', placeholder: '0.00', value: account ? Money.toDecimal(account.openingCents) : '' });

    const nameError = () => {
      const wanted = name.value.trim().toLowerCase();
      if (!wanted) return 'Enter a name.';
      const taken = state.accounts.some((a) => a.name.toLowerCase() === wanted && (!account || a.id !== account.id));
      return taken ? 'You already have an account with this name.' : '';
    };

    const submit = (event) => {
      event.preventDefault();
      if (!validate([[name, nameError()], [opening, openingError(opening)]])) return;
      const values = { name: name.value.trim(), type: type.value, openingCents: Money.parse(opening.value) || 0 };
      modal.close();
      ns.App.commit((s) => {
        if (account) Object.assign(s.accounts.find((a) => a.id === account.id), values);
        else s.accounts.push(Object.assign({ id: Store.newId('a') }, values));
      }, { toast: account ? 'Saved ' + values.name : 'Added ' + values.name, undo: true });
    };

    modal.body.appendChild(el('form', { id: 'account-form', noValidate: true, onSubmit: submit },
      field('Account name', name),
      field('Account type', type),
      field('Opening balance', opening, { hint: 'The balance before your first transaction here. Use a negative number for money owed.' })));
    modal.footer.append(button('Cancel', { onClick: modal.close }),
      el('button', { type: 'submit', class: 'btn btn-primary', form: 'account-form' }, account ? 'Save changes' : 'Add account'));
    name.focus();
  }

  function removeAccount(account) {
    ns.App.commit((s) => {
      s.accounts = s.accounts.filter((a) => a.id !== account.id);
      const touches = (item) => item.accountId === account.id || item.toAccountId === account.id;
      s.transactions = s.transactions.filter((t) => !touches(t));
      s.recurring = s.recurring.filter((r) => !touches(r));
    }, { toast: 'Deleted ' + account.name, undo: true });
  }

  function confirmDelete(account, txCount) {
    if (!txCount) { removeAccount(account); return; }
    Overlays.confirmModal({
      title: 'Delete ' + account.name + '?',
      message: 'This also deletes its ' + txCount.toLocaleString('en-US') + ' transactions, including transfers to and from other accounts, and any recurring rules that use it. Those other accounts’ balances will change.',
      confirmLabel: 'Delete account',
      danger: true,
      onConfirm: () => removeAccount(account),
    });
  }

  function accountRow(account, balance, txCount) {
    const { money } = ns.App;
    return el('tr', { 'data-account': account.id },
      el('td', null,
        el('button', { type: 'button', class: 'row-link', onClick: () => ns.Views.transactions.showWith({ accountId: account.id }) }, el('span', { class: 'row-payee' }, account.name)),
        el('div', { class: 'row-secondary-always' }, TYPE_LABELS[account.type])),
      el('td', { class: 'hide-narrow' }, TYPE_LABELS[account.type]),
      el('td', { class: 'num hide-narrow' }, money(account.openingCents)),
      el('td', { class: 'num hide-narrow' }, txCount.toLocaleString('en-US')),
      el('td', { class: 'num amount-strong ' + (balance < 0 ? 'tone-negative' : ''), 'data-balance': '' }, money(balance)),
      el('td', { class: 'cell-actions-visible' },
        iconButton('list', 'View transactions in ' + account.name, () => ns.Views.transactions.showWith({ accountId: account.id })),
        iconButton('edit', 'Edit ' + account.name, () => openForm(account)),
        iconButton('trash', 'Delete ' + account.name, () => confirmDelete(account, txCount))));
  }

  function render(container) {
    const state = ns.App.state;
    const today = Dates.today();
    const balances = Ledger.balances(state, today);
    const values = state.accounts.map((a) => balances[a.id]);
    const assets = values.filter((v) => v > 0).reduce((sum, v) => sum + v, 0);
    const owed = values.filter((v) => v < 0).reduce((sum, v) => sum + v, 0);
    const counts = (id) => state.transactions.filter((t) => t.accountId === id || t.toAccountId === id).length;
    container.append(
      pageHead('Accounts', null, button('Add account', { variant: 'btn-primary', icon: 'plus', onClick: () => openForm() })),
      el('div', { class: 'tiles tiles-3' },
        tile('Net worth', ns.App.money(assets + owed), 'Balances as of ' + Dates.formatShort(today)),
        tile('Assets', ns.App.money(assets), 'Accounts in credit'),
        tile('Owed', ns.App.money(-owed), 'Accounts below zero')),
      state.accounts.length
        ? el('section', { class: 'card card-flush', 'aria-label': 'Accounts' }, el('div', { class: 'table-wrap' }, el('table', { class: 'data-table' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col' }, 'Account'), el('th', { scope: 'col', class: 'hide-narrow' }, 'Type'),
            el('th', { scope: 'col', class: 'num hide-narrow' }, 'Opening'), el('th', { scope: 'col', class: 'num hide-narrow' }, 'Transactions'),
            el('th', { scope: 'col', class: 'num' }, 'Balance'), el('th', { scope: 'col' }, el('span', { class: 'visually-hidden' }, 'Actions')))),
          el('tbody', null, state.accounts.map((a) => accountRow(a, balances[a.id], counts(a.id)))))))
        : emptyState('No accounts yet', 'Add a checking account, a card, or anywhere else you keep money.', button('Add account', { variant: 'btn-primary', icon: 'plus', onClick: () => openForm() })));
  }

  ns.Views = ns.Views || {};
  ns.Views.accounts = { title: 'Accounts', render };
})();
