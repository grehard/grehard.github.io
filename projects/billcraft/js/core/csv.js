// RFC 4180 CSV writer. Text cells that a spreadsheet would run as a formula are prefixed with an apostrophe.
(function () {
  const NUMERIC = /^-?\d+(\.\d+)?$/;

  function cell(value) {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text) && !NUMERIC.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  const build = (header, rows) => [header].concat(rows).map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';

  window.BC.csv = { build };
})();
