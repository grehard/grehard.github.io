// Builds export files and hands them to the browser as Blob downloads.
(function () {
  const ns = window.Coinpath;
  const { Csv, Money, Ledger, Dates } = ns;

  const HEADERS = ['Date', 'Type', 'Account', 'To account', 'Category', 'Description', 'Notes', 'Amount'];

  /** CSV of the given transactions, oldest first. Expenses are negative. */
  function transactionsCsv(state, transactions) {
    const nameOf = (list, id) => { const item = list.find((x) => x.id === id); return item ? item.name : ''; };
    const rows = Ledger.chronological(transactions).map((tx) => [
      tx.date, tx.type, Csv.safeText(nameOf(state.accounts, tx.accountId)), Csv.safeText(nameOf(state.accounts, tx.toAccountId)),
      Csv.safeText(nameOf(state.categories, tx.categoryId)), Csv.safeText(tx.payee), Csv.safeText(tx.notes),
      Money.toDecimal(tx.type === 'expense' ? -tx.amountCents : tx.amountCents),
    ]);
    return Csv.stringify([HEADERS].concat(rows));
  }

  function backupJson(state) {
    return JSON.stringify(Object.assign({ app: 'coinpath', exportedOn: Dates.today() }, state), null, 2);
  }

  function download(filename, text, mimeType) {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCsv(state, transactions) {
    download('coinpath-transactions-' + Dates.today() + '.csv', transactionsCsv(state, transactions), 'text/csv;charset=utf-8');
  }

  function downloadJson(state) {
    download('coinpath-backup-' + Dates.today() + '.json', backupJson(state), 'application/json');
  }

  ns.Exporter = { transactionsCsv, backupJson, downloadCsv, downloadJson };
})();
