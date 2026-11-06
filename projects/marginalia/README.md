# Marginalia

Linked Markdown notes for writers, students and researchers, running entirely in the browser.

Author: Grehard

## Features

- **Markdown parser written from scratch:** headings, emphasis, nested lists, task lists, tables, fenced and indented code, blockquotes, links and autolinks.
- **Three views:** split, edit only and preview only, with a formatting toolbar and keyboard shortcuts. Lists continue on Enter and indent on Tab.
- **Tasks you tick in the preview:** the checkbox edits the matching line of the source, even inside nested lists and quotes.
- **Wiki links:** `[[Note title]]` and `[[Note title|alias]]`, with autocomplete. Following an unresolved link creates the note.
- **Backlinks panel:** which notes link here, how many times, and the line of context.
- **Link-safe renames:** renaming a note rewrites every link to it, keeps aliases, leaves code alone, and can be undone.
- **Ranked search:** across titles, tags, headings and text, with highlighted snippets and the reason for each match.
- **Graph view:** a force-directed SVG layout. Click a note to open it, drag to rearrange, pan and zoom. Dashed circles are unwritten notes.
- **Organisation:** folders, `#tags`, pinning, and a trash with restore.
- **Version history:** line-by-line comparison with the current text, restore and undo.
- **Files:** export a note as `.md` or everything as JSON, and import `.md` and JSON with validation.
- **Autosave** with a visible status, light and dark themes, full keyboard use, and a phone layout.

## Running it

Open `index.html`, or serve the folder with any static server. There is nothing to install or build.

## How the code is organized

Pure logic, with no DOM access:

| File | Purpose |
| --- | --- |
| `js/markdown-inline.js` | Inline parser: emphasis, code spans, links, wiki links, tags, URL safety |
| `js/markdown.js` | Block parser: lists, tables, quotes, code, headings |
| `js/links.js` | Link and tag extraction, backlinks, rename rewriting, graph model, task toggling |
| `js/search.js` | Scoring, ranking and snippets |
| `js/force.js` | Force layout simulation |
| `js/diff.js` | Line diff for version history |
| `js/store.js` | State, persistence, validation, note and folder operations |
| `js/transfer.js` | Export, and validated import planning |
| `js/seed.js` | First-run notes, with dates relative to today |

Interface, in `js/ui/`: `docview.js` (editor, preview, autosave), `textops.js` (formatting as pure functions), `autocomplete.js`, `sidebar.js`, `margin.js` (backlinks), `graph.js`, `history.js`, `dialogs.js`, `overlays.js` (modals and toasts) and `dom.js`. `js/app.js` wires these together and handles routing in the location hash.

Styles are in `css/`, split by area.

## Key engineering decisions

- **Safe output by construction.** The parser never passes source text through. Every character goes through one escape function and the only tags in the output are literals in the parser, so raw HTML shows as text. URLs use a scheme allowlist that runs after entities are decoded and invisible characters removed, which catches `java&#115;cript:` and `java<tab>script:`.
- **CommonMark's delimiter algorithm for emphasis.** `***a** b*`, `snake_case` and `2 * 3` come out correctly and tags always nest. A regex replace can't do this.
- **Source line numbers travel through parsing.** Block parsing works on `{text, n}` lines, so stripping a quote or list prefix keeps the original line number. That is how a preview checkbox finds its line.
- **Offset-preserving code masking.** Link and tag scanners run on a same-length copy of the note with code blanked out, so backlinks ignore code and renames can splice the original text at exact offsets.
- **Explainable search scores.** Scores are integers from named weights (title word 10, tag 6, heading 4, body word 2, capped at five hits), so a result's position can be worked out by hand and tested exactly.
- **Native undo survives formatting.** Toolbar edits apply only the changed range through `execCommand('insertText')`, which keeps the browser's undo stack, with a direct value update as the fallback.
- **Images render as links.** Opening a note should never make a network request, so `![alt](url)` becomes a link to the image.
- **A deterministic graph.** Nodes start on a sunflower spiral rather than at random positions, so the same notes always settle into the same picture.
- **Whole-state undo.** Destructive actions snapshot notes and folders first. The undo toast restores the snapshot, so a rename that touched many notes reverts in one step.
