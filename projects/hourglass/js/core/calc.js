// The time arithmetic: midnight splitting, rounding, rates, overlaps and timesheet cell edits.
// Everything here is pure: it takes plain data and returns plain data, and never touches the DOM or storage.
(function (HG) {
  'use strict';
  const T = HG.time;

  /** Rounds a duration to a billing increment. minutes = 0 means no rounding. */
  function roundDuration(ms, minutes, mode) {
    if (!minutes) return ms;
    const unit = minutes * T.MIN;
    return (mode === 'nearest' ? Math.round(ms / unit) : Math.ceil(ms / unit)) * unit;
  }

  /** Cuts an entry at each local midnight it crosses. */
  function cutAtMidnights(start, end) {
    const parts = [];
    for (let cursor = start; cursor < end;) {
      const to = Math.min(T.nextMidnight(cursor), end);
      parts.push({ day: T.dayKey(cursor), start: cursor, end: to, rawMs: to - cursor });
      cursor = to;
    }
    return parts;
  }

  /**
   * The per-day pieces of an entry, with rounded time on each piece.
   * Rounding applies once to the whole entry, never per piece: 23:50 to 00:20 is 30 minutes, not 15 + 30.
   * The difference lands on the last piece, moving backwards if rounding down would take it below zero.
   */
  function portions(entry, settings) {
    const parts = cutAtMidnights(entry.start, entry.end);
    const raw = entry.end - entry.start;
    let delta = roundDuration(raw, settings.roundingMinutes, settings.roundingMode) - raw;
    parts.forEach((part) => { part.roundedMs = part.rawMs; });
    for (let i = parts.length - 1; i >= 0 && delta !== 0; i--) {
      const change = Math.max(delta, -parts[i].roundedMs);
      parts[i].roundedMs += change;
      delta -= change;
    }
    return parts;
  }

  function roundedTotal(entry, settings) {
    return roundDuration(entry.end - entry.start, settings.roundingMinutes, settings.roundingMode);
  }

  /** Time of an entry that falls inside one local day. */
  function msInDay(entry, dayKey) {
    const from = T.dayStart(dayKey);
    const to = T.nextMidnight(from);
    return Math.max(0, Math.min(entry.end, to) - Math.max(entry.start, from));
  }

  function touchesDay(entry, dayKey) { return msInDay(entry, dayKey) > 0; }

  function lookups(state) {
    return {
      project: new Map(state.projects.map((p) => [p.id, p])),
      client: new Map(state.clients.map((c) => [c.id, c])),
      tag: new Map(state.tags.map((t) => [t.id, t])),
    };
  }

  /** Project rate, else its client's rate, else the default from settings. In whole cents. */
  function rateCents(projectId, state, maps) {
    const index = maps || lookups(state);
    const project = index.project.get(projectId);
    if (project && project.rate !== null) return Math.round(project.rate * 100);
    const client = project ? index.client.get(project.clientId) : null;
    if (client && client.rate !== null) return Math.round(client.rate * 100);
    return Math.round(state.settings.defaultRate * 100);
  }

  /**
   * Money is summed as exact "cent-milliseconds" and rounded only for display.
   * Rounding each entry to cents first would make three 10-minute entries at 95/h total 47.49 instead of 47.50.
   */
  const exactAmount = (ms, cents) => ms * cents;
  const toCents = (exact) => Math.round(exact / T.HOUR);

  function money(cents, currency) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(cents / 100);
  }

  /** Every overlapping pair in a list. Entries that only touch (one ends as the next starts) don't overlap. */
  function overlapPairs(entries) {
    const sorted = entries.slice().sort((a, b) => a.start - b.start);
    const pairs = [];
    sorted.forEach((a, i) => {
      for (let j = i + 1; j < sorted.length && sorted[j].start < a.end; j++) {
        const b = sorted[j];
        pairs.push({ a, b, start: b.start, end: Math.min(a.end, b.end), ms: Math.min(a.end, b.end) - b.start });
      }
    });
    return pairs;
  }

  /** Entries that a candidate time range would collide with, soonest first. */
  function overlapsWith(candidate, entries) {
    return entries
      .filter((e) => e.id !== candidate.id && e.start < candidate.end && e.end > candidate.start)
      .map((e) => ({ entry: e, ms: Math.min(e.end, candidate.end) - Math.max(e.start, candidate.start) }))
      .sort((x, y) => x.entry.start - y.entry.start);
  }

  /** Stretches of time covered by two or more ranges, merged. Three stacked entries count once, not three times. */
  function overlapZones(ranges) {
    const edges = [];
    ranges.forEach((r) => { edges.push([r.start, 1]); edges.push([r.end, -1]); });
    edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const zones = [];
    let depth = 0;
    let openedAt = 0;
    edges.forEach(([at, change]) => {
      const was = depth;
      depth += change;
      if (was < 2 && depth >= 2) openedAt = at;
      if (was >= 2 && depth < 2 && at > openedAt) zones.push({ start: openedAt, end: at });
    });
    return zones;
  }

  /** Assigns side-by-side columns to ranges for the timeline. Each cluster of touching ranges shares a column count. */
  function layoutColumns(ranges) {
    const sorted = ranges.slice().sort((a, b) => a.start - b.start || b.end - a.end);
    const placed = [];
    let cluster = [];
    let clusterEnd = -Infinity;
    const flush = () => {
      const columns = cluster.reduce((max, item) => Math.max(max, item.col + 1), 1);
      cluster.forEach((item) => { item.cols = columns; });
      cluster = [];
    };
    sorted.forEach((range) => {
      if (range.start >= clusterEnd) { flush(); clusterEnd = -Infinity; }
      const taken = new Set(cluster.filter((item) => item.range.end > range.start).map((item) => item.col));
      let col = 0;
      while (taken.has(col)) col++;
      const item = { range, col, cols: 1 };
      cluster.push(item);
      placed.push(item);
      clusterEnd = Math.max(clusterEnd, range.end);
    });
    flush();
    return placed;
  }

  /** Splits an entry at an instant strictly inside it. Returns null otherwise. */
  function splitEntry(entry, at, newId) {
    if (!(at > entry.start && at < entry.end)) return null;
    return [{ ...entry, end: at }, { ...entry, id: newId, tagIds: entry.tagIds.slice(), start: at }];
  }

  function shrinkCell(entries, cell, cutMs, dayFrom, dayTo, newId) {
    let remaining = cutMs;
    let next = entries;
    for (let i = cell.length - 1; i >= 0 && remaining > 0; i--) {
      const entry = cell[i];
      const portion = Math.min(entry.end, dayTo) - Math.max(entry.start, dayFrom);
      const cut = Math.min(portion, remaining);
      remaining -= cut;
      const others = next.filter((e) => e.id !== entry.id);
      if (entry.start < dayFrom && entry.end > dayTo) {
        const later = dayFrom + cut === dayTo ? dayTo : dayFrom + cut;
        next = others.concat({ ...entry, end: dayFrom }, { ...entry, id: newId(), start: later });
      } else if (entry.end > dayTo) {
        next = others.concat(entry.start + cut < entry.end ? { ...entry, start: entry.start + cut } : []);
      } else {
        next = others.concat(entry.end - cut > entry.start ? { ...entry, end: entry.end - cut } : []);
      }
    }
    return next;
  }

  /** First free stretch of a day that fits a duration, searching from 09:00 and then from midnight. */
  function findGap(entries, durationMs, dayFrom, dayTo) {
    const nine = dayFrom + 9 * T.HOUR;
    const busy = entries.filter((e) => e.start < dayTo && e.end > dayFrom).sort((a, b) => a.start - b.start);
    const search = (from, to) => {
      let cursor = from;
      for (const e of busy) {
        if (e.end <= cursor) continue;
        if (e.start - cursor >= durationMs && cursor + durationMs <= to) return cursor;
        cursor = Math.max(cursor, e.end);
      }
      return cursor + durationMs <= to ? cursor : null;
    };
    const found = search(nine, dayTo);
    return found !== null ? found : search(dayFrom, nine);
  }

  /**
   * Makes a project's tracked time on one day equal a target, by editing real entries.
   * Lower: trims the latest entries first and removes any that reach zero. Raise: extends the day's last
   * entry if the time after it is free, otherwise adds a new entry in the first free gap.
   * Returns { entries, overlapped }.
   */
  function setCellTotal({ entries, projectId, day, targetMs, makeEntry, newId }) {
    const dayFrom = T.dayStart(day);
    const dayTo = T.nextMidnight(dayFrom);
    const cell = entries
      .filter((e) => e.projectId === projectId && e.start < dayTo && e.end > dayFrom)
      .sort((a, b) => a.start - b.start);
    const current = cell.reduce((sum, e) => sum + Math.min(e.end, dayTo) - Math.max(e.start, dayFrom), 0);
    const delta = targetMs - current;
    if (delta === 0) return { entries, overlapped: false };
    if (delta < 0) return { entries: shrinkCell(entries, cell, -delta, dayFrom, dayTo, newId), overlapped: false };

    const last = cell[cell.length - 1];
    if (last && last.end <= dayTo && last.end + delta <= dayTo) {
      const grown = { ...last, end: last.end + delta };
      if (!overlapsWith({ id: last.id, start: last.end, end: grown.end }, entries).length) {
        return { entries: entries.map((e) => (e.id === last.id ? grown : e)), overlapped: false };
      }
    }
    const gap = findGap(entries, delta, dayFrom, dayTo);
    const start = gap !== null ? gap : Math.max(dayFrom, Math.min(dayFrom + 9 * T.HOUR, dayTo - delta));
    return { entries: entries.concat(makeEntry(start, start + delta)), overlapped: gap === null };
  }

  /** The most recent distinct tasks, for quick resume. Blank tasks without a project aren't worth resuming. */
  function recentTasks(entries, limit) {
    const seen = new Set();
    const tasks = [];
    entries.slice().sort((a, b) => b.end - a.end).forEach((e) => {
      const key = `${e.description.trim().toLowerCase()}|${e.projectId}`;
      if (seen.has(key) || tasks.length >= limit || (!e.description.trim() && !e.projectId)) return;
      seen.add(key);
      tasks.push(e);
    });
    return tasks;
  }

  HG.calc = {
    roundDuration, cutAtMidnights, portions, roundedTotal, msInDay, touchesDay, lookups, rateCents, exactAmount, toCents, money,
    overlapPairs, overlapsWith, overlapZones, layoutColumns, splitEntry, setCellTotal, findGap, recentTasks,
  };
})(window.HG);
