// Hand-built SVG charts. The cash flow chart redraws at its container's real width
// so axis text stays the same size on a phone as on a desktop.
(function () {
  const ns = window.Coinpath;
  const { el, svg } = ns.Dom;
  const { Dates, Money } = ns;
  const TAU = Math.PI * 2;
  const MAX_SLICES = 7;

  function makeTooltip(container) {
    const tip = el('div', { class: 'chart-tip', hidden: true });
    container.appendChild(tip);
    return {
      show(title, rows, x, y) {
        tip.textContent = '';
        tip.append(el('div', { class: 'chart-tip-title' }, title),
          ...rows.map((row) => el('div', { class: 'chart-tip-row' },
            el('span', null, row[0]), el('strong', null, row[1]))));
        tip.hidden = false;
        const maxLeft = container.clientWidth - tip.offsetWidth - 4;
        tip.style.left = Math.max(4, Math.min(x + 12, maxLeft)) + 'px';
        tip.style.top = Math.max(4, y - tip.offsetHeight - 8) + 'px';
      },
      hide() { tip.hidden = true; },
    };
  }

  /** A round axis ceiling and step for a maximum value in cents. */
  function niceScale(maxCents, tickCount) {
    const target = Math.max(maxCents, 10000) / tickCount;
    const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= target);
    return { step, max: step * tickCount };
  }

  function topRoundedBar(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height);
    return 'M' + x + ',' + (y + height) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y
      + 'H' + (x + width - r) + 'Q' + (x + width) + ',' + y + ' ' + (x + width) + ',' + (y + r) + 'V' + (y + height) + 'Z';
  }

  function drawGrid(root, frame, scale, currency) {
    for (let value = 0; value <= scale.max; value += scale.step) {
      const y = frame.toY(value);
      root.appendChild(svg('line', { class: value === 0 ? 'chart-base' : 'chart-grid', x1: frame.left, x2: frame.right, y1: y, y2: y }));
      root.appendChild(svg('text', { class: 'chart-axis', x: frame.left - 8, y: y + 4, 'text-anchor': 'end' }, Money.formatCompact(value, currency)));
    }
  }

  function drawBar(root, className, x, width, value, frame) {
    if (value <= 0) return;
    const height = Math.max(2, frame.bottom - frame.toY(value));
    root.appendChild(svg('path', { class: className, d: topRoundedBar(x, frame.bottom - height, width, height, 3) }));
  }

  function monthDescription(point, currency) {
    return [['Income', Money.format(point.income, currency)], ['Spending', Money.format(point.spend, currency)],
      ['Net', Money.format(point.net, currency, { signed: true })]];
  }

  function drawMonth(root, point, index, frame, opts, tooltip) {
    const center = frame.left + frame.slot * (index + 0.5);
    const barWidth = Math.max(4, Math.min(16, (frame.slot - 8) / 2));
    if (point.month === opts.selected) {
      root.appendChild(svg('rect', { class: 'chart-selected', x: center - frame.slot / 2, y: frame.top - 6, width: frame.slot, height: frame.bottom - frame.top + 30, rx: 4 }));
    }
    drawBar(root, 'bar-income', center - barWidth - 1, barWidth, point.income, frame);
    drawBar(root, 'bar-spend', center + 1, barWidth, point.spend, frame);
    if (frame.slot >= 26 || index % 2 === 1) {
      root.appendChild(svg('text', { class: 'chart-axis', x: center, y: frame.bottom + 17, 'text-anchor': 'middle' }, Dates.monthShort(point.month)));
    }
    const rows = monthDescription(point, opts.currency);
    const showTip = () => tooltip.show(Dates.monthShortYear(point.month), rows, center, frame.toY(Math.max(point.income, point.spend)));
    const description = Dates.monthLabel(point.month) + ': ' + rows.map((r) => r[0].toLowerCase() + ' ' + r[1]).join(', ');
    root.appendChild(svg('rect', {
      class: 'chart-hit', x: center - frame.slot / 2, y: frame.top - 6, width: frame.slot, height: frame.bottom - frame.top + 30,
      tabindex: 0, role: 'button', 'aria-label': description, 'data-month': point.month,
      onMouseenter: showTip, onMouseleave: tooltip.hide, onFocus: showTip, onBlur: tooltip.hide,
      onClick: () => opts.onSelect(point.month),
      onKeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); opts.onSelect(point.month); }
      },
    }));
  }

  function drawCashFlow(container, width, series, opts) {
    const height = 236;
    const peak = series.reduce((max, p) => Math.max(max, p.income, p.spend), 0);
    const scale = niceScale(peak, 4);
    const frame = { left: 52, right: width - 4, top: 12, bottom: height - 26 };
    frame.slot = (frame.right - frame.left) / series.length;
    frame.toY = (value) => frame.bottom - (value / scale.max) * (frame.bottom - frame.top);
    container.textContent = '';
    const tooltip = makeTooltip(container);
    const root = svg('svg', { class: 'chart-svg', width, height, viewBox: '0 0 ' + width + ' ' + height, role: 'group', 'aria-label': 'Income and spending per month, last 12 months' });
    drawGrid(root, frame, scale, opts.currency);
    series.forEach((point, index) => drawMonth(root, point, index, frame, opts, tooltip));
    container.insertBefore(root, container.firstChild);
  }

  /** Draws now and again whenever the container's width changes, until it leaves the page. */
  function drawResponsive(container, draw) {
    let lastWidth = 0;
    const run = () => {
      const width = Math.floor(container.clientWidth);
      if (width > 0 && width !== lastWidth) { lastWidth = width; draw(width); }
    };
    if (typeof ResizeObserver === 'undefined') { requestAnimationFrame(run); return; }
    const observer = new ResizeObserver(() => {
      if (!container.isConnected) { observer.disconnect(); return; }
      run();
    });
    observer.observe(container);
  }

  function cashFlow(series, opts) {
    const container = el('div', { class: 'chart-wrap' });
    drawResponsive(container, (width) => drawCashFlow(container, width, series, opts));
    return container;
  }

  function polar(cx, cy, r, angle) {
    return (cx + r * Math.sin(angle)).toFixed(2) + ',' + (cy - r * Math.cos(angle)).toFixed(2);
  }

  function ringSlice(cx, cy, outer, inner, start, end) {
    const sweep = Math.min(end - start, TAU - 0.0005);
    const stop = start + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    return 'M' + polar(cx, cy, outer, start) + 'A' + outer + ',' + outer + ' 0 ' + large + ' 1 ' + polar(cx, cy, outer, stop)
      + 'L' + polar(cx, cy, inner, stop) + 'A' + inner + ',' + inner + ' 0 ' + large + ' 0 ' + polar(cx, cy, inner, start) + 'Z';
  }

  /** Keeps the largest categories and folds the tail into a single "Other" slice. */
  function foldSlices(rows) {
    if (rows.length <= MAX_SLICES + 1) return rows;
    const tail = rows.slice(MAX_SLICES);
    return rows.slice(0, MAX_SLICES).concat({ isOther: true, categoryId: null, name: 'Other (' + tail.length + ')', color: null, cents: tail.reduce((sum, r) => sum + r.cents, 0) });
  }

  function percentOf(cents, total) {
    return total ? ((cents * 100) / total).toFixed(1) + '%' : '0%';
  }

  function highlight(wrap, key) {
    wrap.querySelectorAll('[data-slice]').forEach((node) => {
      node.classList.toggle('is-dimmed', key !== null && node.getAttribute('data-slice') !== key);
    });
  }

  function legendRow(row, key, total, wrap, opts) {
    return el('li', null, el('button', {
      type: 'button', class: 'legend-row', 'data-slice': key,
      onClick: () => opts.onPick(row),
      onMouseenter: () => highlight(wrap, key), onMouseleave: () => highlight(wrap, null),
      onFocus: () => highlight(wrap, key), onBlur: () => highlight(wrap, null),
    },
    ns.Dom.swatch(row.color),
    el('span', { class: 'legend-name', title: row.name }, row.name),
    el('span', { class: 'legend-value' }, Money.format(row.cents, opts.currency)),
    el('span', { class: 'legend-pct' }, percentOf(row.cents, total))));
  }

  /** Donut of spending by category with a linked legend. Returns the combined element. */
  function spendingDonut(rows, opts) {
    const total = rows.reduce((sum, row) => sum + row.cents, 0);
    const slices = foldSlices(rows);
    const size = 176;
    const center = size / 2;
    const wrap = el('div', { class: 'donut' });
    const stage = el('div', { class: 'donut-stage' });
    const tooltip = makeTooltip(stage);
    const summary = slices.map((row) => row.name + ' ' + Money.format(row.cents, opts.currency)).join(', ');
    const root = svg('svg', { class: 'chart-svg', width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, role: 'img', 'aria-label': 'Spending by category: ' + summary });
    let angle = 0;
    slices.forEach((row, index) => {
      const key = String(index);
      const sweep = (row.cents / total) * TAU;
      const values = [['Spent', Money.format(row.cents, opts.currency)], ['Share', percentOf(row.cents, total)]];
      root.appendChild(svg('path', {
        class: 'donut-slice', 'data-slice': key, d: ringSlice(center, center, center - 2, center - 26, angle, angle + sweep),
        fill: row.color || 'var(--neutral-mark)',
        onMousemove: (event) => {
          const box = stage.getBoundingClientRect();
          tooltip.show(row.name, values, event.clientX - box.left, event.clientY - box.top);
          highlight(wrap, key);
        },
        onMouseleave: () => { tooltip.hide(); highlight(wrap, null); },
        onClick: () => opts.onPick(row),
      }));
      angle += sweep;
    });
    stage.append(root, el('div', { class: 'donut-center' },
      el('span', { class: 'donut-total' }, Money.format(total, opts.currency)),
      el('span', { class: 'donut-caption' }, 'spent')));
    wrap.append(stage, el('ul', { class: 'legend' }, slices.map((row, index) => legendRow(row, String(index), total, wrap, opts))));
    return wrap;
  }

  ns.Charts = { cashFlow, spendingDonut, niceScale };
})();
