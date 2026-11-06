// First-run demo data: thirteen months of one person's finances, computed relative
// to today. A seeded generator keeps the story the same each time it's rebuilt.
(function () {
  const ns = window.Coinpath;
  const { Dates, Ledger, Recurring } = ns;

  const ACCOUNTS = [
    { id: 'acc-checking', name: 'Everyday Checking', type: 'checking', openingCents: 412650 },
    { id: 'acc-savings', name: 'Harbor Savings', type: 'savings', openingCents: 1184000 },
    { id: 'acc-card', name: 'Rewards Card', type: 'credit', openingCents: -48230 },
    { id: 'acc-cash', name: 'Cash wallet', type: 'cash', openingCents: 6500 },
    { id: 'acc-index', name: 'Index Fund', type: 'investment', openingCents: 2265000 },
  ];

  const CATEGORIES = [
    { id: 'cat-housing', name: 'Housing', kind: 'expense', color: '#2a78d6' },
    { id: 'cat-groceries', name: 'Groceries', kind: 'expense', color: '#eb6834' },
    { id: 'cat-dining', name: 'Dining out', kind: 'expense', color: '#1baf7a' },
    { id: 'cat-transport', name: 'Transport', kind: 'expense', color: '#eda100' },
    { id: 'cat-bills', name: 'Bills and subscriptions', kind: 'expense', color: '#e87ba4' },
    { id: 'cat-shopping', name: 'Shopping', kind: 'expense', color: '#008300' },
    { id: 'cat-health', name: 'Health', kind: 'expense', color: '#6250d6' },
    { id: 'cat-travel', name: 'Travel', kind: 'expense', color: '#e34948' },
    { id: 'cat-salary', name: 'Salary', kind: 'income', color: '#2a78d6' },
    { id: 'cat-freelance', name: 'Freelance', kind: 'income', color: '#1baf7a' },
    { id: 'cat-interest', name: 'Interest and refunds', kind: 'income', color: '#eda100' },
  ];

  const BUDGET_LIMITS = {
    'cat-housing': 165000, 'cat-groceries': 52000, 'cat-dining': 22000, 'cat-transport': 18000,
    'cat-bills': 26000, 'cat-shopping': 26000, 'cat-health': 9000,
  };

  const RULES = [
    { name: 'Brightwater Studio payroll', type: 'income', amountCents: 298000, accountId: 'acc-checking', categoryId: 'cat-salary', frequency: 'monthly', day: 1 },
    { name: 'Brightwater Studio payroll', type: 'income', amountCents: 298000, accountId: 'acc-checking', categoryId: 'cat-salary', frequency: 'monthly', day: 15 },
    { name: 'Maplewood Residences rent', type: 'expense', amountCents: 165000, accountId: 'acc-checking', categoryId: 'cat-housing', frequency: 'monthly', day: 1, notes: 'Unit 4B' },
    { name: 'Bluepeak Fiber internet', type: 'expense', amountCents: 6499, accountId: 'acc-checking', categoryId: 'cat-bills', frequency: 'monthly', day: 12 },
    { name: 'Reelhouse streaming', type: 'expense', amountCents: 1599, accountId: 'acc-card', categoryId: 'cat-bills', frequency: 'monthly', day: 18 },
    { name: 'Stride Climbing Gym', type: 'expense', amountCents: 4200, accountId: 'acc-card', categoryId: 'cat-health', frequency: 'monthly', day: 3 },
    { name: 'Move to savings', type: 'transfer', amountCents: 60000, accountId: 'acc-checking', toAccountId: 'acc-savings', frequency: 'monthly', day: 2 },
    { name: 'Index fund contribution', type: 'transfer', amountCents: 25000, accountId: 'acc-checking', toAccountId: 'acc-index', frequency: 'monthly', day: 16 },
    { name: 'Fernhill Farm veg box', type: 'expense', amountCents: 3250, accountId: 'acc-card', categoryId: 'cat-groceries', frequency: 'weekly', weekday: 6, unpostedPeriods: 2 },
  ];

  // Everyday spending: how often each kind happens per month and at what cost.
  const HABITS = [
    { categoryId: 'cat-groceries', accountId: 'acc-card', perMonth: [4, 6], cents: [3800, 11200], payees: ['Fernhill Grocers', 'Corner Pantry', 'Marigold Market'] },
    { categoryId: 'cat-dining', accountId: 'acc-card', perMonth: [4, 8], cents: [900, 5600], payees: ['Copper Kettle Cafe', 'Noodle Yard', 'Saltgrass Kitchen', 'Little Fig Bakery'], notes: ['', '', 'Lunch with the design team', 'Split with flatmate'] },
    { categoryId: 'cat-transport', accountId: 'acc-card', perMonth: [2, 4], cents: [1400, 4300], payees: ['Quickline Transit pass', 'Eastside Fuel', 'Cityhop Rides'] },
    { categoryId: 'cat-bills', accountId: 'acc-checking', perMonth: [1, 1], cents: [8200, 13600], payees: ['Tidewater Power and Light'] },
    { categoryId: 'cat-shopping', accountId: 'acc-card', perMonth: [1, 3], cents: [1800, 9400], payees: ['Alder and Finch Home', 'Thread and Needle', 'Paperbark Books'] },
    { categoryId: 'cat-health', accountId: 'acc-card', perMonth: [0, 1], cents: [1200, 6400], payees: ['Meadow Lane Pharmacy', 'Oakridge Dental'] },
    { categoryId: 'cat-dining', accountId: 'acc-cash', perMonth: [1, 2], cents: [450, 1250], payees: ['Harbor Street coffee cart'] },
  ];

  // One-off events by months ago. They give the cash flow chart a real shape.
  const EVENTS = [
    { monthsAgo: 10, day: 9, type: 'income', categoryId: 'cat-freelance', accountId: 'acc-checking', cents: 84000, payee: 'Oakline Press logo project' },
    { monthsAgo: 8, day: 21, type: 'expense', categoryId: 'cat-shopping', accountId: 'acc-card', cents: 74900, payee: 'Alder and Finch Home', notes: 'New desk and chair' },
    { monthsAgo: 7, day: 11, type: 'income', categoryId: 'cat-interest', accountId: 'acc-checking', cents: 112600, payee: 'Tax refund' },
    { monthsAgo: 5, day: 7, type: 'expense', categoryId: 'cat-travel', accountId: 'acc-card', cents: 61240, payee: 'Skylark Air flights', notes: 'Coast trip, two seats' },
    { monthsAgo: 5, day: 19, type: 'expense', categoryId: 'cat-travel', accountId: 'acc-card', cents: 78000, payee: 'Driftwood Lodge', notes: 'Five nights' },
    { monthsAgo: 5, day: 22, type: 'expense', categoryId: 'cat-travel', accountId: 'acc-card', cents: 21450, payee: 'Coastline Car Hire' },
    { monthsAgo: 3, day: 14, type: 'income', categoryId: 'cat-freelance', accountId: 'acc-checking', cents: 126000, payee: 'Oakline Press brochure' },
    { monthsAgo: 2, day: 24, type: 'expense', categoryId: 'cat-health', accountId: 'acc-checking', cents: 38500, payee: 'Oakridge Dental', notes: 'Crown, after insurance' },
    { monthsAgo: 1, day: 17, type: 'expense', categoryId: 'cat-travel', accountId: 'acc-card', cents: 18900, payee: 'Skylark Air flights', notes: 'Weekend visit' },
  ];

  // Always present this month, with days clamped to today, so the budget page
  // shows over-budget and near-limit states even early in a month.
  const THIS_MONTH = [
    { day: 1, categoryId: 'cat-dining', accountId: 'acc-card', cents: 9640, payee: 'Saltgrass Kitchen', notes: 'Birthday dinner' },
    { day: 2, categoryId: 'cat-dining', accountId: 'acc-card', cents: 8450, payee: 'Noodle Yard', notes: 'Team lunch, my round' },
    { day: 3, categoryId: 'cat-dining', accountId: 'acc-card', cents: 6875, payee: 'Copper Kettle Cafe' },
    { day: 4, categoryId: 'cat-shopping', accountId: 'acc-card', cents: 13600, payee: 'Thread and Needle', notes: 'Winter coat repair' },
    { day: 5, categoryId: 'cat-groceries', accountId: 'acc-card', cents: 14285, payee: 'Fernhill Grocers' },
    { day: 6, categoryId: 'cat-transport', accountId: 'acc-card', cents: 6800, payee: 'Quickline Transit pass' },
  ];

  function seededRandom(seed) {
    let a = seed;
    return function next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeBuilder(today) {
    const transactions = [];
    return {
      transactions,
      add(fields) {
        if (fields.date > today) return;
        const n = transactions.length + 1;
        transactions.push(Object.assign({ id: 'seed-t' + n, seq: n, toAccountId: null, categoryId: null, notes: '', recurringId: null }, fields));
      },
    };
  }

  function addHabits(builder, month, random) {
    const between = (range) => range[0] + Math.floor(random() * (range[1] - range[0] + 1));
    const pick = (list) => list[Math.floor(random() * list.length)];
    HABITS.forEach((habit) => {
      const count = between(habit.perMonth);
      for (let i = 0; i < count; i += 1) {
        builder.add({
          type: 'expense', date: Dates.dayInMonth(month, 1 + Math.floor(random() * 28)), amountCents: between(habit.cents),
          accountId: habit.accountId, categoryId: habit.categoryId, payee: pick(habit.payees), notes: habit.notes ? pick(habit.notes) : '',
        });
      }
    });
  }

  function addMonthlyRoutine(builder, month) {
    builder.add({ type: 'transfer', date: Dates.dayInMonth(month, 8), amountCents: 8000, accountId: 'acc-checking', toAccountId: 'acc-cash', payee: 'Cash withdrawal' });
    builder.add({ type: 'income', date: Dates.dayInMonth(month, 28), amountCents: 3400 + Number(month.slice(5)) * 37, accountId: 'acc-savings', categoryId: 'cat-interest', payee: 'Harbor Savings interest' });
  }

  function addOneOffs(builder, thisMonth, today) {
    EVENTS.forEach((event) => {
      builder.add({
        type: event.type, date: Dates.dayInMonth(Dates.shiftMonth(thisMonth, -event.monthsAgo), event.day), amountCents: event.cents,
        accountId: event.accountId, categoryId: event.categoryId, payee: event.payee, notes: event.notes || '',
      });
    });
    THIS_MONTH.forEach((item) => {
      const date = Dates.dayInMonth(thisMonth, item.day);
      builder.add({
        type: 'expense', date: date > today ? today : date, amountCents: item.cents, accountId: item.accountId,
        categoryId: item.categoryId, payee: item.payee, notes: item.notes || '',
      });
    });
  }

  function firstOccurrence(spec, startMonth) {
    if (spec.frequency === 'monthly') return Dates.dayInMonth(startMonth, spec.day);
    let date = Dates.firstOfMonth(startMonth);
    while (Dates.weekdayIndex(date) !== spec.weekday) date = Dates.addDays(date, 1);
    return date;
  }

  // Posts each rule's history. A rule with unpostedPeriods stops short, so the very
  // first load has something to catch up on, exactly as if the app had gone unopened.
  function addRules(builder, startMonth, today) {
    return RULES.map((spec, index) => {
      const rule = {
        id: 'seed-rule-' + (index + 1), name: spec.name, type: spec.type, amountCents: spec.amountCents,
        accountId: spec.accountId, toAccountId: spec.toAccountId || null, categoryId: spec.categoryId || null,
        notes: spec.notes || '', frequency: spec.frequency, nextDate: firstOccurrence(spec, startMonth),
        anchorDay: spec.day || 1, endDate: null, paused: false, postedCount: 0,
      };
      const dates = [];
      while (rule.nextDate <= today) {
        dates.push(rule.nextDate);
        rule.nextDate = Recurring.nextOccurrence(rule, rule.nextDate);
      }
      const held = dates.splice(Math.max(0, dates.length - (spec.unpostedPeriods || 0)));
      if (held.length) rule.nextDate = held[0];
      dates.forEach((date) => {
        builder.add({
          type: rule.type, date, amountCents: rule.amountCents, accountId: rule.accountId, toAccountId: rule.toAccountId,
          categoryId: rule.categoryId, payee: rule.name, notes: rule.notes, recurringId: rule.id,
        });
      });
      rule.postedCount = dates.length;
      return rule;
    });
  }

  // Runs last, month by month, because each payment clears a balance that
  // includes all spending and earlier payments up to that point.
  function addCardPayments(builder, startMonth, thisMonth) {
    const view = { accounts: ACCOUNTS, transactions: builder.transactions };
    for (let month = startMonth; month <= thisMonth; month = Dates.shiftMonth(month, 1)) {
      const owed = -Ledger.balances(view, Dates.lastOfMonth(Dates.shiftMonth(month, -1)))['acc-card'];
      if (owed > 0) {
        builder.add({ type: 'transfer', date: Dates.dayInMonth(month, 5), amountCents: owed, accountId: 'acc-checking', toAccountId: 'acc-card', payee: 'Rewards Card payment' });
      }
    }
  }

  function build(today) {
    const thisMonth = Dates.monthOf(today);
    const startMonth = Dates.shiftMonth(thisMonth, -12);
    const random = seededRandom(20260);
    const builder = makeBuilder(today);
    for (let month = startMonth; month <= thisMonth; month = Dates.shiftMonth(month, 1)) {
      addHabits(builder, month, random);
      addMonthlyRoutine(builder, month);
    }
    addOneOffs(builder, thisMonth, today);
    const recurring = addRules(builder, startMonth, today);
    addCardPayments(builder, startMonth, thisMonth);
    const transactions = Ledger.chronological(builder.transactions).map((tx, i) => Object.assign(tx, { seq: i + 1 }));
    return {
      version: 1,
      currency: 'USD',
      accounts: ACCOUNTS.map((a) => Object.assign({}, a)),
      categories: CATEGORIES.map((c) => Object.assign({}, c)),
      transactions,
      budgets: Object.keys(BUDGET_LIMITS).map((categoryId) => ({ categoryId, fromMonth: startMonth, limitCents: BUDGET_LIMITS[categoryId] })),
      recurring,
      nextSeq: transactions.length + 1,
    };
  }

  /** A bank-style statement that overlaps recent ledger rows, so the import flow has real duplicates to catch. */
  function sampleStatement(state, today) {
    const usDate = (iso) => { const { y, m, d } = Dates.parts(iso); return String(m).padStart(2, '0') + '/' + String(d).padStart(2, '0') + '/' + y; };
    const account = state.accounts[0];
    const overlap = account ? Ledger.chronological(state.transactions)
      .filter((tx) => tx.type !== 'transfer' && tx.accountId === account.id).slice(-3) : [];
    const rows = [['Posted Date', 'Details', 'Amount', 'Memo']];
    overlap.forEach((tx) => {
      rows.push([usDate(tx.date), tx.payee, ns.Money.toDecimal(tx.type === 'income' ? tx.amountCents : -tx.amountCents), '']);
    });
    const fresh = [[0, 'Lantern Hardware', '-27.48', 'Shelf brackets'], [1, 'Sunday Market Stall', '-18.00', ''],
      [1, 'Sunday Market Stall', '-18.00', ''], [2, 'Oakline Press invoice 214', '640.00', 'Poster layout'],
      [3, 'Greywater Plumbing', '-145.00', 'Kitchen tap']];
    fresh.forEach((row) => rows.push([usDate(Dates.addDays(today, -row[0])), row[1], row[2], row[3]]));
    rows.push(['pending', 'Fernhill Grocers', '-52.10', '']);
    return ns.Csv.stringify(rows);
  }

  ns.Seed = { build, sampleStatement };
})();
