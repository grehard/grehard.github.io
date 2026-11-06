// CSV export following RFC 4180, plus a guard against spreadsheet formula injection.
FL.csv = (function () {
  const { allFields, isQuestion, isEmpty } = FL.fields;
  const { localStamp, formatBytes } = FL.util;
  const BOM = '﻿'; // tells Excel the file is UTF-8
  const FORMULA_START = /^[=+\-@\t\r]/;

  function escapeCell(value) {
    const text = String(value);
    return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  /**
   * A respondent could type =HYPERLINK(...) to attack whoever opens the export.
   * The leading apostrophe makes spreadsheets treat it as text.
   * Numbers and phone fields are exempt because -5 and +1 555 0100 are legitimate.
   */
  function guardFormula(text) {
    return FORMULA_START.test(text) ? `'${text}` : text;
  }

  function answerCell(field, value) {
    if (isEmpty(value)) return '';
    if (Array.isArray(value)) return guardFormula(value.join('; '));
    if (field.type === 'file') return guardFormula(`${value.name} (${formatBytes(value.size)})`);
    if (field.type === 'number' || field.type === 'phone') return String(value);
    return guardFormula(String(value));
  }

  function responsesToCsv(form, responses) {
    const questions = allFields(form).filter(isQuestion);
    const header = ['Submitted'].concat(questions.map((field) => field.label));
    const rows = responses.map((response) => [localStamp(response.submittedAt)].concat(
      questions.map((field) => answerCell(field, response.answers[field.id]))
    ));
    const lines = [header].concat(rows).map((row) => row.map(escapeCell).join(','));
    return `${BOM}${lines.join('\r\n')}\r\n`;
  }

  return { escapeCell, guardFormula, responsesToCsv };
})();
