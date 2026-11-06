// Day view: date navigation, quick resume, the timeline and the list of entries.
(function (HG) {
  'use strict';
  const { h, icon } = HG;
  const T = HG.time;
  const C = HG.calc;

  function dayTotals(state, day, now, ranges) {
    const totals = { rawMs: 0, billableMs: 0, exact: 0 };
    const maps = C.lookups(state);
    state.entries.filter((e) => C.touchesDay(e, day)).forEach((entry) => {
      C.portions(entry, state.settings).filter((part) => part.day === day).forEach((part) => {
        totals.rawMs += part.rawMs;
        if (entry.billable) {
          totals.billableMs += part.roundedMs;
          totals.exact += C.exactAmount(part.roundedMs, C.rateCents(entry.projectId, state, maps));
        }
      });
    });
    const running = ranges.find((r) => r.running);
    if (running) totals.rawMs += Math.max(0, running.end - running.start);
    return totals;
  }

  function recentStrip(state) {
    const tasks = C.recentTasks(state.entries, 5);
    if (!tasks.length) return null;
    const maps = C.lookups(state);
    return h('div', { class: 'recent', 'aria-label': 'Recent tasks' },
      h('span', { class: 'recent-label' }, 'Resume'),
      h('div', { class: 'recent-list' }, tasks.map((entry) => {
        const info = HG.ui.projectLabel(state, entry, maps);
        const name = entry.description || info.project;
        return h('button', { type: 'button', class: 'recent-chip', 'aria-label': `Resume ${name}, ${info.project}`, title: `${name} · ${info.project}`, onclick: () => HG.timer.resume(entry) },
          HG.ui.dot(info.color), h('span', { class: 'recent-name' }, name), icon('play', 12));
      })));
  }

  function timeRangeLabel(entry, day) {
    const startDay = T.dayKey(entry.start);
    const endDay = T.dayKey(entry.end);
    const start = startDay === day ? T.timeOfDay(entry.start) : `${T.shortWeekday(startDay)} ${T.timeOfDay(entry.start)}`;
    const end = endDay === day ? T.timeOfDay(entry.end) : `${T.shortWeekday(endDay)} ${T.timeOfDay(entry.end)}`;
    return `${start} to ${end}`;
  }

  function entryRow(entry, day, state, maps, overlapIds) {
    const info = HG.ui.projectLabel(state, entry, maps);
    const name = entry.description || 'Untitled entry';
    const inDay = C.msInDay(entry, day);
    const total = entry.end - entry.start;
    const tags = entry.tagIds.map((id) => maps.tag.get(id)).filter(Boolean);
    return h('li', { class: 'entry-row', 'data-entry': entry.id },
      h('div', { class: 'entry-main' },
        h('div', { class: 'entry-title' }, HG.ui.dot(info.color), h('span', { class: 'entry-name', title: name }, name)),
        h('div', { class: 'entry-meta' },
          h('span', { title: info.project }, info.client ? `${info.project} · ${info.client}` : info.project),
          !entry.billable && h('span', { class: 'badge' }, 'Non-billable'),
          tags.map((t) => h('span', { class: 'badge' }, t.name)),
          overlapIds.has(entry.id) && h('span', { class: 'badge badge-warn' }, icon('warn', 12), 'Overlap'))),
      h('div', { class: 'entry-side' },
        h('div', { class: 'entry-duration' }, T.duration(inDay)),
        h('div', { class: 'entry-range' }, timeRangeLabel(entry, day)),
        inDay !== total && h('div', { class: 'entry-range' }, `${T.duration(total)} in total`)),
      h('div', { class: 'entry-actions' },
        HG.ui.iconButton('play', `Resume ${name}`, () => HG.timer.resume(entry)),
        HG.ui.iconButton('split', `Split ${name}`, () => HG.splitForm.open(entry)),
        HG.ui.iconButton('edit', `Edit ${name}`, () => HG.entryForm.open({ entry })),
        HG.ui.iconButton('trash', `Delete ${name}`, () => HG.entryForm.deleteEntry(entry))));
  }

  function overlapSummary(pairs, ranges) {
    if (!pairs.length) return null;
    const totalMs = C.overlapZones(ranges).reduce((sum, z) => sum + z.end - z.start, 0);
    const names = new Set(pairs.flatMap((p) => [p.a.id, p.b.id])).size;
    return h('div', { class: 'overlap-note', id: 'day-overlap' }, icon('warn'), `${names} entries overlap on this day, for ${T.duration(totalMs)} in total.`);
  }

  function render(params) {
    const { state } = HG.store;
    const now = Date.now();
    const today = T.today();
    const day = params[0] && !Number.isNaN(T.dayStart(params[0])) ? params[0] : today;
    const ranges = HG.timeline.dayRanges(state, day, now);
    const totals = dayTotals(state, day, now, ranges);
    const entries = state.entries.filter((e) => C.touchesDay(e, day)).sort((a, b) => a.start - b.start);
    const maps = C.lookups(state);
    const pairs = C.overlapPairs(ranges.map((r) => ({ id: r.id, start: r.start, end: r.end })));
    const overlapIds = new Set(pairs.flatMap((p) => [p.a.id, p.b.id]));
    const money = C.money(C.toCents(totals.exact), state.settings.currency);
    const timeline = HG.timeline.render(state, day, now);

    const addEntry = () => HG.entryForm.open({ defaults: HG.entryForm.suggestSlot(day) });
    const node = h('div', { class: 'day-view' },
      h('div', { class: 'view-head' },
        h('div', { class: 'date-nav' },
          h('a', { class: 'icon-btn', href: `#/day/${T.addDays(day, -1)}`, 'aria-label': 'Previous day', title: 'Previous day', id: 'day-prev' }, icon('left')),
          h('a', { class: 'icon-btn', href: `#/day/${T.addDays(day, 1)}`, 'aria-label': 'Next day', title: 'Next day', id: 'day-next' }, icon('right')),
          h('h1', { id: 'day-title' }, T.longDate(day)),
          h('input', { type: 'date', class: 'date-jump', 'aria-label': 'Jump to date', value: day, onchange: (e) => { if (e.target.value) location.hash = `#/day/${e.target.value}`; } }),
          day !== today && h('a', { class: 'btn', href: `#/day/${today}` }, 'Today')),
        h('div', { class: 'stats' },
          HG.ui.stat('Tracked', T.duration(totals.rawMs), { 'data-testid': 'day-tracked', id: 'day-tracked' }),
          HG.ui.stat('Billable', T.duration(totals.billableMs), { id: 'day-billable' }),
          HG.ui.stat('Amount', money, { id: 'day-amount' })),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'add-entry', onclick: addEntry }, icon('plus'), 'Add entry')),
      HG.ui.budgetStrip(state, now),
      recentStrip(state),
      overlapSummary(pairs, ranges),
      h('div', { class: 'day-columns' },
        h('section', { class: 'panel tl-panel', 'aria-label': 'Timeline' }, timeline.node),
        h('section', { class: 'panel entries-panel', 'aria-label': 'Entries' },
          entries.length
            ? h('ul', { class: 'entry-list', id: 'entry-list' }, entries.map((entry) => entryRow(entry, day, state, maps, overlapIds)))
            : HG.ui.emptyState('Nothing tracked on this day', 'Start the timer, drag on the timeline, or add an entry by hand.', h('button', { type: 'button', class: 'btn', onclick: addEntry }, icon('plus'), 'Add entry')))));
    node.mount = timeline.mount;
    return node;
  }

  HG.views = HG.views || {};
  HG.views.day = { render };
})(window.HG);
