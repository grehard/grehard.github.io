// Turns parsed CSV rows into transactions: column guessing, date formats, amount
// conventions, and duplicate detection against what's already in the ledger.
(function () {
  const ns = window.Coinpath;
  const { Money, Dates } = ns;

  const FIELDS = [
    { key: 'date', label: 'Date', pattern: /^(posted |posting |transaction |trans\.? |value |booking )?date$|^posted$/i },
    { key: 'payee', label: 'Description', pattern: /desc|details?|payee|merchant|narrative|particulars|^name$/i },
    { key: 'amount', label: 'Amount', pattern: /^(transaction )?(amount|amt|value|sum)\b/i },
    { key: 'debit', label: 'Money out', pattern: /debit|withdrawal|money out|paid out/i },
    { key: 'credit', label: 'Money in', pattern: /credit|deposit|money in|paid in/i },
    { key: 'category', label: 'Category', pattern: /categor/i },
    { key: 'notes', label: 'Notes', pattern: /note|memo|reference/i },
    { key: 'account', label: 'Account', pattern: /^account$|^from account$/i },
    { key: 'type', label: 'Type', pattern: /^(transaction )?type$/i },
  ];

  const DATE_FORMATS = [
    { key: 'ymd', label: 'Year-month-day (2026-03-31)', pattern: /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/, order: [1, 2, 3] },
    { key: 'mdy', label: 'Month/day/year (03/31/2026)', pattern: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/, order: [3, 1, 2] },
    { key: 'dmy', label: 'Day/month/year (31/03/2026)', pattern: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/, order: [3, 2, 1] },
  ];

  /** Maps each field to a column index, or -1. Each column is claimed at most once. */
  function guessMapping(headers) {
    const mapping = {};
    const taken = new Set();
    FIELDS.forEach((field) => {
      const index = headers.findIndex((header, i) => !taken.has(i) && field.pattern.test(String(header).trim()));
      mapping[field.key] = index;
      if (index >= 0) taken.add(index);
    });
    return mapping;
  }

  function parseDate(text, formatKey) {
    const format = DATE_FORMATS.find((f) => f.key === formatKey);
    const match = format && format.pattern.exec(String(text).trim());
    if (!match) return null;
    const yearText = match[format.order[0]];
    const year = yearText.length <= 2 ? 2000 + Number(yearText) : Number(yearText);
    const iso = Dates.make(year, Number(match[format.order[1]]), Number(match[format.order[2]]));
    return Dates.isValid(iso) ? iso : null;
  }

  /** The format that reads the most values. Ties go to the earlier format in the list. */
  function detectDateFormat(values) {
    let best = DATE_FORMATS[0].key;
    let bestScore = -1;
    DATE_FORMATS.forEach((format) => {
      const score = values.filter((value) => parseDate(value, format.key)).length;
      if (score > bestScore) { best = format.key; bestScore = score; }
    });
    return best;
  }

  const cellOf = (row, index) => (index >= 0 && index < row.length ? String(row[index]).trim() : '');

  // Returns a signed amount, positive for money in, or an error message.
  function readAmount(row, mapping, options) {
    if (options.amountMode === 'split') {
      const debit = cellOf(row, mapping.debit);
      const credit = cellOf(row, mapping.credit);
      const debitCents = debit ? Money.parse(debit) : 0;
      const creditCents = credit ? Money.parse(credit) : 0;
      if (debitCents === null || creditCents === null) return { error: 'Amount is not a number' };
      return { cents: Math.abs(creditCents) - Math.abs(debitCents) };
    }
    const cents = Money.parse(cellOf(row, mapping.amount));
    if (cents === null) return { error: 'Amount is not a number' };
    return { cents: options.positiveIs === 'expense' ? -cents : cents };
  }

  function findByName(list, name) {
    const wanted = name.toLowerCase();
    return wanted ? list.find((item) => item.name.toLowerCase() === wanted) : undefined;
  }

  function firstProblem(date, amount, payee) {
    if (!date) return 'Date not readable';
    if (amount.error) return amount.error;
    if (!amount.cents) return 'Amount is zero';
    if (Math.abs(amount.cents) > Money.MAX_CENTS) return 'Amount is too large';
    return payee ? '' : 'Description is empty';
  }

  function readRow(row, rowNumber, mapping, options, state) {
    const payee = cellOf(row, mapping.payee).slice(0, 120);
    const rawDate = cellOf(row, mapping.date);
    const base = { rowNumber, payee, rawDate, include: false, status: 'new', problem: '' };
    if (mapping.type >= 0 && /transfer/i.test(cellOf(row, mapping.type))) {
      return Object.assign(base, { status: 'skipped', problem: 'Transfers restore from a JSON backup' });
    }
    const amount = readAmount(row, mapping, options);
    const date = parseDate(rawDate, options.dateFormat);
    const problem = firstProblem(date, amount, payee);
    const account = findByName(state.accounts, cellOf(row, mapping.account))
      || state.accounts.find((a) => a.id === options.accountId);
    Object.assign(base, { date, signedCents: amount.cents, accountId: account ? account.id : null, notes: cellOf(row, mapping.notes).slice(0, 300) });
    if (problem) return Object.assign(base, { status: 'invalid', problem });
    base.type = amount.cents > 0 ? 'income' : 'expense';
    const category = findByName(state.categories.filter((c) => c.kind === base.type), cellOf(row, mapping.category));
    base.categoryId = category ? category.id : null;
    base.include = true;
    return base;
  }

  const normalize = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const keyOf = (accountId, date, signed, payee) => [accountId, date, signed, normalize(payee)].join('|');

  // Counts rather than a set: a ledger with two identical coffees absorbs two
  // matching rows and a third is genuinely new. That keeps a re-imported statement
  // exact while still allowing real repeat purchases.
  function existingCounts(state) {
    const counts = new Map();
    state.transactions.forEach((tx) => {
      if (tx.type === 'transfer') return;
      const signed = tx.type === 'income' ? tx.amountCents : -tx.amountCents;
      const key = keyOf(tx.accountId, tx.date, signed, tx.payee);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }

  /** Marks rows found in the ledger as duplicates, unticked by default, and flags repeats within the file. */
  function markDuplicates(rows, state) {
    const counts = existingCounts(state);
    const seenInFile = new Map();
    rows.forEach((row) => {
      if (row.status !== 'new') return;
      const key = keyOf(row.accountId, row.date, row.signedCents, row.payee);
      if (counts.get(key) > 0) {
        counts.set(key, counts.get(key) - 1);
        Object.assign(row, { status: 'duplicate', include: false, problem: 'Already in this account' });
      } else if (seenInFile.has(key)) {
        Object.assign(row, { status: 'repeat', problem: 'Same as row ' + seenInFile.get(key) });
      } else {
        seenInFile.set(key, row.rowNumber);
      }
    });
    return rows;
  }

  /** Reads all data rows and classifies each one. firstRowNumber is the first row's position in the file. */
  function buildPreview(dataRows, firstRowNumber, mapping, options, state) {
    const rows = dataRows.map((row, i) => readRow(row, firstRowNumber + i, mapping, options, state));
    return markDuplicates(rows, state);
  }

  function summarize(rows) {
    const count = (status) => rows.filter((row) => row.status === status).length;
    return {
      fresh: count('new'), repeat: count('repeat'), duplicate: count('duplicate'),
      invalid: count('invalid'), skipped: count('skipped'), selected: rows.filter((row) => row.include).length,
    };
  }

  /** Adds the included rows to the state and returns how many were added. */
  function commit(rows, state) {
    let added = 0;
    rows.forEach((row) => {
      if (!row.include) return;
      state.transactions.push({
        id: ns.Store.newId('t'), seq: state.nextSeq, type: row.type, date: row.date, amountCents: Math.abs(row.signedCents),
        accountId: row.accountId, toAccountId: null, categoryId: row.categoryId, payee: row.payee, notes: row.notes, recurringId: null,
      });
      state.nextSeq += 1;
      added += 1;
    });
    return added;
  }

  ns.Importer = { FIELDS, DATE_FORMATS, guessMapping, detectDateFormat, parseDate, buildPreview, summarize, commit };
})();
