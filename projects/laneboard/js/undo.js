// A last-in, first-out stack of inverse operations. Kept in memory on purpose: undo corrects
// the last few actions and starts empty on each visit.
const Undo = (() => {
  const MAX_ENTRIES = 100;
  let stack = [];

  function push(label, projectId, revert) {
    stack.push({ label, projectId, revert });
    if (stack.length > MAX_ENTRIES) stack.shift();
  }

  return {
    push,
    pop: () => stack.pop() || null,
    peek: () => stack[stack.length - 1] || null,
    clear: () => { stack = []; },
  };
})();
