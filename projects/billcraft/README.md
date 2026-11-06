# Billcraft

Invoicing for freelancers and small studios. Runs entirely in the browser with no account or server.

Author: Grehard

## Features

- Business profile: name, address, tax ID, logo upload (stored as a data URL), default terms, currency, paper size
- Client directory with search, per-client payment terms and notes
- Catalogue of reusable items
- Invoice editor with live paper preview, lines reordered by drag, keyboard or buttons, per-line tax, percentage or fixed discount, notes, and a due date worked out from payment terms
- Automatic sequential numbering for invoices and quotes
- Statuses: draft, sent, partially paid, paid, and overdue computed from the date
- Multiple partial payments per invoice, each editable and removable
- Quotes with accepted, declined and expired states, which convert to invoices
- Duplicate for any invoice or quote
- Print stylesheet that gives a clean A4 or Letter document with no app interface, ready to save as PDF
- Dashboard with outstanding, overdue, paid this month, aged receivables and a by-client breakdown
- Per-client statements with opening balance, running balance and aging summary
- CSV export of invoices, line items, payments, quotes, clients, catalogue and statements
- JSON backup and validated JSON import
- Undo on destructive actions, light and dark themes, usable at phone width and by keyboard

## How to run

Open `index.html` in a browser, or serve this folder with any static server. There is nothing to install or build.

## How the code is organized

```
index.html
css/
  base.css          tokens, light and dark themes
  layout.css        side rail, phone top bar and tab bar
  components.css    buttons, fields, tables, badges, modals, toasts
  views.css         dashboard, detail, editor and settings layouts
  paper.css         the invoice document itself
  print.css         print rules
js/
  core/dates.js     calendar arithmetic on day strings
  core/money.js     integer parsing, rounding and formatting
  core/calc.js      totals, status, aging, statements, numbering (no DOM)
  core/csv.js       CSV writer
  core/dom.js       DOM builder and icons
  core/theme.js     theme preference, runs before first paint
  data/seed.js      demo data, dated relative to today
  data/schema.js    validation for stored and imported data
  data/store.js     state, persistence and all mutations
  data/exporter.js  CSV and JSON downloads
  ui/widgets.js     modal, toast, fields and other shared pieces
  ui/paper.js       renders invoices, quotes and statements
  views/            one file per screen
  app.js            shell and hash router
```

## Key engineering decisions

**Integer money.** Amounts are stored as integer cents, quantities as thousandths and percentages as basis points. Input is parsed from its digits, not through floats, and multiplication and rounding use BigInt, so `1.005 x 1.00` is `1.01` where floats would give `1.00`.

**How a total is worked out.** Each line net is rounded half away from zero. The discount comes off before tax and is shared across lines by the largest remainder method, so the shares always add up to the discount exactly. Discounted nets are then grouped by tax rate and tax is rounded once per rate. Every row of the printed tax summary is therefore exactly rate times base, which is how a bookkeeper would check it.

**Overdue is derived, not stored.** Only draft or sent is stored. Partially paid, paid and overdue are computed from the payments and today's date, so an invoice becomes overdue on its own. The due date itself still counts as on time. Overdue outranks partially paid because it is the state that needs action.

**Numbering.** A number is taken when a document is first saved, so abandoning the editor uses nothing. Deleting the newest draft hands its number back. A sent invoice's number is never reused, even after deletion. The counter can be moved forward in Settings, never behind a number in use.

**One document, three contexts.** The editor preview, the detail page and the printed page render the same markup. On screen the sheet is scaled like a page, and it reflows on phones where a scaled page would be unreadable. Print removes the scaling and the app around it.

**No HTML strings.** All interface is built with a small DOM helper that only writes user content through text nodes, so user text cannot become markup.

**Safe loading.** Stored and imported data pass through the same field-by-field validator. Loading keeps whatever is valid so corrupt data cannot crash the app. Import is strict: any problem is listed and nothing changes.

**Undo by snapshot.** Destructive actions keep a snapshot of the state and offer undo in a toast. Any later change closes the offer, so an undo can never overwrite newer work.
