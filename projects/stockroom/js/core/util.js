// Small shared helpers. Dates are handled as local "YYYY-MM-DD" keys so a sale always
// belongs to the calendar day the shop experienced it on.
window.SR = window.SR || {};
SR.views = SR.views || {};

SR.util = (function () {
  const pad = (n) => String(n).padStart(2, '0');

  function dateKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function keyToDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(key, n) {
    const d = keyToDate(key);
    d.setDate(d.getDate() + n);
    return dateKey(d.getTime());
  }

  function isDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    return dateKey(keyToDate(value).getTime()) === value;
  }

  const formatDate = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formatTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const formatDateTime = (ms) => `${formatDate(ms)}, ${formatTime(ms)}`;
  const formatKey = (key) => formatDate(keyToDate(key).getTime());
  const formatKeyShort = (key) => keyToDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formatInt = (n) => Number(n).toLocaleString('en-US');
  const clockTime = (ms) => {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  function debounce(fn, ms) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /** Parses a whole number from user input, returning null for anything else. */
  function parseWhole(text, { allowNegative = false } = {}) {
    const clean = String(text).trim().replace(/,/g, '');
    const pattern = allowNegative ? /^[+-]?\d+$/ : /^\d+$/;
    if (!pattern.test(clean)) return null;
    const value = Number(clean);
    return Number.isSafeInteger(value) ? value : null;
  }

  return {
    dateKey, keyToDate, addDays, isDateKey, formatDate, formatTime, formatDateTime,
    formatKey, formatKeyShort, formatInt, clockTime, debounce, parseWhole,
  };
})();
