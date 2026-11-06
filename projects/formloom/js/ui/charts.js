// Hand-built charts. Bars are SVG; labels stay in HTML so they wrap and stay legible at any width.
FL.charts = (function () {
  const { h, svg, formatNumber } = FL.util;

  function barSvg(fraction) {
    const width = Math.max(0, Math.min(1, fraction)) * 100;
    return svg('svg', { class: 'chart-bar', viewBox: '0 0 100 10', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
      svg('rect', { class: 'chart-track', x: 0, y: 0, width: 100, height: 10 }),
      svg('rect', { class: 'chart-fill', x: 0, y: 0, width, height: 10 }));
  }

  /** items: [{ label, count }]. total is the denominator for percentages. */
  function horizontalBars(items, total) {
    const max = Math.max(1, ...items.map((item) => item.count));
    return h('ul', { class: 'hbars' }, items.map((item) => {
      const percent = total ? Math.round((item.count / total) * 100) : 0;
      return h('li', { class: 'hbar' },
        h('span', { class: 'hbar-label' }, item.label),
        barSvg(item.count / max),
        h('span', { class: 'hbar-value' }, `${item.count.toLocaleString('en-US')}`, h('span', { class: 'hbar-pct' }, ` ${percent}%`)));
    }));
  }

  /** items: [{ label, count }]. Vertical bars in one SVG; counts and labels share its column grid. */
  function columns(items) {
    const max = Math.max(1, ...items.map((item) => item.count));
    const height = 100;
    const gap = 14;
    const cell = 100;
    const bars = items.map((item, index) => {
      const barHeight = (item.count / max) * height;
      return svg('rect', {
        class: item.count ? 'chart-fill' : 'chart-track',
        x: index * cell + gap / 2,
        y: height - Math.max(barHeight, 1.5),
        width: cell - gap,
        height: Math.max(barHeight, 1.5),
      }, svg('title', null, `${item.label}: ${item.count}`));
    });
    const gridStyle = { 'grid-template-columns': `repeat(${items.length}, minmax(0, 1fr))` };
    return h('div', { class: 'vbars' },
      h('div', { class: 'vbars-row vbars-counts', style: gridStyle }, items.map((item) => h('span', null, item.count.toLocaleString('en-US')))),
      svg('svg', { class: 'vbars-plot', viewBox: `0 0 ${items.length * cell} ${height}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': items.map((item) => `${item.label}: ${item.count}`).join(', ') }, bars),
      h('div', { class: 'vbars-row vbars-labels', style: gridStyle }, items.map((item) => h('span', null, item.label))));
  }

  /** Daily counts as a bar strip, with start and end dates below. */
  function timeline(points) {
    const max = Math.max(1, ...points.map((point) => point.count));
    const bars = points.map((point, index) => {
      const barHeight = (point.count / max) * 100;
      return svg('rect', {
        class: point.count ? 'chart-fill' : 'chart-track',
        x: index + 0.12,
        y: 100 - Math.max(barHeight, 2),
        width: 0.76,
        height: Math.max(barHeight, 2),
      }, svg('title', null, `${point.label}: ${point.count}`));
    });
    return h('div', { class: 'timeline' },
      svg('svg', { class: 'timeline-plot', viewBox: `0 0 ${points.length} 100`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `Responses per day, highest ${max}` }, bars),
      h('div', { class: 'timeline-axis' }, h('span', null, points[0].label), h('span', null, points[points.length - 1].label)));
  }

  function stat(label, value) {
    return h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, typeof value === 'number' ? formatNumber(value) : value), h('span', { class: 'stat-label' }, label));
  }

  return { horizontalBars, columns, timeline, stat };
})();
