// Validates stored or imported data. Every record is rebuilt field by field, so nothing unexpected
// reaches the app. Problems are collected as readable issues: loading keeps what survives, import refuses.
(function () {
  const { isValid } = window.BC.dates;
  const money = window.BC.money;
  const calc = window.BC.calc;
  const DOC_STATUS = { invoice: ['draft', 'sent'], quote: ['draft', 'sent', 'accepted', 'declined', 'converted'] };
  const DISCOUNT_TYPES = ['none', 'percent', 'fixed'];
  const MAX_TEXT = 4000;
  const MAX_LOGO_CHARS = 1500000;

  const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const text = (v, fallback) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : fallback || '');
  const isInt = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
  const intOr = (v, min, max, fallback) => (isInt(v, min, max) ? v : fallback);

  function cleanProfile(raw, defaults, issues) {
    if (!isObject(raw)) { issues.push('Business profile is missing.'); return { ...defaults }; }
    const logo = typeof raw.logo === 'string' ? raw.logo : '';
    const logoOk = logo === '' || (/^data:image\//.test(logo) && logo.length <= MAX_LOGO_CHARS);
    if (!logoOk) issues.push('Business logo must be an image stored as a data URL.');
    if (raw.currency !== undefined && !money.CURRENCIES.includes(raw.currency)) issues.push(`Currency "${String(raw.currency).slice(0, 12)}" is not supported.`);
    return {
      name: text(raw.name, defaults.name),
      address: text(raw.address),
      taxId: text(raw.taxId),
      email: text(raw.email),
      phone: text(raw.phone),
      paymentDetails: text(raw.paymentDetails),
      logo: logoOk ? logo : '',
      terms: text(raw.terms),
      currency: money.CURRENCIES.includes(raw.currency) ? raw.currency : defaults.currency,
      paymentDays: intOr(raw.paymentDays, 0, 365, defaults.paymentDays),
      paperSize: raw.paperSize === 'Letter' ? 'Letter' : 'A4',
      invoicePrefix: text(raw.invoicePrefix, defaults.invoicePrefix).slice(0, 12),
      quotePrefix: text(raw.quotePrefix, defaults.quotePrefix).slice(0, 12),
      nextInvoice: intOr(raw.nextInvoice, 1, 99999999, 1),
      nextQuote: intOr(raw.nextQuote, 1, 99999999, 1),
    };
  }

  function cleanClient(raw, label, issues) {
    if (!isObject(raw) || typeof raw.id !== 'string' || !text(raw.name).trim()) {
      issues.push(`${label} needs an id and a name.`);
      return null;
    }
    return {
      id: raw.id,
      name: text(raw.name),
      contact: text(raw.contact),
      email: text(raw.email),
      address: text(raw.address),
      taxId: text(raw.taxId),
      paymentDays: intOr(raw.paymentDays, 0, 365, 30),
      notes: text(raw.notes),
    };
  }

  function cleanItem(raw, label, issues) {
    if (!isObject(raw) || typeof raw.id !== 'string' || !text(raw.name).trim()) {
      issues.push(`${label} needs an id and a name.`);
      return null;
    }
    if (!isInt(raw.unitCents, 0, money.MAX_UNIT_CENTS) || !isInt(raw.taxBp, 0, 10000)) {
      issues.push(`${label} has an invalid price or tax rate.`);
      return null;
    }
    return { id: raw.id, name: text(raw.name), description: text(raw.description), unitCents: raw.unitCents, taxBp: raw.taxBp };
  }

  function cleanLine(raw, label, issues) {
    const ok = isObject(raw) && isInt(raw.qtyMilli, 0, money.MAX_QTY_MILLI)
      && isInt(raw.unitCents, 0, money.MAX_UNIT_CENTS) && isInt(raw.taxBp, 0, 10000);
    if (!ok) { issues.push(`${label} has an invalid quantity, price or tax rate.`); return null; }
    return { id: text(raw.id) || window.BC.dom.uid('l'), description: text(raw.description), qtyMilli: raw.qtyMilli, unitCents: raw.unitCents, taxBp: raw.taxBp };
  }

  function cleanPayment(raw, label, issues) {
    if (!isObject(raw) || !isValid(raw.date) || !isInt(raw.amountCents, 1, money.MAX_TOTAL_CENTS)) {
      issues.push(`${label} needs a valid date and a positive amount.`);
      return null;
    }
    return { id: text(raw.id) || window.BC.dom.uid('p'), date: raw.date, amountCents: raw.amountCents, method: text(raw.method), note: text(raw.note) };
  }

  function cleanDiscount(raw, label, issues) {
    if (raw === undefined || raw === null) return { type: 'none', value: 0 };
    const typeOk = isObject(raw) && DISCOUNT_TYPES.includes(raw.type);
    const max = typeOk && raw.type === 'percent' ? 10000 : money.MAX_TOTAL_CENTS;
    if (!typeOk || !isInt(raw.value, 0, max)) {
      issues.push(`${label} has an invalid discount.`);
      return { type: 'none', value: 0 };
    }
    return { type: raw.type, value: raw.value };
  }

  function cleanDoc(raw, kind, label, issues) {
    if (!isObject(raw) || typeof raw.id !== 'string' || !isInt(raw.seq, 1, 99999999)) {
      issues.push(`${label} needs an id and a sequence number.`);
      return null;
    }
    const name = `${label} (${text(raw.number) || raw.seq})`;
    if (!isValid(raw.issueDate) || !isValid(raw.dueDate)) { issues.push(`${name} has an invalid date.`); return null; }
    if (!DOC_STATUS[kind].includes(raw.status)) { issues.push(`${name} has an unknown status.`); return null; }
    if (!Array.isArray(raw.lines)) { issues.push(`${name} has no line items.`); return null; }
    const lines = raw.lines.map((l, i) => cleanLine(l, `${name} line ${i + 1}`, issues)).filter(Boolean);
    const payments = kind === 'invoice' && Array.isArray(raw.payments)
      ? raw.payments.map((p, i) => cleanPayment(p, `${name} payment ${i + 1}`, issues)).filter(Boolean)
      : [];
    const doc = {
      id: raw.id,
      kind,
      seq: raw.seq,
      number: text(raw.number) || String(raw.seq),
      clientId: text(raw.clientId),
      issueDate: raw.issueDate,
      termsDays: isInt(raw.termsDays, 0, 365) ? raw.termsDays : null,
      dueDate: raw.dueDate,
      lines,
      discount: cleanDiscount(raw.discount, name, issues),
      notes: text(raw.notes),
      terms: text(raw.terms),
      status: raw.status,
      payments,
    };
    if (kind === 'invoice') doc.quoteId = typeof raw.quoteId === 'string' ? raw.quoteId : null;
    else doc.invoiceId = typeof raw.invoiceId === 'string' ? raw.invoiceId : null;
    if (calc.totals(doc).total > money.MAX_TOTAL_CENTS) { issues.push(`${name} total is too large.`); return null; }
    if (calc.paidAmount(doc) > calc.totals(doc).total) issues.push(`${name} has payments above its total.`);
    return doc;
  }

  function cleanList(raw, label, cleanOne, issues) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) { issues.push(`${label} list is not a list.`); return []; }
    const seen = new Set();
    return raw.map((record, i) => cleanOne(record, `${label} ${i + 1}`, issues)).filter((record, i) => {
      if (!record) return false;
      if (seen.has(record.id)) { issues.push(`${label} ${i + 1} repeats an id already used.`); return false; }
      seen.add(record.id);
      return true;
    });
  }

  function checkNumbers(docs, label, issues) {
    const seen = new Set();
    docs.forEach((doc) => {
      if (seen.has(doc.seq)) issues.push(`${label} number ${doc.number} is used twice.`);
      seen.add(doc.seq);
    });
  }

  function checkClientLinks(docs, clients, label, issues) {
    const ids = new Set(clients.map((c) => c.id));
    docs.forEach((doc) => {
      if (!ids.has(doc.clientId)) issues.push(`${label} ${doc.number} points to a client that does not exist.`);
    });
  }

  // Returns { state, issues }. `defaults` fills profile fields when the source leaves them out.
  function cleanState(raw, defaults) {
    const issues = [];
    if (!isObject(raw)) return { state: null, issues: ['This is not a Billcraft data file.'] };
    const profile = cleanProfile(raw.profile, defaults, issues);
    const clients = cleanList(raw.clients, 'Client', cleanClient, issues);
    const items = cleanList(raw.items, 'Catalogue item', cleanItem, issues);
    const invoices = cleanList(raw.invoices, 'Invoice', (r, l, i) => cleanDoc(r, 'invoice', l, i), issues);
    const quotes = cleanList(raw.quotes, 'Quote', (r, l, i) => cleanDoc(r, 'quote', l, i), issues);
    checkNumbers(invoices, 'Invoice', issues);
    checkNumbers(quotes, 'Quote', issues);
    checkClientLinks(invoices, clients, 'Invoice', issues);
    checkClientLinks(quotes, clients, 'Quote', issues);
    profile.nextInvoice = calc.nextSequence(profile.nextInvoice, invoices);
    profile.nextQuote = calc.nextSequence(profile.nextQuote, quotes);
    return { state: { profile, clients, items, invoices, quotes }, issues };
  }

  // Unwraps the export envelope and reports whether the file can be imported as it stands.
  function validateBackup(raw, defaults) {
    if (!isObject(raw) || raw.app !== 'billcraft' || !isObject(raw.data)) {
      return { state: null, issues: ['This file is not a Billcraft backup. Choose a JSON file exported from Settings.'] };
    }
    return cleanState(raw.data, defaults);
  }

  window.BC.schema = { cleanState, validateBackup, MAX_LOGO_CHARS };
})();
