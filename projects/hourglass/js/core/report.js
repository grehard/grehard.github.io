// Turns entries plus filters into report numbers. Entries are cut per day first, so a date range
// counts only the part of a midnight-crossing entry that actually falls inside it.
(function (HG) {
  'use strict';
  const T = HG.time;
  const C = HG.calc;

  function presetRange(preset, today, firstDay) {
    const thisWeek = T.weekStart(today, firstDay);
    switch (preset) {
      case 'week': return { from: thisWeek, to: T.addDays(thisWeek, 6) };
      case 'last-week': return { from: T.addDays(thisWeek, -7), to: T.addDays(thisWeek, -1) };
      case 'month': return { from: T.monthStart(today), to: T.monthEnd(today) };
      case 'last-month': {
        const last = T.addDays(T.monthStart(today), -1);
        return { from: T.monthStart(last), to: last };
      }
      case 'days-90': return { from: T.addDays(today, -89), to: today };
      case 'days-30':
      default: return { from: T.addDays(today, -29), to: today };
    }
  }

  function defaultFilters(state) {
    const range = presetRange('days-30', T.today(), state.settings.weekStart);
    return { preset: 'days-30', from: range.from, to: range.to, clientId: 'all', projectId: 'all', tagId: 'all', billable: 'all', groupBy: 'project', search: '' };
  }

  function entryMatches(entry, f, maps) {
    const project = maps.project.get(entry.projectId);
    if (f.projectId !== 'all' && (entry.projectId || 'none') !== f.projectId) return false;
    if (f.clientId !== 'all' && ((project && project.clientId) || 'none') !== f.clientId) return false;
    if (f.tagId !== 'all' && !entry.tagIds.includes(f.tagId)) return false;
    if (f.billable === 'yes' && !entry.billable) return false;
    if (f.billable === 'no' && entry.billable) return false;
    const search = f.search.trim().toLowerCase();
    return !search || entry.description.toLowerCase().includes(search);
  }

  /** One row per entry per day, inside the range and matching the filters. */
  function lines(state, f) {
    const maps = C.lookups(state);
    const out = [];
    state.entries.forEach((entry) => {
      if (!entryMatches(entry, f, maps)) return;
      const rate = entry.billable ? C.rateCents(entry.projectId, state, maps) : 0;
      C.portions(entry, state.settings).forEach((part) => {
        if (part.day < f.from || part.day > f.to) return;
        out.push({
          entry, day: part.day, start: part.start, end: part.end, rawMs: part.rawMs, roundedMs: part.roundedMs, rateCents: rate,
          exact: C.exactAmount(part.roundedMs, rate), project: maps.project.get(entry.projectId) || null,
        });
      });
    });
    return out.sort((a, b) => a.start - b.start);
  }

  function emptyTotals() { return { rawMs: 0, roundedMs: 0, billableMs: 0, exact: 0, count: 0 }; }

  function addTo(totals, line) {
    totals.rawMs += line.rawMs;
    totals.roundedMs += line.roundedMs;
    if (line.entry.billable) totals.billableMs += line.roundedMs;
    totals.exact += line.exact;
    totals.count += 1;
  }

  function groupByProject(rows, state) {
    const maps = C.lookups(state);
    const groups = new Map();
    rows.forEach((line) => {
      const key = line.entry.projectId || 'none';
      if (!groups.has(key)) {
        const client = line.project ? maps.client.get(line.project.clientId) : null;
        groups.set(key, { key, label: line.project ? line.project.name : 'No project', sublabel: client ? client.name : '',
          color: line.project ? line.project.color : '#7F7D76', ...emptyTotals() });
      }
      addTo(groups.get(key), line);
    });
    return [...groups.values()].sort((a, b) => b.roundedMs - a.roundedMs || a.label.localeCompare(b.label));
  }

  function groupByDay(rows) {
    const groups = new Map();
    rows.forEach((line) => {
      if (!groups.has(line.day)) groups.set(line.day, { key: line.day, label: T.longDate(line.day), sublabel: '', color: null, ...emptyTotals() });
      addTo(groups.get(line.day), line);
    });
    return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  }

  function compute(state, f) {
    const rows = lines(state, f);
    const totals = emptyTotals();
    rows.forEach((line) => addTo(totals, line));
    const groups = f.groupBy === 'day' ? groupByDay(rows) : groupByProject(rows, state);
    return { rows, totals, groups, entries: new Set(rows.map((r) => r.entry.id)).size };
  }

  /**
   * Time buckets for the charts: days, or weeks and months once a range is too long for a readable bar per day.
   */
  function buckets(f, firstDay) {
    const days = T.daysBetween(f.from, f.to);
    if (days.length <= 45) return days.map((d) => ({ key: d, from: d, to: d, label: T.shortDate(d), kind: 'day' }));
    const size = days.length <= 280 ? 'week' : 'month';
    const map = new Map();
    days.forEach((d) => {
      const key = size === 'week' ? T.weekStart(d, firstDay) : T.monthStart(d);
      if (!map.has(key)) map.set(key, { key, from: d, to: d, label: size === 'week' ? T.shortDate(key) : T.monthLabel(key), kind: size });
      map.get(key).to = d;
    });
    return [...map.values()];
  }

  HG.report = { presetRange, defaultFilters, lines, compute, buckets, groupByProject };
})(window.HG);
