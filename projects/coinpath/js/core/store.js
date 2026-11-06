// Persistence and validation. Everything read from storage or an imported file
// passes through sanitize, so the rest of the app can trust the state's shape.
(function () {
  const ns = window.Coinpath;
  const { Money, Dates } = ns;
  const DATA_KEY = 'coinpath.data.v1';
  const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
  const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'cash', 'investment'];
  let storageWorks = true;
  let loadFailed = false;
  let idCounter = 0;

  function readRaw(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      storageWorks = false;
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      window.localStorage.setItem(key, value);
      storageWorks = true;
    } catch (err) {
      storageWorks = false;
    }
  }

  function newId(prefix) {
    idCounter += 1;
    return prefix + '-' + Date.now().toString(36) + '-' + idCounter.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const isBalance = (value) => Number.isSafeInteger(value) && Math.abs(value) <= Money.MAX_CENTS;
  const asArray = (value) => (Array.isArray(value) ? value : []);

  function uniqueById(list) {
    const seen = new Set();
    return list.filter((item) => {
      if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function cleanAccounts(raw) {
    return uniqueById(raw).map((a) => ({
      id: a.id,
      name: cleanText(a.name, 60),
      type: ACCOUNT_TYPES.includes(a.type) ? a.type : 'checking',
      openingCents: isBalance(a.openingCents) ? a.openingCents : 0,
    })).filter((a) => a.name);
  }

  function cleanCategories(raw) {
    return uniqueById(raw).map((c) => ({
      id: c.id,
      name: cleanText(c.name, 40),
      kind: c.kind === 'income' ? 'income' : 'expense',
      color: COLOR_PATTERN.test(c.color) ? c.color : '#2a78d6',
    })).filter((c) => c.name);
  }

  // The fields transactions and recurring rules share, or null if they don't hold up.
  function cleanMovement(item, accountIds, categoryIds) {
    if (!['expense', 'income', 'transfer'].includes(item.type)) return null;
    if (!Money.isValidAmount(item.amountCents) || !accountIds.has(item.accountId)) return null;
    const isTransfer = item.type === 'transfer';
    if (isTransfer && (!accountIds.has(item.toAccountId) || item.toAccountId === item.accountId)) return null;
    return {
      type: item.type,
      amountCents: item.amountCents,
      accountId: item.accountId,
      toAccountId: isTransfer ? item.toAccountId : null,
      categoryId: !isTransfer && categoryIds.has(item.categoryId) ? item.categoryId : null,
      notes: cleanText(item.notes, 300),
    };
  }

  function cleanTransactions(raw, accountIds, categoryIds, ruleIds) {
    let lastSeq = 0;
    return uniqueById(raw).map((t) => {
      const base = cleanMovement(t, accountIds, categoryIds);
      if (!base || !Dates.isValid(t.date)) return null;
      lastSeq = Number.isSafeInteger(t.seq) && t.seq > 0 ? t.seq : lastSeq + 1;
      return Object.assign(base, {
        id: t.id, seq: lastSeq, date: t.date, payee: cleanText(t.payee, 120),
        recurringId: ruleIds.has(t.recurringId) ? t.recurringId : null,
      });
    }).filter(Boolean);
  }

  function cleanBudgets(raw, categoryIds) {
    return raw.filter((b) => b && categoryIds.has(b.categoryId) && Dates.isValidMonth(b.fromMonth)
      && Number.isSafeInteger(b.limitCents) && b.limitCents >= 0 && b.limitCents <= Money.MAX_CENTS)
      .map((b) => ({ categoryId: b.categoryId, fromMonth: b.fromMonth, limitCents: b.limitCents }));
  }

  function cleanRecurring(raw, accountIds, categoryIds) {
    return uniqueById(raw).map((r) => {
      const base = cleanMovement(r, accountIds, categoryIds);
      const name = cleanText(r.name, 120);
      if (!base || !name || !Dates.isValid(r.nextDate)) return null;
      const day = Dates.parts(r.nextDate).d;
      return Object.assign(base, {
        id: r.id,
        name,
        frequency: r.frequency === 'weekly' ? 'weekly' : 'monthly',
        nextDate: r.nextDate,
        anchorDay: Number.isInteger(r.anchorDay) && r.anchorDay >= day && r.anchorDay <= 31 ? r.anchorDay : day,
        endDate: Dates.isValid(r.endDate) ? r.endDate : null,
        paused: r.paused === true,
        postedCount: Number.isSafeInteger(r.postedCount) && r.postedCount >= 0 ? r.postedCount : 0,
      });
    }).filter(Boolean);
  }

  /** Builds a valid state from untrusted data. Throws when it isn't Coinpath data at all. */
  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.accounts) || !Array.isArray(raw.transactions)) {
      throw new Error('This file is not a Coinpath backup: it has no accounts or transactions list.');
    }
    const accounts = cleanAccounts(raw.accounts);
    const categories = cleanCategories(asArray(raw.categories));
    const accountIds = new Set(accounts.map((a) => a.id));
    const categoryIds = new Set(categories.map((c) => c.id));
    const recurring = cleanRecurring(asArray(raw.recurring), accountIds, categoryIds);
    const ruleIds = new Set(recurring.map((r) => r.id));
    const transactions = cleanTransactions(raw.transactions, accountIds, categoryIds, ruleIds);
    return {
      version: 1,
      currency: Money.CURRENCIES.some((c) => c.code === raw.currency) ? raw.currency : 'USD',
      accounts,
      categories,
      transactions,
      budgets: cleanBudgets(asArray(raw.budgets), categoryIds),
      recurring,
      nextSeq: transactions.reduce((max, t) => Math.max(max, t.seq), 0) + 1,
    };
  }

  /** The saved state, or null on first run or when what's saved can't be used. */
  function load() {
    const text = readRaw(DATA_KEY);
    if (!text) return null;
    try {
      return sanitize(JSON.parse(text));
    } catch (err) {
      loadFailed = true;
      writeRaw(DATA_KEY + '.unreadable', text);
      return null;
    }
  }

  const save = (state) => writeRaw(DATA_KEY, JSON.stringify(state));

  ns.Store = { DATA_KEY, ACCOUNT_TYPES, load, save, sanitize, newId, isPersistent: () => storageWorks, lastLoadFailed: () => loadFailed };
})();
