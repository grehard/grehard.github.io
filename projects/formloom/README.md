# Formloom

A drag-and-drop form and survey builder for people collecting responses without a developer. It runs entirely in the browser.

Author: Grehard

## Features

- Three-pane builder: field palette, form canvas and property panel
- 13 field types: short text, long text, email, phone, number, date, rating, scale, single choice, multiple choice, dropdown, file name capture and section break
- Add and reorder with pointer drag, or use the keyboard (arrow keys on a field's handle) and buttons
- Undo and redo for every builder edit, with fast typing merged into one step
- Validation: required, min/max for length, value, date and selection count, regular expressions, and custom messages
- Conditional logic ("show this field when...") with all/any matching, chains and multi-page forms
- Theme settings for the published form: accent, background, font, corners and header style
- Respondent view with real validation, progress and a confirmation screen, in light and dark
- Responses stored locally, shown in a sortable and filterable table and a per-question summary with hand-built SVG charts
- CSV export of the rows on screen, JSON export and import of forms, five templates, and reset to demo data
- Share links that carry the whole form in the URL hash and open directly in respondent mode

File name capture stores a file's name, size and type only. Its contents are never read, uploaded or stored, and the form tells respondents so.

## Running it

Open `index.html`, or serve the folder with any static server. There is no build step and nothing to install.

## How the code is organized

Classic scripts in dependency order, sharing one `FL` namespace, so the app also runs from `file://`.

| Folder | Contents |
| --- | --- |
| `js/core/` | Logic with no UI: field registry, schema normalization, conditional logic, validation, share link codec, CSV |
| `js/data/` | Templates and first-run seed data |
| `js/state/` | The localStorage-backed store and the undo history |
| `js/ui/` | Modals, toasts, theme math, charts, share dialog and the form library |
| `js/respondent/` | Question controls and the fill-in flow |
| `js/builder/` | Pointer drag, form edit operations, canvas, property panel and settings |
| `js/responses/` | Filtering and statistics, the table, and the summary |
| `js/app.js` | Hash routing and the top bar |
| `css/` | Shared styles, the published form, the builder, and the other views |

## Key engineering decisions

**Logic is predictable, even when it is wrong.** A hidden question counts as unanswered, even if it was answered before being hidden, so closing one branch collapses everything downstream of it and stale answers are never stored. An unanswered source makes a condition false, except "is not answered". Loops can't be created in the builder, because the question list disables any source that depends on the current field. They can still arrive in an imported file, so the evaluator finds them first with Tarjan's strongly connected components and keeps their members hidden. The result doesn't depend on evaluation order, and the canvas flags the affected fields.

**Share links need no server.** A form is pruned of default values, compressed with a hand-written LZW coder and encoded as base64url. The dictionary is primed with typical form JSON, which helps most on small forms. A checksum and length header make a truncated link fail with a clear message instead of opening a broken form. Everything decoded from a link or file goes through the same normalizer as saved data.

**Answers have an honest route home.** With no backend, answers stay in the browser that filled the form. When the form isn't owned by that browser, the confirmation screen offers a reply link, compressed the same way. Opening it in the owner's browser adds the response, once.

**Respondent input is treated as hostile.** All text is rendered through text nodes, never HTML. CSV follows RFC 4180, and text answers starting with `=`, `+`, `-` or `@` get a leading apostrophe to stop spreadsheet formula injection; number and phone fields are exempt because `-5` and `+1 555 0100` are legitimate. Regular expressions can arrive in a link, so patterns with nested repeats such as `(a+)+` are refused, since they can freeze the tab.

**Drag doesn't touch the form until release.** The drop target is recalculated from layout on every pointer move, so Escape or a cancelled touch leaves the form unchanged, and each drag is exactly one undo step.
