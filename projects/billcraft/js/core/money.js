// All amounts are integers: cents for money, thousandths for quantity, basis points for percentages.
// User input is parsed from its digits, never through floats, so "19.99" is exactly 1999.
(function () {
  const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'SGD', 'ZAR'];
  const MAX_UNIT_CENTS = 999999999; // 9,999,999.99
  const MAX_QTY_MILLI = 99999000; // 99,999
  const MAX_TOTAL_CENTS = 900000000000000; // keeps every sum well inside the safe integer range

  // a * b / divisor rounded half away from zero, exact at any size.
  function mulDivRound(a, b, divisor) {
    const numerator = BigInt(a) * BigInt(b);
    const d = BigInt(divisor);
    const negative = numerator < 0n;
    const abs = negative ? -numerator : numerator;
    const rounded = (abs * 2n + d) / (d * 2n);
    return Number(negative ? -rounded : rounded);
  }

  // Parses a non-negative decimal into an integer scaled by 10^decimals. Returns null when it isn't one.
  function parseScaled(text, decimals) {
    const clean = String(text === undefined || text === null ? '' : text).replace(/[,\s]/g, '');
    const match = /^(\d*)(?:\.(\d*))?$/.exec(clean);
    if (!match || (!match[1] && !match[2])) return null;
    const fraction = match[2] || '';
    if (fraction.length > decimals && /[1-9]/.test(fraction.slice(decimals))) return null;
    const digits = (match[1] || '0') + fraction.slice(0, decimals).padEnd(decimals, '0');
    if (digits.replace(/^0+/, '').length > 15) return null;
    return Number(digits);
  }

  const parseCents = (text) => parseScaled(text, 2);
  const parseQty = (text) => parseScaled(text, 3);
  const parsePercent = (text) => parseScaled(text, 2);

  function plain(value, scale, minDecimals) {
    const whole = Math.trunc(value / scale);
    const decimals = String(scale).length - 1;
    const fraction = String(Math.abs(value) % scale).padStart(decimals, '0').replace(/0+$/, '').padEnd(minDecimals, '0');
    return fraction ? `${whole}.${fraction}` : String(whole);
  }

  const centsToText = (cents) => plain(cents, 100, 2);
  const qtyToText = (milli) => plain(milli, 1000, 0);
  const percentToText = (bp) => plain(bp, 100, 0);

  const formatters = {};
  function format(cents, currency) {
    const code = CURRENCIES.includes(currency) ? currency : 'GBP';
    if (!formatters[code]) formatters[code] = new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    return formatters[code].format(cents / 100);
  }

  window.BC.money = {
    CURRENCIES, MAX_UNIT_CENTS, MAX_QTY_MILLI, MAX_TOTAL_CENTS,
    mulDivRound, parseCents, parseQty, parsePercent, centsToText, qtyToText, percentToText, format,
  };
})();
