// Dates are stored as "YYYY-MM-DD" strings and months as "YYYY-MM". All arithmetic
// goes through UTC so daylight saving changes can never move a date by a day.
(function () {
  const ns = window.Coinpath;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const pad = (n) => String(n).padStart(2, '0');

  function make(year, month, day) {
    return String(year).padStart(4, '0') + '-' + pad(month) + '-' + pad(day);
  }

  function today() {
    const now = new Date();
    return make(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function parts(iso) {
    return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) };
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function isValid(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const { y, m, d } = parts(iso);
    return y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
  }

  function isValidMonth(month) {
    return typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  }

  function addDays(iso, count) {
    const { y, m, d } = parts(iso);
    const date = new Date(Date.UTC(y, m - 1, d + count));
    return make(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  function shiftMonth(month, count) {
    const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + count;
    return String(Math.floor(index / 12)).padStart(4, '0') + '-' + pad((index % 12) + 1);
  }

  /** The given day in a month, clamped to the month's length (the 31st in February is the 28th or 29th). */
  function dayInMonth(month, day) {
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    return make(y, m, Math.min(day, daysInMonth(y, m)));
  }

  function weekdayIndex(iso) {
    const { y, m, d } = parts(iso);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  const monthOf = (iso) => iso.slice(0, 7);
  const firstOfMonth = (month) => month + '-01';
  const lastOfMonth = (month) => dayInMonth(month, 31);
  const weekdayName = (iso) => WEEKDAYS[weekdayIndex(iso)];

  function format(iso) {
    const { y, m, d } = parts(iso);
    return MONTHS[m - 1] + ' ' + d + ', ' + y;
  }

  function formatShort(iso) {
    const { m, d } = parts(iso);
    return MONTHS[m - 1] + ' ' + d;
  }

  const monthLabel = (month) => LONG_MONTHS[Number(month.slice(5, 7)) - 1] + ' ' + month.slice(0, 4);
  const monthShort = (month) => MONTHS[Number(month.slice(5, 7)) - 1];
  const monthShortYear = (month) => monthShort(month) + ' ' + month.slice(0, 4);

  function ordinal(n) {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return n + 'th';
    return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  }

  ns.Dates = {
    today, make, parts, daysInMonth, isValid, isValidMonth, addDays, shiftMonth, dayInMonth, weekdayIndex, monthOf,
    firstOfMonth, lastOfMonth, weekdayName, format, formatShort, monthLabel, monthShort, monthShortYear, ordinal,
  };
})();
