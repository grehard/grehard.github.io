// Turns a free-text ingredient line into { qty, qtyMax, unit, name, note, aisle }.
// Each reader takes the unread text, records what it recognised and returns the rest.
Mise.IngredientParser = (() => {
  const { NUMBER_PATTERN, expandGlyphs, parse: parseNumber } = Mise.Fractions;
  const { canonical, aliasPattern, familyOf, toBase, fromBase } = Mise.Units;

  const UNIT_PATTERN = aliasPattern();
  const NUMBER_RE = new RegExp(`^(${NUMBER_PATTERN})`);
  const RANGE_RE = new RegExp(`^(${NUMBER_PATTERN})\\s*(?:-|to|or)\\s*(${NUMBER_PATTERN})(?=[\\s(a-zA-Z]|$)`);
  const UNIT_RE = new RegExp(`^(${UNIT_PATTERN})(?:\\.(?=\\s|$)|(?=[\\s,]|$))\\s*`, 'i');
  const PLUS_RE = new RegExp(`^(?:plus|\\+)\\s+(${NUMBER_PATTERN})\\s*(${UNIT_PATTERN})\\.?\\s+`, 'i');
  const PACKAGE_SIZE_RE = /^(\d+(?:\.\d+)?)\s*-?\s*(oz|ounce|g|gram|ml|lb|pound)s?\.?\s+(?=(?:cans?|tins?|jars?|box(?:es)?|bags?|bottles?|packages?|packets?|pkgs?)\b)/i;
  const SOURCE_RE = /^(zest and juice|juice and zest|juice|zest)\s+(?:of|from)\s+/i;
  const SIZE_RE = /^(extra[- ]large|large|medium|small|heaping|scant|level|rounded|generous)\s+/i;
  const LEADING_PREP_RE = /^((?:(?:finely|coarsely|roughly|thinly|freshly)\s+)?(?:chopped|minced|diced|sliced|grated|shredded|crumbled|melted|softened|peeled))\s+/i;
  const TRAILING_PREP_RE = /\s+(sifted|chopped|minced|diced|sliced|grated|shredded|melted|softened|beaten|peeled|drained|rinsed|toasted|crushed|halved|quartered)$/i;
  const TRAILING_PHRASE_RE = /\s+(to taste|for serving|for garnish|for frying|for the pan|as needed|or more|plus more.*|optional)$/i;
  const REVERSED_UNIT_RE = /^(.*\S)\s+(cloves?|stalks?|sprigs?|bunch(?:es)?|heads?|slices?|fillets?)$/i;
  const CONTAINERS = new Set(['can', 'jar', 'box', 'bag', 'bottle', 'package']);
  const MAX_QTY = 100000;

  const WORD_QUANTITIES = [
    [/^half\s+(?:an?\s+)?/i, 0.5], [/^(?:a\s+)?dozen\s+/i, 12], [/^(?:a\s+)?couple(?:\s+of)?\s+/i, 2], [/^(?:a\s+)?few\s+/i, 3],
    [/^(?:an?|one)\s+/i, 1], [/^two\s+/i, 2], [/^three\s+/i, 3], [/^four\s+/i, 4], [/^five\s+/i, 5], [/^six\s+/i, 6],
    [/^seven\s+/i, 7], [/^eight\s+/i, 8], [/^nine\s+/i, 9], [/^ten\s+/i, 10], [/^eleven\s+/i, 11], [/^twelve\s+/i, 12],
  ];

  function normalize(line) {
    return expandGlyphs(line).replace(/^(?:[-*•·]|\d+[.)](?=\s+\D))\s+/, '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  }

  function readSource(text, parsed) {
    return text.replace(SOURCE_RE, (match, source) => {
      parsed.notes.push(source.toLowerCase());
      return '';
    });
  }

  function readWordQuantity(text, parsed) {
    for (const [pattern, value] of WORD_QUANTITIES) {
      if (pattern.test(text)) {
        parsed.qty = value;
        return text.replace(pattern, '');
      }
    }
    return text.replace(/^some\s+/i, '');
  }

  function readQuantity(text, parsed) {
    const range = RANGE_RE.exec(text);
    if (range) {
      parsed.qty = parseNumber(range[1]);
      parsed.qtyMax = parseNumber(range[2]);
      return text.slice(range[0].length).trim();
    }
    const single = NUMBER_RE.exec(text);
    if (!single) return readWordQuantity(text, parsed);
    parsed.qty = parseNumber(single[1]);
    const rest = text.slice(single[0].length).trim().replace(/^[x×]\s*/i, '');
    if (!/^dozen\s+/i.test(rest)) return rest;
    parsed.qty *= 12;
    return rest.replace(/^dozen\s+/i, '');
  }

  function readPackageSize(text, parsed) {
    const inParens = /^\(([^)]*)\)\s*/.exec(text);
    if (inParens) {
      parsed.notes.push(inParens[1].trim());
      return text.slice(inParens[0].length);
    }
    const size = PACKAGE_SIZE_RE.exec(text);
    if (!size) return text;
    parsed.notes.push(`${size[1]} ${canonical(size[2])}`);
    return text.slice(size[0].length);
  }

  function readSize(text, parsed) {
    const size = SIZE_RE.exec(text);
    if (!size) return text;
    parsed.notes.push(size[1].toLowerCase());
    return text.slice(size[0].length);
  }

  function readUnit(text, parsed) {
    const match = UNIT_RE.exec(text);
    if (!match) return text;
    const unit = canonical(match[1]);
    // With nothing after it, the word is the ingredient ("1 head" has no name either way).
    if (!unit || !text.slice(match[0].length).trim()) return text;
    parsed.unit = unit;
    return text.slice(match[0].length);
  }

  // "1 cup plus 2 tablespoons flour" is one amount, so add it up in the first unit.
  function readPlusAmount(text, parsed) {
    const plus = PLUS_RE.exec(text);
    if (!plus || !parsed.unit) return text;
    const unit = canonical(plus[2]);
    if (!unit || familyOf(unit) !== familyOf(parsed.unit)) return text;
    const total = toBase(parsed.qty, parsed.unit) + toBase(parseNumber(plus[1]), unit);
    parsed.qty = fromBase(total, parsed.unit);
    return text.slice(plus[0].length);
  }

  function pullParentheticals(text, parsed) {
    return text.replace(/\s*\(([^)]*)\)\s*/g, (match, inner) => {
      if (inner.trim()) parsed.notes.push(inner.trim());
      return ' ';
    }).trim();
  }

  function pullAfterComma(text, parsed) {
    const comma = text.indexOf(',');
    if (comma === -1) return text;
    const note = text.slice(comma + 1).trim();
    if (note) parsed.notes.push(note);
    return text.slice(0, comma).trim();
  }

  function pullPattern(text, pattern, parsed) {
    const match = pattern.exec(text);
    if (!match) return text;
    parsed.notes.push(match[1].toLowerCase());
    return text.slice(0, match.index) + text.slice(match.index + match[0].length);
  }

  function readName(text, parsed) {
    let name = pullAfterComma(pullParentheticals(text, parsed), parsed);
    name = name.replace(/^of\s+/i, '');
    name = pullPattern(name, TRAILING_PHRASE_RE, parsed);
    name = pullPattern(name, TRAILING_PREP_RE, parsed);
    if (!CONTAINERS.has(parsed.unit)) {
      name = pullPattern(name, LEADING_PREP_RE, parsed);
      name = name.replace(/^freshly\s+/i, '');
    }
    if (/^fresh\s+/i.test(name)) {
      parsed.notes.push('fresh');
      name = name.slice(6);
    }
    parsed.name = name.trim();
  }

  // "3 garlic cloves" means the same as "3 cloves garlic".
  function fixReversedUnit(parsed) {
    const reversed = parsed.unit ? null : REVERSED_UNIT_RE.exec(parsed.name);
    if (!reversed || parsed.qty === null) return;
    parsed.name = reversed[1];
    parsed.unit = canonical(reversed[2]);
  }

  // Tinned tomatoes are shelved with the cans whatever the word "tomato" suggests.
  function guessAisle(parsed) {
    const aisle = Mise.Aisles.guess(parsed.name);
    return (parsed.unit === 'can' || parsed.unit === 'jar') && aisle === 'Produce' ? 'Canned and jarred' : aisle;
  }

  /** Parses one line. Returns null for blanks and section headings, { error, raw } when no name can be found. */
  function parseLine(line) {
    const text = normalize(String(line || ''));
    if (!text || /:$/.test(text)) return null;

    const parsed = { qty: null, qtyMax: null, unit: '', name: '', notes: [] };
    let rest = readSource(text, parsed);
    rest = readQuantity(rest, parsed);
    rest = readPackageSize(rest, parsed);
    rest = readSize(rest, parsed);
    if (parsed.qty !== null) {
      rest = readUnit(rest, parsed);
      rest = readPlusAmount(rest, parsed);
      rest = readPackageSize(rest, parsed);
    }
    readName(rest, parsed);
    fixReversedUnit(parsed);

    if (!parsed.name || Mise.Units.canonical(parsed.name)) return { error: 'No ingredient name found', raw: text };
    if (parsed.qty !== null && !(parsed.qty > 0 && parsed.qty <= MAX_QTY)) return { error: 'Quantity out of range', raw: text };
    return {
      qty: parsed.qty,
      qtyMax: parsed.qtyMax,
      unit: parsed.unit,
      name: parsed.name,
      note: parsed.notes.join(', '),
      aisle: guessAisle(parsed),
    };
  }

  // "Salt and pepper" is one phrase but two things to keep in stock.
  function splitSeasoning(parsed) {
    if (!/^salt (?:and|&) (?:black )?pepper$/i.test(parsed.name)) return [parsed];
    return ['salt', 'black pepper'].map((name) => ({ ...parsed, name, aisle: Mise.Aisles.guess(name) }));
  }

  /** Parses pasted text into { items, failed }, where failed holds the lines it couldn't read. */
  function parseLines(text) {
    const items = [];
    const failed = [];
    String(text || '').split(/\r?\n/).forEach((line) => {
      const parsed = parseLine(line);
      if (!parsed) return;
      if (parsed.error) failed.push(parsed.raw);
      else items.push(...splitSeasoning(parsed));
    });
    return { items, failed };
  }

  return { parseLine, parseLines };
})();
