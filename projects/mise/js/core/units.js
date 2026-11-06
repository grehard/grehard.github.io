// Unit table and conversions. Volume is measured in teaspoons so US measures stay
// whole numbers while adding (2 tbsp + 1/4 cup = 18 tsp); weight is measured in grams.
Mise.Units = (() => {
  const { format } = Mise.Fractions;
  const ML_PER_TSP = 4.92892;

  const MEASURES = {
    pinch: { family: 'volume', base: 1 / 16, system: 'us', plural: 'pinches' },
    dash: { family: 'volume', base: 1 / 8, system: 'us', plural: 'dashes' },
    tsp: { family: 'volume', base: 1, system: 'us' },
    tbsp: { family: 'volume', base: 3, system: 'us' },
    'fl oz': { family: 'volume', base: 6, system: 'us' },
    stick: { family: 'volume', base: 24, system: 'us', plural: 'sticks' },
    cup: { family: 'volume', base: 48, system: 'us', plural: 'cups' },
    pint: { family: 'volume', base: 96, system: 'us', plural: 'pints' },
    quart: { family: 'volume', base: 192, system: 'us', plural: 'quarts' },
    gallon: { family: 'volume', base: 768, system: 'us', plural: 'gallons' },
    ml: { family: 'volume', base: 1 / ML_PER_TSP, system: 'metric' },
    l: { family: 'volume', base: 1000 / ML_PER_TSP, system: 'metric' },
    g: { family: 'weight', base: 1, system: 'metric' },
    kg: { family: 'weight', base: 1000, system: 'metric' },
    oz: { family: 'weight', base: 28.3495, system: 'us' },
    lb: { family: 'weight', base: 453.592, system: 'us' },
  };

  // Things you count rather than measure. Only the same unit can be added together.
  const COUNTED = {
    clove: 'cloves', can: 'cans', jar: 'jars', bunch: 'bunches', head: 'heads', sprig: 'sprigs', slice: 'slices',
    handful: 'handfuls', package: 'packages', bag: 'bags', box: 'boxes', stalk: 'stalks', piece: 'pieces', knob: 'knobs',
    ear: 'ears', fillet: 'fillets', strip: 'strips', sheet: 'sheets', loaf: 'loaves', link: 'links', bottle: 'bottles',
    drop: 'drops', squeeze: 'squeezes',
  };

  const ALIASES = {
    teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tsps: 'tsp',
    tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tbl: 'tbsp',
    cup: 'cup', cups: 'cup', c: 'cup',
    'fl oz': 'fl oz', 'fl. oz': 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
    pint: 'pint', pints: 'pint', pt: 'pint', quart: 'quart', quarts: 'quart', qt: 'quart', gallon: 'gallon', gallons: 'gallon', gal: 'gallon',
    ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
    l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
    g: 'g', gram: 'g', grams: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
    oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
    pinch: 'pinch', pinches: 'pinch', dash: 'dash', dashes: 'dash', stick: 'stick', sticks: 'stick',
    tin: 'can', tins: 'can', pkg: 'package', pack: 'package', packs: 'package', packet: 'package', packets: 'package', rib: 'stalk', ribs: 'stalk',
  };
  Object.keys(COUNTED).forEach((unit) => {
    ALIASES[unit] = unit;
    ALIASES[COUNTED[unit]] = unit;
  });

  const ALL_UNITS = [...Object.keys(MEASURES), ...Object.keys(COUNTED)];

  /** Canonical unit for a word as typed, or null. "T" and "t" are the only case-sensitive spellings. */
  function canonical(word) {
    if (word === 'T') return 'tbsp';
    if (word === 't') return 'tsp';
    return ALIASES[word.toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '')] || null;
  }

  /** Regex source matching any unit spelling, longest first so "tablespoons" beats "t". */
  function aliasPattern() {
    const words = ['T', 't', ...Object.keys(ALIASES)].sort((a, b) => b.length - a.length);
    return words.map((word) => word.replace('.', '\\.').replace(' ', '\\s+')).join('|');
  }

  /** Grouping for adding amounts: "volume", "weight", "count" for bare counts, or "count:clove". */
  function familyOf(unit) {
    if (!unit) return 'count';
    return MEASURES[unit] ? MEASURES[unit].family : `count:${unit}`;
  }

  function toBase(qty, unit) {
    return MEASURES[unit] ? qty * MEASURES[unit].base : qty;
  }

  function fromBase(base, unit) {
    return MEASURES[unit] ? base / MEASURES[unit].base : base;
  }

  function isMetric(unit) {
    return !!MEASURES[unit] && MEASURES[unit].system === 'metric';
  }

  function isNear(value, target, tolerance = 0.06) {
    return Math.abs(value - target) <= tolerance;
  }

  const CUP_MEASURES = [12, 16, 24, 32, 36]; // 1/4, 1/3, 1/2, 2/3 and 3/4 cup, in teaspoons.

  // Picks what a cook would reach for: 18 tsp reads as 6 tbsp because there is no 3/8 cup
  // measure, while 24 tsp reads as 1/2 cup.
  function bestUsVolume(tsp) {
    if (tsp < 0.09) return { qty: 1, unit: 'pinch' };
    if (tsp < 2.97) return { qty: tsp, unit: 'tsp' };
    const tbsp = tsp / 3;
    const halfTablespoons = Math.round(tbsp * 2) / 2;
    if (tsp < 11.94) return isNear(tbsp, halfTablespoons, 0.02) ? { qty: halfTablespoons, unit: 'tbsp' } : { qty: tsp, unit: 'tsp' };
    if (tsp < 47.94) {
      return CUP_MEASURES.some((measure) => isNear(tsp, measure)) ? { qty: tsp / 48, unit: 'cup' } : { qty: halfTablespoons, unit: 'tbsp' };
    }
    return { qty: tsp / 48, unit: 'cup' };
  }

  function roundMetric(value) {
    if (value >= 100) return Math.round(value / 5) * 5;
    if (value >= 10) return Math.round(value);
    return Math.max(0.5, Math.round(value * 2) / 2);
  }

  function bestMetric(value, smallUnit, bigUnit) {
    const rounded = roundMetric(value);
    if (rounded >= 1000) return { qty: Math.round(value / 10) / 100, unit: bigUnit };
    return { qty: rounded, unit: smallUnit };
  }

  function bestUsWeight(grams) {
    const ounces = grams / MEASURES.oz.base;
    return ounces < 15.94 ? { qty: ounces, unit: 'oz' } : { qty: ounces / 16, unit: 'lb' };
  }

  /** The clearest quantity and unit for an amount held in base units. */
  function best(family, base, metric) {
    if (family === 'volume') return metric ? bestMetric(base * ML_PER_TSP, 'ml', 'l') : bestUsVolume(base);
    if (family === 'weight') return metric ? bestMetric(base, 'g', 'kg') : bestUsWeight(base);
    return { qty: base, unit: family.startsWith('count:') ? family.slice(6) : '' };
  }

  function unitLabel(unit, qty) {
    if (!unit) return '';
    const plural = COUNTED[unit] || (MEASURES[unit] && MEASURES[unit].plural);
    return plural && qty > 1 ? plural : unit;
  }

  function formatNumber(qty, unit) {
    if (isMetric(unit)) return qty >= 1000 ? Math.round(qty).toLocaleString('en-US') : String(Math.round(qty * 100) / 100);
    return format(qty, { coarse: !unit });
  }

  /** "1½ cups", "1–2 tbsp", "3 cloves", or just "2" for a bare count. */
  function formatAmount(qty, unit, qtyMax) {
    if (qty === null || qty === undefined) return '';
    const isRange = qtyMax > qty;
    const number = isRange ? `${formatNumber(qty, unit)}–${formatNumber(qtyMax, unit)}` : formatNumber(qty, unit);
    const label = unitLabel(unit, isRange ? qtyMax : qty);
    return label ? `${number} ${label}` : number;
  }

  const TIDY_UNITS = new Set(['tsp', 'tbsp', 'cup', 'oz', 'lb', 'g', 'kg', 'ml', 'l']);

  /** Multiplies an amount and tidies the unit, so 1/4 cup halved reads as 2 tbsp. */
  function scaleAmount(qty, unit, qtyMax, factor) {
    if (qty === null || qty === undefined) return { qty: null, qtyMax: null, unit };
    if (factor === 1 || !TIDY_UNITS.has(unit)) {
      return { qty: qty * factor, qtyMax: qtyMax ? qtyMax * factor : null, unit };
    }
    const tidy = best(familyOf(unit), toBase(qty * factor, unit), isMetric(unit));
    return {
      qty: tidy.qty,
      unit: tidy.unit,
      qtyMax: qtyMax ? fromBase(toBase(qtyMax * factor, unit), tidy.unit) : null,
    };
  }

  return { ALL_UNITS, canonical, aliasPattern, familyOf, toBase, fromBase, isMetric, best, unitLabel, formatAmount, scaleAmount };
})();
