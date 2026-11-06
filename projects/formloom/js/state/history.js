// Undo and redo for the builder. Keeps JSON snapshots per form, for the length of the session.
FL.history = (function () {
  const LIMIT = 100;
  const COALESCE_MS = 900;
  const stacks = new Map();

  function stackFor(formId) {
    if (!stacks.has(formId)) stacks.set(formId, { past: [], future: [], lastKey: null, lastAt: 0 });
    return stacks.get(formId);
  }

  /** Records the state before a change. Rapid edits sharing a key, like typing, become one undo step. */
  function record(form, key) {
    const stack = stackFor(form.id);
    const now = Date.now();
    const merges = key && key === stack.lastKey && now - stack.lastAt < COALESCE_MS;
    stack.lastKey = key || null;
    stack.lastAt = now;
    if (merges) return;
    stack.past.push(JSON.stringify(form));
    if (stack.past.length > LIMIT) stack.past.shift();
    stack.future.length = 0;
  }

  function step(form, from, to) {
    if (!from.length) return null;
    to.push(JSON.stringify(form));
    return JSON.parse(from.pop());
  }

  function undo(form) {
    const stack = stackFor(form.id);
    stack.lastKey = null;
    return step(form, stack.past, stack.future);
  }

  function redo(form) {
    const stack = stackFor(form.id);
    stack.lastKey = null;
    return step(form, stack.future, stack.past);
  }

  const canUndo = (formId) => stackFor(formId).past.length > 0;
  const canRedo = (formId) => stackFor(formId).future.length > 0;

  function clearAll() {
    stacks.clear();
  }

  return { record, undo, redo, canUndo, canRedo, clearAll };
})();
