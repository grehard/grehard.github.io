# Rhythm

A habit tracker for building routines without guilt-driven gimmicks.

Author: Grehard

## Features

- Habits with four schedules: every day, specific weekdays, N times per week, every N days
- Yes or no goals, or measurable targets (8 glasses, 30 minutes) with a quick log
- Today view grouped by morning, afternoon and evening, with one-tap completion
- Skip days that don't break a streak
- Week grid for backfilling past days, usable with arrow keys
- Current and best streak for every schedule type
- Year heatmap per habit and overall, with a year picker
- Statistics: completion rate, 12-week trend, best weekday and a per-habit table
- Archive, restore, delete with undo, and reorder by drag or buttons
- Daily note and a searchable journal
- Optional reminders while the tab is open, falling back to in-app messages when notifications are denied, unsupported or inside an iframe
- JSON and CSV export, validated JSON import, reset to demo data
- Light and dark themes, responsive down to 390px

## Run it

Open `index.html`, or serve the folder with any static server. There is no build step and nothing to install. All data stays in `localStorage`.

## How the code is organized

```
js/logic/    Pure functions with no DOM or storage access
  dates.js            Calendar dates as strings, arithmetic on day numbers
  schedule.js         Turns a habit into its list of periods
  streaks.js          Evaluates periods, computes streaks, classifies a single day
  stats.js            Completion rates, weekly trend, best weekday
  reminder-rules.js   Which reminders are due right now
js/data/     State: validation, seed data, store, cached selectors, import and export
js/ui/       DOM helpers, modal and toast, form parts, SVG charts, shared dialogs
js/views/    One file per screen
js/reminders.js  Notification permission handling and delivery
js/app.js    Hash routing and re-rendering
```

## Key engineering decisions

**One streak algorithm for all schedules.** Each schedule compiles to a list of periods, each with a number of completions required: one per day, one per scheduled day, N per calendar week, or one per N-day cycle. Each period is then met, excused, open or missed. Streaks walk that list: met adds one, missed resets, excused and open do nothing. Completion rates read the same list, so streaks and rates can't disagree.

**Skips.** A skip lowers its period's requirement by one. On a daily habit that sets the day aside. In a 3-times-a-week habit it means two completions keep the week. A skip is never counted as a completion, and skipped periods are left out of rates.

**Open periods don't count against you.** Today, or the current week, can't break a streak until it has ended, and it only enters a rate for what's already been done.

**Partial first weeks.** A 5-times-a-week habit started on a Saturday only has two days available that week, so that week requires two.

**Cycles keep their phase.** "Every N days" counts from a fixed anchor date, and one completion anywhere in the cycle satisfies it. Backfilling before the start date moves the start back without shifting the cycles.

**DST-safe dates.** Dates are `YYYY-MM-DD` strings. Arithmetic converts to a whole-number day index through `Date.UTC`, so a 23 or 25 hour day can't move a date. Local time is read in exactly one function, `Dates.today`.

**Untrusted data.** Local storage and imported files pass through the same validator. Loading drops what's invalid and carries on. Import refuses the whole file and lists the problems. All text reaches the page through text nodes, never as markup.

**Rendering.** Views are plain functions that rebuild their DOM from state. Focus and inner scroll positions are carried across each redraw, so keyboard use isn't interrupted by one-tap actions.
