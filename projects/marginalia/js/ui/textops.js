// Formatting commands as pure functions on {value, start, end}, kept free of the DOM.
(function (MG) {
  'use strict';

  const LIST_LINE = /^(\s*(?:>\s?)*)((?:[-*+]|\d+[.)]) +)(\[[ xX]\] +)?(.*)$/;

  function lineBounds(value, start, end) {
    const from = value.lastIndexOf('\n', start - 1) + 1;
    const stop = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const next = value.indexOf('\n', stop);
    return { from, to: next < 0 ? value.length : next };
  }

  /** Adds or removes a wrapper such as ** around the selection. */
  function toggleWrap(s, marker) {
    const { value, start, end } = s;
    const len = marker.length;
    const selected = value.slice(start, end);
    if (selected.length >= 2 * len && selected.startsWith(marker) && selected.endsWith(marker)) {
      const inner = selected.slice(len, -len);
      return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
    }
    if (value.slice(start - len, start) === marker && value.slice(end, end + len) === marker) {
      return { value: value.slice(0, start - len) + selected + value.slice(end + len), start: start - len, end: end - len };
    }
    return { value: value.slice(0, start) + marker + selected + marker + value.slice(end), start: start + len, end: end + len };
  }

  /** Applies `transform(lines)` to every line touched by the selection and reselects them. */
  function mapLines(s, transform) {
    const { from, to } = lineBounds(s.value, s.start, s.end);
    const replaced = transform(s.value.slice(from, to).split('\n')).join('\n');
    const value = s.value.slice(0, from) + replaced + s.value.slice(to);
    if (s.start === s.end) {
      const caret = from + replaced.length;
      return { value, start: caret, end: caret };
    }
    return { value, start: from, end: from + replaced.length };
  }

  function togglePrefix(s, prefix, pattern) {
    return mapLines(s, (lines) => {
      const filled = lines.filter((line) => line.trim());
      const allHave = filled.length > 0 && filled.every((line) => pattern.test(line));
      return lines.map((line) => {
        if (!line.trim()) return line;
        return allHave ? line.replace(pattern, '') : prefix + line.replace(ANY_LINE_PREFIX, '');
      });
    });
  }

  // A line can only be one kind of block, so applying a new prefix replaces the old one.
  const ANY_LINE_PREFIX = /^(?:#{1,6} +|> ?|[-*+] +\[[ xX]\] +|[-*+] +|\d+[.)] +)/;

  function toggleHeading(s, level) {
    const prefix = `${'#'.repeat(level)} `;
    return togglePrefix(s, prefix, new RegExp(`^#{${level}} +`));
  }

  function toggleQuote(s) {
    return togglePrefix(s, '> ', /^> ?/);
  }

  function toggleBullets(s) {
    return togglePrefix(s, '- ', /^[-*+] +(?!\[[ xX]\] )/);
  }

  function toggleTasks(s) {
    return togglePrefix(s, '- [ ] ', /^[-*+] +\[[ xX]\] +/);
  }

  function toggleNumbers(s) {
    return mapLines(s, (lines) => {
      const filled = lines.filter((line) => line.trim());
      const allHave = filled.length > 0 && filled.every((line) => /^\d+[.)] +/.test(line));
      let n = 0;
      return lines.map((line) => {
        if (!line.trim()) return line;
        if (allHave) return line.replace(/^\d+[.)] +/, '');
        n++;
        return `${n}. ${line.replace(ANY_LINE_PREFIX, '')}`;
      });
    });
  }

  function insertLink(s) {
    const { value, start, end } = s;
    const text = value.slice(start, end) || 'link text';
    const url = 'https://';
    const insert = `[${text}](${url})`;
    const urlStart = start + text.length + 3;
    return { value: value.slice(0, start) + insert + value.slice(end), start: urlStart, end: urlStart + url.length };
  }

  /** Puts `text` on its own lines, separated from its neighbours by a blank line. */
  function insertBlock(s, text, selectFrom, selectLength) {
    const { value, start, end } = s;
    const before = value.slice(0, start);
    const after = value.slice(end);
    let lead = '';
    if (before && !before.endsWith('\n\n')) lead = before.endsWith('\n') ? '\n' : '\n\n';
    let trail = '';
    if (after && !after.startsWith('\n\n')) trail = after.startsWith('\n') ? '\n' : '\n\n';
    const at = before.length + lead.length + selectFrom;
    return { value: before + lead + text + trail + after, start: at, end: at + selectLength };
  }

  function insertCodeBlock(s) {
    const selected = s.value.slice(s.start, s.end) || 'code';
    return insertBlock(s, `\`\`\`\n${selected}\n\`\`\``, 4, selected.length);
  }

  function insertTable(s) {
    const template = '| Column | Column |\n| --- | --- |\n| Cell | Cell |';
    return insertBlock(s, template, 2, 6);
  }

  function insertWikiOpener(s) {
    const { value, start, end } = s;
    const selected = value.slice(start, end);
    if (selected) {
      const wrapped = `[[${selected}]]`;
      const caret = start + wrapped.length;
      return { value: value.slice(0, start) + wrapped + value.slice(end), start: caret, end: caret };
    }
    return { value: `${value.slice(0, start)}[[${value.slice(end)}`, start: start + 2, end: start + 2 };
  }

  function nextMarker(marker) {
    const numbered = /^(\d+)([.)])( +)$/.exec(marker);
    return numbered ? `${parseInt(numbered[1], 10) + 1}${numbered[2]}${numbered[3]}` : marker;
  }

  /** Enter inside a list continues it; Enter on an empty item ends it. Returns null if not in a list. */
  function continueList(s) {
    const { value, start, end } = s;
    if (start !== end) return null;
    const { from, to } = lineBounds(value, start, end);
    const line = value.slice(from, to);
    const match = LIST_LINE.exec(line);
    if (!match || start < from + match[1].length + match[2].length) return null;
    const [, indent, marker, box, content] = match;
    if (!content.trim()) {
      return { value: value.slice(0, from) + indent + value.slice(to), start: from + indent.length, end: from + indent.length };
    }
    const insert = `\n${indent}${nextMarker(marker)}${box ? '[ ] ' : ''}`;
    const caret = start + insert.length;
    return { value: value.slice(0, start) + insert + value.slice(end), start: caret, end: caret };
  }

  /** Tab or Shift+Tab on list lines changes nesting. Returns null outside a list so Tab can move focus. */
  function indentList(s, outdent) {
    const { from, to } = lineBounds(s.value, s.start, s.end);
    const lines = s.value.slice(from, to).split('\n');
    if (!lines.every((line) => !line.trim() || LIST_LINE.test(line))) return null;
    const changed = lines.map((line) => (outdent ? line.replace(/^ {1,2}/, '') : (line.trim() ? `  ${line}` : line)));
    const replaced = changed.join('\n');
    const value = s.value.slice(0, from) + replaced + s.value.slice(to);
    const delta = changed[0].length - lines[0].length;
    if (s.start === s.end) {
      const caret = Math.max(from, s.start + delta);
      return { value, start: caret, end: caret };
    }
    return { value, start: from, end: from + replaced.length };
  }

  MG.TextOps = {
    toggleWrap, toggleHeading, toggleQuote, toggleBullets, toggleTasks, toggleNumbers,
    insertLink, insertCodeBlock, insertTable, insertWikiOpener, continueList, indentList,
  };
})(window.MG = window.MG || {});
