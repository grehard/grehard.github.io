// Monthly category limits and how spending is tracking against them.
(function () {
  const ns = window.Coinpath;
  const { el, button, iconButton, icon, select, field, validate, tile, swatch, pageHead, monthStepper, emptyState } = ns.Dom;
  const { Dates, Budgets, Money, Overlays, TxForm } = ns;

  function progressBar(row) {
    const width = Math.min(100, row.percent);
    return el('div', {
      class: 'progress progress-' + row.state, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(width),
      'aria-label': row.name + ': ' + row.percent + ' percent of budget used',
    }, el('div', { class: 'progress-fill', style: 'width:' + width + '%' }));
  }

  function statusLabel(row) {
    const { money } = ns.App;
    if (row.state === 'over') return el('span', { class: 'status status-over' }, icon('alert', 13), 'Over by ' + money(-row.remaining));
    if (row.state === 'near') return el('span', { class: 'status status-near' }, money(row.remaining) + ' left');
    return el('span', { class: 'status status-ok' }, money(row.remaining) + ' left');
  }

  function openForm(month, existing) {
    const state = ns.App.state;
    const available = state.categories.filter((c) => c.kind === 'expense' && (Budgets.limitFor(state, c.id, month) === 0 || (existing && c.id === existing.categoryId)));
    const modal = Overlays.openModal({ title: existing ? 'Edit budget' : 'Add budget' });
    if (!available.length) {
      modal.body.appendChild(el('p', null, 'Every expense category already has a budget this month. Add a category in Settings to budget for something new.'));
      modal.footer.append(button('Close', { onClick: modal.close }));
      return;
    }
    const category = select(available.map((c) => ({ value: c.id, label: c.name })), existing ? existing.categoryId : available[0].id, { disabled: !!existing });
    const limit = el('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off', placeholder: '0.00', value: existing ? Money.toDecimal(existing.limit) : '' });
    const submit = (event) => {
      event.preventDefault();
      if (!validate([[limit, TxForm.amountError(limit)]])) return;
      const cents = Money.parse(limit.value);
      const categoryId = category.value;
      modal.close();
      ns.App.commit((s) => Budgets.setLimit(s, categoryId, month, cents), { toast: 'Budget saved from ' + Dates.monthLabel(month) + ' onward', undo: true });
    };
    modal.body.appendChild(el('form', { id: 'budget-form', noValidate: true, onSubmit: submit },
      field('Category', category),
      field('Monthly limit', limit, { hint: 'Applies from ' + Dates.monthLabel(month) + ' onward. Earlier months keep their limits.' })));
    modal.footer.append(button('Cancel', { onClick: modal.close }),
      el('button', { type: 'submit', class: 'btn btn-primary', form: 'budget-form' }, existing ? 'Save budget' : 'Add budget'));
    limit.focus();
  }

  function removeBudget(row, month) {
    ns.App.commit((s) => Budgets.setLimit(s, row.categoryId, month, 0), { toast: 'Removed the ' + row.name + ' budget from ' + Dates.monthLabel(month) + ' onward', undo: true });
  }

  function showSpending(row, month) {
    ns.Views.transactions.showWith({ categoryId: row.categoryId, type: 'expense', preset: 'custom', from: Dates.firstOfMonth(month), to: Dates.lastOfMonth(month) });
  }

  function budgetRow(row, month) {
    const { money } = ns.App;
    return el('li', { class: 'budget-row budget-' + row.state, 'data-budget': row.name },
      el('div', { class: 'budget-line' },
        el('button', { type: 'button', class: 'row-link budget-name', onClick: () => showSpending(row, month) }, swatch(row.color), el('span', { class: 'row-payee' }, row.name)),
        statusLabel(row),
        el('div', { class: 'budget-actions' },
          iconButton('edit', 'Edit ' + row.name + ' budget', () => openForm(month, row)),
          iconButton('trash', 'Remove ' + row.name + ' budget', () => removeBudget(row, month)))),
      progressBar(row),
      el('div', { class: 'budget-figures' },
        el('span', { 'data-spent': '' }, money(row.spent) + ' of ' + money(row.limit)),
        el('span', null, row.percent + '%')));
  }

  function render(container) {
    const state = ns.App.state;
    const month = ns.App.viewMonth;
    const { money } = ns.App;
    const report = Budgets.report(state, month);
    const setMonth = (next) => { ns.App.viewMonth = next; ns.App.render(); };
    const overNote = report.overCount ? report.overCount + (report.overCount === 1 ? ' category over' : ' categories over') : 'All within limits';
    const remainingLabel = report.remaining < 0 ? 'Over budget' : 'Remaining';
    const add = button('Add budget', { variant: 'btn-primary', icon: 'plus', onClick: () => openForm(month) });
    container.append(
      pageHead('Budgets', null, [monthStepper(month, setMonth), add]),
      el('div', { class: 'tiles' },
        tile('Budgeted', money(report.limit), Dates.monthLabel(month)),
        tile('Spent', money(report.spent), 'In budgeted categories'),
        tile(remainingLabel, money(Math.abs(report.remaining)), overNote, { tone: report.remaining < 0 ? 'tone-negative' : '' }),
        tile('Unbudgeted spending', money(report.unbudgeted), 'Categories with no limit')),
      report.rows.length
        ? el('section', { class: 'card', 'aria-label': 'Category budgets' }, el('ul', { class: 'budget-list' }, report.rows.map((row) => budgetRow(row, month))))
        : emptyState('No budgets for ' + Dates.monthLabel(month), 'Set a monthly limit on a category to see progress here.', button('Add budget', { variant: 'btn-primary', icon: 'plus', onClick: () => openForm(month) })));
  }

  ns.Views = ns.Views || {};
  ns.Views.budgets = { title: 'Budgets', render, progressBar };
})();
