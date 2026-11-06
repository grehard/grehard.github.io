// Hand-built SVG charts. Bar charts redraw at the container's real width so labels keep their
// size on a phone, rather than scaling down the way a fixed viewBox would.
(function (R) {
  'use strict';
  const { h, svg } = R.dom;
  const D = R.Dates;
  const percent = R.Stats.percent;

  /** Draws into a div now and again whenever its width changes. draw(width) returns an svg. */
  function responsive(className, draw) {
    const box = h('div', { class: className });
    let lastWidth = 0;
    const paint = (width) => {
      if (!width || width === lastWidth) return;
      lastWidth = width;
      const old = box.querySelector('svg');
      const next = draw(width);
      if (old) old.replaceWith(next); else box.prepend(next);
    };
    paint(640);
    if (window.ResizeObserver) new ResizeObserver((items) => paint(Math.round(items[0].contentRect.width))).observe(box);
    return box;
  }

  function showTip(tip, box, text, x, y) {
    tip.textContent = text;
    tip.hidden = false;
    const maxLeft = box.clientWidth - tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(maxLeft, x - tip.offsetWidth / 2))}px`;
    tip.style.top = `${Math.max(0, y - tip.offsetHeight - 6)}px`;
  }

  function trendTable(weeks) {
    return h('table', { class: 'sr-only', data: { testid: 'trend-table' } },
      h('caption', {}, 'Completion rate per week, last 12 weeks'),
      h('thead', {}, h('tr', {}, h('th', {}, 'Week of'), h('th', {}, 'Done'), h('th', {}, 'Expected'), h('th', {}, 'Rate'))),
      h('tbody', {}, weeks.map((w) => h('tr', {},
        h('td', {}, D.formatShort(w.start)), h('td', {}, w.done), h('td', {}, w.expected), h('td', {}, percent(w.rate))))));
  }

  /** weeks: output of Stats.weeklyTrend. The current week is lighter because it isn't finished. */
  function trend(weeks) {
    const HEIGHT = 196;
    const M = { top: 20, right: 4, bottom: 24, left: 38 };
    const plotH = HEIGHT - M.top - M.bottom;
    const y = (rate) => M.top + plotH * (1 - rate);
    let box = null;

    const tipText = (w) => `Week of ${D.formatShort(w.start)}${w.isCurrent ? ' (so far)' : ''}: ${
      w.rate === null ? 'nothing expected' : `${w.done} of ${w.expected}, ${percent(w.rate)}`}`;

    function bar(w, i, step, width) {
      const barW = Math.min(40, step * 0.66);
      const x = M.left + step * i + (step - barW) / 2;
      const showValue = step >= 44;
      const showLabel = step >= 44 || i % 3 === (weeks.length - 1) % 3;
      const parts = [];
      if (w.rate !== null) {
        const top = y(w.rate);
        parts.push(svg('rect', { class: w.isCurrent ? 'bar bar-current' : 'bar', x, y: top, width: barW, height: Math.max(1, HEIGHT - M.bottom - top), rx: 2 }));
        if (showValue) parts.push(svg('text', { class: 'chart-value', x: x + barW / 2, y: top - 6, 'text-anchor': 'middle' }, percent(w.rate)));
      }
      if (showLabel) parts.push(svg('text', { class: 'chart-label', x: x + barW / 2, y: HEIGHT - 6, 'text-anchor': 'middle' }, D.formatShort(w.start)));
      const hit = svg('rect', { class: 'chart-hit', x: M.left + step * i, y: 0, width: step, height: HEIGHT });
      const show = () => showTip(box.querySelector('.chart-tip'), box, tipText(w), Math.min(width, x + barW / 2), w.rate === null ? y(0) : y(w.rate));
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('pointerdown', show);
      hit.addEventListener('pointerleave', () => { box.querySelector('.chart-tip').hidden = true; });
      parts.push(hit);
      return parts;
    }

    function draw(width) {
      const step = (width - M.left - M.right) / weeks.length;
      const grid = [0, 0.5, 1].map((rate) => [
        svg('line', { class: rate === 0 ? 'chart-axis' : 'chart-grid', x1: M.left, x2: width - M.right, y1: y(rate), y2: y(rate) }),
        svg('text', { class: 'chart-label', x: M.left - 8, y: y(rate) + 4, 'text-anchor': 'end' }, `${rate * 100}%`),
      ]);
      const summary = weeks.filter((w) => w.rate !== null).map((w) => `${D.formatShort(w.start)} ${percent(w.rate)}`).join(', ');
      return svg('svg', { width, height: HEIGHT, role: 'img', 'aria-label': `Weekly completion rate: ${summary || 'no data yet'}` },
        grid, weeks.map((w, i) => bar(w, i, step, width)));
    }

    box = responsive('chart', draw);
    box.append(h('div', { class: 'chart-tip', hidden: true }), trendTable(weeks));
    return box;
  }

  /** rates: output of Stats.weekdayRates. The best day takes the accent colour, the rest stay quiet. */
  function weekdays(rates, bestDay) {
    const ROW = 26;
    return responsive('chart', (width) => {
      const labelW = 40;
      const valueW = 44;
      const trackW = Math.max(40, width - labelW - valueW);
      const rows = rates.map((t, i) => {
        const y = i * ROW;
        const isBest = bestDay !== null && t.day === bestDay;
        return [
          svg('text', { class: isBest ? 'chart-label chart-strong' : 'chart-label', x: 0, y: y + 16 }, D.dayShort(t.day)),
          svg('rect', { class: 'bar-track', x: labelW, y: y + 5, width: trackW, height: 14, rx: 2 }),
          t.rate ? svg('rect', { class: isBest ? 'bar' : 'bar bar-quiet', x: labelW, y: y + 5, width: Math.max(2, trackW * t.rate), height: 14, rx: 2 }) : null,
          svg('text', { class: isBest ? 'chart-label chart-strong' : 'chart-label', x: width, y: y + 16, 'text-anchor': 'end' }, percent(t.rate)),
        ];
      });
      const summary = rates.map((t) => `${D.dayShort(t.day)} ${percent(t.rate)}`).join(', ');
      return svg('svg', { width, height: rates.length * ROW, role: 'img', 'aria-label': `Completion by weekday: ${summary}` }, rows);
    });
  }

  function heatmapRange(rangeKey, today, weekStart) {
    if (rangeKey === 'past') return { from: D.startOfWeek(D.addDays(today, -364), weekStart), to: today, gridTo: today, clipFrom: null };
    return { from: D.startOfWeek(`${rangeKey}-01-01`, weekStart), to: `${rangeKey}-12-31`, gridTo: `${rangeKey}-12-31`, clipFrom: `${rangeKey}-01-01` };
  }

  /**
   * A year of days as a week-by-weekday grid.
   * cell(date) returns { shade 0-4, skipped, label }. onSelect(date) fires when a past day is clicked.
   */
  function heatmap({ rangeKey, today, weekStart, cell, onSelect, label }) {
    const SIZE = 14;
    const GAP = 3;
    const LEFT = 30;
    const RIGHT_ROOM = 14; // Lets a month label in the last column finish inside the graphic.
    const TOP = 18;
    const { from, gridTo, clipFrom } = heatmapRange(rangeKey, today, weekStart);
    const readout = h('p', { class: 'heatmap-readout' }, 'Hover over a day for details.');
    const cols = Math.floor(D.diffDays(gridTo, from) / 7) + 1;
    const order = D.weekOrder(weekStart);
    const parts = [];
    let lastMonth = -1;
    let lastLabelCol = -4;

    for (let col = 0; col < cols; col++) {
      const firstOfCol = D.addDays(from, col * 7);
      const visibleStart = clipFrom && firstOfCol < clipFrom ? clipFrom : firstOfCol;
      const month = D.monthOf(visibleStart);
      if (month !== lastMonth && col - lastLabelCol >= 3) {
        parts.push(svg('text', { class: 'chart-label', x: LEFT + col * (SIZE + GAP), y: 11 }, D.monthShort(month)));
        lastLabelCol = col;
      }
      lastMonth = month;
      for (let row = 0; row < 7; row++) {
        const date = D.addDays(firstOfCol, row);
        if (date > gridTo || (clipFrom && date < clipFrom)) continue;
        const isFuture = date > today;
        const info = isFuture ? null : cell(date);
        const cls = isFuture ? 'hm hm-future' : info.skipped ? 'hm hm-skip' : `hm hm-${info.shade}`;
        parts.push(svg('rect', { class: cls, x: LEFT + col * (SIZE + GAP), y: TOP + row * (SIZE + GAP), width: SIZE, height: SIZE, rx: 2,
          data: isFuture ? { date } : { date, label: info.label } }));
      }
    }
    [1, 3, 5].forEach((row) => {
      parts.push(svg('text', { class: 'chart-label', x: 0, y: TOP + row * (SIZE + GAP) + 11 }, D.dayShort(order[row])));
    });

    const describe = (target) => {
      const date = target.dataset && target.dataset.date;
      if (!date) return;
      readout.textContent = target.dataset.label ? `${D.formatWeekday(date)}, ${D.yearOf(date)}: ${target.dataset.label}` : `${D.formatWeekday(date)}, ${D.yearOf(date)}`;
    };
    const graphic = svg('svg', { class: 'heatmap', width: LEFT + cols * (SIZE + GAP) + RIGHT_ROOM, height: TOP + 7 * (SIZE + GAP), role: 'img', 'aria-label': label,
      onMouseover: (e) => describe(e.target),
      onClick: (e) => {
        const date = e.target.dataset && e.target.dataset.date;
        if (date && date <= today && onSelect) onSelect(date);
      },
    }, parts);

    const scroller = h('div', { class: 'scroll-x', data: { scrollKey: 'heatmap' }, tabindex: '0', 'aria-label': `${label}, scrollable` }, graphic);
    requestAnimationFrame(() => { if (rangeKey === 'past') scroller.scrollLeft = scroller.scrollWidth; });
    const legend = h('div', { class: 'heatmap-legend', 'aria-hidden': 'true' }, 'Less',
      [0, 1, 2, 3, 4].map((n) => h('span', { class: `swatch swatch-${n}` })), 'More',
      h('span', { class: 'swatch swatch-skip' }), 'Skipped');
    return h('div', { class: 'heatmap-wrap' }, scroller, h('div', { class: 'heatmap-foot' }, readout, legend));
  }

  /** Options for the range picker: the past 12 months, then each calendar year with history. */
  function heatmapRanges(firstYear, today) {
    const options = [{ value: 'past', label: 'Past 12 months' }];
    for (let year = D.yearOf(today); year >= firstYear; year--) options.push({ value: String(year), label: String(year) });
    return options;
  }

  R.charts = { trend, weekdays, heatmap, heatmapRanges };
})(window.Rhythm);
