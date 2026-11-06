// Calendar dates are plain "YYYY-MM-DD" strings in local time, which sort correctly as text
// and never shift a day across time zones the way Date objects serialized to UTC can.
const Dates = (() => {
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => toISO(new Date());

  function parse(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function isValid(iso) {
    return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && toISO(parse(iso)) === iso;
  }

  function addDays(iso, days) {
    const d = parse(iso);
    d.setDate(d.getDate() + days);
    return toISO(d);
  }

  function formatShort(iso) {
    const d = parse(iso);
    const options = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
    return d.toLocaleDateString('en-US', options);
  }

  function formatLong(iso) {
    return parse(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatStamp(isoDateTime) {
    const d = new Date(isoDateTime);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  const monthOf = (iso) => iso.slice(0, 7);

  function shiftMonth(month, delta) {
    const [y, m] = month.split('-').map(Number);
    return toISO(new Date(y, m - 1 + delta, 1)).slice(0, 7);
  }

  function monthLabel(month) {
    return parse(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // Monday-first weeks covering the month, including the days that spill in from its neighbors.
  function monthWeeks(month) {
    const first = `${month}-01`;
    const mondayOffset = (parse(first).getDay() + 6) % 7;
    let cursor = addDays(first, -mondayOffset);
    const weeks = [];
    do {
      const week = [];
      for (let i = 0; i < 7; i++) { week.push(cursor); cursor = addDays(cursor, 1); }
      weeks.push(week);
    } while (monthOf(cursor) === month);
    return weeks;
  }

  return { toISO, today, parse, isValid, addDays, formatShort, formatLong, formatStamp, monthOf, shiftMonth, monthLabel, monthWeeks };
})();
