// Renders invoices, quotes and statements as a sheet of paper. The same markup is used for the
// editor preview, the detail page and the printed page.
(function () {
  const BC = window.BC;
  const { h } = BC.dom;
  const { calc, dates, money } = BC;
  const SHEET_WIDTH = 760;
  const COMPACT_BELOW = 440;

  const pct = (bp) => `${money.percentToText(bp)}%`;

  function letterhead(profile, title, number) {
    return h('header', { class: 'sheet-head' },
      h('div', { class: 'sheet-brand' },
        profile.logo && h('img', { class: 'sheet-logo', src: profile.logo, alt: `${profile.name} logo` }),
        h('div', {},
          h('p', { class: 'sheet-business' }, profile.name),
          h('p', { class: 'sheet-address' }, profile.address))),
      h('div', { class: 'sheet-title' },
        h('p', { class: 'sheet-kind' }, title),
        number && h('p', { class: 'sheet-number' }, number)));
  }

  function billTo(label, client) {
    if (!client) return h('div', { class: 'sheet-party' }, h('p', { class: 'sheet-label' }, label), h('p', { class: 'sheet-muted' }, 'No client selected'));
    return h('div', { class: 'sheet-party' },
      h('p', { class: 'sheet-label' }, label),
      h('p', { class: 'sheet-client' }, client.name),
      client.contact && h('p', {}, client.contact),
      client.address && h('p', { class: 'sheet-address' }, client.address),
      client.taxId && h('p', { class: 'sheet-muted' }, `Tax ID ${client.taxId}`));
  }

  function metaRows(rows) {
    return h('dl', { class: 'sheet-meta' }, rows.filter(Boolean).map(([term, value]) => h('div', {}, h('dt', {}, term), h('dd', {}, value))));
  }

  function lineDescription(description) {
    const [first, ...rest] = String(description || '').split('\n');
    return [h('span', { class: 'line-title' }, first), rest.length > 0 && h('span', { class: 'line-detail' }, rest.join('\n'))];
  }

  function lineTable(doc, t, fmt) {
    const rows = doc.lines.map((line, i) => h('tr', {},
      h('td', { class: 'col-desc' }, lineDescription(line.description)),
      h('td', { class: 'col-num col-qty', 'data-label': 'Qty' }, money.qtyToText(line.qtyMilli)),
      h('td', { class: 'col-num col-unit', 'data-label': 'Unit price' }, fmt(line.unitCents)),
      h('td', { class: 'col-num col-tax', 'data-label': 'Tax' }, pct(line.taxBp)),
      h('td', { class: 'col-num col-amount' }, fmt(t.nets[i]))));
    return h('table', { class: 'sheet-lines' },
      h('thead', {}, h('tr', {},
        h('th', { class: 'col-desc', scope: 'col' }, 'Description'),
        h('th', { class: 'col-num col-qty', scope: 'col' }, 'Qty'),
        h('th', { class: 'col-num col-unit', scope: 'col' }, 'Unit price'),
        h('th', { class: 'col-num col-tax', scope: 'col' }, 'Tax'),
        h('th', { class: 'col-num col-amount', scope: 'col' }, 'Amount'))),
      h('tbody', {}, rows));
  }

  function discountLabel(discount) {
    return discount.type === 'percent' ? `Discount (${pct(discount.value)})` : 'Discount';
  }

  function totalsBlock(doc, t, paid, fmt) {
    const isInvoice = doc.kind === 'invoice';
    const row = (label, value, cls, key) => h('div', { class: `sheet-total-row ${cls || ''}`.trim(), 'data-total': key }, h('dt', {}, label), h('dd', {}, value));
    return h('dl', { class: 'sheet-totals' },
      row('Subtotal', fmt(t.subtotal), '', 'subtotal'),
      t.discount > 0 && row(discountLabel(doc.discount), `-${fmt(t.discount)}`, '', 'discount'),
      t.taxes.map((tax) => row(`Tax ${pct(tax.rateBp)} on ${fmt(tax.base)}`, fmt(tax.tax), 'sheet-tax-row', `tax-${money.percentToText(tax.rateBp)}`)),
      row('Total', fmt(t.total), 'sheet-grand', 'total'),
      isInvoice && paid > 0 && row('Paid', `-${fmt(paid)}`, '', 'paid'),
      isInvoice && row('Balance due', fmt(Math.max(0, t.total - paid)), 'sheet-balance', 'balance'));
  }

  function textBlock(label, value) {
    return value && value.trim() ? h('div', { class: 'sheet-note' }, h('p', { class: 'sheet-label' }, label), h('p', { class: 'sheet-pre' }, value)) : null;
  }

  function sheetFooter(profile) {
    const parts = [profile.taxId && `Tax ID ${profile.taxId}`, profile.email, profile.phone].filter(Boolean);
    return parts.length ? h('footer', { class: 'sheet-foot' }, parts.join('  |  ')) : null;
  }

  function termsLabel(doc) {
    if (doc.termsDays === null || doc.termsDays === undefined) return null;
    if (doc.kind === 'quote') return ['Validity', `${doc.termsDays} days`];
    return ['Terms', doc.termsDays === 0 ? 'Due on receipt' : `Net ${doc.termsDays}`];
  }

  function documentSheet(doc, data) {
    const { profile, client } = data;
    const fmt = (cents) => money.format(cents, profile.currency);
    const t = calc.totals(doc);
    const paid = doc.kind === 'invoice' ? calc.paidAmount(doc) : 0;
    const isInvoice = doc.kind === 'invoice';
    return h('article', { class: 'sheet', 'aria-label': `${isInvoice ? 'Invoice' : 'Quote'} ${doc.number}` },
      letterhead(profile, isInvoice ? 'Invoice' : 'Quote', doc.number),
      h('section', { class: 'sheet-parties' },
        billTo(isInvoice ? 'Bill to' : 'Prepared for', client),
        metaRows([
          ['Issue date', dates.format(doc.issueDate)],
          [isInvoice ? 'Due date' : 'Valid until', dates.format(doc.dueDate)],
          termsLabel(doc),
        ])),
      lineTable(doc, t, fmt),
      h('section', { class: 'sheet-summary' },
        h('div', { class: 'sheet-notes' },
          textBlock('Notes', doc.notes),
          isInvoice && textBlock('Payment details', profile.paymentDetails),
          textBlock('Terms', doc.terms)),
        totalsBlock(doc, t, paid, fmt)),
      sheetFooter(profile));
  }

  function statementSheet(client, data, range, profile, aging) {
    const fmt = (cents) => money.format(cents, profile.currency);
    const period = `${range.from ? dates.format(range.from) : 'All activity'} to ${dates.format(range.to)}`;
    return h('article', { class: 'sheet', 'aria-label': `Statement for ${client.name}` },
      letterhead(profile, 'Statement', null),
      h('section', { class: 'sheet-parties' },
        billTo('Account', client),
        metaRows([['Period', period], ['Statement date', dates.format(dates.today())]])),
      h('table', { class: 'sheet-lines sheet-ledger' },
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, 'Date'),
          h('th', { scope: 'col' }, 'Reference'),
          h('th', { scope: 'col', class: 'col-ledger-desc' }, 'Details'),
          h('th', { class: 'col-num', scope: 'col' }, 'Charges'),
          h('th', { class: 'col-num', scope: 'col' }, 'Payments'),
          h('th', { class: 'col-num', scope: 'col' }, 'Balance'))),
        h('tbody', {},
          h('tr', { class: 'sheet-opening' }, h('td', { colspan: 5 }, 'Opening balance'), h('td', { class: 'col-num' }, fmt(data.opening))),
          data.rows.map((row) => h('tr', {},
            h('td', { class: 'nowrap' }, dates.format(row.date)),
            h('td', { class: 'nowrap' }, row.ref),
            h('td', { class: 'col-ledger-desc' }, row.description),
            h('td', { class: 'col-num' }, row.charge ? fmt(row.charge) : ''),
            h('td', { class: 'col-num' }, row.credit ? fmt(row.credit) : ''),
            h('td', { class: 'col-num' }, fmt(row.balance)))))),
      h('section', { class: 'sheet-summary' },
        h('div', { class: 'sheet-notes' }, textBlock('Payment details', profile.paymentDetails)),
        h('dl', { class: 'sheet-totals' },
          h('div', { class: 'sheet-total-row' }, h('dt', {}, 'Opening balance'), h('dd', {}, fmt(data.opening))),
          h('div', { class: 'sheet-total-row' }, h('dt', {}, 'Charges'), h('dd', {}, fmt(data.charges))),
          h('div', { class: 'sheet-total-row' }, h('dt', {}, 'Payments'), h('dd', {}, `-${fmt(data.credits)}`)),
          h('div', { class: 'sheet-total-row sheet-balance', 'data-total': 'closing' }, h('dt', {}, 'Closing balance'), h('dd', {}, fmt(data.closing))))),
      h('section', { class: 'sheet-aging' },
        h('p', { class: 'sheet-label' }, 'Unpaid today, by days past due'),
        h('dl', {}, aging.map((bucket) => h('div', {}, h('dt', {}, bucket.label), h('dd', {}, fmt(bucket.amount)))))),
      sheetFooter(profile));
  }

  // Wraps a sheet in a frame that scales it to fit like a page, or lets it reflow on a narrow screen.
  function frame(sheet) {
    const box = h('div', { class: 'sheet-frame' }, sheet);
    const fit = () => {
      const width = box.clientWidth;
      const current = box.firstElementChild;
      if (!width || !current) return;
      const compact = width < COMPACT_BELOW;
      box.classList.toggle('is-compact', compact);
      if (compact) {
        current.style.transform = '';
        box.style.height = '';
      } else {
        const scale = Math.min(1, width / SHEET_WIDTH);
        current.style.transform = `scale(${scale})`;
        box.style.height = `${Math.ceil(current.offsetHeight * scale)}px`;
      }
    };
    let lastWidth = 0;
    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        if (box.clientWidth === lastWidth) return; // height changes come from fit itself
        lastWidth = box.clientWidth;
        requestAnimationFrame(fit);
      }).observe(box);
    }
    box.fit = fit;
    box.update = (next) => { box.replaceChildren(next); fit(); };
    requestAnimationFrame(fit);
    return box;
  }

  function applyPageSize(size) {
    const style = document.getElementById('page-size');
    if (style) style.textContent = `@page { size: ${size === 'Letter' ? 'letter' : 'A4'}; margin: 14mm; }`;
  }

  BC.paper = { documentSheet, statementSheet, frame, applyPageSize };
})();
