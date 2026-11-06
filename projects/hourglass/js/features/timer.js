// The timer's rules. A running timer is one stored number, its start timestamp: elapsed time is always
// Date.now() minus that, so reloads, sleeping laptops and throttled background tabs can't make it drift.
(function (HG) {
  'use strict';
  const T = HG.time;
  const store = () => HG.store;

  const isRunning = () => store().state.timerStart !== null;
  const elapsed = (now) => (isRunning() ? Math.max(0, (now || Date.now()) - store().state.timerStart) : 0);

  function blankTask(state) {
    return { description: '', projectId: null, tagIds: [], billable: state.settings.defaultBillable };
  }

  function makeEntry(state, start, end, focus) {
    const task = state.task;
    return {
      id: HG.store.newId('e'), description: task.description.trim(), projectId: task.projectId, tagIds: task.tagIds.slice(),
      billable: task.billable, start, end, focus: !!focus,
    };
  }

  function announceBudgets(before) {
    HG.budget.newlyOver(before, store().state, Date.now()).forEach((item) => {
      HG.ui.toast(`Over budget. ${HG.budget.alertText(item)}`, { kind: 'alert' });
    });
  }

  function start() {
    if (isRunning()) return;
    store().commit((s) => { s.timerStart = Date.now(); });
  }

  /** Saves the running timer as an entry and offers an undo that puts the timer back as it was. */
  function stop() {
    if (!isRunning()) return;
    if (HG.focus.isActive()) HG.focus.clearSession();
    const now = Date.now();
    const state = store().state;
    if (now - state.timerStart < 1000) {
      store().commit((s) => { s.timerStart = null; });
      HG.ui.toast('Timer ran for under a second, so nothing was saved.');
      return;
    }
    const before = HG.budget.alerts(state, state.timerStart);
    const entry = makeEntry(state, state.timerStart, now, false);
    const task = { ...state.task };
    store().commit((s) => {
      s.entries.push(entry);
      s.timerStart = null;
      s.task = blankTask(s);
    });
    HG.ui.toast(`Saved ${T.clock(entry.end - entry.start)}${entry.description ? ` to "${entry.description}"` : ''}`, {
      action: { label: 'Undo', run: () => reopen(entry, task) },
    });
    announceBudgets(before);
  }

  function reopen(entry, task) {
    store().commit((s) => {
      s.entries = s.entries.filter((e) => e.id !== entry.id);
      s.task = task;
      s.timerStart = entry.start;
    });
  }

  function discard() {
    if (!isRunning()) return;
    if (HG.focus.isActive()) HG.focus.clearSession();
    const start = store().state.timerStart;
    const task = { ...store().state.task };
    store().commit((s) => {
      s.timerStart = null;
      s.task = blankTask(s);
    });
    HG.ui.toast('Timer discarded', {
      action: { label: 'Undo', run: () => store().commit((s) => { s.timerStart = start; s.task = task; }) },
    });
  }

  /** Starts a new timer on a past task, first saving whatever is running. */
  function resume(entry) {
    if (isRunning()) stop();
    if (HG.focus.isActive()) HG.focus.clearSession();
    store().commit((s) => {
      s.task = { description: entry.description, projectId: entry.projectId, tagIds: entry.tagIds.slice(), billable: entry.billable };
      s.timerStart = Date.now();
    });
  }

  function setStart(ms) {
    store().commit((s) => { s.timerStart = ms; });
  }

  HG.timer = { isRunning, elapsed, makeEntry, blankTask, announceBudgets, start, stop, discard, resume, setStart };
})(window.HG);
