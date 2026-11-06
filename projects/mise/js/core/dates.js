// Calendar helpers. Weeks run Monday to Sunday and are named by their Monday's YYYY-MM-DD.
Mise.Dates = (() => {
  const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const LONG_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function toKey(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function fromKey(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
    if (!match) return null;
    const date = new Date(+match[1], +match[2] - 1, +match[3]);
    return toKey(date) === key ? date : null;
  }

  function addDays(key, days) {
    const date = fromKey(key);
    date.setDate(date.getDate() + days);
    return toKey(date);
  }

  function todayKey() {
    return toKey(new Date());
  }

  function mondayOf(key) {
    const date = fromKey(key) || new Date();
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return toKey(date);
  }

  function weekDays(mondayKey) {
    return SHORT_DAYS.map((short, index) => {
      const key = addDays(mondayKey, index);
      return { key, short, long: LONG_DAYS[index], date: fromKey(key).getDate() };
    });
  }

  function weekLabel(mondayKey) {
    const start = fromKey(mondayKey);
    const end = fromKey(addDays(mondayKey, 6));
    const startText = `${MONTHS[start.getMonth()]} ${start.getDate()}`;
    if (start.getMonth() === end.getMonth()) return `${startText} – ${end.getDate()}, ${end.getFullYear()}`;
    return `${startText} – ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }

  function dayLabel(key) {
    const date = fromKey(key);
    return `${LONG_DAYS[(date.getDay() + 6) % 7]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
  }

  return { toKey, fromKey, addDays, todayKey, mondayOf, weekDays, weekLabel, dayLabel };
})();
