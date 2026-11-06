// The three-step CSV import: choose a file, map its columns, review before adding.
(function () {
  const ns = window.Coinpath;
  const { el, button, select, field, validate, segmented, uid } = ns.Dom;
  const { Csv, Importer, Overlays, Dates, Seed } = ns;

  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_ROWS = 20000;
  const STATUS_TEXT = { new: 'New', repeat: 'Repeat', duplicate: 'Duplicate', invalid: 'Not readable', skipped: 'Skipped' };
  const STATUS_CLASS = { new: 'status-ok', repeat: 'status-near', duplicate: 'status-near', invalid: 'status-over', skipped: 'status-muted' };

  function parseRows(text) {
    if (text.includes('\u0000')) throw new Error('This file is not plain text. Export a CSV from your bank and try again.');
    const rows = Csv.parse(text);
    if (!rows.length) throw new Error('No rows found. Choose a CSV file or paste its contents.');
    if (rows.length > MAX_ROWS) throw new Error('This file has more than ' + MAX_ROWS.toLocaleString('en-US') + ' rows. Split it and import each part.');
    return rows;
  }

  function headersFor(flow) {
    const width = flow.rows.reduce((max, row) => Math.max(max, row.length), 0);
    return Array.from({ length: width }, (unused, i) => {
      const label = flow.hasHeader && flow.rows[0][i] ? String(flow.rows[0][i]).trim() : '';
      return label || 'Column ' + (i + 1);
    });
  }

  const dataRowsOf = (flow) => (flow.hasHeader ? flow.rows.slice(1) : flow.rows);

  function applyGuess(flow) {
    flow.mapping = Importer.guessMapping(flow.hasHeader ? flow.rows[0] : []);
    const dates = dataRowsOf(flow).map((row) => row[flow.mapping.date] || '');
    flow.options.dateFormat = flow.hasHeader ? Importer.detectDateFormat(dates) : 'ymd';
    flow.options.amountMode = flow.mapping.amount < 0 && (flow.mapping.debit >= 0 || flow.mapping.credit >= 0) ? 'split' : 'signed';
  }

  function stepTitle(step, text) {
    return 'Import CSV: ' + text + ' (step ' + step + ' of 3)';
  }

  function stepSource(flow) {
    const { modal } = flow;
    modal.setTitle(stepTitle(1, 'choose a file'));
    modal.body.textContent = '';
    modal.footer.textContent = '';
    const fileInput = el('input', { type: 'file', accept: '.csv,.txt,text/csv,text/plain' });
    const pasted = el('textarea', { rows: 8, class: 'mono', placeholder: 'Date,Description,Amount', value: flow.text });
    const error = el('p', { class: 'form-error', role: 'alert', hidden: true });
    const showError = (message) => { error.textContent = message; error.hidden = !message; };

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) { showError('This file is larger than 10 MB.'); return; }
      file.text().then((text) => { pasted.value = text; showError(''); })
        .catch(() => showError('That file could not be read.'));
    });

    const useSample = () => { pasted.value = Seed.sampleStatement(ns.App.state, Dates.today()); showError(''); };

    const next = () => {
      try {
        flow.text = pasted.value;
        flow.rows = parseRows(pasted.value);
      } catch (err) {
        showError(err.message);
        return;
      }
      flow.hasHeader = true;
      applyGuess(flow);
      stepMapping(flow);
    };

    modal.body.append(
      field('CSV file', fileInput, { hint: 'Most banks offer a CSV download of your statement. Nothing leaves this browser.' }),
      field('Or paste CSV text', pasted),
      el('p', { class: 'muted-line' }, 'No statement to hand? ',
        el('button', { type: 'button', class: 'text-btn', onClick: useSample }, 'Use a sample statement'),
        ' that overlaps your recent transactions.'),
      error);
    modal.footer.append(button('Cancel', { onClick: modal.close }), button('Continue', { variant: 'btn-primary', onClick: next }));
    fileInput.focus();
  }

  function columnSelect(flow, key, headers) {
    const options = [{ value: '-1', label: 'Not in this file' }].concat(headers.map((h, i) => ({ value: String(i), label: h })));
    return select(options, String(flow.mapping[key]), { onChange: (event) => { flow.mapping[key] = Number(event.target.value); } });
  }

  function samplePreview(flow, headers) {
    const rows = dataRowsOf(flow).slice(0, 3);
    return el('div', { class: 'table-wrap preview-table' }, el('table', { class: 'data-table data-table-compact' },
      el('caption', { class: 'visually-hidden' }, 'First rows of your file'),
      el('thead', null, el('tr', null, headers.map((h) => el('th', { scope: 'col' }, h)))),
      el('tbody', null, rows.map((row) => el('tr', null, headers.map((h, i) => el('td', null, row[i] || '')))))));
  }

  function mappingProblems(flow, controls) {
    const { mapping, options } = flow;
    const needsAmount = options.amountMode === 'signed' && mapping.amount < 0;
    const needsSplit = options.amountMode === 'split' && mapping.debit < 0 && mapping.credit < 0;
    return [
      [controls.date, mapping.date < 0 ? 'Choose the column with the date.' : ''],
      [controls.payee, mapping.payee < 0 ? 'Choose the column with the description.' : ''],
      [controls.amount, needsAmount ? 'Choose the column with the amount.' : ''],
      [controls.debit, needsSplit ? 'Choose at least one of money out or money in.' : ''],
    ];
  }

  function stepMapping(flow) {
    const { modal, options } = flow;
    const state = ns.App.state;
    modal.setTitle(stepTitle(2, 'map columns'));
    modal.body.textContent = '';
    modal.footer.textContent = '';
    const headers = headersFor(flow);
    const controls = {};
    const makeColumnField = (key, label) => {
      controls[key] = columnSelect(flow, key, headers);
      return field(label, controls[key]);
    };

    const hasHeader = el('input', {
      type: 'checkbox', checked: flow.hasHeader,
      onChange: () => { flow.hasHeader = hasHeader.checked; applyGuess(flow); stepMapping(flow); },
    });
    const amountFields = el('div', { class: 'form-row' });
    const drawAmountFields = () => {
      amountFields.textContent = '';
      if (options.amountMode === 'split') {
        amountFields.append(makeColumnField('debit', 'Money out column'), makeColumnField('credit', 'Money in column'));
      } else {
        const positive = select([{ value: 'income', label: 'Money in' }, { value: 'expense', label: 'Money out' }], options.positiveIs, {
          onChange: (event) => { options.positiveIs = event.target.value; },
        });
        amountFields.append(makeColumnField('amount', 'Amount column'), field('Positive amounts are', positive, { hint: 'Credit card files often list purchases as positive.' }));
      }
    };
    drawAmountFields();

    const amountMode = segmented('How amounts appear', uid('mode'), [
      { value: 'signed', label: 'One amount column' }, { value: 'split', label: 'Separate in and out columns' },
    ], options.amountMode, (mode) => { options.amountMode = mode; drawAmountFields(); });
    const dateFormat = select(Importer.DATE_FORMATS.map((f) => ({ value: f.key, label: f.label })), options.dateFormat, {
      onChange: (event) => { options.dateFormat = event.target.value; },
    });
    const account = select(ns.TxForm.accountOptions(state), options.accountId, { onChange: (event) => { options.accountId = event.target.value; } });
    options.accountId = account.value;

    const dateField = makeColumnField('date', 'Date column');
    controls.date.addEventListener('change', () => {
      options.dateFormat = Importer.detectDateFormat(dataRowsOf(flow).map((row) => row[flow.mapping.date] || ''));
      dateFormat.value = options.dateFormat;
    });
    const payeeField = makeColumnField('payee', 'Description column');
    modal.body.append(
      samplePreview(flow, headers),
      el('label', { class: 'check-line' }, hasHeader, 'First row holds column names'),
      el('div', { class: 'form-row' }, dateField, field('Date format', dateFormat)),
      el('div', { class: 'form-row' }, payeeField, field('Import into account', account, { hint: 'Used for rows with no matching account column.' })),
      amountMode,
      amountFields,
      el('div', { class: 'form-row form-row-3' }, makeColumnField('category', 'Category column'), makeColumnField('notes', 'Notes column'), makeColumnField('account', 'Account column')),
      el('div', { class: 'form-row form-row-3' }, makeColumnField('type', 'Type column')));

    const next = () => {
      if (!validate(mappingProblems(flow, controls).filter((check) => check[0]))) return;
      flow.preview = Importer.buildPreview(dataRowsOf(flow), flow.hasHeader ? 2 : 1, flow.mapping, options, state);
      stepReview(flow);
    };
    modal.footer.append(button('Back', { onClick: () => stepSource(flow) }), button('Review rows', { variant: 'btn-primary', onClick: next }));
    modal.body.scrollTop = 0;
    (controls.date || modal.body).focus();
  }

  function summaryLine(counts) {
    const parts = [counts.fresh + ' new'];
    if (counts.repeat) parts.push(counts.repeat + ' repeated in this file');
    parts.push(counts.duplicate + (counts.duplicate === 1 ? ' duplicate' : ' duplicates'));
    if (counts.invalid) parts.push(counts.invalid + ' not readable');
    if (counts.skipped) parts.push(counts.skipped + ' skipped');
    return parts.join(', ');
  }

  function reviewRow(row, onToggle) {
    const state = ns.App.state;
    const selectable = row.status !== 'invalid' && row.status !== 'skipped';
    const category = state.categories.find((c) => c.id === row.categoryId);
    const label = 'Import row ' + row.rowNumber + ': ' + (row.payee || 'no description');
    return el('tr', { 'data-import-row': row.rowNumber, 'data-status': row.status, class: row.include ? '' : 'row-excluded' },
      el('td', null, selectable && el('input', { type: 'checkbox', checked: row.include, 'aria-label': label, onChange: (event) => { row.include = event.target.checked; onToggle(event.target.closest('tr'), row); } })),
      el('td', { class: 'nowrap' }, row.date ? Dates.format(row.date) : row.rawDate),
      el('td', { class: 'cell-desc-import' }, row.payee),
      el('td', null, selectable ? (category ? category.name : 'Uncategorized') : ''),
      el('td', { class: 'num nowrap' }, Number.isInteger(row.signedCents) ? ns.App.money(row.signedCents, { signed: true }) : ''),
      el('td', null,
        el('span', { class: 'status ' + STATUS_CLASS[row.status] }, STATUS_TEXT[row.status]),
        row.problem && el('div', { class: 'row-notes' }, row.problem)));
  }

  function stepReview(flow) {
    const { modal } = flow;
    modal.setTitle(stepTitle(3, 'review'));
    modal.body.textContent = '';
    modal.footer.textContent = '';
    const summary = el('p', { class: 'import-summary', 'aria-live': 'polite', 'data-import-summary': '' });
    const confirm = button('', { variant: 'btn-primary', onClick: () => finish(flow) });
    const refresh = () => {
      const counts = Importer.summarize(flow.preview);
      summary.textContent = summaryLine(counts);
      confirm.textContent = 'Import ' + counts.selected + (counts.selected === 1 ? ' transaction' : ' transactions');
      confirm.disabled = counts.selected === 0;
    };
    const onToggle = (tr, row) => { tr.classList.toggle('row-excluded', !row.include); refresh(); };
    modal.body.append(summary,
      el('p', { class: 'muted-line' }, 'Duplicates match a transaction already in the same account on date, amount and description. They stay unticked unless you tick them.'),
      el('div', { class: 'table-wrap' }, el('table', { class: 'data-table data-table-compact import-table' },
        el('thead', null, el('tr', null, ['Import', 'Date', 'Description', 'Category', 'Amount', 'Status'].map((h, i) => el('th', { scope: 'col', class: i === 4 ? 'num' : '' }, h)))),
        el('tbody', null, flow.preview.map((row) => reviewRow(row, onToggle))))));
    modal.footer.append(button('Back', { onClick: () => stepMapping(flow) }), confirm);
    refresh();
    modal.body.scrollTop = 0;
    confirm.focus();
  }

  function finish(flow) {
    let added = 0;
    flow.modal.close();
    ns.App.commit((state) => { added = Importer.commit(flow.preview, state); }, {
      toast: () => 'Imported ' + added + (added === 1 ? ' transaction' : ' transactions'),
      undo: true,
    });
  }

  function open() {
    const modal = Overlays.openModal({ title: 'Import CSV', wide: true });
    if (!ns.App.state.accounts.length) {
      modal.body.appendChild(el('p', null, 'Add an account first so imported rows have somewhere to go.'));
      modal.footer.append(button('Close', { onClick: modal.close }));
      return;
    }
    stepSource({ modal, text: '', rows: [], hasHeader: true, mapping: {}, options: { positiveIs: 'income', amountMode: 'signed', dateFormat: 'ymd', accountId: ns.App.state.accounts[0].id }, preview: [] });
  }

  ns.ImportFlow = { open };
})();
