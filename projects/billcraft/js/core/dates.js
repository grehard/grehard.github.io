// Dates are stored as local ISO day strings. Arithmetic runs in UTC so daylight saving can't shift a day.
(function () {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_MS = 86400000;
  const pad = (n) => String(n).padStart(2, '0');

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function toUtc(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return NaN;
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(ms);
    // Rejects dates that roll over, such as 31 February.
    return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? ms : NaN;
  }

  function fromUtc(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  const isValid = (iso) => typeof iso === 'string' && !Number.isNaN(toUtc(iso));
  const addDays = (iso, days) => fromUtc(toUtc(iso) + days * DAY_MS);
  const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
  const monthKey = (iso) => iso.slice(0, 7);

  function format(iso) {
    if (!isValid(iso)) return '';
    const [y, m, d] = iso.split('-');
    return `${+d} ${MONTHS[+m - 1]} ${y}`;
  }

  // Month keys ending at the month of `iso`, oldest first.
  function recentMonths(iso, count) {
    const year = +iso.slice(0, 4);
    const month = +iso.slice(5, 7) - 1;
    const keys = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(year, month - i, 1));
      keys.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
    }
    return keys;
  }

  const monthLabel = (key) => MONTHS[+key.slice(5, 7) - 1];

  window.BC.dates = { today, isValid, addDays, daysBetween, monthKey, format, recentMonths, monthLabel };
})();
