// Export to JSON and CSV, and strict JSON import.
(function (R) {
  'use strict';
  const D = R.Dates;
  const S = R.Streaks;
  const MAX_SHOWN_PROBLEMS = 5;

  function toJson(state) {
    return JSON.stringify({ app: 'rhythm', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
  }

  /** Quotes for CSV, and neutralises text a spreadsheet would otherwise run as a formula. */
  function csvCell(value) {
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function logRows(state) {
    const rows = [];
    for (const habit of state.habits) {
      const log = state.logs[habit.id] || {};
      for (const date of Object.keys(log)) {
        const entry = log[date];
        const status = entry.skipped ? 'skipped' : S.isComplete(habit, entry) ? 'done' : 'partial';
        const target = habit.target.type === 'count' ? habit.target.amount : 1;
        rows.push({ date, habit: habit.name, status, value: entry.skipped ? '' : entry.value, target, unit: habit.target.unit || '' });
      }
    }
    return rows;
  }

  /** One row per logged day. Each date's note goes on its first row, or a row of its own. */
  function toCsv(state) {
    const rows = logRows(state);
    const written = new Set();
    const dates = new Set([...rows.map((r) => r.date), ...Object.keys(state.notes)]);
    const lines = ['date,habit,status,value,target,unit,daily_note'];
    for (const date of [...dates].sort()) {
      const dayRows = rows.filter((r) => r.date === date);
      if (!dayRows.length) dayRows.push({ date, habit: '', status: '', value: '', target: '', unit: '' });
      for (const row of dayRows) {
        const note = written.has(date) ? '' : state.notes[date] || '';
        written.add(date);
        lines.push([row.date, row.habit, row.status, row.value, row.target, row.unit, note].map(csvCell).join(','));
      }
    }
    return lines.join('\r\n') + '\r\n';
  }

  /** Returns { state } for a usable file or { errors } listing what's wrong. Nothing partial gets through. */
  function parseImport(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      return { errors: ['This file is not valid JSON.'] };
    }
    if (!raw || typeof raw !== 'object' || raw.app !== 'rhythm') {
      return { errors: ['This file is not a Rhythm export.'] };
    }
    if (typeof raw.version !== 'number' || raw.version > 1) {
      return { errors: ['This file comes from a newer version of Rhythm, or has no version.'] };
    }
    const { state, problems } = R.Validate.cleanState(raw, D.today());
    if (!state || problems.length) {
      const shown = problems.slice(0, MAX_SHOWN_PROBLEMS);
      if (problems.length > shown.length) shown.push(`And ${problems.length - shown.length} more.`);
      return { errors: shown };
    }
    return { state };
  }

  function download(filename, mime, text) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  R.Transfer = { toJson, toCsv, parseImport, download };
})(window.Rhythm);
