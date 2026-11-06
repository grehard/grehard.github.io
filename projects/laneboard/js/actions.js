// Every change to the workspace goes through here: mutate, log to the card, record how to
// undo it, save, redraw. Moves and deletes store an inverse operation rather than a snapshot,
// so undoing a move doesn't also discard a title edit made after it.
const Actions = (() => {
  const state = () => App.getState();
  const project = () => App.project();

  function commit() {
    Store.save(state());
    App.render();
  }

  function card(cardId) {
    return project().cards[cardId] || null;
  }

  function nameOfColumn(p, columnId) {
    const column = Model.columnById(p, columnId);
    return column ? column.name : 'a removed lane';
  }

  // --- Cards -----------------------------------------------------------------------------

  function createCard({ title, columnId, assigneeId, priority, due }) {
    const p = project();
    const id = Model.uid('c');
    const number = p.nextNumber++;
    const newCard = {
      id, number, title, description: '', assigneeId: assigneeId || null, labelIds: [], priority: priority || 'medium',
      due: due || null, checklist: [], activity: [], createdAt: new Date().toISOString(), archivedFrom: null,
    };
    Model.logActivity(newCard, `Created in ${nameOfColumn(p, columnId)}`);
    p.cards[id] = newCard;
    Model.columnById(p, columnId).cardIds.push(id);
    const key = Model.cardKey(p, newCard);
    Undo.push(`add ${key}`, p.id, () => { Model.detachCard(p, id); delete p.cards[id]; });
    Toast.show(`${key} added to ${nameOfColumn(p, columnId)}.`, { undo: true });
    commit();
    return id;
  }

  function describeChange(field, after) {
    const s = state();
    if (field === 'title') return `Renamed to "${after}"`;
    if (field === 'description') return 'Edited the description';
    if (field === 'assigneeId') {
      const member = Model.memberById(s, after);
      return member ? `Assigned to ${member.name}` : 'Unassigned';
    }
    if (field === 'priority') return `Priority set to ${Model.priority(after).label}`;
    if (field === 'due') return after ? `Due date set to ${Dates.formatShort(after)}` : 'Due date removed';
    return null;
  }

  function updateCard(cardId, patch) {
    const target = card(cardId);
    if (!target) return;
    let changed = false;
    Object.entries(patch).forEach(([field, value]) => {
      if (target[field] === value) return;
      const text = describeChange(field, value);
      target[field] = value;
      if (text) Model.logActivity(target, text);
      changed = true;
    });
    if (changed) commit();
  }

  function toggleLabel(cardId, labelId, on) {
    const target = card(cardId);
    const label = Model.labelById(state(), labelId);
    if (!target || !label) return;
    target.labelIds = target.labelIds.filter((id) => id !== labelId);
    if (on) target.labelIds.push(labelId);
    Model.logActivity(target, `${on ? 'Added' : 'Removed'} label ${label.name}`);
    commit();
  }

  function addChecklistItem(cardId, text) {
    const target = card(cardId);
    target.checklist.push({ id: Model.uid('i'), text, done: false });
    Model.logActivity(target, `Added checklist item "${text}"`);
    commit();
  }

  function toggleChecklistItem(cardId, itemId, done) {
    const target = card(cardId);
    const item = target.checklist.find((i) => i.id === itemId);
    if (!item) return;
    item.done = done;
    Model.logActivity(target, `${done ? 'Checked' : 'Unchecked'} "${item.text}"`);
    commit();
  }

  function renameChecklistItem(cardId, itemId, text) {
    const item = card(cardId).checklist.find((i) => i.id === itemId);
    if (!item || item.text === text) return;
    item.text = text;
    commit();
  }

  function removeChecklistItem(cardId, itemId) {
    const p = project();
    const target = card(cardId);
    const index = target.checklist.findIndex((i) => i.id === itemId);
    if (index === -1) return;
    const [item] = target.checklist.splice(index, 1);
    Model.logActivity(target, `Removed checklist item "${item.text}"`);
    Undo.push(`remove "${item.text}"`, p.id, () => {
      target.checklist.splice(index, 0, item);
      Model.logActivity(target, `Restored checklist item "${item.text}"`);
    });
    Toast.show('Checklist item removed.', { undo: true });
    commit();
  }

  function addNote(cardId, text) {
    Model.logActivity(card(cardId), `Note: ${text}`);
    commit();
  }

  // --- Moving cards ----------------------------------------------------------------------

  function moveCard(cardId, toColumnId, beforeCardId) {
    const p = project();
    const target = card(cardId);
    const result = Model.moveCard(p, cardId, toColumnId, beforeCardId);
    if (!result.changed) { App.render(); return false; }
    const { from } = result;
    const sameLane = from.columnId === toColumnId;
    const fromName = nameOfColumn(p, from.columnId);
    const toName = nameOfColumn(p, toColumnId);
    Model.logActivity(target, sameLane ? `Reordered within ${toName}` : `Moved from ${fromName} to ${toName}`);
    Undo.push(`move ${Model.cardKey(p, target)}`, p.id, () => {
      Model.detachCard(p, cardId);
      Model.placeCard(p, cardId, from.columnId, from.index);
      Model.logActivity(target, `Move undone, back in ${fromName}`);
    });
    const lane = Model.columnById(p, toColumnId);
    const wip = Model.wipState(lane.cardIds.length, lane.limit);
    const overNote = !sameLane && wip.level === 'over' ? ` ${toName} is now ${wip.over} over its limit of ${wip.limit}.` : '';
    const moved = sameLane ? `reordered in ${toName}` : `moved to ${toName}`;
    Toast.show(`${Model.cardKey(p, target)} ${moved}.${overNote}`, { undo: true });
    commit();
    return true;
  }

  function stepCard(cardId, direction) {
    const p = project();
    const at = Model.locate(p, cardId);
    const column = Model.columnById(p, at.columnId);
    const step = Model.stepTarget(column, cardId, direction, (id) => App.isVisible(p, id));
    if (step) moveCard(cardId, column.id, step.before);
  }

  // --- Archive and delete ----------------------------------------------------------------

  function putInArchive(p, cardId) {
    const target = p.cards[cardId];
    const at = Model.detachCard(p, cardId);
    const columnName = nameOfColumn(p, at.columnId);
    target.archivedFrom = { columnId: at.columnId, columnName, at: new Date().toISOString() };
    p.archive.unshift(cardId);
    Model.logActivity(target, `Archived from ${columnName}`);
    return at;
  }

  function archiveCard(cardId) {
    const p = project();
    const target = card(cardId);
    const at = putInArchive(p, cardId);
    App.closeCardIfOpen(cardId);
    Undo.push(`archive ${Model.cardKey(p, target)}`, p.id, () => {
      Model.detachCard(p, cardId);
      Model.placeCard(p, cardId, at.columnId, at.index);
      target.archivedFrom = null;
      Model.logActivity(target, 'Archive undone');
    });
    Toast.show(`${Model.cardKey(p, target)} archived.`, { undo: true });
    commit();
  }

  function restoreCard(cardId) {
    const p = project();
    const target = card(cardId);
    const archiveIndex = p.archive.indexOf(cardId);
    const previousFrom = target.archivedFrom;
    const original = target.archivedFrom && Model.columnById(p, target.archivedFrom.columnId);
    const lane = original || p.columns[0];
    p.archive.splice(archiveIndex, 1);
    lane.cardIds.push(cardId);
    target.archivedFrom = null;
    Model.logActivity(target, `Restored to ${lane.name}`);
    Undo.push(`restore ${Model.cardKey(p, target)}`, p.id, () => {
      Model.detachCard(p, cardId);
      p.archive.splice(archiveIndex, 0, cardId);
      target.archivedFrom = previousFrom;
      Model.logActivity(target, 'Restore undone, back in the archive');
    });
    Toast.show(`${Model.cardKey(p, target)} restored to ${lane.name}.`, { undo: true });
    commit();
  }

  function deleteCard(cardId) {
    const p = project();
    const target = card(cardId);
    const key = Model.cardKey(p, target);
    const at = Model.detachCard(p, cardId);
    delete p.cards[cardId];
    App.closeCardIfOpen(cardId);
    Undo.push(`delete ${key}`, p.id, () => {
      p.cards[cardId] = target;
      if (at.archived) p.archive.splice(at.index, 0, cardId);
      else Model.placeCard(p, cardId, at.columnId, at.index);
      Model.logActivity(target, 'Delete undone');
    });
    Toast.show(`${key} deleted.`, { undo: true });
    commit();
  }

  // --- Lanes -----------------------------------------------------------------------------

  function addColumn({ name, limit, isDone }) {
    const p = project();
    const column = { id: Model.uid('col'), name, limit, isDone, cardIds: [] };
    p.columns.push(column);
    Undo.push(`add lane ${name}`, p.id, () => { p.columns.splice(p.columns.indexOf(column), 1); });
    Toast.show(`Lane "${name}" added.`, { undo: true });
    commit();
  }

  function updateColumn(columnId, { name, limit, isDone }) {
    Object.assign(Model.columnById(project(), columnId), { name, limit, isDone });
    commit();
  }

  function moveColumn(columnId, beforeColumnId) {
    const p = project();
    const column = Model.columnById(p, columnId);
    const result = Model.moveColumn(p, columnId, beforeColumnId);
    if (!result.changed) { App.render(); return false; }
    Undo.push(`move lane ${column.name}`, p.id, () => {
      p.columns.splice(p.columns.indexOf(column), 1);
      p.columns.splice(result.from, 0, column);
    });
    Toast.show(`Lane "${column.name}" moved.`, { undo: true });
    commit();
    return true;
  }

  function stepColumn(columnId, delta) {
    const columns = project().columns;
    const index = columns.findIndex((c) => c.id === columnId);
    const passed = index + delta;
    if (passed < 0 || passed >= columns.length) return;
    const before = delta < 0 ? columns[passed] : columns[passed + 1];
    moveColumn(columnId, before ? before.id : null);
  }

  // `destination` is a lane id to receive the cards, or "archive". Empty lanes pass null.
  function deleteColumn(columnId, destination) {
    const p = project();
    const index = p.columns.findIndex((c) => c.id === columnId);
    const column = p.columns[index];
    const cardIds = column.cardIds.slice();
    if (destination === 'archive') {
      cardIds.forEach((id) => putInArchive(p, id));
    } else if (destination) {
      column.cardIds = [];
      Model.columnById(p, destination).cardIds.push(...cardIds);
      cardIds.forEach((id) => Model.logActivity(p.cards[id], `Moved to ${nameOfColumn(p, destination)} when ${column.name} was deleted`));
    }
    p.columns.splice(index, 1);
    Undo.push(`delete lane ${column.name}`, p.id, () => {
      cardIds.forEach((id) => {
        Model.detachCard(p, id);
        p.cards[id].archivedFrom = null;
      });
      column.cardIds = cardIds;
      p.columns.splice(index, 0, column);
    });
    Toast.show(`Lane "${column.name}" deleted.`, { undo: true });
    commit();
  }

  // --- Projects --------------------------------------------------------------------------

  function addProject(name) {
    const s = state();
    const id = Model.uid('p');
    const key = Model.deriveKey(name, s.projects.map((p) => p.key));
    const lane = (laneName, limit, isDone) => ({ id: Model.uid('col'), name: laneName, limit, isDone, cardIds: [] });
    const created = { id, name, key, nextNumber: 1, columns: [lane('To do', null, false), lane('Doing', 3, false), lane('Done', null, true)], archive: [], cards: {} };
    const previousId = project().id;
    s.projects.push(created);
    App.openProject(id);
    Undo.push(`add project ${name}`, previousId, () => { s.projects.splice(s.projects.indexOf(created), 1); });
    Toast.show(`Project "${name}" created.`, { undo: true });
    commit();
  }

  function renameProject(projectId, name) {
    Model.projectById(state(), projectId).name = name;
    commit();
  }

  function deleteProject(projectId) {
    const s = state();
    if (s.projects.length < 2) return;
    const index = s.projects.findIndex((p) => p.id === projectId);
    const [removed] = s.projects.splice(index, 1);
    App.openProject(s.projects[Math.max(0, index - 1)].id);
    Undo.push(`delete project ${removed.name}`, removed.id, () => { s.projects.splice(index, 0, removed); });
    Toast.show(`Project "${removed.name}" deleted.`, { undo: true });
    commit();
  }

  // --- Team and labels -------------------------------------------------------------------

  function nextColor(list) {
    return Model.COLORS.find((c) => !list.some((item) => item.color === c)) || Model.COLORS[list.length % Model.COLORS.length];
  }

  function addListEntry(listName, name) {
    const list = state()[listName];
    list.push({ id: Model.uid('m'), name, color: nextColor(list) });
    commit();
  }

  function updateListEntry(listName, id, patch) {
    Object.assign(state()[listName].find((entry) => entry.id === id), patch);
    commit();
  }

  function removeMember(memberId) {
    const s = state();
    const index = s.team.findIndex((m) => m.id === memberId);
    const [member] = s.team.splice(index, 1);
    const affected = s.projects.flatMap((p) => Object.values(p.cards).filter((c) => c.assigneeId === memberId));
    affected.forEach((c) => { c.assigneeId = null; Model.logActivity(c, `Unassigned because ${member.name} left the team list`); });
    App.clearFilterValue('assigneeId', memberId);
    Undo.push(`remove ${member.name}`, null, () => {
      s.team.splice(index, 0, member);
      affected.forEach((c) => { c.assigneeId = memberId; Model.logActivity(c, `Assigned to ${member.name} again`); });
    });
    Toast.show(`${member.name} removed from the team. ${affected.length} ${affected.length === 1 ? 'card' : 'cards'} unassigned.`, { undo: true });
    commit();
  }

  function removeLabel(labelId) {
    const s = state();
    const index = s.labels.findIndex((l) => l.id === labelId);
    const [label] = s.labels.splice(index, 1);
    const affected = s.projects.flatMap((p) => Object.values(p.cards).filter((c) => c.labelIds.includes(labelId)));
    const positions = affected.map((c) => c.labelIds.indexOf(labelId));
    affected.forEach((c) => { c.labelIds = c.labelIds.filter((l) => l !== labelId); });
    App.clearFilterValue('labelId', labelId);
    Undo.push(`remove label ${label.name}`, null, () => {
      s.labels.splice(index, 0, label);
      affected.forEach((c, i) => c.labelIds.splice(positions[i], 0, labelId));
    });
    Toast.show(`Label "${label.name}" removed.`, { undo: true });
    commit();
  }

  // --- Whole workspace -------------------------------------------------------------------

  // Reset and import replace everything, so older undo entries no longer apply.
  function replaceWorkspace(next, message) {
    const previous = state();
    const previousProject = project().id;
    Undo.clear();
    App.setState(next);
    Undo.push('replace workspace', previousProject, () => App.setState(previous));
    Toast.show(message, { undo: true });
    commit();
  }

  const resetDemo = () => replaceWorkspace(Seed.build(), 'Demo data restored.');
  const importWorkspace = (next) => replaceWorkspace(next, `Imported ${next.projects.length} ${next.projects.length === 1 ? 'project' : 'projects'}.`);

  function exportWorkspace() {
    const name = Store.exportFile(state());
    Toast.show(`Saved ${name}.`);
  }

  function undo() {
    const entry = Undo.pop();
    if (!entry) return;
    entry.revert();
    App.afterUndo(entry.projectId);
    Toast.show(`Undid ${entry.label}.`);
    commit();
  }

  return {
    createCard, updateCard, toggleLabel, addChecklistItem, toggleChecklistItem, renameChecklistItem, removeChecklistItem, addNote,
    moveCard, stepCard, archiveCard, restoreCard, deleteCard, addColumn, updateColumn, moveColumn, stepColumn, deleteColumn,
    addProject, renameProject, deleteProject, addListEntry, updateListEntry, removeMember, removeLabel, resetDemo, importWorkspace,
    exportWorkspace, undo,
  };
})();
