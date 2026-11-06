// Focus sessions: alternating work and break phases. Like the timer, a session is stored as timestamps.
// If the page was closed across phase boundaries, advance() walks through each one and files the work
// intervals with their exact times, as if the page had stayed open.
(function (HG) {
  'use strict';
  const T = HG.time;
  const state = () => HG.store.state;

  const isActive = () => state().focus !== null;
  const phaseLength = (f) => (f.phase === 'work' ? f.workMin : f.breakMin) * T.MIN;
  const phaseEnd = (f) => f.phaseStart + phaseLength(f);
  const remaining = (now) => (isActive() ? Math.max(0, phaseEnd(state().focus) - now) : 0);

  function start({ workMin, breakMin, rounds }) {
    HG.audio.unlock();
    // Stopping clears the task, and the session should carry on with the same one.
    const task = { ...state().task };
    if (HG.timer.isRunning()) HG.timer.stop();
    const now = Date.now();
    HG.store.commit((s) => {
      s.task = task;
      s.settings.focusWork = workMin;
      s.settings.focusBreak = breakMin;
      s.settings.focusRounds = rounds;
      s.focus = { phase: 'work', phaseStart: now, round: 1, rounds, workMin, breakMin };
      s.timerStart = now;
    });
  }

  /** Moves one phase forward, given the moment the current phase ended. Returns "break", "work" or "done". */
  function stepPhase(s, at) {
    const f = s.focus;
    if (f.phase === 'work') {
      if (at - s.timerStart >= 1000) s.entries.push(HG.timer.makeEntry(s, s.timerStart, at, true));
      s.timerStart = null;
      if (f.round >= f.rounds) {
        s.focus = null;
        s.task = HG.timer.blankTask(s);
        return 'done';
      }
      f.phase = 'break';
      f.phaseStart = at;
      return 'break';
    }
    f.round += 1;
    f.phase = 'work';
    f.phaseStart = at;
    s.timerStart = at;
    return 'work';
  }

  function notify(kind) {
    HG.audio.play(kind, state().settings);
    const messages = {
      break: 'Work interval saved. Break started.',
      work: 'Break over. Work interval started.',
      done: 'Focus session complete. All intervals are on your timeline.',
    };
    HG.ui.toast(messages[kind]);
  }

  /** Called by the clock tick and on load. Does nothing until a phase has actually ended. */
  function advance(now) {
    if (!isActive() || now < phaseEnd(state().focus)) return;
    // Another tab may have filed this phase already. Re-reading first keeps it from being filed twice.
    HG.store.refresh();
    if (!isActive() || now < phaseEnd(state().focus)) { HG.store.commit(() => {}); return; }
    const before = HG.budget.alerts(state(), state().focus.phaseStart);
    let last = null;
    HG.store.commit((s) => {
      while (s.focus && now >= phaseEnd(s.focus)) last = stepPhase(s, phaseEnd(s.focus));
    });
    if (last) notify(last);
    HG.timer.announceBudgets(before);
  }

  /** Ends the current phase now: a short work interval is still saved, a short break is simply cut off. */
  function skip() {
    if (!isActive()) return;
    HG.audio.unlock();
    const now = Date.now();
    let kind = null;
    HG.store.commit((s) => { kind = stepPhase(s, now); });
    notify(kind);
  }

  /** Forgets the session without touching the timer, for when the timer itself is being stopped. */
  function clearSession() {
    HG.store.commitQuiet((s) => { s.focus = null; });
  }

  /** Ends the session early, saving the work done so far. */
  function end() {
    if (!isActive()) return;
    if (state().focus.phase === 'work' && HG.timer.isRunning()) {
      HG.timer.stop();
    } else {
      HG.store.commit((s) => { s.focus = null; s.task = HG.timer.blankTask(s); });
      HG.ui.toast('Focus session ended.');
    }
  }

  HG.focus = { isActive, remaining, phaseLength, start, advance, skip, end, clearSession };
})(window.HG);
