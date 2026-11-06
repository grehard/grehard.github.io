// Reading and writing cooking quantities: "1 1/2", "1½" and ".5" in, "1½" out.
window.Mise = window.Mise || {};

Mise.Fractions = (() => {
  const GLYPH_VALUES = { '⅛': '1/8', '¼': '1/4', '⅓': '1/3', '⅜': '3/8', '½': '1/2', '⅝': '5/8', '⅔': '2/3', '¾': '3/4', '⅞': '7/8' };

  // Measuring tools come in eighths and thirds, so nothing finer is ever displayed.
  const FINE_STEPS = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']];
  // Nobody cuts an egg into eighths.
  const COARSE_STEPS = [[0, ''], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];

  const NUMBER_PATTERN = '\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d*\\.\\d+|\\d{1,3}(?:,\\d{3})+|\\d+';

  function expandGlyphs(text) {
    return String(text).replace(/[⅛¼⅓⅜½⅝⅔¾⅞]/g, (glyph) => ` ${GLYPH_VALUES[glyph]} `).replace(/\s+/g, ' ').trim();
  }

  function parseSimple(text) {
    const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
    if (mixed) return +mixed[3] ? +mixed[1] + +mixed[2] / +mixed[3] : NaN;
    const fraction = /^(\d+)\/(\d+)$/.exec(text);
    if (fraction) return +fraction[2] ? +fraction[1] / +fraction[2] : NaN;
    if (/^\d{1,3}(,\d{3})+$/.test(text)) return +text.replace(/,/g, '');
    if (/^\d*\.?\d+$/.test(text)) return +text;
    return NaN;
  }

  /** Returns the number for "1 1/2", "1½", "1/3", ".5" or "1,000", or NaN when it isn't one. */
  function parse(text) {
    return parseSimple(expandGlyphs(text));
  }

  /** Reads "2", "1 1/2" or a range like "1-2" and "1 to 2". Returns null when the text isn't a quantity. */
  function parseRange(text) {
    const clean = expandGlyphs(text).replace(/[–—]/g, '-');
    const range = new RegExp(`^(${NUMBER_PATTERN})\\s*(?:-|to)\\s*(${NUMBER_PATTERN})$`).exec(clean);
    if (range) {
      const qty = parseSimple(range[1]);
      const qtyMax = parseSimple(range[2]);
      return Number.isNaN(qty) || Number.isNaN(qtyMax) ? null : { qty, qtyMax };
    }
    const qty = parseSimple(clean);
    return Number.isNaN(qty) ? null : { qty, qtyMax: null };
  }

  function nearestStep(fraction, steps) {
    return steps.reduce((best, step) => (Math.abs(step[0] - fraction) < Math.abs(best[0] - fraction) ? step : best));
  }

  /** Formats a quantity using the nearest friendly fraction. `coarse` limits it to quarters and thirds. */
  function format(value, { coarse = false } = {}) {
    if (!(value > 0)) return '0';
    if (value >= 100) return Math.round(value).toLocaleString('en-US');
    const rounded = value >= 10 ? Math.round(value * 2) / 2 : value;

    const steps = coarse ? COARSE_STEPS : FINE_STEPS;
    let whole = Math.floor(rounded);
    const step = nearestStep(rounded - whole, steps);
    if (step[0] === 1) whole += 1;
    if (whole === 0 && step[0] === 0) return steps[1][1]; // Never round a real amount away to nothing.
    return `${whole || ''}${step[1]}`;
  }

  return { NUMBER_PATTERN, expandGlyphs, parse, parseRange, format };
})();
