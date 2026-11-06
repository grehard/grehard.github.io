// All money in Stockroom is an integer count of cents. This file is the only place where
// cents meet fractions, so every rounding rule in the app is defined here.
SR.money = (function () {
  const MAX_CENTS = 99999999;

  /** a * b / c rounded half up, exact even when a * b exceeds 2^53. */
  function mulDiv(a, b, c) {
    const product = a * b;
    if (!Number.isSafeInteger(product)) {
      const big = BigInt(a) * BigInt(b);
      const div = BigInt(c);
      return Number((big * 2n + div) / (div * 2n));
    }
    const remainder = product % c;
    const quotient = (product - remainder) / c;
    return remainder * 2 >= c ? quotient + 1 : quotient;
  }

  /**
   * Splits a whole number of cents across weights using the largest-remainder method,
   * so the parts always add back to exactly the total. Ties go to the earlier index.
   */
  function allocate(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0 || total === 0) return weights.map(() => 0);
    const parts = weights.map((weight, index) => {
      const product = total * weight;
      const remainder = product % sum;
      return { index, value: (product - remainder) / sum, remainder };
    });
    let left = total - parts.reduce((a, p) => a + p.value, 0);
    const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    for (const part of byRemainder) {
      if (left <= 0) break;
      part.value += 1;
      left -= 1;
    }
    return parts.map((p) => p.value);
  }

  function format(cents) {
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(cents);
    const dollars = Math.floor(abs / 100).toLocaleString('en-US');
    return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
  }

  /** Plain decimal for inputs and CSV, with no symbol or thousands separator. */
  function plain(cents) {
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(cents);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  }

  /** Parses "$1,234.5" style input into cents. Returns null when it isn't a valid amount. */
  function parse(text) {
    const clean = String(text).trim().replace(/[$,\s]/g, '');
    const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(clean);
    if (!match || (match[1] === '' && !match[2])) return null;
    const cents = Number(match[1] || 0) * 100 + Number((match[2] || '').padEnd(2, '0'));
    return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
  }

  /** Parses a percentage such as "8.25" into basis points (825). */
  function parsePercent(text) {
    const clean = String(text).trim().replace(/%$/, '');
    const match = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(clean);
    if (!match) return null;
    const bp = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
    return bp <= 10000 ? bp : null;
  }

  function formatPercent(bp) {
    const whole = Math.floor(bp / 100);
    const frac = bp % 100;
    if (!frac) return `${whole}%`;
    return `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}%`;
  }

  /** Gross margin as basis points of revenue. Null when there was no revenue to measure against. */
  function marginBp(grossCents, revenueCents) {
    if (revenueCents <= 0) return null;
    const sign = grossCents < 0 ? -1 : 1;
    return sign * mulDiv(Math.abs(grossCents), 10000, revenueCents);
  }

  function formatMargin(grossCents, revenueCents) {
    const bp = marginBp(grossCents, revenueCents);
    if (bp === null) return 'n/a';
    const sign = bp < 0 ? '-' : '';
    const abs = Math.abs(bp);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}%`;
  }

  return { MAX_CENTS, mulDiv, allocate, format, plain, parse, parsePercent, formatPercent, marginBp, formatMargin };
})();
