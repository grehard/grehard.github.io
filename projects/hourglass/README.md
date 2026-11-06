# Hourglass

Time tracking and timesheets for freelancers and consultants, running entirely in the browser.

Author: Grehard

## Features

- Start/stop timer that survives reloads and shows in the tab title, with an editable start time
- Focus sessions with configurable work, break and round counts, and a chime generated with the Web Audio API
- Clients and projects with hourly rates, budget hours and colors, plus tags
- Manual entries, editing, splitting, and overlap warnings that update as you type
- Day timeline with drag-to-add, and a week timesheet grid where every cell is editable
- Quick resume of recent tasks
- Reports filtered by date range, client, project, tag and billable, grouped by project or day, with SVG charts and billable totals
- Budget progress and over-budget alerts
- Printable timesheet, CSV and JSON export, validated JSON import
- Light and dark themes, keyboard support, and a phone layout

## How to run

Open `index.html`, or serve the folder with any static server. There is no build step and nothing to install. Data stays in this browser's `localStorage`. **Reset demo data** in Settings restores the sample data.

## How the code is organized

Plain scripts, loaded in order, sharing one `HG` namespace.

- `js/core/`: logic with no UI. `time.js` (dates and durations), `calc.js` (rounding, midnight cuts, overlaps, cell edits), `store.js` (state, validation, persistence), `seed.js`, `budget.js`, `report.js`, `export.js`
- `js/ui/`: modals, toasts and shared form controls
- `js/features/`: the timer, focus sessions, Web Audio chimes, the timer bar and the entry and split forms
- `js/views/`: one file per screen, plus `timeline.js` and `charts.js`
- `js/app.js`: hash routing, navigation and the clock tick
- `css/`: `base.css` (tokens and controls), `layout.css` (frame), `views.css` (screens), `print.css`

## Key engineering decisions

- **Time is stored, never counted.** A running timer is a single start timestamp and elapsed time is always `now - start`, so reloads, sleep and throttled background tabs can't make it drift. Focus sessions work the same way: on load they walk through any phases that ended while the page was closed and file those work intervals with their exact times.
- **Midnight is handled in one place.** `calc.portions` cuts an entry at each local midnight using the calendar rather than adding 24 hours, so daylight saving days stay correct. Rounding applies once to the whole entry, and the difference lands on the last day, so 23:50 to 00:22 bills 45 minutes rather than 15 + 30.
- **Money is summed exactly.** Totals add up `milliseconds x rate in cents` and round only for display. Rounding each entry to cents first would make three 10-minute entries at 95/h total 47.49 instead of 47.50.
- **Timesheet cells edit real entries.** Lowering a cell trims the latest entries and removes any that reach zero. Raising it extends the day's last entry if the time after it is free, or adds an entry in the first free gap. Every edit can be undone.
- **User text only reaches the page through text nodes.** All DOM goes through a small `h()` helper, and there is no `innerHTML` anywhere in the app.
- **Nothing trusts stored data.** Everything from `localStorage` is cleaned on load, so corrupt data can't crash the app. Imports are stricter: a file with any problem is rejected with specific messages, and nothing changes.
