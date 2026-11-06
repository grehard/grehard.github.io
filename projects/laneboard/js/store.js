// Persistence and validation. Saved data and imported files pass through the same normalize step,
// so a damaged localStorage entry can never reach the renderer in a shape it doesn't expect.
const Store = (() => {
  const KEY = 'laneboard.state';
  const MAX_TITLE = 300;
  const MAX_TEXT = 20000;
  let memoryCopy = null;

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const cleanString = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const cleanColor = (v, fallback) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);
  const uniqueStrings = (list) => (Array.isArray(list) ? [...new Set(list.filter((v) => typeof v === 'string' && v))] : []);

  function normalizeNamedList(list, what, errors) {
    if (!Array.isArray(list)) { errors.push(`The ${what} list is missing.`); return []; }
    const seen = new Set();
    const out = [];
    list.forEach((raw, i) => {
      const name = isObject(raw) ? cleanString(raw.name, 80) : '';
      if (!name || typeof raw.id !== 'string' || !raw.id) { errors.push(`Entry ${i + 1} in the ${what} list needs an id and a name.`); return; }
      if (seen.has(raw.id)) return;
      seen.add(raw.id);
      out.push({ id: raw.id, name, color: cleanColor(raw.color, Model.COLORS[i % Model.COLORS.length]) });
    });
    return out;
  }

  function normalizeChecklist(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => isObject(item) && cleanString(item.text, MAX_TITLE))
      .map((item, i) => ({ id: typeof item.id === 'string' && item.id ? item.id : `item-${i}-${Model.uid('i')}`, text: cleanString(item.text, MAX_TITLE), done: item.done === true }));
  }

  function normalizeActivity(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((entry) => isObject(entry) && typeof entry.text === 'string' && !Number.isNaN(Date.parse(entry.at)))
      .map((entry) => ({ at: entry.at, text: entry.text.slice(0, MAX_TITLE * 4) }));
  }

  function normalizeArchivedFrom(raw) {
    if (!isObject(raw)) return null;
    return { columnId: String(raw.columnId || ''), columnName: cleanString(raw.columnName, 80), at: Number.isNaN(Date.parse(raw.at)) ? new Date().toISOString() : raw.at };
  }

  function normalizeCard(raw, id, context, errors) {
    const title = isObject(raw) ? cleanString(raw.title, MAX_TITLE) : '';
    if (!title) { errors.push(`A card in "${context.projectName}" has no title.`); return null; }
    return {
      id,
      number: Number.isInteger(raw.number) && raw.number > 0 ? raw.number : 0,
      title,
      description: typeof raw.description === 'string' ? raw.description.slice(0, MAX_TEXT) : '',
      assigneeId: context.memberIds.has(raw.assigneeId) ? raw.assigneeId : null,
      labelIds: uniqueStrings(raw.labelIds).filter((l) => context.labelIds.has(l)),
      priority: Model.PRIORITIES.some((p) => p.id === raw.priority) ? raw.priority : 'medium',
      due: Dates.isValid(raw.due) ? raw.due : null,
      checklist: normalizeChecklist(raw.checklist),
      activity: normalizeActivity(raw.activity),
      createdAt: Number.isNaN(Date.parse(raw.createdAt)) ? new Date().toISOString() : raw.createdAt,
      archivedFrom: normalizeArchivedFrom(raw.archivedFrom),
    };
  }

  function normalizeColumns(rawColumns, projectName, errors) {
    if (!Array.isArray(rawColumns) || !rawColumns.length) { errors.push(`Project "${projectName}" needs at least one lane.`); return []; }
    const seen = new Set();
    return rawColumns.flatMap((raw) => {
      const name = isObject(raw) ? cleanString(raw.name, 80) : '';
      if (!name || typeof raw.id !== 'string' || !raw.id) { errors.push(`A lane in "${projectName}" needs an id and a name.`); return []; }
      if (seen.has(raw.id)) { errors.push(`Project "${projectName}" uses the lane id "${raw.id}" twice.`); return []; }
      seen.add(raw.id);
      const limit = Number.isInteger(raw.limit) && raw.limit >= 1 && raw.limit <= Model.MAX_LIMIT ? raw.limit : null;
      return [{ id: raw.id, name, limit, isDone: raw.isDone === true, cardIds: uniqueStrings(raw.cardIds) }];
    });
  }

  // Cards listed twice stay in their first place, missing cards are dropped from lanes,
  // and cards no lane mentions go to the first lane rather than silently disappearing.
  function reconcilePlacement(project) {
    const placed = new Set();
    const keepKnown = (ids) => ids.filter((id) => {
      if (!project.cards[id] || placed.has(id)) return false;
      placed.add(id);
      return true;
    });
    project.columns.forEach((column) => { column.cardIds = keepKnown(column.cardIds); });
    project.archive = keepKnown(project.archive);
    Object.keys(project.cards).forEach((id) => { if (!placed.has(id)) project.columns[0].cardIds.push(id); });
  }

  function assignCardNumbers(project) {
    const cards = Object.values(project.cards);
    const used = new Set();
    let next = cards.reduce((max, c) => Math.max(max, c.number), 0) + 1;
    cards.forEach((card) => {
      if (!card.number || used.has(card.number)) card.number = next++;
      used.add(card.number);
    });
    return next;
  }

  function normalizeProject(raw, index, shared, errors) {
    const projectName = isObject(raw) ? cleanString(raw.name, 120) : '';
    if (!projectName || typeof raw.id !== 'string' || !raw.id) { errors.push(`Project ${index + 1} needs an id and a name.`); return null; }
    const columns = normalizeColumns(raw.columns, projectName, errors);
    if (!isObject(raw.cards)) { errors.push(`Project "${projectName}" has no cards object.`); return null; }
    if (!columns.length) return null;
    const context = { projectName, ...shared };
    const cards = {};
    Object.entries(raw.cards).forEach(([id, rawCard]) => {
      const card = normalizeCard(rawCard, id, context, errors);
      if (card) cards[id] = card;
    });
    const key = cleanString(raw.key, 8).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PRJ';
    const project = { id: raw.id, name: projectName, key, nextNumber: 1, columns, archive: uniqueStrings(raw.archive), cards };
    reconcilePlacement(project);
    project.nextNumber = assignCardNumbers(project);
    return project;
  }

  // Returns a clean state, or null with the reasons listed in `errors`.
  function normalize(raw, errors) {
    if (!isObject(raw) || raw.format !== 'laneboard') { errors.push('This is not a Laneboard export file.'); return null; }
    if (!Array.isArray(raw.projects) || !raw.projects.length) { errors.push('The file contains no projects.'); return null; }
    const team = normalizeNamedList(raw.team, 'team', errors);
    const labels = normalizeNamedList(raw.labels, 'label', errors);
    const shared = { memberIds: new Set(team.map((m) => m.id)), labelIds: new Set(labels.map((l) => l.id)) };
    const ids = new Set();
    const projects = [];
    raw.projects.forEach((rawProject, i) => {
      const project = normalizeProject(rawProject, i, shared, errors);
      if (!project) return;
      if (ids.has(project.id)) { errors.push(`Two projects share the id "${project.id}".`); return; }
      ids.add(project.id);
      projects.push(project);
    });
    if (errors.length) return null;
    const activeProjectId = ids.has(raw.activeProjectId) ? raw.activeProjectId : projects[0].id;
    return { format: 'laneboard', version: 1, activeProjectId, team, labels, projects };
  }

  function parseImport(text) {
    let raw;
    try { raw = JSON.parse(text); } catch (e) { return { state: null, errors: ['The file is not valid JSON.'] }; }
    const errors = [];
    const state = normalize(raw, errors);
    return { state, errors };
  }

  function load() {
    let text = memoryCopy;
    try { text = localStorage.getItem(KEY); } catch (e) { /* storage blocked: fall through to first-run data */ }
    if (text === null) return { state: Seed.build(), damaged: false };
    const { state } = parseImport(text);
    return state ? { state, damaged: false } : { state: Seed.build(), damaged: true };
  }

  function save(state) {
    memoryCopy = JSON.stringify(state);
    try { localStorage.setItem(KEY, memoryCopy); } catch (e) { /* storage blocked or full: keep working in memory */ }
  }

  function exportFile(state) {
    const payload = { ...state, exportedAt: new Date().toISOString() };
    const name = `laneboard-${Dates.today()}.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  }

  return { load, save, parseImport, exportFile };
})();
