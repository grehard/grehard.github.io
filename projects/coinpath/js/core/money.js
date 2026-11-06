// Money is always an integer number of cents. Parsing and formatting work on
// digit strings so no binary floating point ever touches a stored amount.
(function () {
  const ns = (window.Coinpath = window.Coinpath || {});

  // Limit per amount, low enough that thousands of maximum values can be summed
  // without leaving the safe integer range.
  const MAX_CENTS = 999999999999;
  const MINUS = '−';

  // Two-decimal currencies only: the setting relabels amounts rather than
  // converting them, and a zero-decimal currency would hide stored cents.
  const CURRENCIES = [
    { code: 'USD', label: 'US dollar', symbol: '$' },
    { code: 'EUR', label: 'Euro', symbol: '€' },
    { code: 'GBP', label: 'British pound', symbol: '£' },
    { code: 'CAD', label: 'Canadian dollar', symbol: 'CA$' },
    { code: 'AUD', label: 'Australian dollar', symbol: 'A$' },
    { code: 'NZD', label: 'New Zealand dollar', symbol: 'NZ$' },
    { code: 'CHF', label: 'Swiss franc', symbol: 'CHF ' },
    { code: 'INR', label: 'Indian rupee', symbol: '₹' },
    { code: 'SEK', label: 'Swedish krona', suffix: ' kr' },
    { code: 'NOK', label: 'Norwegian krone', suffix: ' kr' },
    { code: 'MXN', label: 'Mexican peso', symbol: 'MX$' },
    { code: 'ZAR', label: 'South African rand', symbol: 'R ' },
  ];

  function currencyOf(code) {
    return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
  }

  function groupThousands(digits) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function wrapSymbol(body, negative, plus, currency) {
    const sign = negative ? MINUS : plus ? '+' : '';
    return sign + (currency.symbol || '') + body + (currency.suffix || '');
  }

  /** "$1,234.50". With signed: true, positive values get a leading plus. */
  function format(cents, code, opts) {
    const currency = currencyOf(code);
    const abs = Math.abs(cents);
    const whole = groupThousands(String(Math.floor(abs / 100)));
    const frac = String(abs % 100).padStart(2, '0');
    return wrapSymbol(whole + '.' + frac, cents < 0, !!(opts && opts.signed) && cents > 0, currency);
  }

  function trimZero(value) {
    return value.toFixed(1).replace(/\.0$/, '');
  }

  /** Short label for chart axes: "$850", "$1.5k", "$2M". */
  function formatCompact(cents, code) {
    const currency = currencyOf(code);
    const abs = Math.abs(cents);
    const unit = [[1e11, 'B'], [1e8, 'M'], [1e5, 'k']].find((u) => abs >= u[0]);
    const body = unit ? trimZero(abs / unit[0]) + unit[1] : String(Math.round(abs / 100));
    return wrapSymbol(body, cents < 0, false, currency);
  }

  /** Plain "-1234.50", used for CSV cells and for pre-filling inputs. */
  function toDecimal(cents) {
    const abs = Math.abs(cents);
    return (cents < 0 ? '-' : '') + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
  }

  function stripDecoration(text) {
    return text
      .replace(/^\(|\)$/g, '')
      .replace(/^([^\d]*?)[-−+]/, '$1')
      .replace(/[-−]$/, '')
      .trim()
      .replace(/^(?:[A-Z]{3}\s?|[A-Z]{1,2}(?=\$)|R\s)?[$€£₹]?\s*/, '')
      .replace(/\s*(?:[$€£₹]|[A-Z]{3}|kr)$/, '')
      .replace(/['\s ]/g, '');
  }

  function validGroups(whole) {
    return /^\d{1,3}(?:[.,]\d{3})*$|^\d*$/.test(whole);
  }

  // Works out which separator is the decimal point. "1,234" is a thousands
  // group; "1.234" is refused because it is ambiguous between locales.
  function splitDecimal(body) {
    const at = Math.max(body.lastIndexOf('.'), body.lastIndexOf(','));
    if (at < 0) return [body, ''];
    const hasBoth = body.includes('.') && body.includes(',');
    const fraction = body.slice(at + 1);
    if (hasBoth || (fraction.length <= 2 && body.indexOf(body[at]) === at)) {
      return validGroups(body.slice(0, at)) ? [body.slice(0, at), fraction] : null;
    }
    return body[at] === ',' && validGroups(body) ? [body, ''] : null;
  }

  /** Turns user or CSV text into integer cents, or null when it isn't an amount. */
  function parse(input) {
    const text = String(input == null ? '' : input).trim();
    if (!text) return null;
    const body = stripDecoration(text);
    if (!/^[\d.,]*\d[\d.,]*$/.test(body)) return null;
    const split = splitDecimal(body);
    if (!split) return null;
    const whole = split[0].replace(/[.,]/g, '') || '0';
    const fraction = split[1];
    if (!/^\d{0,2}$/.test(fraction) || whole.length > 13) return null;
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (cents > MAX_CENTS) return null;
    const negative = /[-−]/.test(text) || /^\(.*\)$/.test(text);
    return negative ? -cents : cents;
  }

  function isValidAmount(value) {
    return Number.isSafeInteger(value) && value > 0 && value <= MAX_CENTS;
  }

  ns.Money = { MAX_CENTS, CURRENCIES, currencyOf, format, formatCompact, toDecimal, parse, isValidAmount };
})();
