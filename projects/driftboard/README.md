# Driftboard

An infinite whiteboard for diagrams, wireframes and system sketches. It runs entirely in the browser.

Author: Grehard

## Features

- Infinite canvas with smooth pan and zoom to cursor, by wheel, trackpad, pinch and keyboard
- Tools: select, hand, rectangle, ellipse, diamond, line, arrow, freehand pen with smoothing, text, sticky note, eraser
- Straight and elbow connectors that attach to shapes and re-route when shapes move, resize or rotate
- Click, Shift-click and marquee selection. Dragging right selects shapes fully inside; dragging left selects anything touched
- Move, resize with handles and rotate, for single shapes, multi-selections and groups
- Grid snapping and alignment guides, with rulers along the canvas edges
- Style panel: stroke, fill, width, line style, opacity, font size, connector route
- Numeric position, size and rotation fields
- Layer order, group and ungroup, lock, align, duplicate, copy, cut and paste
- Complete undo and redo, kept per board
- Multiple named boards: create, rename, search, duplicate, delete with undo
- Inline text editing on double-click, including connector labels
- Minimap with click and drag navigation
- Export PNG or SVG of the selection or whole board, and save or load JSON with validation
- Keyboard shortcuts with a help panel (press `?`), and keyboard-only placement of shapes
- Light and dark themes
- Phone layout with a touch toolbar: one finger draws, two fingers pan and pinch

## How to run

Open `index.html` directly, or serve the folder with any static server. There is no build step and nothing to install.

## How the code is organized

```
index.html          Static shell and script order
css/                base.css (tokens, controls), layout.css (app frame, phone layout), panels.css (inspector, menus, dialogs)
js/core/            Pure logic with no UI: geometry, connectors, transforms, snapping, spatial index, camera, text layout, pen smoothing
js/model/           schema.js (validation), store.js (document, transactions, undo), boards.js (persistence), actions.js (commands), seed.js
js/render/          painter.js (one shape), renderer.js (frame loop, grid, culling), overlay.js (selection, guides, rulers), minimap.js
js/tools/           handles.js, gestures-draw.js, gestures-select.js, input.js (pointer events), keyboard.js
js/io/export.js     SVG, PNG and JSON output
js/ui/              Inspector, board menu, view menu, export dialog, help panel, modal, toast, inline text editor
js/app.js           Startup and wiring
```

## Key engineering decisions

**Canvas rather than SVG for rendering.** A diagram of 1,000 shapes with text means several thousand SVG nodes, and every pan or zoom would make the browser restyle and repaint them. Canvas redraws in one pass, costs nothing when a shape is off screen, and takes no per-shape DOM memory. The tradeoff is that canvas gives no hit testing or accessibility tree for free, so the app builds its own: a spatial index for picking, and a live region and numeric fields for assistive technology and keyboard users. SVG remains the export format, because it suits a file people keep.

**Two stacked canvases.** Shapes draw on one, and selection, guides, marquee and rulers draw on the other. Hovering and marquee dragging repaint only the overlay.

**Uniform-grid spatial index.** Each shape is registered in the 256-unit cells its bounds touch. Drawing, picking, marquee and snapping all query the index, so their cost follows what is near the pointer or on screen rather than the board's size. The status bar shows the real time of the last paint and how many shapes it drew. Use "1,000-shape board" in the board menu to try it.

**Immutable shapes and transactions.** Every edit replaces a shape object rather than changing it. A transaction remembers the first "before" reference for each shape it touches, and a history entry is just those before and after references, so undoing a move of 1,000 shapes needs no deep copies. Bounds, path objects and text layouts are cached in `WeakMap`s keyed on the shape object, so a replaced shape invalidates its caches automatically.

**Gestures recompute from a snapshot.** Move, resize and rotate calculate from the shape as it was at pointer-down, not from the previous frame, so a long drag does not accumulate rounding error, and cancelling only has to restore the snapshot.

**Connector endpoints are derived.** An attached endpoint stores a shape id and a side, not a position. After any change to a shape, its connectors re-resolve: the side facing the other end is chosen from the shape's rotated normals, then a straight or elbow route is computed. The vertical elbow cases swap x and y and reuse the horizontal ones.

**Group scaling cannot skew.** The model has no skew, so a selection containing a rotated shape always scales uniformly, rather than quietly changing the shape's appearance.

**One text layout.** The canvas, the inline editor and SVG export all use the same wrapping code and text box, so text does not jump when editing begins, and exports match the screen.

**Colors are tokens.** Shapes store names such as `ink` or `blueTint`, resolved per theme, so a board reads correctly in light and dark. Exports always use the light palette.

## Known limits

- Groups are one level deep: grouping shapes from existing groups merges them into a new one.
- Elbow connectors do not route around other shapes in their path.
- Text in SVG uses the system font stack, so wrapped lines may differ slightly on a machine with other fonts.
