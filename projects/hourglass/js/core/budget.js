// Budget usage for projects and clients. Hours count at their rounded value because that is what gets billed,
// and a running timer counts too, so the warning arrives before the hours are gone.
(function (HG) {
  'use strict';
  const NEAR_RATIO = 0.8;
  const { HOUR } = HG.time;

  function usedByProject(state, now) {
    const used = new Map();
    const add = (id, ms) => used.set(id, (used.get(id) || 0) + ms);
    state.entries.forEach((e) => add(e.projectId, HG.calc.roundedTotal(e, state.settings)));
    if (state.timerStart !== null) {
      const running = { start: state.timerStart, end: Math.max(state.timerStart, now) };
      add(state.task.projectId, HG.calc.roundedTotal(running, state.settings));
    }
    return used;
  }

  function describe(kind, item, usedMs) {
    const budgetMs = item.budgetHours === null ? null : item.budgetHours * HOUR;
    let status = 'none';
    if (budgetMs !== null) {
      if (usedMs > budgetMs) status = 'over';
      else if (usedMs >= budgetMs * NEAR_RATIO) status = 'near';
      else status = 'ok';
    }
    return { kind, id: item.id, name: item.name, color: item.color, budgetHours: item.budgetHours, usedMs, budgetMs, status,
      ratio: budgetMs ? usedMs / budgetMs : 0 };
  }

  function usage(state, now) {
    const used = usedByProject(state, now);
    const projects = state.projects.map((p) => describe('project', p, used.get(p.id) || 0));
    const clients = state.clients.map((c) => {
      const total = state.projects.filter((p) => p.clientId === c.id).reduce((sum, p) => sum + (used.get(p.id) || 0), 0);
      return describe('client', c, total);
    });
    return { projects, clients };
  }

  function alerts(state, now) {
    const { projects, clients } = usage(state, now);
    const rank = { over: 0, near: 1 };
    return projects.concat(clients)
      .filter((item) => item.status === 'over' || item.status === 'near')
      .sort((a, b) => rank[a.status] - rank[b.status] || b.ratio - a.ratio);
  }

  /** One line of plain text for an alert, e.g. "Planning portal: 26.50 of 24 h, 2.50 h over". */
  function alertText(item) {
    const used = HG.time.hours(item.usedMs);
    if (item.status === 'over') return `${item.name}: ${used} of ${item.budgetHours} h, ${HG.time.hours(item.usedMs - item.budgetMs)} h over budget`;
    return `${item.name}: ${used} of ${item.budgetHours} h, ${Math.round(item.ratio * 100)}% of budget used`;
  }

  /** Compares alerts before and after a change, and returns the budgets that just went over. */
  function newlyOver(before, state, now) {
    const was = new Set(before.filter((a) => a.status === 'over').map((a) => a.kind + a.id));
    return alerts(state, now).filter((a) => a.status === 'over' && !was.has(a.kind + a.id));
  }

  HG.budget = { usage, alerts, alertText, newlyOver };
})(window.HG);
