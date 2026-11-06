// Inline Markdown: emphasis, code spans, links, wiki links and #tags.
// Output is safe by construction: every piece of source text goes through
// escapeHtml, and the only tags emitted are the fixed ones written in this file.
(function (MG) {
  'use strict';

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', tab: '\t', newline: '\n', lpar: '(', rpar: ')', sol: '/' };
  const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
  const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
  const UNICODE_PUNCTUATION = /[\p{P}\p{S}]/u;
  const WHITESPACE = /\s/;
  // Characters a URL parser ignores or that can hide a scheme from a naive check.
  const URL_INVISIBLES = /[\u0000- \u007f-\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]/g;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
  }

  function decodeEntities(text) {
    return text.replace(/&(?:#(\d{1,7});?|#[xX]([0-9a-fA-F]{1,6});?|([a-zA-Z]+);)/g, (match, dec, hex, name) => {
      if (name) return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name.toLowerCase()) ? NAMED_ENTITIES[name.toLowerCase()] : match;
      const code = dec ? parseInt(dec, 10) : parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
    });
  }

  /** Returns a URL that is safe to place in href, or null if it must be neutralised. */
  function safeUrl(raw) {
    const decoded = decodeEntities(String(raw));
    const compact = decoded.replace(URL_INVISIBLES, '');
    if (!compact) return null;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
    if (scheme) {
      if (!SAFE_SCHEMES.has(scheme[1].toLowerCase())) return null;
    } else if (/^[^/?#]*:/.test(compact)) {
      return null;
    }
    return decoded.trim().replace(/[\u0000-\u001f\u007f]/g, '').replace(/ /g, '%20');
  }

  function isAbsoluteUrl(url) {
    return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');
  }

  function anchor(url, innerHtml, title) {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    const target = isAbsoluteUrl(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${escapeHtml(url)}"${titleAttr}${target}>${innerHtml}</a>`;
  }

  function blockedLink(innerHtml) {
    return `<span class="unsafe-link" title="Link removed: unsafe address">${innerHtml}</span>`;
  }

  function unescapeMarkdown(text) {
    return text.replace(/\\([!-/:-@[-`{-~])/g, '$1');
  }

  function readEscape(text, i) {
    const next = text[i + 1];
    if (next === '\n') return { html: '<br>\n', end: i + 2 };
    if (next && ASCII_PUNCTUATION.test(next)) return { html: escapeHtml(next), end: i + 2 };
    return null;
  }

  function runLength(text, i, ch) {
    let n = 0;
    while (text[i + n] === ch) n++;
    return n;
  }

  function findCodeSpanEnd(text, i, ticks) {
    let pos = i + ticks;
    while (pos < text.length) {
      const next = text.indexOf('`', pos);
      if (next < 0) return -1;
      const run = runLength(text, next, '`');
      if (run === ticks) return next;
      pos = next + run;
    }
    return -1;
  }

  function readCode(text, i) {
    const ticks = runLength(text, i, '`');
    const close = findCodeSpanEnd(text, i, ticks);
    if (close < 0) return { html: escapeHtml(text.slice(i, i + ticks)), end: i + ticks };
    let code = text.slice(i + ticks, close).replace(/\n/g, ' ');
    if (code.length > 1 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
    return { html: `<code>${escapeHtml(code)}</code>`, end: close + ticks };
  }

  function findClosingBracket(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '`') {
        const ticks = runLength(text, i, '`');
        const close = findCodeSpanEnd(text, i, ticks);
        i = close < 0 ? i + ticks - 1 : close + ticks - 1;
      } else if (ch === '[') {
        depth++;
      } else if (ch === ']' && --depth === 0) {
        return i;
      }
    }
    return -1;
  }

  function skipSpaces(text, i) {
    while (i < text.length && WHITESPACE.test(text[i])) i++;
    return i;
  }

  /** Parses `url` from a destination that may contain balanced parentheses. */
  function readBareDestination(text, start) {
    let depth = 0;
    let i = start;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\\') { i++; continue; }
      if (WHITESPACE.test(ch)) break;
      if (ch === '(') depth++;
      if (ch === ')') {
        if (depth === 0) break;
        depth--;
      }
    }
    return depth === 0 ? { url: text.slice(start, i), end: i } : null;
  }

  function readDestination(text, start) {
    if (text[start] !== '<') return readBareDestination(text, start);
    const close = text.indexOf('>', start);
    if (close < 0 || text.slice(start, close).includes('\n')) return null;
    return { url: text.slice(start + 1, close), end: close + 1 };
  }

  function readLinkTitle(text, start) {
    const opener = text[start];
    const closer = { '"': '"', "'": "'", '(': ')' }[opener];
    if (!closer) return null;
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === closer) return { title: text.slice(start + 1, i), end: i + 1 };
    }
    return null;
  }

  /** Parses `(url "title")`; start points at the opening parenthesis. */
  function readLinkTarget(text, start) {
    let pos = skipSpaces(text, start + 1);
    const dest = readDestination(text, pos);
    if (!dest) return null;
    pos = skipSpaces(text, dest.end);
    let title = '';
    if (text[pos] !== ')') {
      const parsed = readLinkTitle(text, pos);
      if (!parsed) return null;
      title = parsed.title;
      pos = skipSpaces(text, parsed.end);
    }
    if (text[pos] !== ')') return null;
    return { url: unescapeMarkdown(dest.url), title: decodeEntities(unescapeMarkdown(title)), end: pos + 1 };
  }

  function readWikiLink(text, i, ctx, opts) {
    const match = /^\[\[([^\[\]|\n]+)(?:\|([^\[\]\n]+))?\]\]/.exec(text.slice(i, i + 400));
    if (!match || !match[1].trim()) return null;
    const target = match[1].trim();
    const label = (match[2] || match[1]).trim();
    const end = i + match[0].length;
    if (opts.inLink) return { html: escapeHtml(label), end };
    const resolved = ctx.wiki ? ctx.wiki(target) : null;
    const missing = !resolved || resolved.missing;
    const href = !missing && resolved.href ? resolved.href : '#';
    const cls = missing ? 'wikilink is-missing' : 'wikilink';
    return { html: `<a class="${cls}" href="${escapeHtml(href)}" data-wiki="${escapeHtml(target)}">${escapeHtml(label)}</a>`, end };
  }

  function readBracket(text, i, ctx, opts) {
    if (text[i + 1] === '[') {
      const wiki = readWikiLink(text, i, ctx, opts);
      if (wiki) return wiki;
    }
    if (opts.inLink) return null;
    const close = findClosingBracket(text, i);
    if (close < 0 || text[close + 1] !== '(') return null;
    const target = readLinkTarget(text, close + 1);
    if (!target) return null;
    const inner = renderInline(text.slice(i + 1, close), ctx, { inLink: true });
    const url = safeUrl(target.url);
    return { html: url === null ? blockedLink(inner) : anchor(url, inner, target.title), end: target.end };
  }

  // Images render as links so that opening a note can never trigger a remote request.
  function readImage(text, i, ctx, opts) {
    if (text[i + 1] !== '[' || opts.inLink) return null;
    const close = findClosingBracket(text, i + 1);
    if (close < 0 || text[close + 1] !== '(') return null;
    const target = readLinkTarget(text, close + 1);
    if (!target) return null;
    const alt = unescapeMarkdown(text.slice(i + 2, close)) || 'Image';
    const url = safeUrl(target.url);
    return { html: url === null ? blockedLink(escapeHtml(alt)) : anchor(url, escapeHtml(alt), target.title), end: target.end };
  }

  function readAutolink(text, i, ctx, opts) {
    const match = /^<([a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>]*|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/.exec(text.slice(i, i + 2000));
    if (!match || opts.inLink) return null;
    const body = match[1];
    const isEmail = !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(body);
    const url = safeUrl(isEmail ? `mailto:${body}` : body);
    const inner = escapeHtml(body);
    return { html: url === null ? blockedLink(inner) : anchor(url, inner), end: i + match[0].length };
  }

  function readTag(text, i, ctx, opts) {
    const prev = text[i - 1];
    if (opts.inLink || (prev !== undefined && !/[\s(]/.test(prev))) return null;
    const match = /^#(\p{L}[\p{L}\p{N}_/-]*)/u.exec(text.slice(i, i + 80));
    if (!match) return null;
    const tag = match[1].replace(/[/-]+$/, '');
    return {
      html: `<a class="tag" href="#" data-tag="${escapeHtml(tag.toLowerCase())}">#${escapeHtml(tag)}</a>`,
      end: i + tag.length + 1,
    };
  }

  function readBareUrl(text, i, ctx, opts) {
    if (opts.inLink || (i > 0 && /[\w/]/.test(text[i - 1]))) return null;
    const match = /^https?:\/\/[^\s<>]+/.exec(text.slice(i, i + 2000));
    if (!match) return null;
    let url = match[0].replace(/[.,;:!?'"*_~]+$/, '');
    const unbalanced = () => (url.match(/\)/g) || []).length > (url.match(/\(/g) || []).length;
    while (url.endsWith(')') && unbalanced()) url = url.slice(0, -1);
    return { html: anchor(url, escapeHtml(url)), end: i + url.length };
  }

  const READERS = {
    '\\': readEscape, '`': readCode, '[': readBracket, '!': readImage,
    '<': readAutolink, '#': readTag, h: readBareUrl,
  };

  function classify(ch) {
    if (ch === undefined || WHITESPACE.test(ch)) return 'space';
    return UNICODE_PUNCTUATION.test(ch) ? 'punct' : 'word';
  }

  /** Applies CommonMark's flanking rules to a run of * _ or ~. */
  function makeDelimiter(text, i, ch, count) {
    const before = classify(text[i - 1]);
    const after = classify(text[i + count]);
    const leftFlanking = after !== 'space' && (after !== 'punct' || before !== 'word');
    const rightFlanking = before !== 'space' && (before !== 'punct' || after !== 'word');
    const canOpen = ch === '_' ? leftFlanking && (!rightFlanking || before === 'punct') : leftFlanking;
    const canClose = ch === '_' ? rightFlanking && (!leftFlanking || after === 'punct') : rightFlanking;
    return { delim: true, char: ch, count, original: count, canOpen, canClose, open: '', close: '' };
  }

  function tokenize(text, ctx, opts) {
    const tokens = [];
    let buffer = '';
    let i = 0;
    const flush = () => {
      if (buffer) tokens.push(escapeHtml(buffer));
      buffer = '';
    };
    while (i < text.length) {
      const ch = text[i];
      const reader = READERS[ch];
      const read = reader ? reader(text, i, ctx, opts) : null;
      if (read) {
        flush();
        tokens.push(read.html);
        i = read.end;
      } else if (ch === '*' || ch === '_' || ch === '~') {
        const count = runLength(text, i, ch);
        if (ch === '~' && count !== 2) {
          buffer += text.slice(i, i + count);
        } else {
          flush();
          tokens.push(makeDelimiter(text, i, ch, count));
        }
        i += count;
      } else if (ch === '\n') {
        const hardBreak = / {2,}$/.test(buffer);
        buffer = buffer.replace(/ +$/, '');
        flush();
        tokens.push(hardBreak ? '<br>\n' : '\n');
        i = skipInlineIndent(text, i + 1);
      } else {
        buffer += ch;
        i++;
      }
    }
    flush();
    return tokens;
  }

  function skipInlineIndent(text, i) {
    while (text[i] === ' ') i++;
    return i;
  }

  function blockedByRuleOfThree(opener, closer) {
    const eitherBoth = (opener.canOpen && opener.canClose) || (closer.canOpen && closer.canClose);
    const sum = opener.original + closer.original;
    return eitherBoth && sum % 3 === 0 && (opener.original % 3 !== 0 || closer.original % 3 !== 0);
  }

  function findOpener(tokens, closerIndex) {
    const closer = tokens[closerIndex];
    for (let j = closerIndex - 1; j >= 0; j--) {
      const t = tokens[j];
      if (t.delim && t.char === closer.char && t.canOpen && t.count > 0 && !blockedByRuleOfThree(t, closer)) return j;
    }
    return -1;
  }

  function tagFor(char, used) {
    if (char === '~') return 'del';
    return used === 2 ? 'strong' : 'em';
  }

  /** Pairs delimiter runs into tags. Pairs always nest, so the HTML is well formed. */
  function resolveEmphasis(tokens) {
    tokens.forEach((closer, c) => {
      if (!closer.delim || !closer.canClose) return;
      while (closer.count > 0) {
        const o = findOpener(tokens, c);
        if (o < 0) return;
        const opener = tokens[o];
        const used = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
        const tag = tagFor(closer.char, used);
        opener.count -= used;
        closer.count -= used;
        opener.open = `<${tag}>${opener.open}`;
        closer.close += `</${tag}>`;
        for (let k = o + 1; k < c; k++) {
          if (tokens[k].delim) tokens[k].canOpen = tokens[k].canClose = false;
        }
      }
    });
  }

  function tokenToHtml(token) {
    if (!token.delim) return token;
    return token.close + escapeHtml(token.char.repeat(token.count)) + token.open;
  }

  /**
   * @param {string} text inline Markdown
   * @param {{wiki?: function(string): {href?: string, missing: boolean}}} ctx
   */
  function renderInline(text, ctx, opts) {
    const tokens = tokenize(text, ctx || {}, opts || {});
    resolveEmphasis(tokens);
    return tokens.map(tokenToHtml).join('');
  }

  MG.Inline = { render: renderInline, escapeHtml, safeUrl };
})(window.MG = window.MG || {});
