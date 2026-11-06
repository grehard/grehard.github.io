// A board's document: shapes, z-order, spatial index and undo history.
// Shapes are immutable: every edit replaces the object. A history entry therefore only holds references
// to the before and after objects of what changed, and a move of 1,000 shapes costs no deep copies.
(function (DB) {
  'use strict';
  const { aabb, isLine } = DB.geometry;

  const HISTORY_LIMIT = 300;
  DB.bus = DB.util.createEmitter();

  class BoardDoc {
    constructor({ id, name, shapes, view, updatedAt }) {
      this.id = id;
      this.name = name;
      this.view = view || null;
      this.updatedAt = updatedAt || Date.now();
      this.shapes = new Map();
      this.order = [];
      this.zIndex = new Map();
      this.spatial = new DB.SpatialIndex();
      this.bindings = new Map();
      this.selection = new Set();
      this.undoStack = [];
      this.redoStack = [];
      this.activeTx = null;
      (shapes || []).forEach((s) => { this.put(s); this.order.push(s.id); });
      this.reindex();
    }

    orderedShapes() { return this.order.map((id) => this.shapes.get(id)); }

    reindex() {
      this.zIndex = new Map(this.order.map((id, i) => [id, i]));
    }

    unlink(line) {
      [line.start, line.end].forEach((end) => {
        if (end && this.bindings.has(end.id)) this.bindings.get(end.id).delete(line.id);
      });
    }

    link(line) {
      [line.start, line.end].forEach((end) => {
        if (!end) return;
        if (!this.bindings.has(end.id)) this.bindings.set(end.id, new Set());
        this.bindings.get(end.id).add(line.id);
      });
    }

    put(shape) {
      const previous = this.shapes.get(shape.id);
      if (previous && isLine(previous)) this.unlink(previous);
      if (isLine(shape)) this.link(shape);
      this.shapes.set(shape.id, shape);
      this.spatial.put(shape.id, aabb(shape));
    }

    drop(id) {
      const previous = this.shapes.get(id);
      if (previous && isLine(previous)) this.unlink(previous);
      this.shapes.delete(id);
      this.spatial.remove(id);
    }

    connectorsOf(id) {
      const set = this.bindings.get(id);
      return set ? Array.from(set).map((lineId) => this.shapes.get(lineId)).filter(Boolean) : [];
    }

    begin(label) {
      if (this.activeTx) this.activeTx.commit();
      this.activeTx = new Transaction(this, label);
      return this.activeTx;
    }

    setSelection(ids) {
      const next = new Set(ids);
      const same = next.size === this.selection.size && Array.from(next).every((id) => this.selection.has(id));
      if (same) return;
      this.selection = next;
      DB.bus.emit('selection');
    }

    applyHistory(entry, direction) {
      const useBefore = direction === 'undo';
      entry.changes.forEach(({ id, before, after }) => {
        const value = useBefore ? before : after;
        if (value) this.put(value); else this.drop(id);
      });
      const order = useBefore ? entry.orderBefore : entry.orderAfter;
      if (order) { this.order = order.slice(); this.reindex(); }
      this.selection = new Set(useBefore ? entry.selectionBefore : entry.selectionAfter);
      DB.bus.emit('selection');
      this.touch();
    }

    undo() {
      if (this.activeTx) this.activeTx.commit();
      const entry = this.undoStack.pop();
      if (!entry) return null;
      this.applyHistory(entry, 'undo');
      this.redoStack.push(entry);
      DB.bus.emit('history');
      return entry.label;
    }

    redo() {
      if (this.activeTx) this.activeTx.commit();
      const entry = this.redoStack.pop();
      if (!entry) return null;
      this.applyHistory(entry, 'redo');
      this.undoStack.push(entry);
      DB.bus.emit('history');
      return entry.label;
    }

    touch() {
      this.updatedAt = Date.now();
      DB.bus.emit('doc', this);
    }
  }

  class Transaction {
    constructor(doc, label) {
      this.doc = doc;
      this.label = label;
      this.before = new Map();
      this.orderBefore = null;
      this.selectionBefore = Array.from(doc.selection);
      this.dirty = new Set();
      this.closed = false;
    }

    remember(id) {
      if (!this.before.has(id)) this.before.set(id, this.doc.shapes.get(id) || null);
    }

    rememberOrder() {
      if (!this.orderBefore) this.orderBefore = this.doc.order.slice();
    }

    add(shape) {
      this.remember(shape.id);
      this.rememberOrder();
      this.doc.put(shape);
      this.doc.order.push(shape.id);
      this.doc.zIndex.set(shape.id, this.doc.order.length - 1);
      this.dirty.add(shape.id);
      DB.bus.emit('scene');
    }

    set(shape) {
      this.remember(shape.id);
      this.doc.put(shape);
      if (!isLine(shape)) this.dirty.add(shape.id);
      DB.bus.emit('scene');
    }

    // Connectors keep their current position when the shape they point at goes away.
    remove(ids) {
      const gone = new Set(ids);
      this.rememberOrder();
      gone.forEach((id) => {
        this.remember(id);
        this.doc.connectorsOf(id).forEach((line) => {
          if (gone.has(line.id)) return;
          const current = this.doc.shapes.get(line.id);
          const next = { ...current };
          if (current.start && current.start.id === id) next.start = null;
          if (current.end && current.end.id === id) next.end = null;
          this.set(next);
        });
        this.doc.drop(id);
        this.dirty.delete(id);
      });
      this.doc.order = this.doc.order.filter((id) => !gone.has(id));
      this.doc.reindex();
      DB.bus.emit('scene');
    }

    setOrder(order) {
      this.rememberOrder();
      this.doc.order = order;
      this.doc.reindex();
      DB.bus.emit('scene');
    }

    // Re-routes every connector attached to a shape changed since the last flush.
    flush() {
      this.dirty.forEach((id) => {
        this.doc.connectorsOf(id).forEach((line) => {
          const current = this.doc.shapes.get(line.id);
          if (current) this.set(DB.connectors.resolve(current, this.doc));
        });
      });
      this.dirty.clear();
    }

    changes() {
      const list = [];
      this.before.forEach((before, id) => {
        const after = this.doc.shapes.get(id) || null;
        if (before !== after && JSON.stringify(before) !== JSON.stringify(after)) list.push({ id, before, after });
      });
      return list;
    }

    orderChanged() {
      if (!this.orderBefore) return false;
      const now = this.doc.order;
      return now.length !== this.orderBefore.length || now.some((id, i) => id !== this.orderBefore[i]);
    }

    commit() {
      if (this.closed) return;
      this.flush();
      this.closed = true;
      this.doc.activeTx = null;
      const changes = this.changes();
      const orderChanged = this.orderChanged();
      if (changes.length === 0 && !orderChanged) return;
      this.doc.undoStack.push({
        label: this.label,
        changes,
        orderBefore: orderChanged ? this.orderBefore : null,
        orderAfter: orderChanged ? this.doc.order.slice() : null,
        selectionBefore: this.selectionBefore,
        selectionAfter: Array.from(this.doc.selection),
      });
      if (this.doc.undoStack.length > HISTORY_LIMIT) this.doc.undoStack.shift();
      this.doc.redoStack.length = 0;
      DB.bus.emit('history');
      this.doc.touch();
    }

    cancel() {
      if (this.closed) return;
      this.closed = true;
      this.doc.activeTx = null;
      this.before.forEach((before, id) => {
        if (before) this.doc.put(before); else this.doc.drop(id);
      });
      if (this.orderBefore) {
        this.doc.order = this.orderBefore;
        this.doc.reindex();
      }
      this.doc.selection = new Set(this.selectionBefore);
      DB.bus.emit('selection');
      DB.bus.emit('scene');
    }
  }

  DB.BoardDoc = BoardDoc;
})(window.DB);
