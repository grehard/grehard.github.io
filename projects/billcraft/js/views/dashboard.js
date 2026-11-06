// Dashboard: headline balances, aged receivables, cash received and invoices needing attention.
(function () {
  const BC = window.BC;
  const { h, s, icon } = BC.dom;
  const { calc, dates, store, ui } = BC;
  const { money } = ui;

  const AGE_SHADES = ['age-0', 'age-1', 'age-2', 'age-3', 'age-4'];

  function tile(label, value, detail, href, tone) {
    return h('a', { class: `tile${tone ? ' tile-' + tone : ''}`, href, 'data-tile': label },
      h('span', { class: 'tile-label' }, label),
      h('span', { class: 'tile-value' }, value),
      h('span', { class: 'tile-detail' }, detail));
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function agedChart(buckets) {
    const max = Math.max(1, ...buckets.map((b) => b.amount));
    return h('div', { class: 'aged', role: 'list', 'aria-label': 'Unpaid balance by days past due' }, buckets.map((bucket, i) => {
      const width = (bucket.amount / max) * 100;
      return h('a', { class: 'aged-row', role: 'listitem', href: i === 0 ? '#/invoices?status=open' : '#/invoices?status=overdue', 'data-bucket': bucket.key, title: `${bucket.label}: ${money(bucket.amount)} across ${plural(bucket.count, 'invoice')}` },
        h('span', { class: 'aged-label' }, bucket.label),
        s('svg', { class: 'aged-bar', height: 14, width: '100%', 'aria-hidden': 'true' },
          bucket.amount > 0 && s('rect', { class: AGE_SHADES[i], x: 0, y: 0, width: `${Math.max(width, 0.6)}%`, height: 14, rx: 3 })),
        h('span', { class: 'aged-count' }, bucket.count ? String(bucket.count) : ''),
        h('span', { class: 'aged-amount' }, money(bucket.amount)));
    }));
  }

  function clientAging(today) {
    const rows = store.state.clients.map((client) => {
      const buckets = calc.agedReceivables(store.docsForClient('invoice', client.id), today);
      return { client, buckets, total: buckets.reduce((sum, b) => sum + b.amount, 0) };
    }).filter((row) => row.total > 0).sort((a, b) => b.total - a.total);
    if (!rows.length) return ui.emptyState('Nothing unpaid', 'Every sent invoice has been paid in full.');
    const headings = ['Not yet due', '1 to 30', '31 to 60', '61 to 90', 'Over 90'];
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table table-compact' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Client'),
        headings.map((label) => h('th', { class: 'num', scope: 'col' }, label)),
        h('th', { class: 'num', scope: 'col' }, 'Total'))),
      h('tbody', {}, rows.map((row) => h('tr', {},
        h('td', {}, h('a', { href: `#/clients/${row.client.id}` }, row.client.name)),
        row.buckets.map((b) => h('td', { class: `num${b.amount ? '' : ' muted'}` }, b.amount ? money(b.amount) : '-')),
        h('td', { class: 'num strong' }, money(row.total)))))));
  }

  // Column chart with one bar per month. Hover or focus shows the exact amount in a tooltip.
  function paidChart(months) {
    const max = Math.max(1, ...months.map((m) => m.amount));
    const chartHeight = 112;
    const tip = h('div', { class: 'chart-tip', hidden: true });
    const box = h('div', { class: 'paid-chart' });
    const show = (month, x) => {
      tip.textContent = `${dates.monthLabel(month.key)} ${month.key.slice(0, 4)}: ${money(month.amount)}`;
      tip.hidden = false;
      tip.style.left = `${x}%`;
    };
    const hide = () => { tip.hidden = true; };
    const step = 100 / months.length;
    const svg = s('svg', { width: '100%', height: chartHeight + 22, role: 'img', 'aria-label': `Payments received: ${months.map((m) => `${dates.monthLabel(m.key)} ${money(m.amount)}`).join(', ')}` },
      s('line', { x1: '0', x2: '100%', y1: chartHeight, y2: chartHeight, class: 'chart-axis' }),
      months.map((month, i) => {
        const height = Math.round((month.amount / max) * (chartHeight - 8));
        const center = step * i + step / 2;
        return s('g', {},
          month.amount > 0 && s('rect', { class: 'chart-bar', x: `${center - step * 0.28}%`, y: chartHeight - height, width: `${step * 0.56}%`, height: Math.max(height, 2), rx: 3 }),
          s('text', { class: 'chart-label', x: `${center}%`, y: chartHeight + 16, 'text-anchor': 'middle' }, dates.monthLabel(month.key)),
          s('rect', {
            x: `${step * i}%`, y: 0, width: `${step}%`, height: chartHeight + 22, fill: 'transparent', tabindex: 0,
            'aria-label': `${dates.monthLabel(month.key)}: ${money(month.amount)}`,
            onmouseenter: () => show(month, center), onmouseleave: hide, onfocus: () => show(month, center), onblur: hide,
          }));
      }));
    box.append(svg, tip);
    return box;
  }

  function attentionList(today) {
    const rows = store.state.invoices
      .map((invoice) => ({ invoice, info: calc.summarize(invoice, today) }))
      .filter((row) => row.info.status === 'overdue')
      .sort((a, b) => b.info.daysLate - a.info.daysLate);
    if (!rows.length) return ui.emptyState('No overdue invoices', 'Anything past its due date shows up here.');
    return h('ul', { class: 'attention' }, rows.slice(0, 5).map(({ invoice, info }) => h('li', {},
      h('a', { href: `#/invoices/${invoice.id}` },
        h('span', { class: 'attention-main' }, h('strong', {}, invoice.number), ' ', store.clientName(invoice.clientId)),
        h('span', { class: 'attention-side' },
          h('span', { class: 'attention-amount' }, money(info.balance)),
          h('span', { class: 'attention-days' }, `${plural(info.daysLate, 'day')} late`))))));
  }

  function panel(title, content, action) {
    return h('section', { class: 'panel' }, h('header', { class: 'panel-head' }, h('h2', {}, title), action), content);
  }

  BC.views.dashboard = function dashboardView() {
    const today = dates.today();
    const invoices = store.state.invoices;
    const stats = calc.dashboard(invoices, today);
    const openQuotes = store.state.quotes.filter((q) => ['sent', 'accepted'].includes(calc.quoteStatus(q, today)));
    const quoteValue = openQuotes.reduce((sum, q) => sum + calc.totals(q).total, 0);
    return h('div', { class: 'page' },
      ui.pageHeader('Dashboard', dates.format(today), [ui.linkButton('New invoice', 'plus', '#/invoices/new', 'btn-primary')]),
      h('div', { class: 'tiles' },
        tile('Outstanding', money(stats.outstanding), plural(stats.outstandingCount, 'unpaid invoice'), '#/invoices?status=open'),
        tile('Overdue', money(stats.overdue), plural(stats.overdueCount, 'invoice') + ' past due', '#/invoices?status=overdue', stats.overdue ? 'danger' : null),
        tile('Paid this month', money(stats.paidThisMonth), plural(stats.paidThisMonthCount, 'payment'), '#/invoices?status=paid'),
        tile('Open quotes', money(quoteValue), plural(openQuotes.length, 'quote') + ' sent or accepted', '#/quotes')),
      h('div', { class: 'dash-grid' },
        h('div', { class: 'dash-main' },
          panel('Aged receivables', agedChart(calc.agedReceivables(invoices, today)), h('span', { class: 'panel-note' }, 'Days past due date')),
          panel('By client', clientAging(today))),
        h('div', { class: 'dash-side' },
          panel('Overdue, oldest first', attentionList(today), h('a', { class: 'panel-link', href: '#/invoices?status=overdue' }, 'View all', icon('arrow', 13))),
          panel('Payments received', paidChart(calc.paidByMonth(invoices, today, 6))))));
  };
})();
