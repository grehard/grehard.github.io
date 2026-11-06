// First-run demo data for a small design studio. All dates are computed relative to today.
(function () {
  const { addDays, today } = window.BC.dates;
  const { formatNumber } = window.BC.calc;

  const LOGO = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#0f5e5b"/>'
    + '<path d="M20 14v36h24" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="square"/>'
    + '<circle cx="42" cy="22" r="6" fill="#fff"/></svg>'
  );

  const PROFILE = {
    name: 'Larkfield Studio',
    address: '14 Ashton Yard\nBristol BS3 1TF\nUnited Kingdom',
    taxId: 'GB 284 6193 07',
    email: 'accounts@larkfield.example',
    phone: '0117 496 0182',
    paymentDetails: 'Larkfield Studio Ltd\nSort code 20-45-17, account 40918263',
    logo: LOGO,
    terms: 'Payment by bank transfer, quoting the invoice number. Late balances may incur interest at 4% above base rate.',
    currency: 'GBP',
    paymentDays: 30,
    paperSize: 'A4',
    invoicePrefix: 'INV-',
    quotePrefix: 'QUO-',
    nextInvoice: 59,
    nextQuote: 24,
  };

  const CLIENTS = [
    { id: 'c-alder', name: 'Alder & Finch Bakery', contact: 'Rosalind Pym', email: 'rosalind@alderfinch.example', address: '3 Mill Lane\nFrome BA11 1EB', taxId: '', paymentDays: 14, notes: 'Prefers invoices at month end.' },
    { id: 'c-north', name: 'Northgate Cycle Co-op', contact: 'Tomasz Bielak', email: 'tomasz@northgatecycles.example', address: 'Unit 7, Northgate Works\nGloucester GL1 2QP', taxId: 'GB 771 2043 18', paymentDays: 30, notes: '' },
    { id: 'c-marlowe', name: 'Marlowe Street Dental', contact: 'Dr Ife Adeyemi', email: 'practice@marlowedental.example', address: '48 Marlowe Street\nBath BA1 2LY', taxId: '', paymentDays: 30, notes: 'Send to the practice manager, copy Dr Adeyemi.' },
    { id: 'c-quay', name: 'Quayside Ceramics', contact: 'Hanne Lindqvist', email: 'hanne@quaysideceramics.example', address: 'The Old Chandlery\nWatchet TA23 0AQ', taxId: 'GB 509 3381 62', paymentDays: 14, notes: '' },
    { id: 'c-tallis', name: 'Tallis Architects LLP', contact: 'Owen Marchetti', email: 'accounts@tallisarchitects.example', address: 'Second Floor, 9 Corn Street\nBristol BS1 1HT', taxId: 'GB 318 7720 45', paymentDays: 30, notes: 'Purchase order number needed on every invoice.' },
    { id: 'c-bright', name: 'Brightwater Community Trust', contact: 'Maeve Corrigan', email: 'maeve@brightwatertrust.example', address: 'Riverside Hall\nStroud GL5 3AB', taxId: '', paymentDays: 45, notes: 'Grant funded. Pays in stages.' },
    { id: 'c-oak', name: 'Oakhollow Cider', contact: 'Jem Tregenza', email: 'jem@oakhollowcider.example', address: 'Hollow Farm\nWedmore BS28 4UD', taxId: 'GB 642 1195 30', paymentDays: 30, notes: '' },
  ];

  const ITEMS = [
    { id: 'i-identity', name: 'Brand identity system', description: 'Logo suite, type and colour, usage guide', unitCents: 480000, taxBp: 2000 },
    { id: 'i-template', name: 'Website page template', description: 'Design and responsive build, per template', unitCents: 65000, taxBp: 2000 },
    { id: 'i-dev', name: 'Front-end development', description: 'Per day', unitCents: 52000, taxBp: 2000 },
    { id: 'i-consult', name: 'Design consultancy', description: 'Per hour', unitCents: 9500, taxBp: 2000 },
    { id: 'i-copy', name: 'Copywriting', description: 'Per 500 words, two rounds of edits', unitCents: 12000, taxBp: 2000 },
    { id: 'i-hosting', name: 'Hosting and maintenance', description: 'Monthly, includes security updates', unitCents: 8500, taxBp: 2000 },
    { id: 'i-photo', name: 'Stock photo licence', description: 'Single image, extended licence', unitCents: 4800, taxBp: 2000 },
    { id: 'i-print', name: 'Printed brochures', description: 'Per 100 copies, zero rated', unitCents: 28500, taxBp: 0 },
    { id: 'i-travel', name: 'Rail and mileage', description: 'Disbursement at cost', unitCents: 6240, taxBp: 0 },
  ];

  const line = (description, qty, unitCents, taxBp) => ({ id: '', description, qtyMilli: Math.round(qty * 1000), unitCents, taxBp });
  const DISCOUNT_NONE = { type: 'none', value: 0 };
  const pct = (bp) => ({ type: 'percent', value: bp });
  const fixed = (cents) => ({ type: 'fixed', value: cents });

  // Each entry: client, days ago issued, payment days, lines, then optional state.
  // [days ago paid, amount in cents, method]; a null amount means the remaining balance.
  const INVOICES = [
    ['c-tallis', 150, 30, [line('Practice brochure design\n24 pages, two rounds of amends', 1, 340000, 2000), line('Printed brochures\n500 copies, zero rated', 5, 28500, 0)], { paid: [[112, 150000, 'Bank transfer']] }],
    ['c-alder', 140, 14, [line('Seasonal menu redesign\nThree menus, print ready', 1, 72000, 2000)], { paid: [[129, null, 'Bank transfer']] }],
    ['c-north', 125, 30, [line('Front-end development\nBooking calendar', 6, 52000, 2000), line('Design consultancy', 4, 9500, 2000)], { paid: [[95, null, 'Bank transfer']] }],
    ['c-marlowe', 100, 30, [line('Patient leaflet set\nFive leaflets, accessible format', 5, 18500, 2000), line('Copywriting', 3, 12000, 2000)], {}],
    ['c-bright', 95, 45, [line('Annual report design\n40 pages with charts', 1, 420000, 2000), line('Printed brochures', 3, 28500, 0)], { discount: pct(1000), notes: 'Charity rate of 10% applied.', paid: [[70, 200000, 'Bank transfer'], [46, null, 'Bank transfer']] }],
    ['c-quay', 80, 30, [line('Online shop templates\nProduct, collection and basket', 3, 65000, 2000), line('Product photography licence', 12, 4800, 2000)], { paid: [[42, 80000, 'Card']] }],
    ['c-oak', 70, 14, [line('Label design\nDry, medium and perry', 3, 38000, 2000)], { paid: [[58, null, 'Bank transfer']] }],
    ['c-tallis', 60, 30, [line('Competition boards\nFour A1 boards', 4, 34500, 2000), line('Rail and mileage', 1, 6240, 0)], { paid: [[28, null, 'Bank transfer']] }],
    ['c-alder', 45, 30, [line('Website page template\nOrder ahead page', 2, 65000, 2000), line('Stock photo licence', 3, 4800, 2000)], {}],
    ['c-north', 40, 30, [line('Member newsletter templates', 2, 42000, 2000), line('Design consultancy', 2.5, 9500, 2000)], { paid: [[12, null, 'Card']] }],
    ['c-bright', 30, 45, [line('Volunteer handbook design\n60 pages', 1, 310000, 2000), line('Printed brochures', 2, 28500, 0)], { discount: pct(1000), notes: 'Charity rate of 10% applied. Second stage due on delivery.', paid: [[20, 120000, 'Bank transfer']] }],
    ['c-marlowe', 21, 30, [line('Website refresh\nFour templates and content migration', 4, 65000, 2000), line('Hosting and maintenance\nFirst 12 months', 12, 8500, 2000)], { discount: fixed(25000), notes: 'Includes the agreed goodwill reduction of 250.00.' }],
    ['c-quay', 14, 14, [line('Christmas catalogue layout', 1, 96000, 2000)], {}],
    ['c-oak', 10, 30, [line('Tasting room signage\nExterior and interior set', 1, 145000, 2000)], { paid: [[0, null, 'Bank transfer']] }],
    ['c-tallis', 6, 30, [line('Studio website\nDesign and build, stage one', 1, 520000, 2000), line('Copywriting', 6, 12000, 2000)], { fromQuote: 'q-tallis' }],
    ['c-alder', 3, 14, [line('Design consultancy\nShopfront sign review', 3, 9500, 2000)], { paid: [[1, null, 'Card']] }],
    ['c-north', 1, 30, [line('Spring campaign posters\nThree designs, A2', 3, 27500, 2000)], { draft: true }],
    ['c-bright', 0, 45, [line('Grant report summary\nEight pages', 1, 88000, 2000)], { draft: true, discount: pct(1000) }],
  ];

  // Client, days ago, valid days, status, lines, optional fields.
  const QUOTES = [
    ['c-quay', 60, 30, 'declined', [line('Trade catalogue\n48 pages', 1, 280000, 2000)], {}],
    ['c-north', 50, 30, 'sent', [line('Shop signage set', 1, 165000, 2000)], {}],
    ['c-tallis', 28, 30, 'converted', [line('Studio website\nDesign and build, stage one', 1, 520000, 2000), line('Copywriting', 6, 12000, 2000)], { id: 'q-tallis' }],
    ['c-marlowe', 12, 60, 'accepted', [line('Recruitment microsite', 3, 65000, 2000), line('Copywriting', 4, 12000, 2000)], { notes: 'Accepted by phone, start date to be agreed.' }],
    ['c-oak', 5, 30, 'sent', [line('Festival stand graphics\nBanner, bar front and price boards', 1, 112000, 2000), line('Rail and mileage', 2, 6240, 0)], {}],
    ['c-alder', 0, 30, 'draft', [line('Loyalty card and window vinyls', 1, 48000, 2000)], {}],
  ];

  function withLineIds(lines, prefix) {
    return lines.map((l, i) => ({ ...l, id: `${prefix}-l${i}` }));
  }

  function buildInvoices(now, calc, quoteIdFor) {
    const firstSeq = PROFILE.nextInvoice - INVOICES.length;
    return INVOICES.map(([clientId, ago, days, lines, opts], index) => {
      const seq = firstSeq + index;
      const id = `inv-${seq}`;
      const issueDate = addDays(now, -ago);
      const doc = {
        id, kind: 'invoice', seq, number: formatNumber(PROFILE.invoicePrefix, seq), clientId, issueDate,
        termsDays: days, dueDate: addDays(issueDate, days), lines: withLineIds(lines, id),
        discount: opts.discount || DISCOUNT_NONE, notes: opts.notes || '', terms: PROFILE.terms,
        status: opts.draft ? 'draft' : 'sent', payments: [], quoteId: quoteIdFor(opts.fromQuote),
      };
      let remaining = calc.totals(doc).total;
      (opts.paid || []).forEach(([paidAgo, amount, method], p) => {
        const amountCents = amount === null ? remaining : amount;
        remaining -= amountCents;
        doc.payments.push({ id: `${id}-p${p}`, date: addDays(now, -paidAgo), amountCents, method, note: '' });
      });
      return doc;
    });
  }

  function buildQuotes(now, invoices) {
    const firstSeq = PROFILE.nextQuote - QUOTES.length;
    return QUOTES.map(([clientId, ago, days, status, lines, opts], index) => {
      const seq = firstSeq + index;
      const id = opts.id || `quo-${seq}`;
      const issueDate = addDays(now, -ago);
      const invoice = invoices.find((inv) => inv.quoteId === id);
      return {
        id, kind: 'quote', seq, number: formatNumber(PROFILE.quotePrefix, seq), clientId, issueDate,
        termsDays: days, dueDate: addDays(issueDate, days), lines: withLineIds(lines, id),
        discount: DISCOUNT_NONE, notes: opts.notes || '', terms: 'Prices are valid until the date shown. A 30% deposit confirms the booking.',
        status, payments: [], invoiceId: invoice ? invoice.id : null,
      };
    });
  }

  function createSeed() {
    const now = today();
    const invoices = buildInvoices(now, window.BC.calc, (id) => id || null);
    const quotes = buildQuotes(now, invoices);
    return {
      profile: { ...PROFILE },
      clients: CLIENTS.map((c) => ({ ...c })),
      items: ITEMS.map((i) => ({ ...i })),
      invoices,
      quotes,
    };
  }

  window.BC.seed = { createSeed };
})();
