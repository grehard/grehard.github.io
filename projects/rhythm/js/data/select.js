// Derived data for the views, cached per store revision so a render can ask freely.
(function (R) {
  'use strict';
  const D = R.Dates;
  const S = R.Streaks;
  const Store = R.Store;

  let cacheKey = '';
  let cache = new Map();

  const today = () => D.today();
  const weekStart = () => Store.get().settings.weekStart;
  const activeHabits = () => Store.get().habits.filter((h) => !h.archivedOn);
  const archivedHabits = () => Store.get().habits.filter((h) => h.archivedOn);

  function info(habit) {
    const key = `${Store.revision()}|${today()}|${weekStart()}`;
    if (key !== cacheKey) { cacheKey = key; cache = new Map(); }
    let entry = cache.get(habit.id);
    if (!entry) {
      const log = Store.logFor(habit.id);
      const timeline = S.timeline(habit, log, today(), weekStart());
      entry = { log, timeline, lookup: S.buildLookup(timeline), streaks: S.fromTimeline(timeline) };
      cache.set(habit.id, entry);
    }
    return entry;
  }

  function dayStatus(habit, date) {
    const { log, lookup } = info(habit);
    return S.dayStatus(habit, log, lookup, date, today());
  }

  const timelines = (habits) => habits.map((h) => info(h).timeline);
  const entries = (habits) => habits.map((h) => ({ habit: h, log: info(h).log }));

  function dayOverall(habits, date) {
    return R.Stats.dayTotals(habits.map((h) => dayStatus(h, date)));
  }

  /** The earliest year with any history, used to offer year views on the heatmaps. */
  function firstYear(habits) {
    const dates = habits.map((h) => h.startDate);
    return D.yearOf(dates.length ? dates.sort()[0] : today());
  }

  function formatValue(n) {
    return Number.isInteger(n) ? n.toLocaleString('en-US') : String(n);
  }

  function formatStreak(habit, n) {
    return `${n.toLocaleString('en-US')} ${R.Schedule.streakUnit(habit.schedule, n)}`;
  }

  function describeGoal(habit) {
    if (habit.target.type !== 'count') return 'Yes or no';
    return `${formatValue(habit.target.amount)} ${habit.target.unit}`.trim();
  }

  R.Select = { today, weekStart, activeHabits, archivedHabits, info, dayStatus, timelines, entries, dayOverall, firstYear, formatValue, formatStreak, describeGoal };
})(window.Rhythm);
