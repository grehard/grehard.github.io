// Holds the app state and keeps it in localStorage. Everything is validated on the way in,
// and if storage is blocked the app carries on in memory.
(function (HG) {
  'use strict';
  const KEY = 'hourglass.data.v1';
  const COLOR = /^#[0-9a-f]{6}$/i;
  const MAX_TEXT = 300;
  const MAX_MONEY = 100000;
  const MAX_BUDGET = 1000000;
  const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'NZD', 'JPY'];

  const DEFAULT_SETTINGS = {
    name: '', roundingMinutes: 0, roundingMode: 'up', weekStart: 1, currency: 'USD', defaultRate: 0, defaultBillable: true,
    focusWork: 25, focusBreak: 5, focusRounds: 4, sound: true, volume: 60,
  };

  let state = null;
  let storageOk = true;
  let counter = 0;
  const listeners = new Set();

  const text = (value, max) => (typeof value === 'string' ? value.slice(0, max || MAX_TEXT) : '');
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);

  function numberOrNull(value, max) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null;
  }

  function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function stamp(value) {
    if (finite(value)) return value;
    if (typeof value === 'string' && value) return Date.parse(value);
    return NaN;
  }

  function cleanSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const d = DEFAULT_SETTINGS;
    return {
      name: text(r.name, 120),
      roundingMinutes: [0, 6, 15].includes(r.roundingMinutes) ? r.roundingMinutes : d.roundingMinutes,
      roundingMode: r.roundingMode === 'nearest' ? 'nearest' : 'up',
      weekStart: r.weekStart === 0 ? 0 : 1,
      currency: CURRENCIES.includes(r.currency) ? r.currency : d.currency,
      defaultRate: numberOrNull(r.defaultRate, MAX_MONEY) || 0,
      defaultBillable: r.defaultBillable !== false,
      focusWork: clampInt(r.focusWork, 1, 180, d.focusWork),
      focusBreak: clampInt(r.focusBreak, 1, 60, d.focusBreak),
      focusRounds: clampInt(r.focusRounds, 1, 12, d.focusRounds),
      sound: r.sound !== false,
      volume: clampInt(r.volume, 0, 100, d.volume),
    };
  }

  function cleanData(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const list = (value) => (Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []);
    const uniqueById = (items) => {
      const seen = new Set();
      return items.filter((item) => item.id && !seen.has(item.id) && seen.add(item.id));
    };
    const clients = uniqueById(list(r.clients).map((c) => ({
      id: text(c.id, 80), name: text(c.name) || 'Unnamed client', rate: numberOrNull(c.rate, MAX_MONEY),
      budgetHours: numberOrNull(c.budgetHours, MAX_BUDGET), color: COLOR.test(c.color) ? c.color : '#2F6DB5',
    })));
    const clientIds = new Set(clients.map((c) => c.id));
    const projects = uniqueById(list(r.projects).map((p) => ({
      id: text(p.id, 80), name: text(p.name) || 'Unnamed project', clientId: clientIds.has(p.clientId) ? p.clientId : null,
      rate: numberOrNull(p.rate, MAX_MONEY), budgetHours: numberOrNull(p.budgetHours, MAX_BUDGET),
      color: COLOR.test(p.color) ? p.color : '#2F6DB5', billable: p.billable !== false,
    })));
    const projectIds = new Set(projects.map((p) => p.id));
    const tags = uniqueById(list(r.tags).map((t) => ({ id: text(t.id, 80), name: text(t.name, 60) || 'Unnamed tag' })));
    const tagIds = new Set(tags.map((t) => t.id));
    const entries = uniqueById(list(r.entries).map((e) => ({
      id: text(e.id, 80), description: text(e.description), projectId: projectIds.has(e.projectId) ? e.projectId : null,
      tagIds: Array.isArray(e.tagIds) ? [...new Set(e.tagIds)].filter((id) => tagIds.has(id)) : [],
      billable: e.billable !== false, start: stamp(e.start), end: stamp(e.end), focus: e.focus === true,
    }))).filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end) && e.end > e.start);
    return { clients, projects, tags, entries, settings: cleanSettings(r.settings) };
  }

  function cleanTask(raw, data) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const projectIds = new Set(data.projects.map((p) => p.id));
    const tagIds = new Set(data.tags.map((t) => t.id));
    return {
      description: text(r.description),
      projectId: projectIds.has(r.projectId) ? r.projectId : null,
      tagIds: Array.isArray(r.tagIds) ? r.tagIds.filter((id) => tagIds.has(id)) : [],
      billable: r.billable === undefined ? data.settings.defaultBillable : r.billable === true,
    };
  }

  function cleanFocus(raw) {
    if (!raw || typeof raw !== 'object' || !finite(raw.phaseStart)) return null;
    if (raw.phase !== 'work' && raw.phase !== 'break') return null;
    return {
      phase: raw.phase, phaseStart: raw.phaseStart,
      round: clampInt(raw.round, 1, 12, 1), rounds: clampInt(raw.rounds, 1, 12, 4),
      workMin: clampInt(raw.workMin, 1, 180, 25), breakMin: clampInt(raw.breakMin, 1, 60, 5),
    };
  }

  function cleanState(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const data = cleanData(r);
    return {
      ...data,
      task: cleanTask(r.task, data),
      timerStart: finite(r.timerStart) && r.timerStart <= Date.now() + 86400000 ? r.timerStart : null,
      focus: cleanFocus(r.focus),
    };
  }

  function seedState() {
    const seeded = HG.seed.create(Date.now());
    return cleanState(seeded);
  }

  function readDisk() {
    try {
      const stored = localStorage.getItem(KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      storageOk = storageOk && !(e instanceof DOMException);
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storageOk = true;
    } catch (e) {
      storageOk = false;
    }
  }

  function load() {
    const disk = readDisk();
    state = disk ? cleanState(disk) : seedState();
    save();
  }

  function emit() { listeners.forEach((fn) => fn(state)); }

  /** Applies a change, saves it and re-renders. */
  function commit(change) {
    change(state);
    save();
    emit();
  }

  /** Applies and saves a change without re-rendering, for fields the user is typing in. */
  function commitQuiet(change) {
    change(state);
    save();
  }

  /** Picks up changes another tab has written. Called before work that must not be done twice. */
  function refresh() {
    const disk = readDisk();
    if (disk) state = cleanState(disk);
  }

  const DATA_KEYS = ['clients', 'projects', 'tags', 'entries', 'settings'];

  function snapshot() {
    return JSON.stringify(DATA_KEYS.reduce((out, key) => { out[key] = state[key]; return out; }, {}));
  }

  /** Restores a snapshot. The timer and focus session keep running, because undo is about records, not the clock. */
  function restore(json) {
    const data = cleanData(JSON.parse(json));
    commit((s) => {
      DATA_KEYS.forEach((key) => { s[key] = data[key]; });
      s.task = cleanTask(s.task, data);
    });
  }

  function replaceData(data) {
    const clean = cleanData(data);
    commit((s) => {
      DATA_KEYS.forEach((key) => { s[key] = clean[key]; });
      s.task = cleanTask(s.task, clean);
    });
  }

  function resetDemo() {
    const fresh = seedState();
    commit((s) => {
      Object.assign(s, fresh);
    });
  }

  function newId(prefix) {
    counter += 1;
    return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  }

  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) {
      refresh();
      emit();
    }
  });

  HG.store = {
    get state() { return state; },
    get storageOk() { return storageOk; },
    CURRENCIES, load, commit, commitQuiet, refresh, snapshot, restore, replaceData, resetDemo, newId, cleanData, stamp,
    on: (fn) => listeners.add(fn),
  };
})(window.HG);
