// Single source of truth. Every change goes through commit(), which saves and notifies the views.
(function () {
  const BC = window.BC;
  const { calc, dates, schema, seed } = BC;
  const { uid } = BC.dom;
  const KEY = 'billcraft.data.v1';

  const listeners = new Set();
  let state = null;
  let storageFailed = false;

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storageFailed = false;
    } catch (e) {
      storageFailed = true; // keeps working in memory; the shell shows a notice
    }
  }

  function load() {
    const fresh = seed.createSeed();
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) { raw = null; }
    const cleaned = raw ? schema.cleanState(raw, fresh.profile).state : null;
    state = cleaned || fresh;
    if (!cleaned) save();
  }

  function commit(change) {
    if (change) change(state);
    save();
    listeners.forEach((fn) => fn());
  }

  const subscribe = (fn) => listeners.add(fn);
  const snapshot = () => JSON.stringify(state);
  function restore(json) {
    state = JSON.parse(json);
    commit();
  }

  const collection = (kind) => (kind === 'quote' ? state.quotes : state.invoices);
  const findDoc = (kind, id) => collection(kind).find((doc) => doc.id === id) || null;
  const findClient = (id) => state.clients.find((c) => c.id === id) || null;
  const clientName = (id) => (findClient(id) || { name: 'Unknown client' }).name;
  const docsForClient = (kind, id) => collection(kind).filter((doc) => doc.clientId === id);

  function prefixFor(kind) { return kind === 'quote' ? state.profile.quotePrefix : state.profile.invoicePrefix; }
  function counterKey(kind) { return kind === 'quote' ? 'nextQuote' : 'nextInvoice'; }
  function peekSequence(kind) { return calc.nextSequence(state.profile[counterKey(kind)], collection(kind)); }
  function peekNumber(kind) { return calc.formatNumber(prefixFor(kind), peekSequence(kind)); }

  function takeNumber(kind) {
    const seq = peekSequence(kind);
    state.profile[counterKey(kind)] = seq + 1;
    return { seq, number: calc.formatNumber(prefixFor(kind), seq) };
  }

  // A draft that was never sent can give its number back, but only if it is the newest one.
  // Numbers on sent documents are never reused, even if the document is later deleted.
  function releaseNumber(doc) {
    const key = counterKey(doc.kind);
    if (doc.status === 'draft' && doc.seq === state.profile[key] - 1) state.profile[key] = doc.seq;
  }

  function saveDocument(kind, fields, id) {
    let saved = null;
    commit(() => {
      const existing = id ? findDoc(kind, id) : null;
      if (existing) {
        Object.assign(existing, fields);
        saved = existing;
      } else {
        saved = { id: uid(kind), kind, status: 'draft', payments: [], ...(kind === 'quote' ? { invoiceId: null } : { quoteId: null }), ...takeNumber(kind), ...fields };
        collection(kind).unshift(saved);
      }
    });
    return saved;
  }

  function deleteDocument(kind, id) {
    commit(() => {
      const doc = findDoc(kind, id);
      if (!doc) return;
      releaseNumber(doc);
      if (kind === 'invoice' && doc.quoteId) {
        const quote = findDoc('quote', doc.quoteId);
        if (quote) { quote.invoiceId = null; quote.status = 'accepted'; }
      }
      if (kind === 'quote' && doc.invoiceId) {
        const invoice = findDoc('invoice', doc.invoiceId);
        if (invoice) invoice.quoteId = null;
      }
      const list = collection(kind);
      list.splice(list.indexOf(doc), 1);
    });
  }

  function freshCopy(source, kind, clientId) {
    const issueDate = dates.today();
    const client = findClient(clientId);
    const termsDays = source.kind === kind && source.termsDays !== null ? source.termsDays : (client ? client.paymentDays : state.profile.paymentDays);
    return {
      clientId,
      issueDate,
      termsDays,
      dueDate: dates.addDays(issueDate, termsDays),
      lines: source.lines.map((line) => ({ ...line, id: uid('l') })),
      discount: { ...source.discount },
      notes: source.notes,
      terms: source.kind === kind ? source.terms : state.profile.terms,
    };
  }

  const duplicateDocument = (kind, id) => {
    const source = findDoc(kind, id);
    return source ? saveDocument(kind, freshCopy(source, kind, source.clientId)) : null;
  };

  function convertQuote(id) {
    const quote = findDoc('quote', id);
    if (!quote || quote.invoiceId) return null;
    const invoice = saveDocument('invoice', { ...freshCopy(quote, 'invoice', quote.clientId), quoteId: quote.id });
    commit(() => {
      quote.invoiceId = invoice.id;
      quote.status = 'converted';
    });
    return invoice;
  }

  function setStatus(kind, id, status) {
    commit(() => {
      const doc = findDoc(kind, id);
      if (doc) doc.status = status;
    });
  }

  function savePayment(invoiceId, fields, paymentId) {
    commit(() => {
      const invoice = findDoc('invoice', invoiceId);
      if (!invoice) return;
      const existing = invoice.payments.find((p) => p.id === paymentId);
      if (existing) Object.assign(existing, fields);
      else invoice.payments.push({ id: uid('p'), ...fields });
      invoice.payments.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    });
  }

  function deletePayment(invoiceId, paymentId) {
    commit(() => {
      const invoice = findDoc('invoice', invoiceId);
      if (invoice) invoice.payments = invoice.payments.filter((p) => p.id !== paymentId);
    });
  }

  function saveRecord(listName, fields, id) {
    let saved = null;
    commit(() => {
      const list = state[listName];
      saved = id ? list.find((record) => record.id === id) : null;
      if (saved) Object.assign(saved, fields);
      else { saved = { id: uid(listName), ...fields }; list.push(saved); }
      list.sort((a, b) => a.name.localeCompare(b.name));
    });
    return saved;
  }

  function deleteRecord(listName, id) {
    commit(() => {
      state[listName] = state[listName].filter((record) => record.id !== id);
    });
  }

  const saveProfile = (fields) => commit(() => { Object.assign(state.profile, fields); });
  const resetDemo = () => { state = seed.createSeed(); commit(); };
  const replaceAll = (next) => { state = next; commit(); };

  load();

  BC.store = {
    get state() { return state; },
    get storageFailed() { return storageFailed; },
    subscribe, snapshot, restore, clone,
    collection, findDoc, findClient, clientName, docsForClient,
    peekNumber, peekSequence, saveDocument, deleteDocument, duplicateDocument, convertQuote, setStatus,
    savePayment, deletePayment, saveRecord, deleteRecord, saveProfile, resetDemo, replaceAll,
  };
})();
