// The single source of truth for notes and folders, plus persistence.
// Everything read from storage or from an import passes through the sanitize functions,
// so the rest of the app can trust the shape of its data.
(function (MG) {
  'use strict';

  const { normTitle, titleProblem, rewriteLinks, TITLE_MAX } = MG.Links;
  const STORAGE_KEY = 'marginalia.v1';
  const CORRUPT_KEY = 'marginalia.corrupt-backup';
  const MAX_VERSIONS = 30;
  const FOLDER_NAME_MAX = 40;

  let state = { notes: [], folders: [], settings: {} };
  let idCounter = 0;
  let storageHealthy = true;
  let loadWarning = '';
  const listeners = new Set();

  function newId(prefix) {
    idCounter++;
    return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  }

  function validTime(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function sanitizeVersions(raw, now) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v) => v && typeof v.body === 'string')
      .map((v) => ({ at: validTime(v.at, now), label: typeof v.label === 'string' ? v.label.slice(0, 60) : 'Saved', body: v.body }))
      .slice(-MAX_VERSIONS);
  }

  /** Returns a clean note, or null when the raw value can't be one. */
  function sanitizeNote(raw, now) {
    if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string' || typeof raw.body !== 'string') return null;
    if (titleProblem(raw.title)) return null;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : newId('n'),
      title: raw.title.trim().replace(/\s+/g, ' '),
      body: raw.body,
      folderId: typeof raw.folderId === 'string' ? raw.folderId : null,
      pinned: raw.pinned === true,
      createdAt: validTime(raw.createdAt, now),
      updatedAt: validTime(raw.updatedAt, now),
      deletedAt: typeof raw.deletedAt === 'number' ? raw.deletedAt : null,
      versions: sanitizeVersions(raw.versions, now),
    };
  }

  function sanitizeFolder(raw) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string' || !raw.name.trim()) return null;
    return { id: raw.id, name: raw.name.trim().slice(0, FOLDER_NAME_MAX) };
  }

  function sanitizeState(raw) {
    const now = Date.now();
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.notes)) return null;
    const folders = (Array.isArray(raw.folders) ? raw.folders : []).map(sanitizeFolder).filter(Boolean);
    const folderIds = new Set(folders.map((f) => f.id));
    const seenIds = new Set();
    const seenTitles = new Set();
    const notes = [];
    raw.notes.forEach((entry) => {
      const note = sanitizeNote(entry, now);
      if (!note || seenIds.has(note.id)) return;
      seenIds.add(note.id);
      if (note.folderId && !folderIds.has(note.folderId)) note.folderId = null;
      if (!note.deletedAt) {
        const key = normTitle(note.title);
        if (seenTitles.has(key)) return;
        seenTitles.add(key);
      }
      notes.push(note);
    });
    const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    return {
      notes,
      folders,
      settings: {
        mode: ['split', 'edit', 'preview'].includes(settings.mode) ? settings.mode : 'split',
        marginOpen: settings.marginOpen !== false,
        lastId: typeof settings.lastId === 'string' ? settings.lastId : null,
      },
    };
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      storageHealthy = false;
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  function freshSeed() {
    const seed = MG.Seed.build(Date.now());
    return { notes: seed.notes, folders: seed.folders, settings: { mode: 'split', marginOpen: true, lastId: 'n_outline' } };
  }

  function load() {
    const raw = readStorage(STORAGE_KEY);
    if (raw === null) {
      state = freshSeed();
      persist();
      return;
    }
    let parsed = null;
    try {
      parsed = sanitizeState(JSON.parse(raw));
    } catch (err) {
      parsed = null;
    }
    if (parsed) {
      state = parsed;
    } else {
      writeStorage(CORRUPT_KEY, raw);
      loadWarning = 'Your saved notes could not be read, so the demo notes were loaded. A copy of the old data was kept in this browser.';
      state = freshSeed();
      persist();
    }
  }

  function persist() {
    storageHealthy = writeStorage(STORAGE_KEY, JSON.stringify(state));
    return storageHealthy;
  }

  function notify() {
    listeners.forEach((fn) => fn());
  }

  function commit() {
    persist();
    notify();
  }

  function subscribe(fn) {
    listeners.add(fn);
  }

  // Lookups

  function get(id) {
    return state.notes.find((note) => note.id === id) || null;
  }

  function live() {
    return state.notes.filter((note) => !note.deletedAt);
  }

  function trashed() {
    return state.notes.filter((note) => note.deletedAt);
  }

  function findByTitle(title) {
    const key = normTitle(title);
    return live().find((note) => normTitle(note.title) === key) || null;
  }

  function folder(id) {
    return state.folders.find((f) => f.id === id) || null;
  }

  function tagCounts() {
    const counts = new Map();
    live().forEach((note) => {
      MG.Links.extractTags(note.body).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  /** The first free title: "Untitled", "Untitled 2", and so on. */
  function uniqueTitle(base) {
    const clean = String(base).trim().slice(0, TITLE_MAX - 6) || 'Untitled';
    if (!findByTitle(clean)) return clean;
    for (let n = 2; ; n++) {
      const candidate = `${clean} ${n}`;
      if (!findByTitle(candidate)) return candidate;
    }
  }

  // Undo works by restoring a snapshot of the content taken before the change.

  function checkpoint() {
    return JSON.stringify({ notes: state.notes, folders: state.folders });
  }

  function rollback(snapshot) {
    const data = JSON.parse(snapshot);
    state.notes = data.notes;
    state.folders = data.folders;
    commit();
  }

  // Notes

  function createNote(fields) {
    const now = Date.now();
    const note = {
      id: newId('n'),
      title: uniqueTitle(fields && fields.title ? fields.title : 'Untitled'),
      body: fields && fields.body ? fields.body : '',
      folderId: fields && fields.folderId ? fields.folderId : null,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      versions: [],
    };
    state.notes.push(note);
    commit();
    return note;
  }

  /** Updates a body in memory. The caller decides when to save, so typing stays cheap. */
  function setBody(id, body) {
    const note = get(id);
    if (!note || note.body === body) return false;
    note.body = body;
    note.updatedAt = Date.now();
    return true;
  }

  function captureVersion(id, label) {
    const note = get(id);
    if (!note) return false;
    const last = note.versions[note.versions.length - 1];
    if (last && last.body === note.body) return false;
    note.versions.push({ at: Date.now(), label, body: note.body });
    if (note.versions.length > MAX_VERSIONS) note.versions.shift();
    return true;
  }

  function restoreVersion(id, index) {
    const note = get(id);
    const version = note && note.versions[index];
    if (!version) return false;
    captureVersion(id, 'Before restore');
    note.body = version.body;
    note.updatedAt = Date.now();
    commit();
    return true;
  }

  function validateTitle(rawTitle, ignoreId) {
    const problem = titleProblem(rawTitle);
    if (problem) return problem;
    const existing = findByTitle(rawTitle);
    return existing && existing.id !== ignoreId ? `A note called "${existing.title}" already exists.` : '';
  }

  /**
   * Renames a note and repoints every link to it, in all notes including the trash.
   * @returns {{ok: boolean, error?: string, changed?: boolean, links?: number, notes?: number}}
   */
  function renameNote(id, rawTitle) {
    const note = get(id);
    if (!note) return { ok: false, error: 'That note no longer exists.' };
    const error = validateTitle(rawTitle, id);
    if (error) return { ok: false, error };
    const title = rawTitle.trim().replace(/\s+/g, ' ');
    if (title === note.title) return { ok: true, changed: false, links: 0, notes: 0 };
    let links = 0;
    let touched = 0;
    state.notes.forEach((other) => {
      const result = rewriteLinks(other.body, note.title, title);
      if (!result.count) return;
      captureVersion(other.id, `Before rename of ${note.title}`.slice(0, 60));
      other.body = result.body;
      links += result.count;
      touched++;
    });
    note.title = title;
    note.updatedAt = Date.now();
    commit();
    return { ok: true, changed: true, links, notes: touched };
  }

  function update(id, change) {
    const note = get(id);
    if (!note) return;
    change(note);
    commit();
  }

  function togglePin(id) {
    update(id, (note) => { note.pinned = !note.pinned; });
  }

  function setFolder(id, folderId) {
    update(id, (note) => {
      note.folderId = folderId && folder(folderId) ? folderId : null;
    });
  }

  function trashNote(id) {
    update(id, (note) => { note.deletedAt = Date.now(); note.pinned = false; });
  }

  /** Restores from the trash, adding a suffix if the title has been reused in the meantime. */
  function restoreNote(id) {
    update(id, (note) => {
      note.deletedAt = null;
      if (findOtherLiveWithTitle(note)) note.title = uniqueTitle(`${note.title} (restored)`.slice(0, TITLE_MAX));
    });
  }

  function findOtherLiveWithTitle(note) {
    const key = normTitle(note.title);
    return live().find((other) => other.id !== note.id && normTitle(other.title) === key);
  }

  function deleteForever(id) {
    state.notes = state.notes.filter((note) => note.id !== id);
    commit();
  }

  function emptyTrash() {
    state.notes = live();
    commit();
  }

  // Folders

  function folderNameProblem(rawName, ignoreId) {
    const name = String(rawName).trim();
    if (!name) return 'Give the folder a name.';
    if (name.length > FOLDER_NAME_MAX) return `Folder names can be at most ${FOLDER_NAME_MAX} characters.`;
    const clash = state.folders.find((f) => f.id !== ignoreId && f.name.toLowerCase() === name.toLowerCase());
    return clash ? `There is already a folder called "${clash.name}".` : '';
  }

  function createFolder(rawName) {
    const f = { id: newId('f'), name: String(rawName).trim() };
    state.folders.push(f);
    commit();
    return f;
  }

  function renameFolder(id, rawName) {
    const f = folder(id);
    if (!f) return;
    f.name = String(rawName).trim();
    commit();
  }

  /** Deletes the folder only; its notes stay and become unfiled. */
  function deleteFolder(id) {
    state.folders = state.folders.filter((f) => f.id !== id);
    state.notes.forEach((note) => {
      if (note.folderId === id) note.folderId = null;
    });
    commit();
  }

  function resetDemo() {
    const settings = state.settings;
    const seed = freshSeed();
    state = { notes: seed.notes, folders: seed.folders, settings: Object.assign({}, settings, { lastId: 'n_outline' }) };
    commit();
  }

  function setSetting(key, value) {
    state.settings[key] = value;
    persist();
  }

  /** Adds imported notes and folders in one step, so a single undo removes them all. */
  function addImported(notes, folders) {
    folders.forEach((f) => state.folders.push(f));
    notes.forEach((note) => state.notes.push(note));
    commit();
  }

  MG.Store = {
    load, persist, commit, subscribe, get, live, trashed, findByTitle, tagCounts, folder, uniqueTitle,
    checkpoint, rollback, createNote, setBody, captureVersion, restoreVersion, validateTitle, renameNote,
    togglePin, setFolder, trashNote, restoreNote, deleteForever, emptyTrash, folderNameProblem, createFolder,
    renameFolder, deleteFolder, resetDemo, setSetting, addImported, sanitizeNote, newId,
    get notes() { return state.notes; },
    get folders() { return state.folders; },
    get settings() { return state.settings; },
    get storageHealthy() { return storageHealthy; },
    takeLoadWarning() { const w = loadWarning; loadWarning = ''; return w; },
  };
})(window.MG = window.MG || {});
