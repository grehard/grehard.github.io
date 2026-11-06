// Daily and weekly nutrition under the planner: a calorie chart and the full table.
Mise.Views.nutritionPanel = (() => {
  const { h, svg } = Mise.Dom;
  const { FIELDS, MEALS, weekTotals } = Mise.Nutrition;
  const Store = Mise.Store;

  const CHART = { width: 560, height: 230, left: 44, right: 8, top: 22, bottom: 26 };
  const count = (value) => value.toLocaleString('en-US');

  function niceMax(max) {
    const step = max > 3000 ? 1000 : 500;
    return Math.max(step * 2, Math.ceil(max / step) * step);
  }

  function gridLines(top, scaleY) {
    const step = top > 3000 ? 1000 : 500;
    const lines = [];
    for (let value = 0; value <= top; value += step) {
      const y = scaleY(value);
      lines.push(
        svg('line', { class: value ? 'chart-grid' : 'chart-base', x1: CHART.left, x2: CHART.width - CHART.right, y1: y, y2: y }),
        svg('text', { class: 'chart-axis', x: CHART.left - 8, y: y + 4, 'text-anchor': 'end' }, count(value)));
    }
    return lines;
  }

  function barPath(x, y, width, baseline) {
    const radius = Math.min(4, baseline - y);
    return `M${x} ${baseline}V${y + radius}Q${x} ${y} ${x + radius} ${y}H${x + width - radius}Q${x + width} ${y} ${x + width} ${y + radius}V${baseline}Z`;
  }

  function tooltipContent(day) {
    return [
      h('strong', null, `${day.long}: ${count(day.total.calories)} kcal`),
      ...MEALS.map((meal) => h('span', null, `${meal[0].toUpperCase()}${meal.slice(1)} ${count(day.byMeal[meal])}`)),
    ];
  }

  function showTooltip(tooltip, day, xPercent) {
    tooltip.replaceChildren(...tooltipContent(day));
    tooltip.style.left = `${xPercent}%`;
    tooltip.hidden = false;
  }

  function dayBar(day, index, slotWidth, scaleY, tooltip) {
    const baseline = scaleY(0);
    const barWidth = Math.min(34, slotWidth * 0.56);
    const slotX = CHART.left + slotWidth * index;
    const x = slotX + (slotWidth - barWidth) / 2;
    const y = scaleY(day.total.calories);
    const center = slotX + slotWidth / 2;
    const show = () => showTooltip(tooltip, day, (center / CHART.width) * 100);
    const hide = () => { tooltip.hidden = true; };
    return svg('g', { class: 'chart-day' },
      day.total.calories ? svg('path', { class: 'chart-bar', d: barPath(x, y, barWidth, baseline) }) : null,
      day.total.calories ? svg('text', { class: 'chart-value', x: center, y: y - 6, 'text-anchor': 'middle' }, count(day.total.calories)) : null,
      svg('text', { class: 'chart-axis', x: center, y: CHART.height - 8, 'text-anchor': 'middle' }, day.short),
      svg('rect', {
        class: 'chart-hit',
        x: slotX,
        y: CHART.top,
        width: slotWidth,
        height: baseline - CHART.top,
        tabindex: '0',
        role: 'img',
        'aria-label': `${day.long}: ${count(day.total.calories)} calories`,
        onpointerenter: show,
        onpointerleave: hide,
        onfocus: show,
        onblur: hide,
      }));
  }

  function chart(totals) {
    // A narrower drawing on phones keeps the labels at a readable size once it is scaled to fit.
    CHART.width = window.matchMedia('(max-width: 860px)').matches ? 380 : 560;
    const tooltip = h('div', { class: 'chart-tip', hidden: true });
    const top = niceMax(Math.max(...totals.perDay.map((day) => day.total.calories)));
    const baseline = CHART.height - CHART.bottom;
    const scaleY = (value) => baseline - (value / top) * (baseline - CHART.top);
    const slotWidth = (CHART.width - CHART.left - CHART.right) / 7;
    return h('figure', { class: 'chart' },
      h('figcaption', null, 'Calories by day'),
      h('div', { class: 'chart-frame' },
        svg('svg', { viewBox: `0 0 ${CHART.width} ${CHART.height}`, id: 'calorie-chart', role: 'group', 'aria-label': 'Calories planned for each day. The table beside it has the same numbers.' },
          gridLines(top, scaleY),
          totals.perDay.map((day, index) => dayBar(day, index, slotWidth, scaleY, tooltip))),
        tooltip));
  }

  function tableRow(label, values, { className, testId } = {}) {
    return h('tr', { class: className || null, 'data-row': testId || null },
      h('th', { scope: 'row' }, label),
      FIELDS.map(({ key }) => h('td', null, values ? count(values[key]) : '–')));
  }

  function table(totals) {
    return h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Nutrition by day' },
      h('table', { class: 'nutrition-table', id: 'nutrition-table' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Day'),
          FIELDS.map(({ label, unit }) => h('th', { scope: 'col' }, label, h('span', { class: 'th-unit' }, unit))))),
        h('tbody', null, totals.perDay.map((day) => tableRow(`${day.short} ${day.date}`, day.planned ? day.total : null, { testId: day.key }))),
        h('tfoot', null,
          tableRow('Week total', totals.week, { testId: 'week-total' }),
          tableRow('Daily average', totals.average, { testId: 'day-average' }))));
  }

  /** `days` is the week from Mise.Dates.weekDays. */
  function render(days) {
    const totals = weekTotals(Store.state.plan, days, Store.recipesById());
    const body = totals.plannedDays
      ? h('div', { class: 'nutrition-body' }, chart(totals), table(totals))
      : h('p', { class: 'hint' }, 'Plan a meal to see totals for the day and week.');
    return h('section', { class: 'nutrition-panel', id: 'nutrition', 'aria-labelledby': 'nutrition-title' },
      h('div', { class: 'section-head' },
        h('h2', { id: 'nutrition-title' }, 'Nutrition'),
        h('p', { class: 'hint' }, 'Per person: one serving of each planned meal. Averages count days with a meal planned.')),
      body);
  }

  return { render };
})();
