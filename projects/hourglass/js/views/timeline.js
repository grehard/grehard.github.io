// The vertical 24-hour day timeline. Drag on empty space (or click, or tap) to add an entry there.
(function (HG) {
  'use strict';
  const { h } = HG;
  const T = HG.time;
  const HOUR_PX = 44;
  const SNAP_MIN = 15;
  const CLICK_PX = 5;
  let lastScroll = { day: null, top: 0 };

  const toPx = (ms) => (ms / T.HOUR) * HOUR_PX;

  /** The day's ranges clipped to it. The running timer appears as a live range ending now. */
  function dayRanges(state, day, now) {
    const from = T.dayStart(day);
    const to = T.nextMidnight(from);
    const ranges = state.entries
      .filter((e) => e.start < to && e.end > from)
      .map((e) => ({ id: e.id, entry: e, start: Math.max(e.start, from), end: Math.min(e.end, to), running: false }));
    if (state.timerStart !== null && state.timerStart < to && now > from) {
      const task = state.task;
      ranges.push({
        id: '__timer', running: true, start: Math.max(state.timerStart, from), end: Math.max(Math.min(now, to), state.timerStart + 1),
        entry: { id: '__timer', description: task.description, projectId: task.projectId, tagIds: task.tagIds, billable: task.billable, start: state.timerStart, end: now },
      });
    }
    return ranges;
  }

  function blockFor(item, day, state, maps, from) {
    const { range } = item;
    const info = HG.ui.projectLabel(state, range.entry, maps);
    const color = info.color || '#7F7D76';
    const top = toPx(range.start - from);
    const height = Math.max(18, toPx(range.end - range.start) - 2);
    const fromPrev = range.entry.start < from;
    const toNext = range.entry.end > T.nextMidnight(from);
    const when = `${T.timeOfDay(range.entry.start)} to ${range.running ? 'now' : T.timeOfDay(range.entry.end)}`;
    const name = range.entry.description || 'Untitled entry';
    const open = () => { if (!range.running) HG.entryForm.open({ entry: range.entry }); };
    return h('button', {
      type: 'button',
      class: `tl-block${range.running ? ' is-running' : ''}${height < 34 ? ' is-short' : ''}`,
      style: {
        top: `${top}px`, height: `${height}px`, left: `calc(${(item.col / item.cols) * 100}% + 1px)`, width: `calc(${100 / item.cols}% - 3px)`,
        background: color, color: HG.dom.textOn(color),
      },
      'aria-label': `${name}, ${info.project}, ${when}${range.running ? ', timer running' : ''}`,
      title: `${name} · ${info.project} · ${when}`,
      'data-entry': range.entry.id,
      onclick: open,
    },
    h('span', { class: 'tl-name' }, fromPrev && '← ', name, toNext && ' →'),
    height >= 34 && h('span', { class: 'tl-sub' }, `${T.timeOfDay(range.start)} to ${range.running ? 'now' : (toNext ? '24:00' : T.timeOfDay(range.end))} · ${info.project}`));
  }

  /** Drag handling on the empty background. Touch only taps, so finger-scrolling the timeline still works. */
  function attachDragToCreate(canvas, day, from) {
    const snap = (y) => {
      const rect = canvas.getBoundingClientRect();
      const minutes = Math.round((((y - rect.top) / HOUR_PX) * 60) / SNAP_MIN) * SNAP_MIN;
      return from + Math.max(0, Math.min(24 * 60, minutes)) * T.MIN;
    };
    canvas.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.tl-block') || event.button !== 0) return;
      const anchorY = event.clientY;
      const anchor = snap(anchorY);
      let ghost = null;
      const isTouch = event.pointerType === 'touch';
      const range = (y) => {
        const a = Math.min(anchor, snap(y));
        const b = Math.max(anchor, snap(y));
        return { a, b };
      };
      const onMove = (e) => {
        if (isTouch || Math.abs(e.clientY - anchorY) < CLICK_PX) return;
        const { a, b } = range(e.clientY);
        if (!ghost) {
          ghost = h('div', { class: 'tl-ghost' });
          canvas.appendChild(ghost);
        }
        ghost.style.top = `${toPx(a - from)}px`;
        ghost.style.height = `${Math.max(2, toPx(b - a))}px`;
        ghost.textContent = `${T.timeOfDay(a)} to ${b >= T.nextMidnight(from) ? '24:00' : T.timeOfDay(b)}`;
      };
      const finish = (e) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        if (ghost) ghost.remove();
        const { a, b } = range(e.clientY);
        if (ghost && b > a) {
          HG.entryForm.open({ defaults: { start: a, end: b } });
        } else if (Math.abs(e.clientY - anchorY) < CLICK_PX) {
          const start = Math.min(anchor, T.nextMidnight(from) - T.HOUR);
          HG.entryForm.open({ defaults: { start, end: start + T.HOUR } });
        }
      };
      const cancel = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        if (ghost) ghost.remove();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', cancel);
    });
  }

  function initialScroll(day, ranges, now) {
    if (lastScroll.day === day) return lastScroll.top;
    const anchors = ranges.map((r) => r.start);
    if (day === T.today()) anchors.push(now - 2 * T.HOUR);
    const from = T.dayStart(day);
    const dayRelevant = anchors.filter((a) => a - from > 60 * T.MIN);
    const first = dayRelevant.length ? Math.min(...dayRelevant) : from + 8 * T.HOUR;
    return Math.max(0, toPx(first - from) - 12);
  }

  function render(state, day, now) {
    const from = T.dayStart(day);
    const dayHeight = toPx(T.nextMidnight(from) - from);
    const maps = HG.calc.lookups(state);
    const ranges = dayRanges(state, day, now);
    const zones = HG.calc.overlapZones(ranges);
    const canvas = h('div', { class: 'tl-canvas', style: { height: `${dayHeight}px` } });

    const hours = [];
    for (let hour = 0; hour < 24; hour++) {
      hours.push(h('div', { class: 'tl-hour', style: { top: `${hour * HOUR_PX}px` } }, h('span', null, `${T.pad(hour)}:00`)));
    }
    zones.forEach((zone) => {
      canvas.appendChild(h('div', { class: 'tl-overlap', style: { top: `${toPx(zone.start - from)}px`, height: `${Math.max(2, toPx(zone.end - zone.start))}px` } }));
    });
    HG.calc.layoutColumns(ranges).forEach((item) => canvas.appendChild(blockFor(item, day, state, maps, from)));
    if (now >= from && now < T.nextMidnight(from)) {
      canvas.appendChild(h('div', { class: 'tl-now', style: { top: `${toPx(now - from)}px` } }, h('span', { class: 'tl-now-label' }, T.timeOfDay(now))));
    }
    attachDragToCreate(canvas, day, from);

    const scroller = h('div', { class: 'tl-scroll', tabindex: '0', 'aria-label': `Timeline for ${T.longDate(day)}`, role: 'group',
      onscroll: (e) => { lastScroll = { day, top: e.target.scrollTop }; } },
    h('div', { class: 'tl-grid', style: { height: `${dayHeight}px` } }, h('div', { class: 'tl-hours' }, hours), canvas));
    const scrollTop = initialScroll(day, ranges, now);
    lastScroll = { day, top: scrollTop };
    return { node: scroller, mount: () => { scroller.scrollTop = scrollTop; } };
  }

  HG.timeline = { render, dayRanges };
})(window.HG);
