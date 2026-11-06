# Stockroom

Point of sale and inventory for a small independent shop, running entirely in the browser. The demo data is a fictional neighbourhood hardware and plant shop.

Author: Grehard

## Features

- **Register:** product search, category tabs, SKU and barcode entry (`3*POT-TC6` adds three), cart editing, line and order discounts, tax, hold and resume, F-key shortcuts for every action.
- **Payment:** cash with quick tender and change due. Card is only a recorded label. Stockroom processes no payments, and says so on the card screen, the receipt and the settings page.
- **Receipts:** thermal-style receipt with a print stylesheet set for an 80mm roll.
- **Products:** variants, cost, price, SKU, barcode, supplier, reorder point and reorder quantity.
- **Stock ledger:** every unit that moves gets a row with its reason, reference, change and running balance. Adjustments need a reason. Change by an amount, or count to a number.
- **Refunds and returns:** whole or partial, per line, and each line either goes back to stock or doesn't.
- **Purchase orders:** draft, ordered, partially received, received. Receipts update stock and weighted-average cost. Short deliveries can be closed.
- **Low stock alerts:** one click drafts a reorder, in whole reorder lots, onto the supplier's open draft.
- **Reports:** revenue, gross profit, margin and top sellers by day, product and category, with hand-built SVG charts and tables.
- **End of day:** count the drawer by note and coin, see expected cash and over or short, and keep the history.
- **Data:** CSV export of products, sales and the ledger. JSON backup and validated restore. Reset demo data, with undo.

## How to run

Open `index.html`, or serve the folder with any static server. There is no build step and nothing to install. Data stays in `localStorage` in that browser.

## Keyboard

| Key | Action |
| --- | --- |
| F2 | Focus search |
| Enter | Add the SKU, barcode or highlighted result |
| Up, Down | Select a cart line, or move through results while searching |
| + and - | Change the selected line's quantity |
| Del | Remove the selected line |
| F3 | Edit the line's price or discount |
| F4 | Order discount |
| F7 | Pay by cash |
| F8 | Record a card sale |
| F9 | Hold the sale |
| F10 | Sales on hold |

## How the code is organized

```
js/core/    Logic with no DOM. money, pricing, catalog, inventory, cart, sales,
            purchasing, reports, cashup, csv, store, seed
js/ui/      DOM helpers, modals and toasts, forms, tables, SVG charts, receipt
js/views/   One file per screen, plus the register's dialogs
js/app.js   Navigation rail, hash routing, theme, save and redraw cycle
css/        Tokens and frame, shared components, register, other views, print
```

Scripts are classic `<script>` tags in dependency order, so the app also runs from `file://`.

## Key engineering decisions

- **Money is integer cents.** All rounding lives in `js/core/money.js`, as half-up on exact integer arithmetic, falling back to BigInt if a product would pass 2^53.
- **Discounts and tax allocate to lines.** Tax is computed once on the discounted taxable total. The order discount and the tax are then split across lines by largest remainder, so line amounts always add up to the order exactly.
- **Refunds telescope.** A partial refund takes the difference between two cumulative shares of the line, so any sequence of partial returns sums to the exact amount originally charged.
- **The ledger is the source of truth for movement.** `variant.stock` only changes through `inventory.post()`, and the Inventory screen replays the ledger against on-hand counts on every view.
- **Weighted-average cost uses landed cost.** Each receipt blends into the average, rounded half up to the cent. With no stock on hand, or an oversold negative count, the incoming cost replaces the average.
- **Gross margin follows the goods.** Sale lines keep the unit cost at the moment of sale. A restocked return reverses that cost. A return that doesn't go back on the shelf gives the revenue back but keeps the cost, because the goods are gone.
- **Refunds count on the day they happen,** so past days in reports never change.
- **The seed runs the shop.** Demo history goes through the same functions as the UI, with a seeded generator and dates relative to today, so it reconciles to the unit.
- **Rendering can't inject markup.** All DOM is built with `createElement` and text nodes. There is no `innerHTML` in the app.
- **Loaded data is checked first.** Storage and backup files pass through `store.validate()`. Bad storage falls back to the demo data with a notice, and a bad backup file is refused with its errors listed and current data untouched.
