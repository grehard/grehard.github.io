// Hand-built SVG charts. Each one measures its container and redraws on resize, so text and
// bars stay crisp at any width rather than being scaled by a viewBox.
(function () {
  const { h, svg, clear } = SR.ui;
  const { format } = SR.money;

  /** Smallest round tick size that lets four gridlines cover the value. */
  function niceTick(value) {
    const raw = Math.max(value, 100) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (step * magnitude >= raw) return step * magnitude;
    return 10 * magnitude;
  }

  const shortMoney = (cents) => {
    const dollars = cents / 100;
    return dollars >= 1000 ? `$${Number((dollars / 1000).toFixed(1))}k` : `$${Math.round(dollars)}`;
  };

  /** A rectangle with only its top corners rounded, for the data end of a bar. */
  function topRounded(x, y, w, height, radius) {
    const r = Math.min(radius, w / 2, height);
    return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + height}Z`;
  }

  function rightRounded(x, y, w, height, radius) {
    const r = Math.min(radius, height / 2, w);
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + height - r}Q${x + w},${y + height} ${x + w - r},${y + height}H${x}Z`;
  }

  /** Shared wrapper: redraw on resize, plus one tooltip element that stays inside the chart. */
  function chartShell(draw, label) {
    const tip = h('div', { class: 'chart-tip', hidden: true });
    const stage = h('div', { class: 'chart-stage' });
    const shell = h('div', { class: 'chart', role: 'group', 'aria-label': label }, stage, tip);
    let lastWidth = 0;
    const tooltip = {
      show(lines, x, y) {
        clear(tip);
        lines.forEach((line, i) => tip.appendChild(h('div', { class: i === 0 ? 'chart-tip-head' : 'chart-tip-row' }, line)));
        tip.hidden = false;
        const width = tip.offsetWidth;
        const left = Math.max(0, Math.min(stage.clientWidth - width, x - width / 2));
        tip.style.left = `${left}px`;
        tip.style.top = `${Math.max(0, y - tip.offsetHeight - 10)}px`;
      },
      hide() { tip.hidden = true; },
    };
    const render = () => {
      const width = stage.clientWidth;
      if (!width || width === lastWidth) return;
      lastWidth = width;
      clear(stage);
      tooltip.hide();
      draw(stage, width, tooltip);
    };
    if (window.ResizeObserver) new ResizeObserver(render).observe(stage);
    requestAnimationFrame(render);
    shell.addEventListener('mouseleave', () => tooltip.hide());
    return shell;
  }

  /** Revenue by day as stacked bars: gross profit on the baseline, cost of goods on top. */
  function dailyRevenueChart(days) {
    return chartShell((stage, width, tooltip) => {
      const height = 240;
      const margin = { top: 12, right: 8, bottom: 26, left: 48 };
      const plotW = width - margin.left - margin.right;
      const plotH = height - margin.top - margin.bottom;
      const tick = niceTick(Math.max(...days.map((d) => d.revenueCents), 1));
      const maxValue = tick * 4;
      const yOf = (v) => margin.top + plotH - (v / maxValue) * plotH;
      const slot = plotW / days.length;
      const barW = Math.max(2, Math.min(28, slot - 2));
      const root = svg('svg', { class: 'chart-svg', width, height, role: 'img', 'aria-label': 'Daily revenue, split into gross profit and cost of goods' });

      for (let i = 0; i <= 4; i++) {
        const value = tick * i;
        const y = yOf(value);
        root.appendChild(svg('line', { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: i === 0 ? 'chart-axis' : 'chart-grid' }));
        root.appendChild(svg('text', { x: margin.left - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-label' }, shortMoney(value)));
      }

      const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(plotW / 64))));
      const marks = [];
      days.forEach((day, i) => {
        const x = margin.left + slot * i + (slot - barW) / 2;
        const revenue = Math.max(0, day.revenueCents);
        const profit = Math.max(0, Math.min(revenue, day.grossCents));
        const baseY = yOf(0);
        const profitH = baseY - yOf(profit);
        const cost = revenue - profit;
        const costH = baseY - yOf(cost);
        const gap = profitH > 2 && costH > 2 ? 2 : 0;
        const group = svg('g', { class: 'chart-bar' });
        if (cost > 0) {
          const y = baseY - profitH - costH;
          group.appendChild(svg('path', { d: topRounded(x, y, barW, Math.max(0, costH - gap), 4), class: 'fill-cost' }));
        }
        if (profit > 0) {
          const d = cost > 0 ? `M${x},${baseY}V${baseY - profitH}H${x + barW}V${baseY}Z` : topRounded(x, baseY - profitH, barW, profitH, 4);
          group.appendChild(svg('path', { d, class: 'fill-profit' }));
        }
        const showTip = () => {
          tooltip.show([
            SR.util.formatKey(day.date),
            `Revenue ${format(day.revenueCents)}`,
            `Gross profit ${format(day.grossCents)} (${SR.money.formatMargin(day.grossCents, day.revenueCents)})`,
            `${day.saleCount} sales, ${day.units} units`,
          ], x + barW / 2, yOf(revenue));
          marks.forEach((m) => m.classList.remove('hot'));
          group.classList.add('hot');
        };
        group.appendChild(svg('rect', { x: margin.left + slot * i, y: margin.top, width: slot, height: plotH, class: 'chart-hit' }));
        group.addEventListener('pointerenter', showTip);
        group.addEventListener('pointerdown', showTip);
        marks.push(group);
        marks[i].showTip = showTip;
        root.appendChild(group);
        if (i % labelEvery === 0) {
          root.appendChild(svg('text', { x: x + barW / 2, y: height - 8, 'text-anchor': 'middle', class: 'chart-label' }, SR.util.formatKeyShort(day.date)));
        }
      });
      stage.appendChild(root);
      enableArrowKeys(stage.parentElement, marks);
    }, 'Revenue by day. Use the left and right arrow keys to read each day.');
  }

  /** Lets keyboard users walk a chart's marks with the arrow keys. */
  function enableArrowKeys(shell, marks) {
    let index = -1;
    shell.tabIndex = 0;
    shell.onkeydown = (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      index = event.key === 'ArrowRight' ? Math.min(marks.length - 1, index + 1) : Math.max(0, index - 1);
      marks[index].showTip();
    };
  }

  /**
   * Ranked horizontal bars. rows: [{ name, value, display, detail: [lines] }].
   * Negative values draw as an empty bar; the number beside it still tells the truth.
   */
  function rankedBars(rows, { label, testId } = {}) {
    const chart = chartShell((stage, width, tooltip) => {
      const rowH = 32;
      const labelW = Math.min(Math.max(120, width * 0.38), 260);
      const valueW = 82;
      const barMax = Math.max(20, width - labelW - valueW - 16);
      const maxValue = Math.max(...rows.map((r) => r.value), 1);
      const height = rows.length * rowH + 4;
      const root = svg('svg', { class: 'chart-svg', width, height, role: 'img', 'aria-label': label });
      const marks = [];
      const charFit = Math.floor((labelW - 8) / 6.6);
      rows.forEach((row, i) => {
        const y = i * rowH + 2;
        const w = Math.max(0, (row.value / maxValue) * barMax);
        const shortName = row.name.length > charFit ? `${row.name.slice(0, charFit - 1)}…` : row.name;
        const group = svg('g', { class: 'chart-bar' });
        group.appendChild(svg('text', { x: 0, y: y + 19, class: 'chart-row-label' }, shortName));
        if (w > 0) group.appendChild(svg('path', { d: rightRounded(labelW, y + 6, Math.max(w, 2), rowH - 14, 4), class: 'fill-profit' }));
        group.appendChild(svg('text', { x: width, y: y + 19, 'text-anchor': 'end', class: 'chart-row-value' }, row.display));
        group.appendChild(svg('rect', { x: 0, y, width, height: rowH, class: 'chart-hit' }));
        const showTip = () => {
          tooltip.show([row.name, ...row.detail], labelW + w / 2, y + 6);
          marks.forEach((m) => m.classList.remove('hot'));
          group.classList.add('hot');
        };
        group.showTip = showTip;
        group.addEventListener('pointerenter', showTip);
        group.addEventListener('pointerdown', showTip);
        marks.push(group);
        root.appendChild(group);
      });
      stage.appendChild(root);
    }, label);
    if (testId) chart.dataset.testid = testId;
    return chart;
  }

  Object.assign(SR.ui, { dailyRevenueChart, rankedBars });
})();
