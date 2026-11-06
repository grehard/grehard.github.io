// Sales reports for any date range: headline numbers, three hand-built charts and the tables
// behind them.
SR.views.reports = (function () {
  const { h, btn, clear, field, input, pageHeader, dataTable, emptyState, statTile, segmented, dailyRevenueChart, rankedBars } = SR.ui;
  const { format, formatMargin, mulDiv } = SR.money;
  const { dateKey, addDays, formatInt, formatKey } = SR.util;

  const MAX_RANGE_DAYS = 366;
  const view = { preset: 30, from: '', to: '', metric: 'revenue', sort: { key: 'revenueCents', dir: 'desc' } };
  let content = null;
  let controls = null;
  const state = () => SR.store.state;

  function range() {
    const today = dateKey(Date.now());
    if (view.preset) return { from: addDays(today, -(view.preset - 1)), to: today };
    return { from: view.from, to: view.to };
  }

  function paintControls() {
    clear(controls);
    const { from, to } = range();
    const fromInput = input({ type: 'date', value: from, max: to, onChange: (e) => setCustom(e.target.value, to) });
    const toInput = input({ type: 'date', value: to, onChange: (e) => setCustom(from, e.target.value) });
    controls.append(
      h('div', { class: 'preset-row', role: 'group', 'aria-label': 'Report period' }, [7, 30, 60].map((days) => h('button', {
        type: 'button', class: `chip${view.preset === days ? ' on' : ''}`, 'aria-pressed': String(view.preset === days),
        onClick: () => { view.preset = days; refresh(); },
      }, `${days} days`))),
      field('From', fromInput), field('To', toInput));
  }

  function setCustom(from, to) {
    if (!SR.util.isDateKey(from) || !SR.util.isDateKey(to)) return;
    const today = dateKey(Date.now());
    const end = (from <= to ? to : from) > today ? today : (from <= to ? to : from);
    const start = from <= to ? from : to;
    // A year is the longest range a daily chart can still show, so older starts are pulled in.
    const earliest = addDays(end, -(MAX_RANGE_DAYS - 1));
    view.preset = 0;
    view.from = start > end ? end : (start < earliest ? earliest : start);
    view.to = end;
    refresh();
  }

  function kpis(report) {
    const { totals } = report;
    const avg = totals.saleCount ? mulDiv(totals.revenueCents + totals.taxCents, 1, totals.saleCount) : 0;
    return h('div', { class: 'stats', dataset: { testid: 'report-kpis' } },
      statTile('Revenue', format(totals.revenueCents), 'after discounts and refunds, before tax'),
      statTile('Gross profit', format(totals.grossCents), `cost of goods ${format(totals.cogsCents)}`),
      statTile('Gross margin', formatMargin(totals.grossCents, totals.revenueCents), 'gross profit as a share of revenue'),
      statTile('Sales', formatInt(totals.saleCount), `${formatInt(totals.units)} units net, ${format(avg)} average sale`),
      statTile('Refunded', format(totals.refundCents), 'including tax'));
  }

  const legendItem = (cls, label) => h('span', { class: 'legend-item' }, h('span', { class: `legend-swatch ${cls}`, 'aria-hidden': 'true' }), label);

  function panel(title, subtitle, body, extra) {
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null), extra || null),
      body);
  }

  const detailLines = (row) => [
    `Revenue ${format(row.revenueCents)}`,
    `Gross profit ${format(row.grossCents)} (${formatMargin(row.grossCents, row.revenueCents)})`,
    `${formatInt(row.units)} units`,
  ];

  function categoryChart(report) {
    const rows = report.categories.map((c) => ({
      name: c.name,
      value: c.revenueCents,
      display: formatMargin(c.grossCents, c.revenueCents),
      detail: detailLines(c),
    }));
    return panel('Revenue by category', 'Bars show revenue. The number is gross margin.',
      rows.length ? rankedBars(rows, { label: 'Revenue by category', testId: 'category-chart' }) : emptyState('No sales in this period'));
  }

  function topSellerChart(report) {
    const metrics = {
      revenue: { key: 'revenueCents', show: format },
      units: { key: 'units', show: formatInt },
      gross: { key: 'grossCents', show: format },
    };
    const metric = metrics[view.metric];
    const rows = [...report.products].sort((a, b) => b[metric.key] - a[metric.key]).slice(0, 10).map((p) => ({
      name: p.name,
      value: p[metric.key],
      display: metric.show(p[metric.key]),
      detail: detailLines(p),
    }));
    const switcher = segmented('Rank top sellers by', [{ value: 'revenue', label: 'Revenue' }, { value: 'units', label: 'Units' }, { value: 'gross', label: 'Profit' }], view.metric, (value) => {
      view.metric = value;
      refresh();
    });
    return panel('Top sellers', 'The ten best products in this period.',
      rows.length ? rankedBars(rows, { label: 'Top selling products', testId: 'top-chart' }) : emptyState('No sales in this period'), switcher);
  }

  function setSort(key) {
    view.sort = view.sort.key === key ? { key, dir: view.sort.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' };
    refresh();
  }

  function sorted(rows) {
    const { key, dir } = view.sort;
    const factor = dir === 'asc' ? 1 : -1;
    const value = (row) => (key === 'margin' ? SR.money.marginBp(row.grossCents, row.revenueCents) || 0 : row[key]);
    return [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * factor;
    });
  }

  function productTable(report) {
    return panel('By product', 'Click a heading to sort.', dataTable({
      caption: 'Sales by product',
      testId: 'product-report',
      rows: sorted(report.products),
      pageSize: 15,
      sort: view.sort,
      onSort: setSort,
      empty: emptyState('No sales in this period'),
      columns: [
        { label: 'Product', sortKey: 'name', render: (r) => r.name },
        { label: 'Category', sortKey: 'category', render: (r) => r.category },
        { label: 'Units', align: 'right', sortKey: 'units', render: (r) => formatInt(r.units) },
        { label: 'Revenue', align: 'right', sortKey: 'revenueCents', render: (r) => format(r.revenueCents) },
        { label: 'Cost of goods', align: 'right', sortKey: 'cogsCents', render: (r) => format(r.cogsCents) },
        { label: 'Gross profit', align: 'right', sortKey: 'grossCents', render: (r) => format(r.grossCents) },
        { label: 'Margin', align: 'right', sortKey: 'margin', render: (r) => formatMargin(r.grossCents, r.revenueCents) },
      ],
    }));
  }

  function categoryTable(report) {
    return panel('By category', null, dataTable({
      caption: 'Sales by category',
      testId: 'category-report',
      rows: report.categories,
      empty: emptyState('No sales in this period'),
      columns: [
        { label: 'Category', render: (r) => r.name },
        { label: 'Units', align: 'right', render: (r) => formatInt(r.units) },
        { label: 'Revenue', align: 'right', render: (r) => format(r.revenueCents) },
        { label: 'Gross profit', align: 'right', render: (r) => format(r.grossCents) },
        { label: 'Margin', align: 'right', render: (r) => formatMargin(r.grossCents, r.revenueCents) },
      ],
    }));
  }

  function dayTable(report) {
    return panel('By day', null, dataTable({
      caption: 'Sales by day',
      testId: 'day-report',
      rows: [...report.days].reverse(),
      pageSize: 14,
      columns: [
        { label: 'Date', render: (r) => formatKey(r.date) },
        { label: 'Sales', align: 'right', render: (r) => r.saleCount },
        { label: 'Units', align: 'right', render: (r) => formatInt(r.units) },
        { label: 'Revenue', align: 'right', render: (r) => format(r.revenueCents) },
        { label: 'Gross profit', align: 'right', render: (r) => format(r.grossCents) },
        { label: 'Margin', align: 'right', render: (r) => formatMargin(r.grossCents, r.revenueCents) },
        { label: 'Refunds', align: 'right', render: (r) => (r.refundCents ? format(r.refundCents) : '') },
      ],
    }));
  }

  function refresh() {
    if (!content) return;
    paintControls();
    clear(content);
    const { from, to } = range();
    const report = SR.reports.build(state(), from, to);
    content.append(
      kpis(report),
      panel('Revenue by day', `${formatKey(from)} to ${formatKey(to)}`, dailyRevenueChart(report.days),
        h('div', { class: 'legend' }, legendItem('fill-profit', 'Gross profit'), legendItem('fill-cost', 'Cost of goods'))),
      h('div', { class: 'panel-pair' }, categoryChart(report), topSellerChart(report)),
      productTable(report),
      h('div', { class: 'panel-pair' }, categoryTable(report), dayTable(report)));
  }

  function mount(root) {
    controls = h('div', { class: 'toolbar report-controls' });
    content = h('div', { class: 'report' });
    root.append(
      pageHeader('Reports', 'Revenue is after discounts and refunds, before tax. Refunds count on the day they happen.',
        btn('Export sales CSV', { iconName: 'download', onClick: () => SR.ui.download('stockroom-sales.csv', SR.csv.sales(state()), 'text/csv') })),
      controls, content);
    refresh();
  }

  return { mount, unmount: () => { content = null; }, refresh };
})();
