// A schedule turns into a list of "periods": spans of time with a number of completions required.
// Streaks and completion rates are defined over periods, so every schedule type shares one algorithm.
//   daily     one period per day, 1 required
//   weekdays  one period per scheduled day, 1 required
//   weekly    one period per calendar week, N required (fewer in a partial first week)
//   interval  one period per N-day cycle counted from the anchor date, 1 required
(function (R) {
  'use strict';
  const D = R.Dates;

  function weekPeriods(habit, asOf, weekStart) {
    const periods = [];
    const last = D.startOfWeek(asOf, weekStart);
    for (let start = D.startOfWeek(habit.startDate, weekStart); start <= last; start = D.addDays(start, 7)) {
      const end = D.addDays(start, 6);
      const firstOpenDay = start > habit.startDate ? start : habit.startDate;
      const daysAvailable = D.diffDays(end, firstOpenDay) + 1;
      periods.push({ start, end, required: Math.min(habit.schedule.times, daysAvailable) });
    }
    return periods;
  }

  function intervalPeriods(habit, asOf) {
    const every = habit.schedule.every;
    const anchor = habit.schedule.anchor || habit.startDate;
    const cycle = Math.floor(D.diffDays(habit.startDate, anchor) / every);
    const periods = [];
    for (let start = D.addDays(anchor, cycle * every); start <= asOf; start = D.addDays(start, every)) {
      periods.push({ start, end: D.addDays(start, every - 1), required: 1 });
    }
    return periods;
  }

  function dayPeriods(habit, asOf) {
    const days = D.eachDay(habit.startDate, asOf);
    const scheduled = habit.schedule.type === 'weekdays'
      ? days.filter((d) => habit.schedule.days.includes(D.weekday(d)))
      : days;
    return scheduled.map((d) => ({ start: d, end: d, required: 1 }));
  }

  /** Every period from the habit's start through the one containing asOf, oldest first. */
  function periods(habit, asOf, weekStart = 1) {
    if (habit.startDate > asOf) return [];
    if (habit.schedule.type === 'weekly') return weekPeriods(habit, asOf, weekStart);
    if (habit.schedule.type === 'interval') return intervalPeriods(habit, asOf);
    return dayPeriods(habit, asOf);
  }

  function describe(schedule, weekStart = 1) {
    if (schedule.type === 'daily') return 'Every day';
    if (schedule.type === 'weekly') return schedule.times === 1 ? 'Once a week' : `${schedule.times} times a week`;
    if (schedule.type === 'interval') return `Every ${schedule.every} days`;
    if (schedule.days.length === 7) return 'Every day';
    return D.weekOrder(weekStart).filter((d) => schedule.days.includes(d)).map(D.dayShort).join(', ');
  }

  /** The unit a streak is counted in. Weekday habits count scheduled days, not calendar days. */
  function streakUnit(schedule, n) {
    const word = schedule.type === 'weekly' ? 'week' : schedule.type === 'interval' ? 'cycle' : 'day';
    return n === 1 ? word : `${word}s`;
  }

  function streakRule(habit) {
    const s = habit.schedule;
    if (s.type === 'weekly') {
      return `Counts calendar weeks with ${s.times} ${s.times === 1 ? 'completion' : 'completions'}. Each skip lowers that week's target by one, and the current week can't break a streak until it ends.`;
    }
    if (s.type === 'interval') {
      return `Counts ${s.every}-day cycles with at least one completion. A skipped cycle is set aside, neither counted nor broken.`;
    }
    if (s.type === 'weekdays') {
      return 'Counts scheduled days only. Other days are ignored, and a skipped day is set aside, neither counted nor broken.';
    }
    return 'Counts days completed in a row. A skipped day is set aside, neither counted nor broken, and today stays open until it ends.';
  }

  R.Schedule = { periods, describe, streakUnit, streakRule };
})(window.Rhythm);
