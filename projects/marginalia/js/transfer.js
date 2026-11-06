// Export to files and validated import from files. Parsing is separate from the UI
// so every problem becomes a message the import dialog can show.
(function (MG) {
  'use strict';

  const { Store } = MG;
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const MARKDOWN_EXTENSIONS = /\.(md|markdown|txt)$/i;

  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Keeps spaces and case so that re-importing the file restores the same title.
  function safeFilename(title) {
    return String(title).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/[. ]+$/, '').trim() || 'Untitled';
  }

  function exportNote(note) {
    download(`${safeFilename(note.title)}.md`, note.body, 'text/markdown');
  }

  function buildExport() {
    return {
      app: 'marginalia',
      version: 1,
      exportedAt: new Date().toISOString(),
      folders: Store.folders,
      notes: Store.notes,
    };
  }

  function exportAll() {
    const day = new Date().toISOString().slice(0, 10);
    download(`marginalia-notes-${day}.json`, JSON.stringify(buildExport(), null, 2), 'application/json');
  }

  function titleFromFilename(name) {
    const stem = name.replace(MARKDOWN_EXTENSIONS, '').replace(/[\[\]|]/g, ' ').replace(/\s+/g, ' ').trim();
    return stem.slice(0, MG.Links.TITLE_MAX) || 'Untitled';
  }

  /** A title not used by live notes or by notes earlier in this same import. */
  function claimTitle(base, taken) {
    let title = base;
    for (let n = 2; taken.has(MG.Links.normTitle(title)) || Store.findByTitle(title); n++) {
      title = `${base.slice(0, MG.Links.TITLE_MAX - 6)} ${n}`;
    }
    taken.add(MG.Links.normTitle(title));
    return title;
  }

  function parseMarkdownFile(name, text, plan) {
    if (text.includes('\u0000')) {
      plan.errors.push(`${name}: this doesn't look like a text file.`);
      return;
    }
    const now = Date.now();
    plan.notes.push({
      id: Store.newId('n'), title: claimTitle(titleFromFilename(name), plan.takenTitles), body: text.replace(/\r\n?/g, '\n'),
      folderId: null, pinned: false, createdAt: now, updatedAt: now, deletedAt: null, versions: [],
    });
  }

  function mapFolders(rawFolders, plan) {
    const mapping = new Map();
    (Array.isArray(rawFolders) ? rawFolders : []).forEach((raw) => {
      if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string' || !raw.name.trim()) return;
      const name = raw.name.trim().slice(0, 40);
      const lower = name.toLowerCase();
      const existing = [...Store.folders, ...plan.folders].find((f) => f.name.toLowerCase() === lower);
      if (existing) {
        mapping.set(raw.id, existing.id);
      } else {
        const created = { id: Store.newId('f'), name };
        plan.folders.push(created);
        mapping.set(raw.id, created.id);
      }
    });
    return mapping;
  }

  function parseJsonFile(name, text, plan) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      plan.errors.push(`${name}: this isn't valid JSON.`);
      return;
    }
    const rawNotes = Array.isArray(data) ? data : data && data.notes;
    if (!Array.isArray(rawNotes)) {
      plan.errors.push(`${name}: expected a Marginalia export with a "notes" list.`);
      return;
    }
    const folderMap = mapFolders(data.folders, plan);
    let skipped = 0;
    let accepted = 0;
    rawNotes.forEach((raw) => {
      const note = Store.sanitizeNote(raw, Date.now());
      if (!note) {
        skipped++;
        return;
      }
      accepted++;
      note.id = Store.newId('n');
      note.folderId = folderMap.get(note.folderId) || null;
      if (!note.deletedAt) note.title = claimTitle(note.title, plan.takenTitles);
      plan.notes.push(note);
    });
    if (skipped) plan.errors.push(`${name}: skipped ${skipped} ${skipped === 1 ? 'entry' : 'entries'} without a usable title and body.`);
    if (!accepted && !skipped) plan.errors.push(`${name}: the file contains no notes.`);
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  /**
   * Validates files and works out what to add, without changing anything yet.
   * @returns {Promise<{notes: Array, folders: Array, errors: string[]}>}
   */
  async function planImport(files) {
    const plan = { notes: [], folders: [], errors: [], takenTitles: new Set() };
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        plan.errors.push(`${file.name}: larger than the 5 MB limit.`);
      } else if (/\.json$/i.test(file.name)) {
        parseJsonFile(file.name, await readFile(file), plan);
      } else if (MARKDOWN_EXTENSIONS.test(file.name)) {
        parseMarkdownFile(file.name, await readFile(file), plan);
      } else {
        plan.errors.push(`${file.name}: only .md, .markdown, .txt and .json files can be imported.`);
      }
    }
    return plan;
  }

  MG.Transfer = { exportNote, exportAll, planImport };
})(window.MG = window.MG || {});
