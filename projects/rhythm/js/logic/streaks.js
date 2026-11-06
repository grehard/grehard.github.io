// Evaluates periods against a habit's log. Pure: everything comes in as arguments.
// Period status:
//   met       enough completions (or at least one, when skips excused the whole requirement)
//   excused   skips removed the requirement and nothing was done; ignored by streaks and rates
//   open      not met yet, but the period hasn't ended; can't break a streak
//   missed    ended without being met; resets the current streak
(function (R) {
  'use strict';
  const D = R.Dates;

  const goal = (habit) => (habit.target.type === 'count' ? habit.target.amount : 1);
  const isComplete = (habit, entry) => !!entry && !entry.skipped && entry.value >= goal(habit);

  /** Archived habits are measured as of the day they were archived, so their streak stays frozen. */
  const asOfFor = (habit, today) => (habit.archivedOn && habit.archivedOn < today ? habit.archivedOn : today);

  function evaluate(period, habit, log, asOf) {
    let done = 0;
    let skips = 0;
    const lastDay = period.end < asOf ? period.end : asOf;
    for (const date of D.eachDay(period.start, lastDay)) {
      const entry = log[date];
      if (!entry) continue;
      if (entry.skipped) skips++;
      else if (isComplete(habit, entry)) done++;
    }
    const required = Math.max(0, period.required - skips);
    let status = 'missed';
    if (done > 0 && done >= required) status = 'met';
    else if (required === 0) status = 'excused';
    else if (period.end >= asOf) status = 'open';
    return { ...period, done, skips, requiredAfterSkips: required, status, anchor: lastDay };
  }

  function timeline(habit, log, today, weekStart = 1) {
    const asOf = asOfFor(habit, today);
    return R.Schedule.periods(habit, asOf, weekStart).map((p) => evaluate(p, habit, log, asOf));
  }

  function fromTimeline(items) {
    let run = 0;
    let best = 0;
    for (const period of items) {
      if (period.status === 'met') { run++; if (run > best) best = run; }
      else if (period.status === 'missed') run = 0;
    }
    return { current: run, best };
  }

  function compute(habit, log, today, weekStart = 1) {
    return fromTimeline(timeline(habit, log, today, weekStart));
  }

  /** Maps each date to its evaluated period. Days outside any period (unscheduled days) are absent. */
  function buildLookup(items) {
    const lookup = {};
    for (const period of items) {
      for (const date of D.eachDay(period.start, period.end)) lookup[date] = period;
    }
    return lookup;
  }

  /**
   * What a single calendar day means for a habit:
   * future, before, done, partial, skipped, rest (nothing needed), due (today), open, missed.
   */
  function dayStatus(habit, log, lookup, date, today) {
    if (date > today) return 'future';
    const entry = log[date];
    if (entry && entry.skipped) return 'skipped';
    if (isComplete(habit, entry)) return 'done';
    if (entry && entry.value > 0) return 'partial';
    if (date < habit.startDate) return 'before';
    const period = lookup[date];
    if (!period || period.status === 'met' || period.status === 'excused') return 'rest';
    if (period.status === 'missed') return 'missed';
    return date === today ? 'due' : 'open';
  }

  R.Streaks = { goal, isComplete, asOfFor, evaluate, timeline, fromTimeline, compute, buildLookup, dayStatus };
})(window.Rhythm);
