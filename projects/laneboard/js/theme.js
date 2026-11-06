// Runs in <head>, before the first paint, so a remembered theme never flashes the wrong colors.
const Theme = (() => {
  const KEY = 'laneboard.theme';
  let memoryChoice = null;

  function readChoice() {
    try { return localStorage.getItem(KEY) || memoryChoice; } catch (e) { return memoryChoice; }
  }

  function writeChoice(choice) {
    memoryChoice = choice;
    try { localStorage.setItem(KEY, choice); } catch (e) { /* stays in memory for this visit */ }
  }

  function current() {
    const choice = readChoice();
    if (choice === 'light' || choice === 'dark') return choice;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function apply(choice) {
    if (choice === 'light' || choice === 'dark') document.documentElement.dataset.theme = choice;
  }

  function toggle() {
    const next = current() === 'dark' ? 'light' : 'dark';
    writeChoice(next);
    apply(next);
    return next;
  }

  apply(readChoice());
  return { current, toggle };
})();
