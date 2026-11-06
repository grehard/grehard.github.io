// Decides which reminders are due. Kept apart from the Notification plumbing so it can be tested alone.
(function (R) {
  'use strict';
  const LATE_LIMIT_MINUTES = 30;

  const minutesOf = (hhmm) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

  /** A reminder fires once a day, up to half an hour late, so opening the tab at night doesn't replay the morning. */
  function dueReminders(habits, nowMinutes, firedIds, isOutstanding) {
    return habits.filter((habit) => {
      if (!habit.reminder || habit.archivedOn || firedIds.includes(habit.id)) return false;
      const late = nowMinutes - minutesOf(habit.reminder);
      return late >= 0 && late <= LATE_LIMIT_MINUTES && isOutstanding(habit);
    });
  }

  R.ReminderRules = { dueReminders, minutesOf };
})(window.Rhythm);
