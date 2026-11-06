// First-run data: six weeks of a consultant's work, all dated relative to today.
(function (HG) {
  'use strict';
  const T = HG.time;

  const CLIENTS = [
    { id: 'c-alder', name: 'Alder & Finch Architects', rate: 135, color: '#2F6DB5', budgetRatio: null },
    { id: 'c-kestrel', name: 'Kestrel Ridge Outfitters', rate: 110, color: '#0A9A8C', budgetRatio: 1.35 },
    { id: 'c-tallow', name: 'Tallow Bay Co-op', rate: 85, color: '#7E9A12', budgetRatio: null },
    { id: 'c-quillon', name: 'Quillon Freight Analytics', rate: 150, color: '#A63D9A', budgetRatio: null },
  ];

  // budgetRatio sets the budget relative to hours generated below, so one project is always over and one near its limit.
  const PROJECTS = [
    { id: 'p-web', name: 'Website rebuild', clientId: 'c-alder', rate: null, color: '#2F6DB5', billable: true, budgetRatio: 1.5 },
    { id: 'p-portal', name: 'Planning portal prototype', clientId: 'c-alder', rate: 150, color: '#D9661F', billable: true, budgetRatio: 0.9 },
    { id: 'p-audit', name: 'Checkout audit', clientId: 'c-kestrel', rate: null, color: '#0A9A8C', billable: true, budgetRatio: 1.13 },
    { id: 'p-sync', name: 'Inventory sync', clientId: 'c-kestrel', rate: 125, color: '#7C5CD6', billable: true, budgetRatio: 1.8 },
    { id: 'p-news', name: 'Member newsletter system', clientId: 'c-tallow', rate: null, color: '#7E9A12', billable: true, budgetRatio: 1.4 },
    { id: 'p-routes', name: 'Route cost dashboard', clientId: 'c-quillon', rate: 165, color: '#A63D9A', billable: true, budgetRatio: 1.6 },
    { id: 'p-admin', name: 'Admin and invoicing', clientId: null, rate: 0, color: '#C99A00', billable: false, budgetRatio: null },
    { id: 'p-reading', name: 'Professional reading', clientId: null, rate: 0, color: '#CE3A5C', billable: false, budgetRatio: null },
  ];

  const TAGS = [
    ['t-dev', 'Development'], ['t-design', 'Design'], ['t-meet', 'Meeting'], ['t-research', 'Research'],
    ['t-review', 'Review'], ['t-write', 'Writing'], ['t-admin', 'Admin'], ['t-bug', 'Bug fix'],
  ].map(([id, name]) => ({ id, name }));

  // [project, description, tags, relative weight]
  const TASKS = [
    ['p-web', 'Homepage layout build', ['t-dev'], 5],
    ['p-web', 'Project gallery templates', ['t-dev', 't-design'], 4],
    ['p-web', 'Content migration from old site', ['t-dev'], 3],
    ['p-web', 'Design review with studio partners', ['t-meet', 't-review'], 2],
    ['p-portal', 'Permit status screens', ['t-design'], 3],
    ['p-portal', 'Applicant flow prototype', ['t-dev', 't-design'], 3],
    ['p-portal', 'Usability notes from council staff', ['t-research', 't-write'], 2],
    ['p-audit', 'Abandoned cart funnel analysis', ['t-research'], 3],
    ['p-audit', 'Payment form accessibility review', ['t-review'], 3],
    ['p-audit', 'Audit findings write-up', ['t-write'], 2],
    ['p-sync', 'Stock feed importer', ['t-dev'], 4],
    ['p-sync', 'Warehouse mismatch fixes', ['t-dev', 't-bug'], 3],
    ['p-sync', 'Sync status call with operations', ['t-meet'], 2],
    ['p-news', 'Newsletter template build', ['t-dev'], 2],
    ['p-news', 'Member list clean-up', ['t-admin'], 1],
    ['p-routes', 'Fuel cost model', ['t-research', 't-dev'], 3],
    ['p-routes', 'Depot comparison chart', ['t-dev', 't-design'], 3],
    ['p-routes', 'Weekly check-in with fleet team', ['t-meet'], 2],
    ['p-admin', 'Invoices and bookkeeping', ['t-admin'], 2],
    ['p-admin', 'Proposal for spring retainer', ['t-write', 't-admin'], 1],
    ['p-reading', 'Web performance reading', ['t-research'], 2],
  ];

  const WEIGHTED = TASKS.flatMap((task) => Array(task[3]).fill(task));
  const LENGTHS = [25, 35, 40, 50, 55, 65, 75, 80, 90, 105, 120, 135, 150];

  // Small deterministic generator, so every first run looks the same relative to today.
  function makeRandom(seed) {
    let a = seed;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeEntry(id, task, start, end, focus) {
    const project = PROJECTS.find((p) => p.id === task[0]);
    return { id, description: task[1], projectId: task[0], tagIds: task[2].slice(), billable: project.billable, start, end, focus: !!focus };
  }

  function generateDay(dayKey, random, nextId) {
    const entries = [];
    const count = 3 + Math.floor(random() * 3);
    let cursor = T.dayStart(dayKey) + (8 * 60 + 45 + Math.floor(random() * 6) * 5) * T.MIN;
    const lastStart = T.dayStart(dayKey) + 17 * T.HOUR;
    for (let i = 0; i < count && cursor < lastStart; i++) {
      const task = WEIGHTED[Math.floor(random() * WEIGHTED.length)];
      const minutes = LENGTHS[Math.floor(random() * LENGTHS.length)];
      const seconds = random() < 0.35 ? Math.floor(random() * 60) : 0;
      const end = cursor + minutes * T.MIN + seconds * 1000;
      entries.push(makeEntry(nextId(), task, cursor, end, minutes === 25 || minutes === 50));
      cursor = end + (5 + Math.floor(random() * 4) * 5) * T.MIN;
      const lunchFrom = T.dayStart(dayKey) + 12 * T.HOUR;
      if (cursor > lunchFrom && cursor < lunchFrom + 90 * T.MIN) cursor = lunchFrom + 75 * T.MIN;
    }
    return entries;
  }

  // Minutes after midnight, length in minutes. The third overlaps the second by 20 minutes on purpose.
  const TODAY_PLAN = [
    [540, 50, ['p-web', 'Sprint planning with studio partners', ['t-meet']]],
    [595, 95, ['p-web', 'Homepage layout build', ['t-dev']]],
    [670, 30, ['p-audit', 'Call about refund flow findings', ['t-meet']]],
    [705, 70, ['p-sync', 'Warehouse mismatch fixes', ['t-dev', 't-bug']]],
    [810, 65, ['p-portal', 'Permit status screens', ['t-design']]],
    [880, 110, ['p-routes', 'Depot comparison chart', ['t-dev', 't-design']]],
    [995, 40, ['p-admin', 'Invoices and bookkeeping', ['t-admin']]],
  ];

  /** Today's entries must be in the past. Early in the day the first three slide back so they end just before now. */
  function generateToday(now, earliest, nextId) {
    const base = T.dayStart(T.dayKey(now));
    const plan = TODAY_PLAN.map(([from, minutes, task]) => ({ start: base + from * T.MIN, end: base + (from + minutes) * T.MIN, task }));
    let kept = plan.filter((p) => p.end <= now - 5 * T.MIN);
    if (kept.length < 3) {
      const shift = (now - 10 * T.MIN) - plan[2].end;
      kept = plan.slice(0, 3)
        .map((p) => ({ ...p, start: p.start + shift, end: p.end + shift }))
        .filter((p) => p.start >= earliest);
    }
    return kept.map((p) => makeEntry(nextId(), p.task, p.start, p.end, false));
  }

  function budgetFrom(usedMs, ratio) {
    return Math.max(2, Math.round((usedMs / T.HOUR) * ratio * 2) / 2);
  }

  function create(now) {
    const random = makeRandom(20260311);
    let counter = 0;
    const nextId = () => `e-${++counter}`;
    const today = T.dayKey(now);
    const entries = [];

    for (let offset = 42; offset >= 1; offset--) {
      const key = T.addDays(today, -offset);
      const weekday = new Date(T.dayStart(key)).getDay();
      const weekend = weekday === 0 || weekday === 6;
      if (weekend && offset !== 1 && offset % 13 !== 0) continue;
      entries.push(...generateDay(key, random, nextId));
    }

    // A late deployment that crosses midnight, ending today when there's enough of today to end in.
    const todayStart = T.dayStart(today);
    const endsToday = now >= todayStart + 30 * T.MIN;
    const crossDay = endsToday ? today : T.addDays(today, -1);
    const crossBase = T.dayStart(crossDay);
    entries.push(makeEntry(nextId(), ['p-sync', 'Production cutover for stock feed', ['t-dev']], crossBase - 80 * T.MIN, crossBase + 25 * T.MIN, false));
    entries.push(...generateToday(now, endsToday ? todayStart + 30 * T.MIN : todayStart, nextId));

    const usedMs = (test) => entries.filter(test).reduce((sum, e) => sum + e.end - e.start, 0);
    return {
      clients: CLIENTS.map((c) => ({
        id: c.id, name: c.name, rate: c.rate, color: c.color,
        budgetHours: c.budgetRatio ? budgetFrom(usedMs((e) => PROJECTS.find((p) => p.id === e.projectId).clientId === c.id), c.budgetRatio) : null,
      })),
      projects: PROJECTS.map((p) => ({
        id: p.id, name: p.name, clientId: p.clientId, rate: p.rate, color: p.color, billable: p.billable,
        budgetHours: p.budgetRatio ? budgetFrom(usedMs((e) => e.projectId === p.id), p.budgetRatio) : null,
      })),
      tags: TAGS.map((t) => ({ ...t })),
      entries,
      settings: { name: 'Dana Whitlock' },
    };
  }

  HG.seed = { create };
})(window.HG);
