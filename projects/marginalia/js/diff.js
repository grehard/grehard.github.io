// Line diff for the version history (longest common subsequence).
(function (MG) {
  'use strict';

  const MAX_TABLE_CELLS = 4000000; // Above this, show a whole-block replace rather than stall the UI.

  function lcsDiff(a, b) {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const table = new Array(rows);
    for (let i = 0; i < rows; i++) table[i] = new Uint32Array(cols);
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        out.push({ type: 'same', text: a[i] });
        i++; j++;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        out.push({ type: 'del', text: a[i++] });
      } else {
        out.push({ type: 'add', text: b[j++] });
      }
    }
    while (i < a.length) out.push({ type: 'del', text: a[i++] });
    while (j < b.length) out.push({ type: 'add', text: b[j++] });
    return out;
  }

  /** @returns {Array<{type: 'same'|'add'|'del', text: string}>} lines turning `before` into `after` */
  function diffLines(before, after) {
    const a = String(before).split('\n');
    const b = String(after).split('\n');
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    const midA = a.slice(start, endA);
    const midB = b.slice(start, endB);
    const middle = midA.length * midB.length > MAX_TABLE_CELLS
      ? [...midA.map((text) => ({ type: 'del', text })), ...midB.map((text) => ({ type: 'add', text }))]
      : lcsDiff(midA, midB);
    const same = (text) => ({ type: 'same', text });
    return [...a.slice(0, start).map(same), ...middle, ...a.slice(endA).map(same)];
  }

  MG.Diff = { diffLines };
})(window.MG = window.MG || {});
