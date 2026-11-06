# Laneboard

A project board for small teams to plan and track work, across several projects, in the browser with no backend.

Author: Grehard

## Features

- Multiple projects, each with its own custom lanes, card numbering and archive
- Lanes you can add, rename, reorder and delete, with optional work-in-progress limits
- A visible limit state: tick gauge, "At limit" and "1 over limit" labels, a tinted lane, and a line in the list where the limit was passed
- Drag and drop for cards (across and within lanes) and for lanes, with mouse, pen or touch
- A keyboard alternative: press M on a card, or use its menu, to reach "Move to" and the up, down, top and bottom moves
- Card details: title, description, assignee from an editable team list, labels, priority, due date, checklist with progress, and a timestamped activity log with notes
- Filters by text, assignee, label and overdue, which combine
- Month calendar of due dates, sortable table view, and an archive with restore
- Undo for moves, deletes, archiving and additions, from the toast, the toolbar or Ctrl+Z
- JSON export and validated import, and a Reset demo data control
- Light and dark themes, usable from 390px wide

## Running it

Open `index.html`, or serve the folder with any static server. There is nothing to install or build.

## How the code is organized

```
index.html           Page shell and script order
css/                 tokens (theme and controls), layout, board, views, panel, overlays
js/theme.js          Applies the remembered theme before first paint
js/dates.js          Local calendar dates as YYYY-MM-DD strings
js/model.js          Pure logic: moving, limits, filters, sorting, validation
js/seed.js           First-run workspace, with dates relative to today
js/store.js          localStorage with fallback to memory, normalizing, import, export
js/undo.js           The stack of inverse operations
js/actions.js        Every change: mutate, log, record undo, save, redraw
js/ui/               One file per surface: board, calendar, table, archive, panel, rail,
                     top bar, filter bar, plus drag, menu, modal, toast, forms and editors
js/app.js            Startup, hash routing, and the render loop
```

## Key engineering decisions

**Moves are "insert before this card", not an index.** With a filter on, the board shows only some of a lane's cards, so a position on screen isn't a position in the list. Dropping records the next visible card and the model inserts in front of it, which leaves the hidden cards exactly where they were. A drop back into the original gap is detected and does nothing, so it never records a false move.

**Undo stores inverse operations, not snapshots.** Undoing a move puts that one card back. A snapshot would also revert any title or checklist edit made after the move. Additions are on the stack too, so the stack stays consistent when lanes or cards come and go. Reset and import replace the whole workspace, so they clear older entries and hold the previous workspace as their own undo. The stack is in memory and starts empty on each visit.

**One drag path for mouse and touch.** Everything goes through pointer events. Mouse drags start after 5px of movement. Touch drags start after a 220ms press, so a swipe still scrolls the board. Since `touch-action` can't change mid-gesture, a non-passive `touchmove` listener stops scrolling once a drag has begun. Pointer capture sits on a stable ancestor rather than the dragged card, which is hidden during the drag, and it keeps the drag alive if the pointer leaves the iframe the app may be embedded in.

**Limits warn rather than block.** Going over a limit is sometimes the right call, so the board allows it and makes it obvious. While hovering, a lane states that the drop would pass its limit. The count always includes every card in the lane, whatever the filter shows.

**Rendering is plain and full.** Each change redraws from state using a small element builder that only ever inserts user text as text nodes, so there is no markup escaping to get wrong. Focus and scroll positions are restored by key after each redraw. A redraw that arrives while a pointer is held waits for release, because replacing the element under the pointer would lose the click. This happens when pressing a button makes a text field commit on blur.

**Saved data and imported files share one validator.** Both pass through the same normalizing step: structural problems are reported, while small ones are repaired, such as a card listed twice or an unknown assignee. If saved data is unusable the app loads the demo data and says so. If an import is unusable the board is unchanged and the reasons are listed.
