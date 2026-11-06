// RFC 4180 reader and writer, with delimiter detection for the semicolon and tab
// files many banks produce.
(function () {
  const ns = window.Coinpath;

  // Counts delimiters outside quotes on the first line only, since descriptions
  // further down often contain stray commas.
  function detectDelimiter(text) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let quoted = false;
    for (const ch of text) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && (ch === '\n' || ch === '\r')) break;
      else if (!quoted && ch in counts) counts[ch] += 1;
    }
    return Object.keys(counts).reduce((best, key) => (counts[key] > counts[best] ? key : best), ',');
  }

  function parse(input) {
    const text = String(input).replace(/^﻿/, '');
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const endCell = () => { row.push(cell); cell = ''; };
    const endRow = () => {
      endCell();
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    };
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') quoted = true;
      else if (ch === delimiter) endCell();
      else if (ch === '\n') endRow();
      else if (ch !== '\r') cell += ch;
    }
    if (cell !== '' || row.length) endRow();
    return rows;
  }

  function quoteCell(value) {
    const text = String(value == null ? '' : value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function stringify(rows) {
    return rows.map((row) => row.map(quoteCell).join(',')).join('\r\n') + '\r\n';
  }

  /** Stops spreadsheets running a user's text as a formula when they open an export. */
  function safeText(value) {
    const text = String(value == null ? '' : value);
    return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
  }

  ns.Csv = { parse, stringify, safeText };
})();
