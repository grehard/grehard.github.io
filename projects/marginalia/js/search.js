// Ranked full-text search. Scores are plain integers so a result's position can be
// explained: a word in the title outweighs a heading, which outweighs a word in the body.
(function (MG) {
  'use strict';

  const { escapeHtml } = MG.Inline;
  const { extractTags, toPlain, normTitle } = MG.Links;

  const WEIGHT = {
    exactTitle: 30, titleWord: 10, titlePrefix: 6, tag: 6, headingWord: 4,
    bodyWord: 2, bodyPrefix: 1, allTerms: 8, phrase: 12,
  };
  const MAX_COUNTED_BODY_HITS = 5; // Stops a long note winning on repetition alone.
  const SNIPPET_LENGTH = 150;
  const SNIPPET_LEAD_IN = 30;
  const WORD = /[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu;

  function fold(word) {
    return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  }

  /** Words with source offsets; folding is per word so offsets stay true to the original text. */
  function tokenize(text) {
    const tokens = [];
    WORD.lastIndex = 0;
    let m;
    while ((m = WORD.exec(text))) tokens.push({ word: fold(m[0]), start: m.index, end: m.index + m[0].length });
    return tokens;
  }

  function matchKind(word, term) {
    if (word === term) return 'exact';
    return term.length >= 2 && word.startsWith(term) ? 'prefix' : '';
  }

  function countMatches(tokens, term) {
    let exact = 0;
    let prefix = 0;
    tokens.forEach((token) => {
      const kind = matchKind(token.word, term);
      if (kind === 'exact') exact++;
      else if (kind === 'prefix') prefix++;
    });
    return { exact, prefix };
  }

  function hasPhrase(tokens, terms) {
    for (let i = 0; i + terms.length <= tokens.length; i++) {
      if (terms.every((term, t) => tokens[i + t].word === term)) return true;
    }
    return false;
  }

  function headingWords(body) {
    return tokenize(body.split('\n').filter((line) => /^ {0,3}#{1,6}\s/.test(line)).join('\n'));
  }

  function scoreTerm(term, fields) {
    const title = countMatches(fields.title, term);
    const body = countMatches(fields.body, term);
    const heading = countMatches(fields.headings, term);
    const tagged = fields.tags.some((tag) => tag === term || tag.split('/').includes(term));
    const score =
      (title.exact ? WEIGHT.titleWord : title.prefix ? WEIGHT.titlePrefix : 0) +
      (tagged ? WEIGHT.tag : 0) +
      (heading.exact ? WEIGHT.headingWord : 0) +
      Math.min(body.exact, MAX_COUNTED_BODY_HITS) * WEIGHT.bodyWord +
      Math.min(body.prefix, MAX_COUNTED_BODY_HITS) * WEIGHT.bodyPrefix;
    return { score, titleHits: title.exact + title.prefix, bodyHits: body.exact + body.prefix, tagged };
  }

  function scoreNote(note, terms, query, plain) {
    const fields = {
      title: tokenize(note.title),
      body: tokenize(plain),
      headings: headingWords(note.body),
      tags: extractTags(note.body).map(fold),
    };
    let score = 0;
    let matched = 0;
    let titleHits = 0;
    let bodyHits = 0;
    let tagHits = 0;
    terms.forEach((term) => {
      const result = scoreTerm(term, fields);
      score += result.score;
      if (result.score > 0) matched++;
      titleHits += result.titleHits;
      bodyHits += result.bodyHits;
      if (result.tagged) tagHits++;
    });
    if (!matched) return null;
    if (terms.length > 1 && matched === terms.length) score += WEIGHT.allTerms;
    if (terms.length > 1 && (hasPhrase(fields.title, terms) || hasPhrase(fields.body, terms))) score += WEIGHT.phrase;
    if (normTitle(fold(note.title)) === normTitle(fold(query))) score += WEIGHT.exactTitle;
    return { score, titleHits, bodyHits, tagHits, bodyTokens: fields.body };
  }

  function highlight(text, tokens, terms) {
    let html = '';
    let pos = 0;
    tokens.forEach((token) => {
      if (token.start < pos || !terms.some((term) => matchKind(token.word, term))) return;
      html += escapeHtml(text.slice(pos, token.start));
      html += `<mark>${escapeHtml(text.slice(token.start, token.end))}</mark>`;
      pos = token.end;
    });
    return html + escapeHtml(text.slice(pos));
  }

  /** Start of the stretch of text that covers the most distinct terms. */
  function bestWindowStart(hits) {
    let bestStart = hits[0].start;
    let bestScore = -1;
    hits.forEach((first, i) => {
      const distinct = new Set();
      let count = 0;
      for (let j = i; j < hits.length && hits[j].end - first.start <= SNIPPET_LENGTH; j++) {
        distinct.add(hits[j].term);
        count++;
      }
      const score = distinct.size * 100 + count;
      if (score > bestScore) {
        bestScore = score;
        bestStart = first.start;
      }
    });
    return bestStart;
  }

  function trimToWordBoundaries(plain, start, end) {
    let from = start;
    let to = Math.min(plain.length, end);
    if (from > 0) {
      const space = plain.indexOf(' ', from);
      if (space >= 0 && space < start + 20) from = space + 1;
    }
    if (to < plain.length) {
      const space = plain.lastIndexOf(' ', to);
      if (space > from) to = space;
    }
    return { from, to };
  }

  /** An HTML snippet around the best match, with matches in <mark>. All text is escaped. */
  function snippet(plain, tokens, terms) {
    const hits = [];
    tokens.forEach((token) => {
      const term = terms.find((t) => matchKind(token.word, t));
      if (term) hits.push({ start: token.start, end: token.end, term });
    });
    const anchor = hits.length ? bestWindowStart(hits) : 0;
    const range = trimToWordBoundaries(plain, Math.max(0, anchor - SNIPPET_LEAD_IN), anchor + SNIPPET_LENGTH);
    const piece = plain.slice(range.from, range.to).replace(/\s/g, ' ');
    const inner = highlight(piece, tokenize(piece), terms);
    return (range.from > 0 ? '\u2026' : '') + inner + (range.to < plain.length ? '\u2026' : '');
  }

  function parseTerms(query) {
    return tokenize(query).map((token) => token.word);
  }

  /**
   * @param {string} query
   * @param {Array<{title: string, body: string, updatedAt: number}>} notes
   * @returns {Array<{note, score, titleHtml, snippetHtml, titleHits, bodyHits, tagHits}>} best first
   */
  function search(query, notes) {
    const terms = [...new Set(parseTerms(query))];
    if (!terms.length) return [];
    const results = [];
    notes.forEach((note) => {
      const plain = toPlain(note.body);
      const scored = scoreNote(note, terms, query, plain);
      if (!scored) return;
      results.push({
        note,
        score: scored.score,
        titleHits: scored.titleHits,
        bodyHits: scored.bodyHits,
        tagHits: scored.tagHits,
        titleHtml: highlight(note.title, tokenize(note.title), terms),
        snippetHtml: snippet(plain.replace(/\s+/g, ' ').trim(), tokenize(plain.replace(/\s+/g, ' ').trim()), terms),
      });
    });
    return results.sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt || a.note.title.localeCompare(b.note.title));
  }

  MG.Search = { search, WEIGHT };
})(window.MG = window.MG || {});
