// Date and duration helpers. Days are local-time "YYYY-MM-DD" keys; instants are epoch milliseconds.
(function (HG) {
  'use strict';
  const MIN = 60000;
  const HOUR = 3600000;
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pad = (n) => String(n).padStart(2, '0');

  function dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** Local midnight of a day key, or NaN if the key isn't a real calendar date. */
  function dayStart(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    if (!m) return NaN;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d.getTime() : NaN;
  }

  function addDays(key, n) {
    const d = new Date(dayStart(key));
    return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime());
  }

  /** Next local midnight after an instant. Uses the calendar, not +24h, so DST days stay correct. */
  function nextMidnight(ms) {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  }

  function weekStart(key, firstDay) {
    const offset = (new Date(dayStart(key)).getDay() - firstDay + 7) % 7;
    return addDays(key, -offset);
  }

  function daysBetween(fromKey, toKey) {
    const days = [];
    for (let key = fromKey; key <= toKey && days.length < 20000; key = addDays(key, 1)) days.push(key);
    return days;
  }

  function monthStart(key) { return key.slice(0, 8) + '01'; }

  function monthEnd(key) {
    const d = new Date(dayStart(key));
    return dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime());
  }

  /** "H:MM", rounded to the nearest minute. Hours are not wrapped, so 30 hours reads 30:00. */
  function duration(ms) {
    const minutes = Math.round(Math.max(0, ms) / MIN);
    return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
  }

  /** "H:MM:SS" for the running timer. Always floors, so it never shows a second that hasn't passed. */
  function clock(ms) {
    const total = Math.floor(Math.max(0, ms) / 1000);
    return `${Math.floor(total / 3600)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
  }

  /** "MM:SS" countdown. Ceils, so a phase shows 25:00 at its start and 00:00 only at its end. */
  function countdown(ms) {
    const total = Math.ceil(Math.max(0, ms) / 1000);
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }

  const hours = (ms) => (ms / HOUR).toFixed(2);

  function timeOfDay(ms) {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** Builds an instant from date and time input values. NaN when either is missing or invalid. */
  function combine(dateValue, timeValue) {
    const base = dayStart(dateValue);
    const m = /^(\d{2}):(\d{2})/.exec(timeValue || '');
    if (Number.isNaN(base) || !m) return NaN;
    const d = new Date(base);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[1], +m[2]).getTime();
  }

  /**
   * Reads what people type into a timesheet cell: "1:30", "1.5", "1,5", "90m", "1h 30m", "2".
   * Returns milliseconds, 0 for blank, or null if it can't be understood.
   */
  function parseDuration(text) {
    const value = String(text === undefined || text === null ? '' : text).trim().toLowerCase();
    if (!value) return 0;
    let m = /^(\d{1,4}):([0-5]?\d)$/.exec(value);
    if (m) return (+m[1] * 60 + +m[2]) * MIN;
    m = /^(\d{1,4}(?:[.,]\d+)?)\s*(?:h|hr|hrs|hours?)?$/.exec(value);
    if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 60) * MIN;
    m = /^(\d{1,5})\s*(?:m|min|mins|minutes?)$/.exec(value);
    if (m) return +m[1] * MIN;
    m = /^(\d{1,4})\s*h(?:r|rs|ours?)?\s*(\d{1,3})\s*(?:m|min|mins|minutes?)?$/.exec(value);
    if (m) return (+m[1] * 60 + +m[2]) * MIN;
    return null;
  }

  const date = (key) => new Date(dayStart(key));
  const weekdayName = (key) => WEEKDAYS[date(key).getDay()];
  const shortWeekday = (key) => weekdayName(key).slice(0, 3);
  const dayOfMonth = (key) => date(key).getDate();
  const shortDate = (key) => `${dayOfMonth(key)} ${MONTHS[date(key).getMonth()].slice(0, 3)}`;
  const longDate = (key) => `${weekdayName(key)}, ${dayOfMonth(key)} ${MONTHS[date(key).getMonth()]} ${date(key).getFullYear()}`;
  const fullShortDate = (key) => `${shortDate(key)} ${date(key).getFullYear()}`;
  const monthLabel = (key) => `${MONTHS[date(key).getMonth()].slice(0, 3)} ${date(key).getFullYear()}`;

  function rangeLabel(fromKey, toKey) {
    if (fromKey === toKey) return fullShortDate(fromKey);
    const sameYear = fromKey.slice(0, 4) === toKey.slice(0, 4);
    return `${sameYear ? shortDate(fromKey) : fullShortDate(fromKey)} to ${fullShortDate(toKey)}`;
  }

  HG.time = {
    MIN, HOUR, pad, dayKey, dayStart, addDays, nextMidnight, weekStart, daysBetween, monthStart, monthEnd,
    duration, clock, countdown, hours, timeOfDay, combine, parseDuration,
    weekdayName, shortWeekday, dayOfMonth, shortDate, longDate, fullShortDate, monthLabel, rangeLabel,
    today: () => dayKey(Date.now()),
  };
})(window.HG);
