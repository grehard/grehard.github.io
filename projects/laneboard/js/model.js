// Pure board logic. Nothing here touches the DOM or storage, so every rule can be reasoned about alone.
const Model = (() => {
  const PRIORITIES = [
    { id: 'urgent', label: 'Urgent', rank: 0, bars: 4 },
    { id: 'high', label: 'High', rank: 1, bars: 3 },
    { id: 'medium', label: 'Medium', rank: 2, bars: 2 },
    { id: 'low', label: 'Low', rank: 3, bars: 1 },
  ];
  const COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#be185d', '#4d7c0f', '#6d28d9', '#c2410c', '#475569'];
  const MAX_LIMIT = 999;
  const MAX_ACTIVITY = 300;

  let idCounter = 0;
  const uid = (prefix) => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

  const priority = (id) => PRIORITIES.find((p) => p.id === id) || PRIORITIES[2];
  const projectById = (state, id) => state.projects.find((p) => p.id === id) || null;
  const columnById = (project, id) => project.columns.find((c) => c.id === id) || null;
  const memberById = (state, id) => state.team.find((m) => m.id === id) || null;
  const labelById = (state, id) => state.labels.find((l) => l.id === id) || null;
  const cardKey = (project, card) => `${project.key}-${card.number}`;

  function locate(project, cardId) {
    for (const column of project.columns) {
      const index = column.cardIds.indexOf(cardId);
      if (index !== -1) return { columnId: column.id, index, archived: false };
    }
    const index = project.archive.indexOf(cardId);
    return index === -1 ? null : { columnId: null, index, archived: true };
  }

  function placeCard(project, cardId, columnId, index) {
    const column = columnById(project, columnId);
    column.cardIds.splice(Math.max(0, Math.min(index, column.cardIds.length)), 0, cardId);
  }

  function detachCard(project, cardId) {
    const at = locate(project, cardId);
    if (!at) return null;
    const list = at.archived ? project.archive : columnById(project, at.columnId).cardIds;
    list.splice(at.index, 1);
    return at;
  }

  // Moves by "insert before this card" instead of by index: under an active filter the board only
  // shows some of a lane's cards, so a visible position is not the card's real position.
  function moveCard(project, cardId, toColumnId, beforeCardId) {
    const from = locate(project, cardId);
    const target = columnById(project, toColumnId);
    if (!from || from.archived || !target || beforeCardId === cardId) return { changed: false };
    columnById(project, from.columnId).cardIds.splice(from.index, 1);
    const found = beforeCardId ? target.cardIds.indexOf(beforeCardId) : -1;
    const index = found === -1 ? target.cardIds.length : found;
    target.cardIds.splice(index, 0, cardId);
    const changed = from.columnId !== toColumnId || from.index !== index;
    return { changed, from, to: { columnId: toColumnId, index } };
  }

  // Finds the insertion point that moves a card one step among the cards the viewer can see.
  // Returns null when the card can't go further that way.
  function stepTarget(column, cardId, direction, isVisible) {
    const visible = column.cardIds.filter((id) => id === cardId || isVisible(id));
    const at = visible.indexOf(cardId);
    if (direction === 'up') return at > 0 ? { before: visible[at - 1] } : null;
    if (direction === 'top') return at > 0 ? { before: column.cardIds[0] } : null;
    if (at >= visible.length - 1) return null;
    if (direction === 'bottom') return { before: null };
    const passed = column.cardIds.indexOf(visible[at + 1]);
    return { before: column.cardIds[passed + 1] || null };
  }

  function moveColumn(project, columnId, beforeColumnId) {
    const from = project.columns.findIndex((c) => c.id === columnId);
    if (from === -1 || beforeColumnId === columnId) return { changed: false };
    const [column] = project.columns.splice(from, 1);
    const found = beforeColumnId ? project.columns.findIndex((c) => c.id === beforeColumnId) : -1;
    const index = found === -1 ? project.columns.length : found;
    project.columns.splice(index, 0, column);
    return { changed: from !== index, from, to: index };
  }

  function wipState(count, limit) {
    if (!limit) return { level: 'none', count, limit: null, over: 0, room: null };
    const over = Math.max(0, count - limit);
    const level = count > limit ? 'over' : count === limit ? 'at' : 'under';
    return { level, count, limit, over, room: Math.max(0, limit - count) };
  }

  function isFinished(project, cardId) {
    const at = locate(project, cardId);
    return !at || at.archived || !!columnById(project, at.columnId).isDone;
  }

  function isOverdue(project, card, today) {
    return !!card.due && card.due < today && !isFinished(project, card.id);
  }

  function checklistProgress(card) {
    const total = card.checklist.length;
    const done = card.checklist.filter((item) => item.done).length;
    return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  const emptyFilter = () => ({ text: '', assigneeId: '', labelId: '', overdue: false });

  const filterIsActive = (f) => !!(f.text.trim() || f.assigneeId || f.labelId || f.overdue);

  function searchableText(project, card) {
    return [cardKey(project, card), card.title, card.description, ...card.checklist.map((i) => i.text)].join('\n').toLowerCase();
  }

  // All conditions must hold. Each word of the text filter may match anywhere on the card.
  function matchesFilter(project, card, filter, today) {
    if (filter.assigneeId === 'none' && card.assigneeId) return false;
    if (filter.assigneeId && filter.assigneeId !== 'none' && card.assigneeId !== filter.assigneeId) return false;
    if (filter.labelId && !card.labelIds.includes(filter.labelId)) return false;
    if (filter.overdue && !isOverdue(project, card, today)) return false;
    const words = filter.text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const haystack = searchableText(project, card);
    return words.every((word) => haystack.includes(word));
  }

  const SORT_VALUES = {
    key: (row) => row.card.number,
    title: (row) => row.card.title.toLowerCase(),
    lane: (row) => row.laneIndex,
    assignee: (row) => (row.assignee ? row.assignee.name.toLowerCase() : null),
    priority: (row) => priority(row.card.priority).rank,
    due: (row) => row.card.due,
    checklist: (row) => (row.card.checklist.length ? checklistProgress(row.card).percent : null),
  };

  // Blank values stay at the bottom in both directions; ties fall back to card number so order never jitters.
  function sortRows(rows, key, direction) {
    const valueOf = SORT_VALUES[key] || SORT_VALUES.key;
    const sign = direction === 'desc' ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      const blankA = va === null || va === undefined;
      const blankB = vb === null || vb === undefined;
      if (blankA || blankB) return blankA === blankB ? a.card.number - b.card.number : blankA ? 1 : -1;
      const order = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return order ? order * sign : a.card.number - b.card.number;
    });
  }

  function logActivity(card, text, at) {
    card.activity.push({ at: at || new Date().toISOString(), text });
    if (card.activity.length > MAX_ACTIVITY) card.activity.shift();
  }

  function parseLimit(text) {
    const value = String(text).trim();
    if (!value) return { ok: true, value: null };
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > MAX_LIMIT) {
      return { ok: false, error: `Enter a whole number from 1 to ${MAX_LIMIT}, or leave empty for no limit.` };
    }
    return { ok: true, value: Number(value) };
  }

  // A short uppercase prefix for card numbers: "Field app 2.4" becomes "FA".
  function deriveKey(name, takenKeys) {
    const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => /^[A-Z]/.test(w));
    let base = words.map((w) => w[0]).join('').slice(0, 4);
    if (base.length < 2) base = (words[0] || 'PRJ').slice(0, 3);
    let key = base;
    for (let n = 2; takenKeys.includes(key); n++) key = `${base}${n}`;
    return key;
  }

  return {
    PRIORITIES, COLORS, MAX_LIMIT, uid, priority, projectById, columnById, memberById, labelById, cardKey, locate, placeCard, detachCard,
    moveCard, stepTarget, moveColumn, wipState, isFinished, isOverdue, checklistProgress, emptyFilter, filterIsActive,
    matchesFilter, sortRows, logActivity, parseLimit, deriveKey,
  };
})();
