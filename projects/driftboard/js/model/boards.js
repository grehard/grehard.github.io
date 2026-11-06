// The set of named boards and their persistence. Each board has its own storage key, so saving
// one edit rewrites one board. Opened boards stay in memory and keep their undo history.
(function (DB) {
  'use strict';
  const { storage, uid, debounce } = DB.util;
  const { sanitizeShapes, sanitizeName, sanitizeView } = DB.schema;

  const INDEX_KEY = 'driftboard:index';
  const boardKey = (id) => `driftboard:board:${id}`;

  const state = { list: [], docs: new Map(), currentId: null };

  function metaFor(doc) {
    return { id: doc.id, name: doc.name, updatedAt: doc.updatedAt, count: doc.shapes.size, view: doc.view };
  }

  function writeIndex() {
    return storage.set(INDEX_KEY, JSON.stringify({ current: state.currentId, boards: state.list }));
  }

  function writeBoard(doc) {
    const entry = state.list.find((m) => m.id === doc.id);
    if (entry) Object.assign(entry, metaFor(doc));
    const saved = storage.set(boardKey(doc.id), JSON.stringify(doc.orderedShapes()));
    writeIndex();
    DB.bus.emit('saved', saved);
  }

  const pending = new Set();
  const flushPending = () => {
    pending.forEach((id) => { const doc = state.docs.get(id); if (doc) writeBoard(doc); });
    pending.clear();
  };
  const scheduleFlush = debounce(flushPending, 250);

  function scheduleSave(doc) {
    pending.add(doc.id);
    scheduleFlush();
  }

  function flush() {
    scheduleFlush.flush();
    flushPending();
    writeIndex();
  }

  function addDoc(name, shapes, view, select) {
    const doc = new DB.BoardDoc({ id: uid('b'), name, shapes, view });
    state.docs.set(doc.id, doc);
    state.list.push(metaFor(doc));
    writeBoard(doc);
    if (select) open(doc.id);
    return doc;
  }

  function loadDoc(meta) {
    const raw = storage.readJSON(boardKey(meta.id));
    const { shapes, skipped } = sanitizeShapes(raw);
    const doc = new DB.BoardDoc({ id: meta.id, name: meta.name, shapes, view: meta.view, updatedAt: meta.updatedAt });
    if (skipped > 0 || (raw !== null && !Array.isArray(raw))) DB.bus.emit('notice', `Some saved shapes on "${meta.name}" could not be read and were skipped.`);
    state.docs.set(doc.id, doc);
    return doc;
  }

  function current() { return state.docs.get(state.currentId); }

  function open(id) {
    const meta = state.list.find((m) => m.id === id);
    if (!meta) return null;
    const previous = current();
    if (previous) {
      if (previous.activeTx) previous.activeTx.commit();
      writeBoard(previous);
    }
    const doc = state.docs.get(id) || loadDoc(meta);
    state.currentId = id;
    writeIndex();
    DB.bus.emit('board', doc);
    return doc;
  }

  function seedAll() {
    state.list = [];
    state.docs = new Map();
    state.currentId = null;
    DB.seed.boards().forEach((board) => addDoc(board.name, board.shapes, null, false));
  }

  function readIndex() {
    const index = storage.readJSON(INDEX_KEY);
    if (!index || !Array.isArray(index.boards) || index.boards.length === 0) return null;
    const list = index.boards
      .filter((m) => m && typeof m.id === 'string' && m.id)
      .map((m) => ({ id: m.id, name: sanitizeName(m.name, 'Untitled board'), updatedAt: Number(m.updatedAt) || Date.now(), count: Number(m.count) || 0, view: sanitizeView(m.view) }));
    return list.length ? { list, current: index.current } : null;
  }

  function init() {
    const index = readIndex();
    if (index) {
      state.list = index.list;
      open(index.list.some((m) => m.id === index.current) ? index.current : index.list[0].id);
    } else {
      seedAll();
      open(state.list[0].id);
    }
  }

  function create(name) {
    return addDoc(sanitizeName(name, nextUntitled()), [], null, true);
  }

  function nextUntitled() {
    let n = state.list.length + 1;
    while (state.list.some((m) => m.name === `Untitled board ${n}`)) n += 1;
    return `Untitled board ${n}`;
  }

  // Returns an error message, or null if the rename went through.
  function rename(id, name) {
    const trimmed = String(name).trim();
    if (!trimmed) return 'Enter a board name.';
    if (trimmed.length > DB.schema.LIMITS.name) return `Keep the name under ${DB.schema.LIMITS.name} characters.`;
    const meta = state.list.find((m) => m.id === id);
    meta.name = trimmed;
    const doc = state.docs.get(id);
    if (doc) { doc.name = trimmed; writeBoard(doc); } else writeIndex();
    DB.bus.emit('boards');
    return null;
  }

  function shapesOf(id) {
    const doc = state.docs.get(id);
    if (doc) return doc.orderedShapes();
    return sanitizeShapes(storage.readJSON(boardKey(id))).shapes;
  }

  // Ids are regenerated, so boards never share shape ids. Bindings and groups are remapped to match.
  function duplicate(id) {
    const meta = state.list.find((m) => m.id === id);
    const copies = DB.actions.cloneShapes(shapesOf(id), 0, 0);
    return addDoc(`${meta.name} copy`.slice(0, DB.schema.LIMITS.name), copies, meta.view, true);
  }

  function remove(id) {
    const index = state.list.findIndex((m) => m.id === id);
    if (index < 0) return null;
    const meta = state.list[index];
    const shapes = shapesOf(id);
    const wasCurrent = state.currentId === id;
    state.list.splice(index, 1);
    state.docs.delete(id);
    pending.delete(id);
    storage.remove(boardKey(id));
    if (state.list.length === 0) addDoc('Untitled board 1', [], null, false);
    if (wasCurrent) {
      state.currentId = null;
      open(state.list[Math.min(index, state.list.length - 1)].id);
    } else {
      writeIndex();
      DB.bus.emit('boards');
    }
    return () => {
      const restored = new DB.BoardDoc({ id: meta.id, name: meta.name, shapes, view: meta.view, updatedAt: meta.updatedAt });
      state.docs.set(meta.id, restored);
      state.list.splice(Math.min(index, state.list.length), 0, metaFor(restored));
      writeBoard(restored);
      open(meta.id);
    };
  }

  function exportAll() {
    return state.list.map((meta) => ({ name: meta.name, view: meta.view, shapes: shapesOf(meta.id) }));
  }

  function resetDemo() {
    const before = exportAll();
    const currentName = (current() || {}).name;
    const clearStorage = () => {
      state.list.forEach((m) => storage.remove(boardKey(m.id)));
      pending.clear();
    };
    clearStorage();
    seedAll();
    open(state.list[0].id);
    return () => {
      clearStorage();
      state.list = [];
      state.docs = new Map();
      state.currentId = null;
      before.forEach((board) => addDoc(board.name, board.shapes, board.view, false));
      const match = state.list.find((m) => m.name === currentName) || state.list[0];
      open(match.id);
    };
  }

  function importBoards(parsed) {
    let firstDoc = null;
    parsed.forEach((board) => {
      const copies = DB.actions.cloneShapes(board.shapes, 0, 0);
      const doc = addDoc(board.name, copies, board.view, false);
      if (!firstDoc) firstDoc = doc;
    });
    open(firstDoc.id);
  }

  DB.bus.on('doc', (doc) => {
    const meta = state.list.find((m) => m.id === doc.id);
    if (meta) meta.count = doc.shapes.size;
    scheduleSave(doc);
  });

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  DB.boards = {
    init, current, open, create, rename, duplicate, remove, resetDemo, importBoards, addDoc, exportAll, flush,
    get list() { return state.list; },
    writeIndex,
  };
})(window.DB);
