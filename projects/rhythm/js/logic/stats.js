// Completion rates, trends and weekday figures. All pure.
// A rate is credited units over expected units, with three rules that keep it honest and guilt-free:
//   excused periods are left out; an open period only counts what's already done;
//   a period belongs to the range containing its last elapsed day.
(function (R) {
  'use strict';
  const D = R.Dates;
  const S = R.Streaks;

  function periodUnits(period) {
    if (period.status === 'excused') return { done: 0, expected: 0 };
    if (period.status === 'met') {
      const units = Math.max(period.requiredAfterSkips, Math.min(period.done, period.required));
      return { done: units, expected: units };
    }
    const done = Math.min(period.done, period.requiredAfterSkips);
    return { done, expected: period.status === 'open' ? done : period.requiredAfterSkips };
  }

  /** timelines is an array of evaluated period lists, one per habit. */
  function rateInRange(timelines, from, to) {
    let done = 0;
    let expected = 0;
    for (const items of timelines) {
      for (const period of items) {
        if (period.anchor < from || period.anchor > to) continue;
        const units = periodUnits(period);
        done += units.done;
        expected += units.expected;
      }
    }
    return { done, expected, rate: expected ? done / expected : null };
  }

  /** The last `weeks` calendar weeks ending with the current one, oldest first. */
  function weeklyTrend(timelines, today, weekStart = 1, weeks = 12) {
    const current = D.startOfWeek(today, weekStart);
    const result = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const start = D.addDays(current, -7 * i);
      const end = D.addDays(start, 6);
      result.push({ start, end, isCurrent: i === 0, ...rateInRange(timelines, start, end) });
    }
    return result;
  }

  /**
   * For each weekday: completions as a share of the days the habit could have been done.
   * Weekday habits only count their scheduled days; skipped days and an unfinished today are left out.
   * entries is [{ habit, log }]. Returned in display order for the week start.
   */
  function weekdayRates(entries, from, to, today, weekStart = 1) {
    const tally = D.weekOrder(weekStart).map((day) => ({ day, done: 0, possible: 0, rate: null }));
    const slot = {};
    tally.forEach((t) => { slot[t.day] = t; });
    for (const { habit, log } of entries) {
      const asOf = S.asOfFor(habit, today);
      const first = habit.startDate > from ? habit.startDate : from;
      const last = asOf < to ? asOf : to;
      if (first > last) continue;
      for (const date of D.eachDay(first, last)) {
        const day = D.weekday(date);
        if (habit.schedule.type === 'weekdays' && !habit.schedule.days.includes(day)) continue;
        const entry = log[date];
        if (entry && entry.skipped) continue;
        const complete = S.isComplete(habit, entry);
        if (date === today && !complete) continue;
        slot[day].possible++;
        if (complete) slot[day].done++;
      }
    }
    tally.forEach((t) => { t.rate = t.possible ? t.done / t.possible : null; });
    return tally;
  }

  /** Highest rate wins. Ties go to the day that comes first in the week. */
  function bestWeekday(rates) {
    let best = null;
    for (const t of rates) if (t.rate !== null && (!best || t.rate > best.rate)) best = t;
    return best;
  }

  /** Progress within one calendar week, counting the whole week's expected units, not just elapsed ones. */
  function weekProgress(habit, log, weekFrom, today, weekStart = 1) {
    const weekTo = D.addDays(weekFrom, 6);
    const asOf = S.asOfFor(habit, today);
    let done = 0;
    let expected = 0;
    for (const period of R.Schedule.periods(habit, weekTo, weekStart)) {
      if (period.end < weekFrom || period.end > weekTo) continue;
      const evaluated = S.evaluate(period, habit, log, asOf < period.end ? asOf : period.end);
      expected += evaluated.requiredAfterSkips;
      done += Math.min(evaluated.done, evaluated.requiredAfterSkips);
    }
    return { done, expected };
  }

  /** One day across many habits, for the overall heatmap. statuses is a list of dayStatus values. */
  function dayTotals(statuses) {
    let done = 0;
    let total = 0;
    for (const status of statuses) {
      if (status === 'done') { done++; total++; }
      else if (status === 'partial' || status === 'due' || status === 'missed') total++;
    }
    return { done, total, ratio: total ? done / total : null };
  }

  /** Maps a 0-1 ratio to heatmap shade 1-4. Zero stays 0 so an empty day reads as empty. */
  function shade(ratio) {
    if (!ratio) return 0;
    return ratio >= 1 ? 4 : ratio >= 0.67 ? 3 : ratio >= 0.34 ? 2 : 1;
  }

  const percent = (rate) => (rate === null || rate === undefined ? '-' : `${Math.round(rate * 100)}%`);

  R.Stats = { periodUnits, rateInRange, weeklyTrend, weekdayRates, bestWeekday, weekProgress, dayTotals, shade, percent };
})(window.Rhythm);
