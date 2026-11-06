// Pure logic for the note network: wiki links, tags, backlinks, rename rewriting,
// task toggling, the graph model and Markdown-to-plain-text conversion.
(function (MG) {
  'use strict';

  const WIKI_LINK = /\[\[([^\[\]|\n]+)(?:\|([^\[\]\n]+))?\]\]/g;
  const LIST_MARKER = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s/;
  const FENCE_LINE = /^[ >]*(?:(?:[-*+]|\d+[.)]) +)*(`{3,}|~{3,})/;
  const TITLE_MAX = 120;

  function normTitle(title) {
    return String(title).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  /** Why a title is unusable, or '' if fine. Brackets and pipes would break [[link]] syntax. */
  function titleProblem(title) {
    const clean = String(title).trim();
    if (!clean) return 'Give the note a title.';
    if (/[\[\]|]/.test(clean)) return 'Titles can\'t contain [ ] or |, because those characters end a wiki link.';
    if (clean.length > TITLE_MAX) return `Titles can be at most ${TITLE_MAX} characters.`;
    return '';
  }

  function blankOut(text) {
    return text.replace(/[^\n]/g, ' ');
  }

  function maskFencesAndIndentedCode(body) {
    let fence = null;
    let inList = false;
    let previousBlank = true;
    let previousCode = false;
    return body.split('\n').map((line) => {
      const blank = !line.trim();
      let masked = line;
      let isCode = false;
      const fenceMatch = FENCE_LINE.exec(line);
      if (fence) {
        const closes = fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length;
        if (closes) fence = null;
        masked = blankOut(line);
      } else if (fenceMatch) {
        fence = fenceMatch[1];
        masked = blankOut(line);
      } else if (!blank && /^( {4}|\t)/.test(line) && !inList && (previousBlank || previousCode)) {
        masked = blankOut(line);
        isCode = true;
      }
      if (LIST_MARKER.test(line)) inList = true;
      else if (!blank && previousBlank && !/^\s/.test(line)) inList = false;
      if (!blank) previousCode = isCode;
      previousBlank = blank;
      return masked;
    }).join('\n');
  }

  function maskCodeSpans(text) {
    let out = '';
    let i = 0;
    while (i < text.length) {
      if (text[i] === '\\') {
        out += text.slice(i, i + 2);
        i += 2;
      } else if (text[i] === '`') {
        let ticks = 1;
        while (text[i + ticks] === '`') ticks++;
        const close = findClosingTicks(text, i + ticks, ticks);
        if (close < 0) {
          out += text.slice(i, i + ticks);
          i += ticks;
        } else {
          out += blankOut(text.slice(i, close + ticks));
          i = close + ticks;
        }
      } else {
        out += text[i];
        i++;
      }
    }
    return out;
  }

  function findClosingTicks(text, from, ticks) {
    const paragraphEnd = text.indexOf('\n\n', from);
    const limit = paragraphEnd < 0 ? text.length : paragraphEnd;
    let pos = from;
    while (pos < limit) {
      const at = text.indexOf('`', pos);
      if (at < 0 || at >= limit) return -1;
      let run = 1;
      while (text[at + run] === '`') run++;
      if (run === ticks) return at;
      pos = at + run;
    }
    return -1;
  }

  /** Same-length copy of the body with code blanked, so offsets still line up with the source. */
  function maskCode(body) {
    return maskCodeSpans(maskFencesAndIndentedCode(String(body)));
  }

  /** Every wiki link outside code: {target, alias, index, length}. */
  function extractWikiLinks(body) {
    const masked = maskCode(body);
    const links = [];
    WIKI_LINK.lastIndex = 0;
    let m;
    while ((m = WIKI_LINK.exec(masked))) {
      if (masked[m.index - 1] === '\\' || !m[1].trim()) continue;
      links.push({ target: m[1].trim(), alias: m[2] ? m[2].trim() : '', index: m.index, length: m[0].length });
    }
    return links;
  }

  /** Lowercased #tags in first-seen order, ignoring code, links and URLs. */
  function extractTags(body) {
    const masked = maskCode(body)
      .replace(WIKI_LINK, blankOut)
      .replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, blankOut)
      .replace(/https?:\/\/\S+/g, blankOut);
    const seen = new Set();
    const tagPattern = /(^|[\s(])#(\p{L}[\p{L}\p{N}_/-]*)/gu;
    let m;
    while ((m = tagPattern.exec(masked))) {
      seen.add(m[2].replace(/[/-]+$/, '').toLowerCase());
    }
    return [...seen];
  }

  /**
   * Points every [[oldTitle]] at newTitle, keeping aliases and leaving code alone.
   * @returns {{body: string, count: number}}
   */
  function rewriteLinks(body, oldTitle, newTitle) {
    const wanted = normTitle(oldTitle);
    const hits = extractWikiLinks(body).filter((link) => normTitle(link.target) === wanted);
    let out = body;
    for (let i = hits.length - 1; i >= 0; i--) {
      const { index, length, alias } = hits[i];
      const replacement = alias ? `[[${newTitle}|${alias}]]` : `[[${newTitle}]]`;
      out = out.slice(0, index) + replacement + out.slice(index + length);
    }
    return { body: out, count: hits.length };
  }

  function lineAt(body, index) {
    const start = body.lastIndexOf('\n', index - 1) + 1;
    const end = body.indexOf('\n', index);
    return body.slice(start, end < 0 ? body.length : end);
  }

  /** Notes linking to `title`, most links first: [{note, count, contexts: [plain text line]}]. */
  function backlinks(title, notes) {
    const wanted = normTitle(title);
    const results = [];
    notes.forEach((note) => {
      if (normTitle(note.title) === wanted) return;
      const hits = extractWikiLinks(note.body).filter((link) => normTitle(link.target) === wanted);
      if (!hits.length) return;
      const contexts = [...new Set(hits.map((hit) => linePlain(lineAt(note.body, hit.index))))];
      results.push({ note, count: hits.length, contexts });
    });
    return results.sort((a, b) => b.count - a.count || a.note.title.localeCompare(b.note.title));
  }

  /** Distinct outgoing links of a note: [{title, label}] in document order. */
  function outgoing(body) {
    const seen = new Map();
    extractWikiLinks(body).forEach((link) => {
      const key = normTitle(link.target);
      if (!seen.has(key)) seen.set(key, link.target);
    });
    return [...seen.values()];
  }

  /**
   * Graph model of the live notes. Edges are undirected and unique; self-links are dropped.
   * Unresolved link targets become `ghost` nodes.
   */
  function buildGraph(notes, options) {
    const opts = Object.assign({ ghosts: true, orphans: true }, options);
    const nodes = new Map();
    notes.forEach((note) => nodes.set(normTitle(note.title), { key: normTitle(note.title), title: note.title, id: note.id, ghost: false, degree: 0 }));
    const edges = new Map();
    notes.forEach((note) => {
      const from = normTitle(note.title);
      outgoing(note.body).forEach((target) => {
        const to = normTitle(target);
        if (to === from) return;
        if (!nodes.has(to)) {
          if (!opts.ghosts) return;
          nodes.set(to, { key: to, title: target, id: null, ghost: true, degree: 0 });
        }
        const edgeKey = from < to ? `${from}\n${to}` : `${to}\n${from}`;
        if (!edges.has(edgeKey)) edges.set(edgeKey, { source: from, target: to });
      });
    });
    edges.forEach((edge) => {
      nodes.get(edge.source).degree++;
      nodes.get(edge.target).degree++;
    });
    const kept = [...nodes.values()].filter((node) => opts.orphans || node.degree > 0);
    return { nodes: kept, edges: [...edges.values()] };
  }

  /** Flips the checkbox on a source line. Returns the body unchanged if the line has no task. */
  function toggleTask(body, line) {
    const lines = String(body).split('\n');
    if (line < 0 || line >= lines.length) return body;
    lines[line] = lines[line].replace(
      /^([\s>]*(?:(?:[-*+]|\d+[.)])\s+)+\[)([ xX])(\])/,
      (m, before, mark, after) => before + (mark === ' ' ? 'x' : ' ') + after,
    );
    return lines.join('\n');
  }

  function countTasks(body) {
    const masked = maskCode(body);
    const done = (masked.match(/^[\s>]*(?:(?:[-*+]|\d+[.)])\s+)+\[[xX]\]/gm) || []).length;
    const open = (masked.match(/^[\s>]*(?:(?:[-*+]|\d+[.)])\s+)+\[ \]/gm) || []).length;
    return { done, total: done + open };
  }

  function linePlain(line) {
    return line
      .replace(/^\s*(?:>\s*)*/, '')
      .replace(/^#{1,6}\s+/, '')
      .replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
      .replace(/\[\[([^\[\]|\n]+)\|([^\[\]\n]+)\]\]/g, '$2')
      .replace(/\[\[([^\[\]|\n]+)\]\]/g, '$1')
      .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
      .replace(/(\*\*|__|~~|`)/g, '')
      .replace(/(^|[\s(])[*_]([^*_\s][^*_\n]*)[*_](?=$|[\s).,;:!?])/g, '$1$2')
      .replace(/\s*\|\s*/g, ' ')
      .trim();
  }

  /** Readable text of a note, used for search, list previews and word counts. */
  function toPlain(body) {
    return String(body).split('\n')
      .filter((line) => !FENCE_LINE.test(line) && !/^[\s|:-]*-{2,}[\s|:-]*$/.test(line))
      .map(linePlain)
      .join('\n');
  }

  function countWords(body) {
    return (toPlain(body).match(/[\p{L}\p{N}]+(?:['\u2019-][\p{L}\p{N}]+)*/gu) || []).length;
  }

  MG.Links = {
    TITLE_MAX, normTitle, titleProblem, maskCode, extractWikiLinks, extractTags, rewriteLinks,
    backlinks, outgoing, buildGraph, toggleTask, countTasks, toPlain, countWords,
  };
})(window.MG = window.MG || {});
