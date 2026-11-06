// Recurring rules: weekly or monthly transactions that post themselves when due.
(function () {
  const ns = window.Coinpath;
  const { el, button, iconButton, select, field, validate, tile, pageHead, emptyState } = ns.Dom;
  const { Dates, Recurring, Overlays, Store, TxForm } = ns;

  // Limits how much history one saved form can post in a single step.
  const MAX_DAYS_BACK = 366 * 5;
  const STATUS_LABELS = { active: 'Active', paused: 'Paused', ended: 'Ended' };

  const pluralPosted = (count) => (count === 1 ? '1 past occurrence' : count + ' past occurrences');

  function nextDateError(input) {
    const invalid = TxForm.dateError(input);
    if (invalid) return invalid;
    return input.value < Dates.addDays(Dates.today(), -MAX_DAYS_BACK) ? 'Choose a date within the last five years.' : '';
  }

  function saveRule(existing, values) {
    let posted = [];
    const anchorDay = Dates.parts(values.nextDate).d;
    ns.App.commit((state) => {
      if (existing) Object.assign(state.recurring.find((r) => r.id === existing.id), values, { anchorDay });
      else state.recurring.push(Object.assign({ id: Store.newId('r'), paused: false, postedCount: 0, anchorDay }, values));
      posted = Recurring.postDue(state, Dates.today());
    }, {
      toast: () => (existing ? 'Saved ' : 'Added ') + values.name + (posted.length ? ' and posted ' + pluralPosted(posted.length) : ''),
      undo: true,
    });
  }

  function openForm(rule) {
    const state = ns.App.state;
    const modal = Overlays.openModal({ title: rule ? 'Edit recurring rule' : 'Add recurring rule' });
    if (!state.accounts.length) {
      modal.body.appendChild(el('p', null, 'Add an account first, then come back to set up this rule.'));
      modal.footer.append(button('Close', { onClick: modal.close }));
      return;
    }
    const source = rule || { type: 'expense', amountCents: 0, accountId: state.accounts[0].id, toAccountId: null, categoryId: '', frequency: 'monthly', nextDate: Dates.today(), endDate: null, name: '', notes: '' };
    const move = TxForm.movementFields(state, source);
    const name = el('input', { type: 'text', maxLength: 120, value: source.name, placeholder: 'Rent, salary, gym' });
    const frequency = select([{ value: 'monthly', label: 'Monthly' }, { value: 'weekly', label: 'Weekly' }], source.frequency);
    const nextDate = el('input', { type: 'date', value: source.nextDate });
    const endDate = el('input', { type: 'date', value: source.endDate || '' });
    const notes = el('textarea', { rows: 1, maxLength: 300, value: source.notes });

    const submit = (event) => {
      event.preventDefault();
      const endProblem = endDate.value && (!Dates.isValid(endDate.value) || endDate.value < nextDate.value) ? 'The end date must be on or after the next date.' : '';
      const ok = validate(move.errors().concat([[name, name.value.trim() ? '' : 'Enter a name.'], [nextDate, nextDateError(nextDate)], [endDate, endProblem]]));
      if (!ok) return;
      const values = Object.assign(move.values(), {
        name: name.value.trim(), frequency: frequency.value, nextDate: nextDate.value, endDate: endDate.value || null, notes: notes.value.trim(),
      });
      modal.close();
      saveRule(rule, values);
    };

    modal.body.appendChild(el('form', { id: 'rule-form', noValidate: true, onSubmit: submit },
      move.type,
      el('div', { class: 'form-row' }, field('Name', name), field('Amount', move.amount)),
      el('div', { class: 'form-row' }, move.accountField, move.toField, move.categoryField),
      el('div', { class: 'form-row' }, field('Repeats', frequency), field('Next date', nextDate, { hint: 'A past date posts every missed period when you save.' })),
      field('End date (optional)', endDate),
      field('Notes', notes)));
    modal.footer.append(button('Cancel', { onClick: modal.close }),
      el('button', { type: 'submit', class: 'btn btn-primary', form: 'rule-form' }, rule ? 'Save rule' : 'Add rule'));
    name.focus();
  }

  function togglePause(rule) {
    const resuming = rule.paused;
    let posted = [];
    ns.App.commit((state) => {
      const target = state.recurring.find((r) => r.id === rule.id);
      if (resuming) {
        Recurring.resume(target, Dates.today());
        posted = Recurring.postDue(state, Dates.today());
      } else target.paused = true;
    }, {
      toast: () => (resuming ? 'Resumed ' : 'Paused ') + rule.name + (posted.length ? ', posted today’s occurrence' : ''),
      undo: true,
    });
  }

  function removeRule(rule) {
    ns.App.commit((state) => {
      state.recurring = state.recurring.filter((r) => r.id !== rule.id);
      state.transactions.forEach((t) => { if (t.recurringId === rule.id) t.recurringId = null; });
    }, { toast: 'Deleted ' + rule.name + '. Posted transactions stay in your ledger.', undo: true });
  }

  function ruleRow(rule, state) {
    const status = Recurring.status(rule);
    const nameOf = (id) => { const a = state.accounts.find((x) => x.id === id); return a ? a.name : ''; };
    const account = rule.type === 'transfer' ? nameOf(rule.accountId) + ' to ' + nameOf(rule.toAccountId) : nameOf(rule.accountId);
    return el('tr', { 'data-rule': rule.name },
      el('td', null,
        el('button', { type: 'button', class: 'row-link', onClick: () => openForm(rule) }, el('span', { class: 'row-payee' }, rule.name)),
        el('div', { class: 'row-secondary-always' }, account)),
      el('td', { class: 'hide-narrow' }, Recurring.describeSchedule(rule)),
      el('td', { class: 'hide-narrow' }, status === 'ended' ? '–' : Dates.format(rule.nextDate)),
      el('td', { class: 'hide-narrow num' }, rule.postedCount.toLocaleString('en-US')),
      el('td', null, el('span', { class: 'status status-' + (status === 'active' ? 'ok' : 'muted') }, STATUS_LABELS[status])),
      el('td', { class: 'num amount amount-' + rule.type }, ns.Views.transactions.displayAmount(rule)),
      el('td', { class: 'cell-actions-visible' },
        status !== 'ended' && iconButton(rule.paused ? 'play' : 'pause', (rule.paused ? 'Resume ' : 'Pause ') + rule.name, () => togglePause(rule)),
        iconButton('edit', 'Edit ' + rule.name, () => openForm(rule)),
        iconButton('trash', 'Delete ' + rule.name, () => removeRule(rule))));
  }

  function render(container) {
    const state = ns.App.state;
    const { money } = ns.App;
    const totals = Recurring.commitments(state);
    const next = Recurring.upcoming(state, 1)[0];
    const add = () => button('Add rule', { variant: 'btn-primary', icon: 'plus', onClick: () => openForm() });
    const rules = state.recurring.slice().sort((a, b) => (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0));
    container.append(
      pageHead('Recurring', 'Due items post by themselves when you open Coinpath, including any periods you missed.', add()),
      el('div', { class: 'tiles tiles-3' },
        tile('Regular income', money(totals.income), 'Average per month'),
        tile('Regular spending', money(totals.spend), 'Average per month'),
        tile('Next up', next ? Dates.formatShort(next.nextDate) : 'Nothing', next ? next.name : 'No active rules')),
      rules.length
        ? el('section', { class: 'card card-flush', 'aria-label': 'Recurring rules' }, el('div', { class: 'table-wrap' }, el('table', { class: 'data-table' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col' }, 'Rule'), el('th', { scope: 'col', class: 'hide-narrow' }, 'Schedule'), el('th', { scope: 'col', class: 'hide-narrow' }, 'Next date'),
            el('th', { scope: 'col', class: 'hide-narrow num' }, 'Posted'), el('th', { scope: 'col' }, 'Status'), el('th', { scope: 'col', class: 'num' }, 'Amount'),
            el('th', { scope: 'col' }, el('span', { class: 'visually-hidden' }, 'Actions')))),
          el('tbody', null, rules.map((rule) => ruleRow(rule, state))))))
        : emptyState('No recurring rules yet', 'Add rent, salary or a subscription once and it posts itself from then on.', add()));
  }

  ns.Views = ns.Views || {};
  ns.Views.recurring = { title: 'Recurring', render };
})();
