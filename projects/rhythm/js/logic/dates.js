// Calendar dates are 'YYYY-MM-DD' strings and all arithmetic goes through a whole-number day
// index. Local midnight never enters the maths, so a 23 or 25 hour DST day can't shift a date.
(function (R) {
  'use strict';
  const MS_PER_DAY = 86400000;
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
  const pad = (n) => String(n).padStart(2, '0');

  function toDay(iso) {
    return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS_PER_DAY;
  }

  function fromDay(day) {
    const d = new Date(day * MS_PER_DAY);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  function isValid(iso) {
    return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && fromDay(toDay(iso)) === iso;
  }

  /** The user's local calendar date. This is the only place wall-clock time becomes a date. */
  function today(now = new Date()) {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  const addDays = (iso, n) => fromDay(toDay(iso) + n);
  const diffDays = (a, b) => toDay(a) - toDay(b);
  /** 0 = Sunday ... 6 = Saturday. Day 0 of the index, 1970-01-01, was a Thursday. */
  const weekday = (iso) => (((toDay(iso) + 4) % 7) + 7) % 7;

  function startOfWeek(iso, weekStart = 1) {
    return addDays(iso, -((weekday(iso) - weekStart + 7) % 7));
  }
  const endOfWeek = (iso, weekStart = 1) => addDays(startOfWeek(iso, weekStart), 6);

  function eachDay(from, to) {
    const days = [];
    for (let d = toDay(from), end = toDay(to); d <= end; d++) days.push(fromDay(d));
    return days;
  }

  /** Weekday indexes in display order for a given first day of the week. */
  const weekOrder = (weekStart = 1) => [0, 1, 2, 3, 4, 5, 6].map((i) => (i + weekStart) % 7);

  const dayName = (i) => DAY_NAMES[i];
  const dayShort = (i) => DAY_NAMES[i].slice(0, 3);
  const monthShort = (i) => MONTH_NAMES[i].slice(0, 3);
  const monthOf = (iso) => +iso.slice(5, 7) - 1;
  const dayOfMonth = (iso) => +iso.slice(8, 10);
  const yearOf = (iso) => +iso.slice(0, 4);

  const formatShort = (iso) => `${monthShort(monthOf(iso))} ${dayOfMonth(iso)}`;
  const formatWeekday = (iso) => `${dayShort(weekday(iso))}, ${formatShort(iso)}`;
  const formatLong = (iso) => `${DAY_NAMES[weekday(iso)]}, ${MONTH_NAMES[monthOf(iso)]} ${dayOfMonth(iso)}`;
  const formatFull = (iso) => `${formatLong(iso)}, ${yearOf(iso)}`;

  function formatRange(from, to) {
    const end = monthOf(from) === monthOf(to) ? dayOfMonth(to) : formatShort(to);
    return `${formatShort(from)} to ${end}, ${yearOf(to)}`;
  }

  R.Dates = {
    toDay, fromDay, isValid, today, addDays, diffDays, weekday, startOfWeek, endOfWeek, eachDay, weekOrder,
    dayName, dayShort, monthShort, monthOf, dayOfMonth, yearOf, formatShort, formatWeekday, formatLong, formatFull, formatRange,
  };
})(window.Rhythm = window.Rhythm || {});
