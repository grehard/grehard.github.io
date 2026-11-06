// The single source of app state. Storage failures are caught, and the app carries on in memory.
(function (R) {
  'use strict';
  const D = R.Dates;
  const S = R.Streaks;
  const V = R.Validate;
  const KEY = 'rhythm:data';
  const SAVE_DELAY_MS = 250;

  let state = null;
  let revision = 0;
  let storageWorks = true;
  let recovered = false;
  let saveTimer = null;
  const listeners = [];

  function readRaw(key) {
    try { return localStorage.getItem(key); } catch (e) { storageWorks = false; return null; }
  }

  function writeRaw(key, value) {
    try { localStorage.setItem(key, value); storageWorks = true; } catch (e) { storageWorks = false; }
  }

  function load() {
    const today = D.today();
    const raw = readRaw(KEY);
    if (raw !== null) {
      try {
        state = V.cleanState(JSON.parse(raw), today).state;
      } catch (e) {
        state = null;
      }
      recovered = state === null;
    }
    if (!state) state = R.Seed.build(today);
    revision++;
  }

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    writeRaw(KEY, JSON.stringify({ version: 1, ...state }));
  }

  function commit() {
    revision++;
    saveNow();
    listeners.forEach((fn) => fn());
  }

  /** For text being typed: saves soon and doesn't trigger a re-render that would disturb the field. */
  function commitQuietly() {
    revision++;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
  }

  function flush() { if (saveTimer) saveNow(); }

  const newId = () => `h-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const habitById = (id) => state.habits.find((h) => h.id === id) || null;
  const logFor = (id) => state.logs[id] || (state.logs[id] = {});

  function addHabit(fields) {
    const habit = { id: newId(), archivedOn: null, ...fields };
    if (habit.schedule.type === 'interval') habit.schedule.anchor = habit.startDate;
    state.habits.push(habit);
    state.logs[habit.id] = {};
    commit();
    return habit;
  }

  function updateHabit(id, fields) {
    const habit = habitById(id);
    if (!habit) return;
    const previous = habit.schedule;
    const cycleChanged = previous.every !== fields.schedule.every || habit.startDate !== fields.startDate;
    Object.assign(habit, fields);
    if (fields.schedule.type === 'interval') {
      // Backfilling keeps the cycle phase, but an explicit edit restarts cycles from the chosen date.
      habit.schedule.anchor = cycleChanged ? fields.startDate : previous.anchor;
    }
    for (const date of Object.keys(logFor(id))) if (date < habit.startDate) habit.startDate = date;
    commit();
  }

  function deleteHabit(id) {
    state.habits = state.habits.filter((h) => h.id !== id);
    delete state.logs[id];
    commit();
  }

  function setArchived(id, archived) {
    const habit = habitById(id);
    if (!habit) return;
    habit.archivedOn = archived ? D.today() : null;
    commit();
  }

  /** ids is the new order of the active habits. Archived habits keep their place after them. */
  function reorderActive(ids) {
    const byId = new Map(state.habits.map((h) => [h.id, h]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    const rest = state.habits.filter((h) => !ids.includes(h.id));
    state.habits = [...ordered, ...rest];
    commit();
  }

  /** Sets or clears (null) one day's entry. Logging before the start date moves the start back. */
  function setEntry(id, date, entry) {
    const habit = habitById(id);
    if (!habit) return;
    const log = logFor(id);
    if (entry) log[date] = entry; else delete log[date];
    if (entry && date < habit.startDate) habit.startDate = date;
    commit();
  }

  /** Tapping the circle: a completed day clears, anything else becomes complete. */
  function toggleDone(id, date) {
    const habit = habitById(id);
    if (!habit) return;
    setEntry(id, date, S.isComplete(habit, logFor(id)[date]) ? null : { value: S.goal(habit) });
  }

  function toggleSkip(id, date) {
    const entry = logFor(id)[date];
    setEntry(id, date, entry && entry.skipped ? null : { skipped: true });
  }

  function adjustValue(id, date, direction) {
    const habit = habitById(id);
    if (!habit || habit.target.type !== 'count') return;
    const entry = logFor(id)[date];
    const current = entry && !entry.skipped ? entry.value : 0;
    const next = V.roundValue(Math.min(V.MAX_VALUE, Math.max(0, current + direction * habit.target.step)));
    setEntry(id, date, next > 0 ? { value: next } : null);
  }

  function setNote(date, text) {
    if (text.trim()) state.notes[date] = text.slice(0, V.LIMITS.note); else delete state.notes[date];
    commitQuietly();
  }

  function deleteNote(date) {
    delete state.notes[date];
    commit();
  }

  function setSetting(name, value) {
    state.settings[name] = value;
    commit();
  }

  const snapshot = () => JSON.parse(JSON.stringify(state));

  function replaceAll(next) {
    state = next;
    commit();
  }

  function resetDemo() { replaceAll(R.Seed.build(D.today())); }

  R.Store = {
    load, flush, snapshot, replaceAll, resetDemo, subscribe: (fn) => listeners.push(fn), readRaw, writeRaw,
    get: () => state,
    revision: () => revision,
    storageWorks: () => storageWorks,
    wasRecovered: () => recovered,
    habitById, logFor, addHabit, updateHabit, deleteHabit, setArchived, reorderActive,
    setEntry, toggleDone, toggleSkip, adjustValue, setNote, deleteNote, setSetting,
  };
})(window.Rhythm);
