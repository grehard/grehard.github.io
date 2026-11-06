// Turns untrusted data (localStorage, imported files, form fields) into a well-formed state.
// Everything invalid is dropped and described in `problems`: loading tolerates them, import refuses them.
(function (R) {
  'use strict';
  const D = R.Dates;
  const TIMES_OF_DAY = ['morning', 'afternoon', 'evening'];
  const MAX_VALUE = 1000000;
  const LIMITS = { name: 80, unit: 20, note: 20000 };

  const isPositive = (n, max = MAX_VALUE) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= max;
  const isWhole = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  const roundValue = (n) => Math.round(n * 100) / 100;

  function cleanSchedule(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.type === 'daily') return { type: 'daily' };
    if (raw.type === 'weekdays') {
      if (!Array.isArray(raw.days)) return null;
      const days = [...new Set(raw.days)].filter((d) => isWhole(d, 0, 6)).sort((a, b) => a - b);
      return days.length ? { type: 'weekdays', days } : null;
    }
    if (raw.type === 'weekly') return isWhole(raw.times, 1, 7) ? { type: 'weekly', times: raw.times } : null;
    if (raw.type === 'interval') {
      if (!isWhole(raw.every, 2, 365)) return null;
      return { type: 'interval', every: raw.every, anchor: D.isValid(raw.anchor) ? raw.anchor : null };
    }
    return null;
  }

  function cleanTarget(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.type === 'check') return { type: 'check' };
    if (raw.type !== 'count' || !isPositive(raw.amount)) return null;
    return {
      type: 'count',
      amount: roundValue(raw.amount),
      unit: typeof raw.unit === 'string' ? raw.unit.trim().slice(0, LIMITS.unit) : '',
      step: isPositive(raw.step) ? roundValue(raw.step) : 1,
    };
  }

  function cleanHabit(raw, today, label, problems) {
    const fail = (why) => { problems.push(`${label}: ${why}.`); return null; };
    if (!raw || typeof raw !== 'object') return fail('is not a habit');
    if (typeof raw.id !== 'string' || !raw.id) return fail('has no id');
    if (typeof raw.name !== 'string' || !raw.name.trim()) return fail('has no name');
    const schedule = cleanSchedule(raw.schedule);
    if (!schedule) return fail('has an invalid schedule');
    const target = cleanTarget(raw.target);
    if (!target) return fail('has an invalid target');
    const startDate = D.isValid(raw.startDate) ? raw.startDate : today;
    if (schedule.type === 'interval' && !schedule.anchor) schedule.anchor = startDate;
    return {
      id: raw.id,
      name: raw.name.trim().slice(0, LIMITS.name),
      timeOfDay: TIMES_OF_DAY.includes(raw.timeOfDay) ? raw.timeOfDay : 'morning',
      schedule,
      target,
      startDate,
      archivedOn: D.isValid(raw.archivedOn) ? raw.archivedOn : null,
      reminder: typeof raw.reminder === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.reminder) ? raw.reminder : null,
    };
  }

  function cleanLog(raw, habit, problems) {
    const log = {};
    if (!raw || typeof raw !== 'object') return log;
    for (const [date, entry] of Object.entries(raw)) {
      if (!D.isValid(date) || !entry || typeof entry !== 'object') {
        problems.push(`${habit.name}: entry "${String(date).slice(0, 20)}" is not a valid log.`);
      } else if (entry.skipped === true) {
        log[date] = { skipped: true };
      } else if (isPositive(entry.value)) {
        log[date] = { value: roundValue(entry.value) };
      } else {
        problems.push(`${habit.name}: entry for ${date} has an invalid value.`);
      }
    }
    return log;
  }

  /** A log before the start date means the habit really began earlier, so the start follows the data. */
  function pullStartBack(habit, log) {
    for (const date of Object.keys(log)) if (date < habit.startDate) habit.startDate = date;
  }

  function cleanNotes(raw, problems) {
    const notes = {};
    if (!raw || typeof raw !== 'object') return notes;
    for (const [date, text] of Object.entries(raw)) {
      if (!D.isValid(date) || typeof text !== 'string') problems.push(`Daily note "${String(date).slice(0, 20)}" is invalid.`);
      else if (text.trim()) notes[date] = text.slice(0, LIMITS.note);
    }
    return notes;
  }

  function cleanSettings(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return { weekStart: s.weekStart === 0 ? 0 : 1, reminders: s.reminders === true };
  }

  /** Returns { state, problems }. state is null only when the data isn't state-shaped at all. */
  function cleanState(raw, today) {
    const problems = [];
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.habits)) {
      return { state: null, problems: ['The file has no list of habits.'] };
    }
    const seen = new Set();
    const habits = [];
    raw.habits.forEach((item, i) => {
      const habit = cleanHabit(item, today, `Habit ${i + 1}`, problems);
      if (!habit) return;
      if (seen.has(habit.id)) { problems.push(`Habit ${i + 1}: duplicate id "${habit.id.slice(0, 20)}".`); return; }
      seen.add(habit.id);
      habits.push(habit);
    });
    const rawLogs = raw.logs && typeof raw.logs === 'object' ? raw.logs : {};
    const logs = {};
    for (const habit of habits) {
      logs[habit.id] = cleanLog(rawLogs[habit.id], habit, problems);
      pullStartBack(habit, logs[habit.id]);
    }
    return { state: { habits, logs, notes: cleanNotes(raw.notes, problems), settings: cleanSettings(raw.settings) }, problems };
  }

  function parseNumber(text) {
    const trimmed = String(text).trim();
    return trimmed === '' ? NaN : Number(trimmed);
  }

  /** Validates the habit form. Returns { errors, fields }, where fields is safe to store when errors is empty. */
  function habitFields(v) {
    const errors = {};
    const name = v.name.trim();
    if (!name) errors.name = 'Give the habit a name.';
    else if (name.length > LIMITS.name) errors.name = `Keep the name to ${LIMITS.name} characters.`;

    let schedule = { type: 'daily' };
    if (v.scheduleType === 'weekdays') {
      if (!v.days.length) errors.days = 'Pick at least one day.';
      schedule = { type: 'weekdays', days: v.days };
    } else if (v.scheduleType === 'weekly') {
      const times = parseNumber(v.times);
      if (!isWhole(times, 1, 7)) errors.times = 'Enter a whole number from 1 to 7.';
      schedule = { type: 'weekly', times };
    } else if (v.scheduleType === 'interval') {
      const every = parseNumber(v.every);
      if (!isWhole(every, 2, 365)) errors.every = 'Enter a whole number from 2 to 365.';
      schedule = { type: 'interval', every };
    }

    let target = { type: 'check' };
    if (v.goalType === 'count') {
      const amount = parseNumber(v.amount);
      const step = parseNumber(v.step);
      if (!isPositive(amount)) errors.amount = `Enter a target above 0, up to ${MAX_VALUE.toLocaleString('en-US')}.`;
      if (!isPositive(step)) errors.step = 'Enter a step above 0.';
      if (v.unit.trim().length > LIMITS.unit) errors.unit = `Keep the unit to ${LIMITS.unit} characters.`;
      target = { type: 'count', amount: roundValue(amount), unit: v.unit.trim(), step: roundValue(step) };
    }

    if (!D.isValid(v.startDate)) errors.startDate = 'Enter a valid date.';
    return {
      errors,
      fields: { name, timeOfDay: v.timeOfDay, schedule, target, startDate: v.startDate, reminder: v.reminder || null },
    };
  }

  R.Validate = { cleanState, habitFields, parseNumber, roundValue, MAX_VALUE, LIMITS };
})(window.Rhythm);
