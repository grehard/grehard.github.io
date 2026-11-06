// Startup and the wiring between modules. Holds the view state: active tool, settings, theme and camera.
(function (DB) {
  'use strict';
  const { storage, debounce } = DB.util;

  const SETTINGS_KEY = 'driftboard:settings';
  const NARROW = 700;
  const FIT_PADDING = 40;
  const MAX_FIT_ZOOM = 2;
  const PHONE_ZOOM = 0.6;
  const ZOOM_BUTTON_STEP = 1.25;

  function loadSettings() {
    const narrow = window.innerWidth < NARROW;
    const base = {
      snapGrid: true, guides: true, showGrid: true, rulers: true, minimap: !narrow, inspector: !narrow, theme: null,
      defaults: { ...DB.schema.STYLE_DEFAULTS, route: 'straight' },
    };
    const raw = storage.readJSON(SETTINGS_KEY);
    if (!raw || typeof raw !== 'object') return base;
    ['snapGrid', 'guides', 'showGrid', 'rulers', 'minimap'].forEach((key) => {
      if (typeof raw[key] === 'boolean') base[key] = raw[key];
    });
    if (typeof raw.inspector === 'boolean' && !narrow) base.inspector = raw.inspector;
    if (raw.theme === 'light' || raw.theme === 'dark') base.theme = raw.theme;
    if (raw.defaults && typeof raw.defaults === 'object') {
      const probe = DB.schema.sanitizeShape({ type: 'rect', x: 0, y: 0, w: 1, h: 1, ...raw.defaults });
      if (probe) {
        const { stroke, fill, width, dash, opacity, fontSize } = probe;
        base.defaults = { stroke, fill, width, dash, opacity, fontSize, route: raw.defaults.route === 'elbow' ? 'elbow' : 'straight' };
      }
    }
    return base;
  }

  const prefersDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };

  const saveViewLater = debounce(() => {
    const doc = DB.boards.current();
    if (doc) DB.boards.writeIndex();
  }, 400);

  const app = {
    settings: loadSettings(),
    tool: 'select',
    transient: { hover: null, marquee: null, candidates: null, guides: [], erase: null, pen: null, anchorTarget: null, frameOverride: null, editingId: null },
    camera: null,
    renderer: null,
    input: null,
    minimap: null,

    theme() { return this.settings.theme || (prefersDark.matches ? 'dark' : 'light'); },

    saveSettings() { storage.set(SETTINGS_KEY, JSON.stringify(this.settings)); },

    setTool(tool) {
      if (this.input.gesture) this.input.cancelGesture();
      this.tool = tool;
      this.transient.hover = null;
      this.transient.anchorTarget = null;
      document.querySelectorAll('#toolbar .tool').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
      });
      this.input.refreshCursor();
      DB.bus.emit('overlay');
    },

    undo() {
      const label = DB.boards.current().undo();
      announce(label ? `Undid ${label.toLowerCase()}` : 'Nothing to undo');
    },

    redo() {
      const label = DB.boards.current().redo();
      announce(label ? `Redid ${label.toLowerCase()}` : 'Nothing to redo');
    },

    // Keyboard zoom targets the cursor when it is over the canvas, and otherwise the middle of the view.
    zoomStep(factor) {
      const { camera, input } = this;
      const p = input.lastPointer;
      camera.zoomToward(p ? p.sx : camera.width / 2, p ? p.sy : camera.height / 2, factor);
    },

    zoomReset() {
      const { camera } = this;
      camera.zoomToward(camera.width / 2, camera.height / 2, 1 / (camera.target ? camera.target.zoom : camera.zoom));
    },

    zoomFit() { this.fitShapes(DB.boards.current().orderedShapes(), true); },

    zoomSelection() {
      const selected = DB.actions.selectedShapes();
      this.fitShapes(selected.length ? selected : DB.boards.current().orderedShapes(), true);
    },

    fitShapes(shapes, animate) {
      const { camera } = this;
      const bounds = DB.geometry.unionBounds(shapes);
      if (!bounds) {
        const view = { ox: 60, oy: 60, zoom: 1 };
        if (animate) camera.animateTo(view); else camera.set(view);
        return;
      }
      const view = camera.fitRect(bounds, FIT_PADDING, MAX_FIT_ZOOM);
      if (animate) camera.animateTo(view); else camera.set(view);
    },

    pasteTarget() {
      const p = this.input.lastPointer;
      return p ? { x: p.x, y: p.y } : null;
    },

    toggleSetting(key) {
      this.settings[key] = !this.settings[key];
      this.saveSettings();
      applySettings();
      DB.bus.emit('settings');
      DB.bus.emit('scene');
    },

    toggleTheme() {
      this.settings.theme = this.theme() === 'dark' ? 'light' : 'dark';
      this.saveSettings();
      applyTheme();
    },
  };

  function announce(text) {
    document.getElementById('live').textContent = text;
    const node = document.getElementById('status-selection');
    if (node) node.textContent = text;
  }

  function applyTheme() {
    const theme = app.theme();
    document.documentElement.dataset.theme = theme;
    const button = document.getElementById('theme-button');
    button.innerHTML = DB.icons.svg(theme === 'dark' ? 'sun' : 'moon');
    button.setAttribute('aria-label', theme === 'dark' ? 'Use light theme' : 'Use dark theme');
    button.setAttribute('title', theme === 'dark' ? 'Use light theme' : 'Use dark theme');
    DB.bus.emit('theme');
    if (app.renderer) app.renderer.requestAll();
    if (app.minimap) app.minimap.request();
  }

  function applySettings() {
    const { settings } = app;
    const inspector = document.getElementById('inspector');
    document.getElementById('app').classList.toggle('inspector-open', settings.inspector);
    document.getElementById('panel-button').setAttribute('aria-expanded', String(settings.inspector));
    inspector.hidden = !settings.inspector;
    document.getElementById('minimap-wrap').hidden = !settings.minimap;
    if (app.renderer) app.renderer.resize();
    if (app.minimap) app.minimap.request();
  }

  function refreshHistoryButtons() {
    const doc = DB.boards.current();
    if (!doc) return;
    document.getElementById('undo-button').disabled = doc.undoStack.length === 0;
    document.getElementById('redo-button').disabled = doc.redoStack.length === 0;
  }

  function refreshStatus() {
    const doc = DB.boards.current();
    if (!doc) return;
    document.getElementById('status-count').textContent = DB.actions.plural(doc.shapes.size, 'shape');
  }

  function refreshSelectionStatus() {
    const selected = DB.actions.selectedShapes();
    let text = '';
    if (selected.length === 1) text = DB.inspector.describe(selected[0]);
    else if (selected.length > 1) text = `${selected.length} shapes selected`;
    document.getElementById('status-selection').textContent = text;
    if (text) document.getElementById('live').textContent = text;
  }

  function showBoard(doc) {
    document.getElementById('board-name').textContent = doc.name;
    document.title = `${doc.name} - Driftboard`;
    if (doc.view) app.camera.set(doc.view);
    else openingView(doc);
    app.transient.hover = null;
    refreshHistoryButtons();
    refreshStatus();
    refreshSelectionStatus();
    DB.bus.emit('selection');
    app.renderer.requestAll();
    app.minimap.request();
  }

  // On a phone a whole diagram fitted to the width is too small to read, so a board opens at a
  // readable zoom from its top-left corner, with the rest a pan away.
  function openingView(doc) {
    const shapes = doc.orderedShapes();
    const bounds = DB.geometry.unionBounds(shapes);
    if (!bounds || window.innerWidth >= NARROW) { app.fitShapes(shapes, false); return; }
    app.camera.set({ zoom: PHONE_ZOOM, ox: 16 - bounds.x * PHONE_ZOOM, oy: 16 - bounds.y * PHONE_ZOOM });
  }

  function formatCoordinate(v) {
    return String(Math.round(v * 100) / 100);
  }

  function wireBus() {
    const { bus } = DB;
    const { renderer, minimap } = app;
    bus.on('scene', () => { renderer.requestScene(); minimap.request(); });
    bus.on('overlay', () => renderer.requestOverlay());
    bus.on('doc', () => { renderer.requestScene(); minimap.request(); refreshStatus(); });
    bus.on('selection', () => { renderer.requestOverlay(); minimap.request(); refreshSelectionStatus(); });
    bus.on('history', refreshHistoryButtons);
    bus.on('board', showBoard);
    bus.on('boards', () => {
      const doc = DB.boards.current();
      if (doc) showBoardName(doc);
    });
    bus.on('status', announce);
    bus.on('notice', (text) => DB.toast.show(text));
    bus.on('saved', (ok) => {
      document.getElementById('status-save').textContent = ok ? '' : 'Not saved: browser storage is unavailable';
    });
    // Updating the readout every frame would be unreadable, so it refreshes at most five times a second.
    let perfTimer = null;
    bus.on('painted', (stats) => {
      if (perfTimer !== null) return;
      perfTimer = setTimeout(() => {
        perfTimer = null;
        document.getElementById('status-perf').textContent = `${stats.ms.toFixed(1)} ms, ${stats.drawn} drawn`;
      }, 200);
    });
    bus.on('cursor', (p) => {
      if (p) document.getElementById('status-cursor').textContent = `X ${formatCoordinate(p.x)} Y ${formatCoordinate(p.y)}`;
    });
  }

  function showBoardName(doc) {
    document.getElementById('board-name').textContent = doc.name;
    document.title = `${doc.name} - Driftboard`;
  }

  function wireToolbar() {
    document.querySelectorAll('#toolbar .tool').forEach((button) => {
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        app.setTool(button.dataset.tool);
        if (window.innerWidth >= NARROW) document.getElementById('overlay').focus({ preventScroll: true });
      });
    });
    const click = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    click('undo-button', () => app.undo());
    click('redo-button', () => app.redo());
    click('zoom-in', () => app.camera.zoomToward(app.camera.width / 2, app.camera.height / 2, ZOOM_BUTTON_STEP));
    click('zoom-out', () => app.camera.zoomToward(app.camera.width / 2, app.camera.height / 2, 1 / ZOOM_BUTTON_STEP));
    click('zoom-label', () => app.zoomReset());
    click('help-button', () => DB.helpPanel.open());
    click('theme-button', () => app.toggleTheme());
    click('panel-button', () => app.toggleSetting('inspector'));
    click('export-button', () => DB.exportDialog.open());
  }

  // The canvas shows its focus ring only when reached with Tab. A click or shortcut must not outline the drawing area.
  function wireCanvasFocus(overlay) {
    let tabbing = false;
    document.addEventListener('keydown', (ev) => { tabbing = ev.key === 'Tab'; }, true);
    document.addEventListener('pointerdown', () => { tabbing = false; }, true);
    overlay.addEventListener('focus', () => overlay.classList.toggle('keyboard-focus', tabbing));
    overlay.addEventListener('blur', () => overlay.classList.remove('keyboard-focus'));
  }

  function start() {
    DB.icons.hydrate(document.body);
    const scene = document.getElementById('scene');
    const overlay = document.getElementById('overlay');
    app.camera = new DB.Camera(() => {
      app.renderer.requestAll();
      app.minimap.request();
      DB.bus.emit('view');
      document.getElementById('zoom-label').textContent = `${Math.round(app.camera.zoom * 100)}%`;
      const doc = DB.boards.current();
      if (doc) {
        doc.view = { ox: app.camera.ox, oy: app.camera.oy, zoom: app.camera.zoom };
        const meta = DB.boards.list.find((m) => m.id === doc.id);
        if (meta) meta.view = doc.view;
        saveViewLater();
      }
    });
    app.renderer = new DB.Renderer(app, scene, overlay);
    app.input = new DB.Input(app, overlay);
    app.minimap = DB.minimap.create(app, document.getElementById('minimap-wrap'), document.getElementById('minimap'));
    DB.app = app;

    wireBus();
    wireToolbar();
    wireCanvasFocus(overlay);
    DB.keyboard.attach(app);
    DB.textEditor.attach();
    DB.boardsMenu.attach();
    DB.viewMenu.attach(app);
    applyTheme();
    applySettings();
    app.setTool('select');
    if (prefersDark.addEventListener) prefersDark.addEventListener('change', applyTheme);
    // The panel is a sheet over the canvas on a phone, so it starts closed there, including after a rotation.
    const narrowQuery = window.matchMedia(`(max-width: ${NARROW - 1}px)`);
    narrowQuery.addEventListener('change', () => {
      app.settings.inspector = !narrowQuery.matches;
      applySettings();
    });

    new ResizeObserver(() => {
      app.renderer.resize();
      app.minimap.request();
    }).observe(document.getElementById('stage'));

    DB.boards.init();
    DB.inspector.build(document.getElementById('inspector'));
  }

  DB.app = app;
  start();
})(window.DB);
