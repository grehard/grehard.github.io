// Block-level Markdown parser. Works on {text, n} lines so that nested structures
// (quotes, lists) keep the source line number, which is what lets a task checkbox
// in the preview find and flip the right line in the note's source.
(function (MG) {
  'use strict';

  const { escapeHtml, render: renderInline } = MG.Inline;
  const MAX_DEPTH = 24;

  const RE = {
    blank: /^\s*$/,
    fence: /^( {0,3})(`{3,}|~{3,})[ \t]*([^`]*)$/,
    heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))??(?:[ \t]+#+)?[ \t]*$/,
    rule: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
    quote: /^ {0,3}> ?/,
    marker: /^( {0,3})([-*+]|\d{1,9}[.)])( +|$)(.*)$/,
    setext: /^ {0,3}(=+|-+)[ \t]*$/,
    tableDelimiter: /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/,
    task: /^\[([ xX])\](?:[ \t]+|$)(.*)$/,
  };

  function indentOf(text) {
    let i = 0;
    while (text[i] === ' ') i++;
    return i;
  }

  function isBlank(line) {
    return RE.blank.test(line.text);
  }

  function matchMarker(text) {
    const m = RE.marker.exec(text);
    if (!m) return null;
    const indent = m[1].length;
    const spaces = m[4] === '' || m[3].length > 4 ? 1 : m[3].length;
    const content = m[3].length > 4 ? ' '.repeat(m[3].length - 1) + m[4] : m[4];
    return {
      indent,
      ordered: /\d/.test(m[2]),
      bullet: m[2].slice(-1),
      start: parseInt(m[2], 10),
      contentIndent: indent + m[2].length + spaces,
      content,
      empty: !content.trim(),
    };
  }

  function canInterruptParagraph(text) {
    if (RE.fence.test(text) || RE.rule.test(text) || RE.quote.test(text)) return true;
    const heading = RE.heading.exec(text);
    if (heading) return true;
    const marker = matchMarker(text);
    return !!marker && !marker.empty && (!marker.ordered || marker.start === 1);
  }

  function splitRow(text) {
    let row = text.trim();
    if (row.startsWith('|')) row = row.slice(1);
    if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
    const cells = [];
    let current = '';
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '\\' && row[i + 1] === '|') {
        current += '|';
        i++;
      } else if (row[i] === '|') {
        cells.push(current.trim());
        current = '';
      } else {
        current += row[i];
      }
    }
    cells.push(current.trim());
    return cells;
  }

  function isTableStart(lines, i) {
    const header = lines[i];
    const delimiter = lines[i + 1];
    if (!delimiter || !header.text.includes('|') || !delimiter.text.includes('|')) return false;
    if (!RE.tableDelimiter.test(delimiter.text)) return false;
    return splitRow(header.text).length === splitRow(delimiter.text).length;
  }

  function alignmentOf(cell) {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return left ? 'left' : '';
  }

  function renderRow(cells, aligns, tag, ctx) {
    const html = aligns.map((align, c) => {
      const style = align ? ` style="text-align:${align}"` : '';
      return `<${tag}${style}>${renderInline(cells[c] || '', ctx)}</${tag}>`;
    });
    return `<tr>${html.join('')}</tr>`;
  }

  function parseTable(lines, start, ctx) {
    const aligns = splitRow(lines[start + 1].text).map(alignmentOf);
    const head = renderRow(splitRow(lines[start].text), aligns, 'th', ctx);
    const rows = [];
    let i = start + 2;
    while (i < lines.length && !isBlank(lines[i]) && !canInterruptParagraph(lines[i].text)) {
      rows.push(renderRow(splitRow(lines[i].text), aligns, 'td', ctx));
      i++;
    }
    const body = rows.length ? `<tbody>${rows.join('')}</tbody>` : '';
    return { html: `<div class="table-wrap"><table><thead>${head}</thead>${body}</table></div>`, next: i };
  }

  function parseFence(lines, start, match) {
    const indent = match[1].length;
    const fence = match[2];
    const language = (match[3].trim().split(/\s+/)[0] || '').replace(/[^\w+#.-]/g, '');
    const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`);
    const code = [];
    let i = start + 1;
    while (i < lines.length && !closing.test(lines[i].text)) {
      code.push(lines[i].text.replace(new RegExp(`^ {0,${indent}}`), ''));
      i++;
    }
    const cls = language ? ` class="language-${escapeHtml(language)}"` : '';
    const body = code.length ? `${escapeHtml(code.join('\n'))}\n` : '';
    return { html: `<pre><code${cls}>${body}</code></pre>`, next: i + 1 };
  }

  function parseIndentedCode(lines, start) {
    const code = [];
    let i = start;
    while (i < lines.length && (isBlank(lines[i]) || indentOf(lines[i].text) >= 4)) {
      code.push(lines[i].text.slice(4));
      i++;
    }
    while (code.length && !code[code.length - 1].trim()) code.pop();
    return { html: `<pre><code>${escapeHtml(code.join('\n'))}\n</code></pre>`, next: i };
  }

  function parseQuote(lines, start, ctx, depth) {
    const inner = [];
    let i = start;
    let lazyAllowed = false;
    while (i < lines.length) {
      const line = lines[i];
      if (RE.quote.test(line.text)) {
        const stripped = line.text.replace(RE.quote, '');
        inner.push({ text: stripped, n: line.n });
        lazyAllowed = !RE.blank.test(stripped);
      } else if (lazyAllowed && !isBlank(line) && !canInterruptParagraph(line.text)) {
        inner.push(line);
      } else {
        break;
      }
      i++;
    }
    return { html: `<blockquote>\n${parseBlocks(inner, ctx, { depth: depth + 1 })}\n</blockquote>`, next: i };
  }

  /** Collects the lines of one list item. Returns where it ended and whether blank lines separate its blocks. */
  function collectItem(lines, start, marker) {
    const item = [{ text: marker.content, n: lines[start].n }];
    const pendingBlanks = [];
    let inFence = RE.fence.test(marker.content);
    let hasInnerBlank = false;
    let i = start + 1;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (isBlank(line)) {
        pendingBlanks.push({ text: '', n: line.n });
        continue;
      }
      const indent = indentOf(line.text);
      // Beyond the spec: `  - child` under `1. parent` nests, because that is what writers intend.
      const belongs = indent >= marker.contentIndent || (indent > marker.indent && matchMarker(line.text));
      const lazy = !pendingBlanks.length && !isBlank(item[item.length - 1]) && !canInterruptParagraph(line.text) && !matchMarker(line.text);
      if (!belongs && !lazy) break;
      if (pendingBlanks.length && !inFence) hasInnerBlank = true;
      item.push(...pendingBlanks.splice(0));
      const text = belongs ? line.text.slice(Math.min(indent, marker.contentIndent)) : line.text;
      if (RE.fence.test(text)) inFence = !inFence;
      item.push({ text, n: line.n });
    }
    return { item, next: i, hasInnerBlank, endedOnBlank: pendingBlanks.length > 0 };
  }

  function sameList(a, b) {
    return a.ordered === b.ordered && a.bullet === b.bullet;
  }

  function plainText(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  function renderItem(entry, tight, ctx, depth) {
    const first = entry.lines[0];
    const task = RE.task.exec(first.text);
    if (!task) {
      return `<li>${parseBlocks(entry.lines, ctx, { tight, depth: depth + 1 })}</li>`;
    }
    const body = [{ text: task[2], n: first.n }, ...entry.lines.slice(1)];
    const inner = parseBlocks(body, ctx, { tight, depth: depth + 1 });
    const checked = task[1] === ' ' ? '' : ' checked';
    const label = escapeHtml(plainText(renderInline(task[2], ctx)).slice(0, 120)) || 'Task';
    return `<li class="task-item"><input type="checkbox" class="task-box" data-line="${first.n}" aria-label="${label}"${checked}> ${inner}</li>`;
  }

  function parseList(lines, start, ctx, depth) {
    const first = matchMarker(lines[start].text);
    const items = [];
    let loose = false;
    let i = start;
    while (i < lines.length) {
      const marker = matchMarker(lines[i].text);
      if (!marker || !sameList(marker, first) || RE.rule.test(lines[i].text)) break;
      const collected = collectItem(lines, i, marker);
      items.push({ lines: collected.item });
      if (collected.hasInnerBlank) loose = true;
      i = collected.next;
      const nextMarker = i < lines.length ? matchMarker(lines[i].text) : null;
      if (collected.endedOnBlank && nextMarker && sameList(nextMarker, first)) loose = true;
    }
    const tag = first.ordered ? 'ol' : 'ul';
    const startAttr = first.ordered && first.start !== 1 ? ` start="${first.start}"` : '';
    const body = items.map((entry) => renderItem(entry, !loose, ctx, depth)).join('\n');
    return { html: `<${tag}${startAttr}>\n${body}\n</${tag}>`, next: i };
  }

  function parseParagraph(lines, start, ctx, tight) {
    const collected = [];
    let i = start;
    for (; i < lines.length; i++) {
      const text = lines[i].text;
      if (RE.blank.test(text)) break;
      if (collected.length) {
        const setext = RE.setext.exec(text);
        if (setext) {
          const tag = setext[1][0] === '=' ? 'h1' : 'h2';
          return { html: `<${tag}>${renderInline(joinParagraph(collected), ctx)}</${tag}>`, next: i + 1 };
        }
        if (canInterruptParagraph(text) || isTableStart(lines, i)) break;
      }
      collected.push(text);
    }
    const inner = renderInline(joinParagraph(collected), ctx);
    return { html: tight ? inner : `<p>${inner}</p>`, next: i };
  }

  function joinParagraph(collected) {
    return collected.map((text) => text.replace(/^ +/, '')).join('\n').replace(/\s+$/, '');
  }

  function parseBlock(lines, i, ctx, opts) {
    const text = lines[i].text;
    const depth = opts.depth || 0;
    if (indentOf(text) >= 4) return parseIndentedCode(lines, i);
    const fence = RE.fence.exec(text);
    if (fence) return parseFence(lines, i, fence);
    const heading = RE.heading.exec(text);
    if (heading) {
      const tag = `h${heading[1].length}`;
      return { html: `<${tag}>${renderInline((heading[2] || '').trim(), ctx)}</${tag}>`, next: i + 1 };
    }
    if (RE.rule.test(text)) return { html: '<hr>', next: i + 1 };
    if (depth < MAX_DEPTH) {
      if (RE.quote.test(text)) return parseQuote(lines, i, ctx, depth);
      if (matchMarker(text)) return parseList(lines, i, ctx, depth);
    }
    if (isTableStart(lines, i)) return parseTable(lines, i, ctx);
    return parseParagraph(lines, i, ctx, opts.tight);
  }

  function parseBlocks(lines, ctx, opts) {
    const output = [];
    let i = 0;
    while (i < lines.length) {
      if (isBlank(lines[i])) {
        i++;
      } else {
        const block = parseBlock(lines, i, ctx, opts);
        output.push(block.html);
        i = block.next;
      }
    }
    return output.join('\n');
  }

  function expandLeadingTabs(text) {
    return text.replace(/^[ \t]+/, (ws) => ws.replace(/\t/g, '    '));
  }

  /**
   * Renders Markdown to HTML. Raw HTML in the source is shown as text, never parsed.
   * @param {string} source
   * @param {{wiki?: function(string): {href?: string, missing: boolean}}} [ctx]
   */
  function render(source, ctx) {
    const clean = String(source == null ? '' : source).replace(/\r\n?/g, '\n').replace(/\u0000/g, '\ufffd');
    const lines = clean.split('\n').map((text, n) => ({ text: expandLeadingTabs(text), n }));
    return parseBlocks(lines, ctx || {}, { depth: 0 });
  }

  MG.Markdown = { render };
})(window.MG = window.MG || {});
