// File formats: CSV and JSON export, and strict validation of JSON imports.
(function (HG) {
  'use strict';
  const T = HG.time;
  const COLUMNS = ['date', 'start', 'end', 'hours', 'rounded_hours', 'description', 'client', 'project', 'tags', 'billable', 'rate', 'amount', 'entry_id'];
  const MAX_IMPORT_ERRORS = 6;

  // Spreadsheets run cells that begin with these characters as formulas, so text cells get a leading apostrophe.
  function csvCell(value, isText) {
    let cell = String(value === null || value === undefined ? '' : value);
    if (isText && /^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
    return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  }

  /** One CSV row per entry per day, so a midnight-crossing entry bills on the days it was worked. */
  function toCsv(state, rows) {
    const maps = HG.calc.lookups(state);
    const out = [COLUMNS.join(',')];
    rows.forEach((line) => {
      const client = line.project ? maps.client.get(line.project.clientId) : null;
      const tags = line.entry.tagIds.map((id) => maps.tag.get(id)).filter(Boolean).map((t) => t.name).join('; ');
      const cents = HG.calc.toCents(line.exact);
      out.push([
        csvCell(line.day), csvCell(T.timeOfDay(line.start)), csvCell(line.end === T.dayStart(T.addDays(line.day, 1)) ? '24:00' : T.timeOfDay(line.end)),
        csvCell(T.hours(line.rawMs)), csvCell(T.hours(line.roundedMs)),
        csvCell(line.entry.description, true), csvCell(client ? client.name : '', true), csvCell(line.project ? line.project.name : '', true),
        csvCell(tags, true), csvCell(line.entry.billable ? 'yes' : 'no'), csvCell((line.rateCents / 100).toFixed(2)),
        csvCell((cents / 100).toFixed(2)), csvCell(line.entry.id),
      ].join(','));
    });
    return out.join('\r\n') + '\r\n';
  }

  function allRowsCsv(state) {
    const filters = { ...HG.report.defaultFilters(state), from: '0000-00-00', to: '9999-99-99' };
    return toCsv(state, HG.report.lines(state, filters));
  }

  function toJson(state) {
    return JSON.stringify({
      app: 'hourglass', version: 1, exportedAt: new Date().toISOString(),
      settings: state.settings, clients: state.clients, projects: state.projects, tags: state.tags,
      entries: state.entries.map((e) => ({ ...e, start: new Date(e.start).toISOString(), end: new Date(e.end).toISOString() })),
    }, null, 2);
  }

  function checkList(data, name, errors) {
    if (!Array.isArray(data[name])) { errors.push(`"${name}" must be a list.`); return []; }
    return data[name];
  }

  function checkEntries(entries, projectIds, tagIds, errors) {
    entries.forEach((e, i) => {
      const where = `Entry ${i + 1}`;
      if (!e || typeof e !== 'object') { errors.push(`${where} is not an object.`); return; }
      const start = HG.store.stamp(e.start);
      const end = HG.store.stamp(e.end);
      if (!Number.isFinite(start)) errors.push(`${where} has an invalid start time.`);
      if (!Number.isFinite(end)) errors.push(`${where} has an invalid end time.`);
      if (Number.isFinite(start) && Number.isFinite(end) && end <= start) errors.push(`${where} ends before it starts.`);
      if (e.projectId && !projectIds.has(e.projectId)) errors.push(`${where} points to a project that isn't in the file.`);
      (Array.isArray(e.tagIds) ? e.tagIds : []).forEach((id) => {
        if (!tagIds.has(id)) errors.push(`${where} points to a tag that isn't in the file.`);
      });
    });
  }

  function checkNamed(items, label, errors) {
    const seen = new Set();
    items.forEach((item, i) => {
      if (!item || typeof item.id !== 'string' || !item.id) errors.push(`${label} ${i + 1} has no id.`);
      else if (seen.has(item.id)) errors.push(`${label} ${i + 1} repeats the id "${item.id}".`);
      else seen.add(item.id);
      if (!item || typeof item.name !== 'string' || !item.name.trim()) errors.push(`${label} ${i + 1} has no name.`);
    });
    return seen;
  }

  /** Checks an imported file's text. Returns { data } when usable, or { errors } with messages to show the user. */
  function parseImport(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { errors: ['This file is not valid JSON.'] };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { errors: ['This file does not contain Hourglass data.'] };
    if (parsed.app !== 'hourglass') return { errors: ['This file was not exported from Hourglass.'] };

    const errors = [];
    const clients = checkList(parsed, 'clients', errors);
    const projects = checkList(parsed, 'projects', errors);
    const tags = checkList(parsed, 'tags', errors);
    const entries = checkList(parsed, 'entries', errors);
    checkNamed(clients, 'Client', errors);
    const projectIds = checkNamed(projects, 'Project', errors);
    const tagIds = checkNamed(tags, 'Tag', errors);
    checkEntries(entries, projectIds, tagIds, errors);
    if (errors.length) {
      const extra = errors.length - MAX_IMPORT_ERRORS;
      return { errors: errors.slice(0, MAX_IMPORT_ERRORS).concat(extra > 0 ? `and ${extra} more problems.` : []) };
    }
    return { data: HG.store.cleanData(parsed) };
  }

  HG.exporter = { toCsv, allRowsCsv, toJson, parseImport };
})(window.HG);
