// Hand-built SVG charts. Each draw function gets a width, because the charts redraw when their container resizes.
(function (HG) {
  'use strict';
  const { h, s } = HG;
  const OTHER_COLOR = '#7F7D76';

  function niceMax(value, ticks) {
    if (value <= 0) return ticks;
    const rough = value / ticks;
    const power = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].find((n) => n * power >= rough) * power;
    return step * ticks;
  }

  function tip() { return document.getElementById('chart-tip'); }

  function showTip(event, title, rows) {
    const node = tip();
    node.replaceChildren(
      h('div', { class: 'tip-title' }, title),
      ...rows.map((row) => h('div', { class: 'tip-row' },
        row.color && h('span', { class: 'tip-key', style: { background: row.color } }),
        h('strong', null, row.value), h('span', null, row.label))),
    );
    node.hidden = false;
    const box = node.getBoundingClientRect();
    const x = Math.min(window.innerWidth - box.width - 8, event.clientX + 14);
    const y = event.clientY - box.height - 12 < 8 ? event.clientY + 16 : event.clientY - box.height - 12;
    node.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
  }

  function hideTip() { tip().hidden = true; }

  function roundedTop(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height);
    return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
  }

  function yAxis(svg, { left, right, top, plotHeight, max, ticks, format }) {
    for (let i = 0; i <= ticks; i++) {
      const y = top + plotHeight - (plotHeight * i) / ticks;
      svg.appendChild(s('line', { x1: left, x2: right, y1: y, y2: y, class: i === 0 ? 'axis-base' : 'grid-line' }));
      svg.appendChild(s('text', { x: left - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-text' }, format((max * i) / ticks)));
    }
  }

  /** Thins x labels so they never collide: every label if it fits, otherwise every nth. */
  function labelStep(count, plotWidth, labelWidth) {
    return Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plotWidth / labelWidth))));
  }

  /** Stacked columns. columns: [{ label, title, segments: [{ color, value, name, display }], total, totalText }] */
  function columns(width, { items, format, ariaLabel, height = 230 }) {
    const left = 44; const right = width - 8; const top = 12; const bottom = 26;
    const plotHeight = height - top - bottom;
    const plotWidth = right - left;
    const ticks = 4;
    const max = niceMax(Math.max(0, ...items.map((c) => c.total)), ticks);
    const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart-svg', role: 'img', 'aria-label': ariaLabel });
    yAxis(svg, { left, right, top, plotHeight, max, ticks, format });
    const slot = plotWidth / Math.max(1, items.length);
    const barWidth = Math.max(2, Math.min(28, slot - Math.max(2, slot * 0.28)));
    const step = labelStep(items.length, plotWidth, 52);
    items.forEach((item, i) => {
      const x = left + slot * i + (slot - barWidth) / 2;
      let y = top + plotHeight;
      const group = s('g', { class: 'chart-mark' });
      const visible = item.segments.filter((seg) => seg.value > 0);
      visible.forEach((seg, j) => {
        const segHeight = Math.max(1, (seg.value / max) * plotHeight);
        y -= segHeight;
        const isTop = j === visible.length - 1;
        // A 2px gap keeps stacked colors apart. The top segment is the only one with rounded corners.
        group.appendChild(isTop
          ? s('path', { d: roundedTop(x, y, barWidth, segHeight, 3), fill: seg.color })
          : s('rect', { x, y: y + 1, width: barWidth, height: Math.max(0.5, segHeight - 1), fill: seg.color }));
      });
      const hit = s('rect', { x: left + slot * i, y: top, width: slot, height: plotHeight, fill: 'transparent', class: 'chart-hit' });
      hit.addEventListener('pointermove', (e) => showTip(e, item.title, visible.map((seg) => ({ color: seg.color, value: seg.display, label: seg.name })).concat(visible.length ? [] : [{ value: 'Nothing tracked', label: '' }])));
      hit.addEventListener('pointerleave', hideTip);
      group.appendChild(hit);
      svg.appendChild(group);
      if (i % step === 0) {
        svg.appendChild(s('text', { x: left + slot * i + slot / 2, y: height - 8, 'text-anchor': 'middle', class: 'axis-text' }, item.label));
      }
    });
    return svg;
  }

  function truncateToWidth(text, width) {
    const chars = Math.max(4, Math.floor(width / 6.6));
    return text.length > chars ? `${text.slice(0, chars - 1)}…` : text;
  }

  /** Horizontal bars, directly labelled. items: [{ label, color, value, valueText, tip }] */
  function bars(width, { items, ariaLabel }) {
    const rowHeight = 30;
    const narrow = width < 460;
    const labelWidth = narrow ? Math.max(90, width * 0.34) : Math.min(190, width * 0.34);
    const valueWidth = narrow ? 84 : 130;
    const plotLeft = labelWidth + 8;
    const plotWidth = Math.max(20, width - plotLeft - valueWidth - 8);
    const max = Math.max(...items.map((i) => i.value), 1);
    const height = items.length * rowHeight + 4;
    const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart-svg', role: 'img', 'aria-label': ariaLabel });
    items.forEach((item, i) => {
      const y = i * rowHeight + 2;
      const barLength = Math.max(2, (item.value / max) * plotWidth);
      const group = s('g', { class: 'chart-mark' },
        s('text', { x: labelWidth, y: y + 18, 'text-anchor': 'end', class: 'bar-label' }, truncateToWidth(item.label, labelWidth)),
        s('path', { d: `M${plotLeft},${y + 6}H${plotLeft + barLength - 3}Q${plotLeft + barLength},${y + 6} ${plotLeft + barLength},${y + 9}V${y + 19}Q${plotLeft + barLength},${y + 22} ${plotLeft + barLength - 3},${y + 22}H${plotLeft}Z`, fill: item.color }),
        s('text', { x: plotLeft + barLength + 8, y: y + 18, class: 'bar-value' }, narrow ? item.valueShort : item.valueText),
        s('rect', { x: 0, y, width, height: rowHeight, fill: 'transparent', class: 'chart-hit' }));
      group.lastChild.addEventListener('pointermove', (e) => showTip(e, item.label, item.tip));
      group.lastChild.addEventListener('pointerleave', hideTip);
      svg.appendChild(group);
    });
    return svg;
  }

  /** One running-total line with a crosshair. points: [{ label, title, value, display }] */
  function line(width, { points, format, ariaLabel, color, height = 230 }) {
    const left = 58; const right = width - 12; const top = 14; const bottom = 26;
    const plotHeight = height - top - bottom;
    const plotWidth = right - left;
    const ticks = 4;
    const max = niceMax(Math.max(0, ...points.map((p) => p.value)), ticks);
    const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart-svg', role: 'img', 'aria-label': ariaLabel });
    yAxis(svg, { left, right, top, plotHeight, max, ticks, format });
    const xOf = (i) => left + (points.length > 1 ? (plotWidth * i) / (points.length - 1) : plotWidth / 2);
    const yOf = (value) => top + plotHeight - (value / max) * plotHeight;
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`).join('');
    svg.appendChild(s('path', { d: path, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const last = points[points.length - 1];
    if (last) svg.appendChild(s('circle', { cx: xOf(points.length - 1), cy: yOf(last.value), r: 4, fill: color, class: 'line-end' }));
    const step = labelStep(points.length, plotWidth, 56);
    points.forEach((p, i) => {
      if (i % step === 0) svg.appendChild(s('text', { x: xOf(i), y: height - 8, 'text-anchor': i === 0 ? 'start' : 'middle', class: 'axis-text' }, p.label));
    });
    const hair = s('line', { y1: top, y2: top + plotHeight, class: 'crosshair', visibility: 'hidden' });
    const marker = s('circle', { r: 4, fill: color, class: 'line-end', visibility: 'hidden' });
    svg.append(hair, marker);
    const hit = s('rect', { x: left, y: top, width: plotWidth, height: plotHeight, fill: 'transparent', class: 'chart-hit' });
    hit.addEventListener('pointermove', (e) => {
      const rect = svg.getBoundingClientRect();
      const ratio = points.length > 1 ? (e.clientX - rect.left - left) / plotWidth : 0;
      const i = Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
      const x = xOf(i);
      hair.setAttribute('x1', x); hair.setAttribute('x2', x); hair.setAttribute('visibility', 'visible');
      marker.setAttribute('cx', x); marker.setAttribute('cy', yOf(points[i].value)); marker.setAttribute('visibility', 'visible');
      showTip(e, points[i].title, [{ color, value: points[i].display, label: 'running total' }]);
    });
    hit.addEventListener('pointerleave', () => {
      hair.setAttribute('visibility', 'hidden'); marker.setAttribute('visibility', 'hidden'); hideTip();
    });
    svg.appendChild(hit);
    return svg;
  }

  function legend(items) {
    return h('div', { class: 'chart-legend' }, items.map((item) => h('span', { class: 'legend-item' },
      h('span', { class: 'legend-swatch', style: { background: item.color } }), h('span', { class: 'legend-name', title: item.name }, item.name))));
  }

  /** A chart slot that redraws at its own width. draw(width) returns an svg. */
  function responsive(draw) {
    const slot = h('div', { class: 'chart-slot' });
    let lastWidth = 0;
    const paint = () => {
      const width = Math.floor(slot.clientWidth);
      if (!width || width === lastWidth) return;
      lastWidth = width;
      slot.replaceChildren(draw(width));
    };
    if (window.ResizeObserver) new ResizeObserver(paint).observe(slot);
    else window.addEventListener('resize', paint);
    slot.paint = paint;
    return slot;
  }

  HG.charts = { columns, bars, line, legend, responsive, niceMax, hideTip, OTHER_COLOR };
})(window.HG);
