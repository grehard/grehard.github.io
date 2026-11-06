# Coinpath

A personal finance tracker for seeing where your money goes and staying within budget. It runs entirely in the browser.

Author: Grehard

## Features

- Multiple accounts with opening balances, and net worth split into assets and money owed
- Income, expense and transfer transactions with categories and notes
- Search, plus filters by date range, account, category and type
- A running balance column for any single account, correct under any search or filter
- Monthly category budgets with progress, near-limit and over-budget states
- Weekly and monthly recurring rules that post themselves on load and catch up missed periods, with pause, resume and an optional end date
- A dashboard with net worth, income against spending, a spending-by-category donut and a 12-month cash flow chart, both with hover values
- A currency setting with 12 two-decimal currencies
- CSV import with a column-mapping step, date format detection, separate in and out columns, and duplicate detection
- CSV export of any filtered list, and JSON backup and restore
- Undo on every data change, light and dark themes, keyboard support, and a layout that works at phone width

## How to run

Open `index.html` in a browser, or serve this folder with any static server. There is nothing to build or install.

## How the code is organized

- `js/core/`: logic with no DOM access
  - `money.js`: parses and formats integer cents
  - `dates.js`: calendar arithmetic on `YYYY-MM-DD` strings
  - `csv.js`: RFC 4180 reader and writer
  - `store.js`: `localStorage` persistence and validation of untrusted data
  - `ledger.js`: balances, running balances, totals, cash flow and filtering
  - `budgets.js`: limits by month and the budget report
  - `recurring.js`: occurrence dates and posting
  - `importer.js`: column guessing, row parsing and duplicate detection
  - `exporter.js`: CSV and JSON downloads
  - `seed.js`: demo data relative to today, and the sample statement
- `js/ui/`: DOM helpers, modals and toasts, theme, SVG charts, and the transaction form
- `js/views/`: one file per page, plus the import flow
- `js/app.js`: state ownership, the save-and-redraw cycle, routing and undo

## Key engineering decisions

**Integer cents, with no floats on the way in.** `Money.parse` works on the digit string, so `19.99` can't become `1998` through binary rounding. `Money.format` splits with integer division. It accepts `1,234.50`, `1.234,50`, `(12.00)` and `$-5`, and refuses `1.234` because it means different things in different locales.

**Balances are derived, never stored.** A running balance is the opening balance plus each transaction's effect in date order, with a sequence number breaking same-day ties. A back-dated entry, an edit or an undo can't leave a stored balance out of step. Filters apply after the calculation, so a filtered row still shows its true balance.

**Transfers are their own type.** A transfer has a from and a to account. It moves both balances, leaves net worth unchanged, and is skipped by every income, spending and budget total because those only count the `income` and `expense` types.

**Recurring catch-up walks one stored date.** Each rule holds `nextDate`. Posting loops while that date is due, so a period posts exactly once however long the app went unopened. Monthly rules step from a stored `anchorDay` rather than the previous date, so a rule on the 31st posts on Feb 28 and returns to Mar 31. Resuming a paused rule skips the paused periods, since pausing means those payments weren't wanted.

**Budget limits are effective-dated.** Editing a limit applies from the viewed month onward, and earlier months keep the limit they had, so history doesn't change when a budget does.

**Duplicate detection counts matches.** A row matches on account, date, signed amount and normalized description. Using counts rather than a set means two identical coffees in the ledger absorb two matching rows, and a third is new. Re-importing a statement finds every row, while real repeat purchases in a new file are flagged but kept.

**Undo is a state snapshot.** Each change saves a JSON copy of the state, and Undo restores it through the same validation as loading. One mechanism covers everything, including deleting an account with its transfers.

**Currency is a label.** Changing it doesn't convert amounts. Zero-decimal currencies such as the yen are left out because they would hide stored cents.

**Chart palette.** Category colors use a categorical palette checked with a color-vision-deficiency validator for adjacent slices. Colors belong to the category, so they don't change when a month's ranking does.
