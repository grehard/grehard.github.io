// End of day: count the drawer by note and coin, compare with expected cash, keep the record.
SR.views.close = (function () {
  const { h, btn, clear, field, input, textarea, pageHeader, dataTable, emptyState, toast, iconBtn, pill } = SR.ui;
  const { format, parse, plain } = SR.money;
  const { dateKey, formatKey, parseWhole } = SR.util;
  const C = SR.cashup;

  let date = null;
  let content = null;
  let historyEl = null;
  const state = () => SR.store.state;

  function overShortPill(cents) {
    if (cents === 0) return pill('Balanced', 'good');
    return cents > 0 ? pill(`Over ${format(cents)}`, 'warn') : pill(`Short ${format(-cents)}`, 'bad');
  }

  function summaryRow(label, value, testId, cls) {
    return h('div', { class: `total-row${cls ? ` ${cls}` : ''}` }, h('span', null, label), h('span', { dataset: testId ? { testid: testId } : undefined }, value));
  }

  function overShortBanner(diff, counted, bad) {
    if (!counted || bad) return h('div', { class: 'over-short pending' }, h('span', null, bad ? 'Check the counts' : 'Not counted yet'), h('strong', { dataset: { testid: 'over-short' } }, '--'));
    return h('div', { class: `over-short ${diff === 0 ? 'even' : diff > 0 ? 'over' : 'short'}` },
      h('span', null, diff === 0 ? 'Balanced' : diff > 0 ? 'Over' : 'Short'),
      h('strong', { dataset: { testid: 'over-short' } }, format(diff)));
  }

  function renderDay() {
    clear(content);
    const existing = state().closes.find((c) => c.date === date);
    const floatInput = input({ inputmode: 'decimal', autocomplete: 'off', value: plain(existing ? existing.floatCents : state().settings.floatCents), onInput: () => recalc() });
    const floatField = field('Opening float', floatInput, { hint: 'Cash in the drawer before the first sale.' });
    const note = textarea({ value: existing ? existing.note : '', maxlength: 200, placeholder: 'Anything that explains a difference' });
    const countsInputs = C.DENOMINATIONS.map((d) => {
      const control = input({
        inputmode: 'numeric', autocomplete: 'off', class: 'input num-input', value: existing && existing.counts[d.cents] ? String(existing.counts[d.cents]) : '',
        'aria-label': `Count of ${d.label}`, onInput: () => recalc(),
      });
      const amount = h('span', { class: 'denom-amount' });
      return { d, control, amount };
    });
    const summaryEl = h('div', { class: 'summary-list' });
    const problem = h('div', { class: 'field-error', role: 'alert', hidden: true });

    function readCounts() {
      const counts = {};
      let bad = false;
      for (const { d, control } of countsInputs) {
        const text = control.value.trim();
        if (!text) continue;
        const n = parseWhole(text);
        if (n === null || n > 100000) bad = true;
        else if (n) counts[d.cents] = n;
      }
      return { counts, bad };
    }

    function recalc() {
      const { counts, bad } = readCounts();
      const floatCents = parse(floatInput.value);
      const summary = C.daySummary(state(), date);
      countsInputs.forEach(({ d, amount }) => { amount.textContent = format((counts[d.cents] || 0) * d.cents); });
      const expected = C.expectedCash(floatCents === null ? 0 : floatCents, summary);
      const counted = C.countedFrom(counts);
      const diff = counted - expected;
      clear(summaryEl);
      summaryEl.append(
        summaryRow('Opening float', format(floatCents === null ? 0 : floatCents)),
        summaryRow('Cash sales', format(summary.cashSalesCents), 'cash-sales'),
        summaryRow('Cash refunds', format(-summary.cashRefundsCents), 'cash-refunds'),
        summaryRow('Expected in drawer', format(expected), 'expected-cash', 'grand'),
        summaryRow('Counted', format(counted), 'counted-cash'),
        overShortBanner(diff, Object.keys(counts).length > 0 || !!existing, bad),
        summaryRow('Card, recorded only', format(summary.cardSalesCents - summary.cardRefundsCents), 'card-total'),
        summaryRow('Sales this day', String(summary.saleCount)));
    }

    function save() {
      const { counts, bad } = readCounts();
      const floatCents = parse(floatInput.value);
      floatField.setError(floatCents === null ? 'Enter a valid amount.' : '');
      problem.textContent = bad ? 'Counts must be whole numbers.' : '';
      problem.hidden = !bad;
      if (bad || floatCents === null) return;
      const { record, replaced } = C.saveClose(state(), { date, floatCents, counts, note: note.value });
      SR.app.commit();
      toast(`${formatKey(date)} saved: ${record.overShortCents === 0 ? 'balanced' : `${record.overShortCents > 0 ? 'over' : 'short'} ${format(Math.abs(record.overShortCents))}`}`, {
        undo: () => {
          const list = state().closes;
          list.splice(list.indexOf(record), 1, ...(replaced ? [replaced] : []));
          SR.app.commit();
        },
      });
    }

    const dateInput = input({ type: 'date', value: date, max: dateKey(Date.now()), onChange: (e) => {
        const today = dateKey(Date.now());
        if (SR.util.isDateKey(e.target.value)) date = e.target.value > today ? today : e.target.value;
        refresh();
      },
    });
    content.append(
      h('div', { class: 'close-grid' },
        h('section', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('h2', null, 'Count the drawer')),
          h('div', { class: 'denom-grid' }, countsInputs.map(({ d, control, amount }) => h('div', { class: 'denom' },
            h('span', { class: 'denom-label' }, d.label), control, amount)))),
        h('section', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('h2', null, existing ? `Counted ${SR.util.formatTime(existing.at)}` : 'Day summary')),
          h('div', { class: 'stack' },
            h('div', { class: 'form-grid' }, field('Business day', dateInput), floatField),
            summaryEl,
            field('Note (optional)', note),
            problem,
            btn(existing ? 'Save new count' : 'Save count', { kind: 'primary', size: 'lg', onClick: save })))));
    recalc();
    renderHistory();
  }

  function deleteClose(record) {
    const list = state().closes;
    const index = list.indexOf(record);
    list.splice(index, 1);
    SR.app.commit();
    toast(`Count for ${formatKey(record.date)} deleted`, {
      undo: () => {
        list.splice(index, 0, record);
        SR.app.commit();
      },
    });
  }

  function renderHistory() {
    clear(historyEl);
    const rows = [...state().closes].reverse();
    historyEl.appendChild(h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, 'Past counts')),
      dataTable({
        caption: 'Past cash counts',
        testId: 'close-history',
        rows,
        pageSize: 14,
        empty: emptyState('No counts yet', 'Save a count above to start the record.'),
        columns: [
          { label: 'Day', render: (c) => h('button', { type: 'button', class: 'link', onClick: () => { date = c.date; refresh(); } }, formatKey(c.date)) },
          { label: 'Result', render: (c) => overShortPill(c.overShortCents) },
          { label: 'Expected', align: 'right', render: (c) => format(c.expectedCents) },
          { label: 'Counted', align: 'right', render: (c) => format(c.countedCents) },
          { label: 'Over or short', align: 'right', render: (c) => format(c.overShortCents) },
          { label: 'Note', render: (c) => h('span', { class: 'cell-clip' }, c.note) },
          { label: 'Actions', render: (c) => iconBtn('trash', `Delete count for ${formatKey(c.date)}`, () => deleteClose(c)) },
        ],
      })));
  }

  function refresh() {
    if (content) renderDay();
  }

  function mount(root) {
    if (!date) date = dateKey(Date.now());
    content = h('div', { class: 'stack-page' });
    historyEl = h('div');
    root.append(
      pageHeader('End of day', 'Count the cash, compare it with what the sales say should be there, and keep the record.'),
      content, historyEl);
    renderDay();
  }

  return { mount, unmount: () => { content = null; }, refresh };
})();
