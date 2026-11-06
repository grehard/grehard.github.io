// Modal forms for creating and editing cards, lanes and projects.
const Forms = (() => {
  const { h, select } = Dom;
  const MAX_TITLE = 300;

  function field(labelText, control, hint) {
    const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const wrapper = h('label', { class: 'field' }, h('span', { class: 'field-label' }, labelText), control, hint ? h('span', { class: 'field-hint' }, hint) : null, error);
    wrapper.setError = (message) => {
      error.textContent = message || '';
      error.hidden = !message;
      control.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (message) control.focus();
    };
    return wrapper;
  }

  function actionsRow(submitLabel, extra) {
    return h('div', { class: 'form-actions' }, extra || null,
      h('button', { type: 'button', class: 'btn', onClick: Modal.close }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel));
  }

  function memberOptions(state) {
    return [{ value: '', label: 'Unassigned' }, ...state.team.map((m) => ({ value: m.id, label: m.name }))];
  }

  function priorityOptions() {
    return Model.PRIORITIES.map((p) => ({ value: p.id, label: p.label }));
  }

  function openCard({ columnId, due } = {}) {
    const state = App.getState();
    const project = App.project();
    const startLane = columnId || project.columns[0].id;
    const title = h('input', { type: 'text', id: 'new-card-title', maxlength: MAX_TITLE, autocomplete: 'off', 'data-autofocus': true });
    const lane = select(project.columns.map((c) => ({ value: c.id, label: c.name })), startLane, { id: 'new-card-lane' });
    const assignee = select(memberOptions(state), '', { id: 'new-card-assignee' });
    const priority = select(priorityOptions(), 'medium', { id: 'new-card-priority' });
    const dueInput = h('input', { type: 'date', id: 'new-card-due', value: due || '' });
    const titleField = field('Title', title);

    const submit = (event) => {
      event.preventDefault();
      const text = title.value.trim();
      if (!text) { titleField.setError('Enter a title for the card.'); return; }
      Modal.close();
      Actions.createCard({ title: text, columnId: lane.value, assigneeId: assignee.value, priority: priority.value, due: dueInput.value });
    };
    Modal.open({
      title: 'Add card',
      render: (body) => body.replaceChildren(h('form', { class: 'form', novalidate: true, onSubmit: submit },
        titleField,
        h('div', { class: 'form-grid' }, field('Lane', lane), field('Assignee', assignee), field('Priority', priority), field('Due date', dueInput)),
        actionsRow('Add card'))),
    });
  }

  function openLane(columnId) {
    const existing = columnId ? Model.columnById(App.project(), columnId) : null;
    const name = h('input', { type: 'text', id: 'lane-name', maxlength: 80, autocomplete: 'off', value: existing ? existing.name : '', 'data-autofocus': true });
    const limit = h('input', { type: 'text', id: 'lane-limit', inputmode: 'numeric', autocomplete: 'off', value: existing && existing.limit ? existing.limit : '' });
    const isDone = h('input', { type: 'checkbox', id: 'lane-done', checked: existing ? existing.isDone : false });
    const nameField = field('Lane name', name);
    const limitField = field('Work-in-progress limit', limit, 'Leave empty for no limit. Going over the limit is allowed and clearly marked.');

    const submit = (event) => {
      event.preventDefault();
      nameField.setError('');
      limitField.setError('');
      const parsed = Model.parseLimit(limit.value);
      if (!parsed.ok) limitField.setError(parsed.error);
      if (!name.value.trim()) nameField.setError('Enter a name for the lane.');
      if (!parsed.ok || !name.value.trim()) return;
      const values = { name: name.value.trim(), limit: parsed.value, isDone: isDone.checked };
      Modal.close();
      if (existing) Actions.updateColumn(existing.id, values);
      else Actions.addColumn(values);
    };
    Modal.open({
      title: existing ? 'Edit lane' : 'Add lane',
      render: (body) => body.replaceChildren(h('form', { class: 'form', novalidate: true, onSubmit: submit },
        nameField, limitField,
        h('label', { class: 'check-field' }, isDone, h('span', null, 'Cards here are finished, so they never count as overdue')),
        actionsRow(existing ? 'Save lane' : 'Add lane'))),
    });
  }

  function openDeleteLane(columnId) {
    const project = App.project();
    const column = Model.columnById(project, columnId);
    if (!column.cardIds.length) { Actions.deleteColumn(columnId, null); return; }
    const count = column.cardIds.length;
    const others = project.columns.filter((c) => c.id !== columnId);
    const options = [...others.map((c) => ({ value: c.id, label: `Move to ${c.name}` })), { value: 'archive', label: 'Archive them' }];
    const destination = select(options, options[0].value, { id: 'lane-delete-destination' });
    const submit = (event) => {
      event.preventDefault();
      const value = destination.value;
      Modal.close();
      Actions.deleteColumn(columnId, value);
    };
    Modal.open({
      title: `Delete lane "${column.name}"`,
      render: (body) => body.replaceChildren(h('form', { class: 'form', onSubmit: submit },
        h('p', null, `This lane holds ${count} ${count === 1 ? 'card' : 'cards'}. Choose what happens to ${count === 1 ? 'it' : 'them'}.`),
        field('Cards in this lane', destination),
        actionsRow('Delete lane'))),
    });
  }

  function openProject(projectId) {
    const state = App.getState();
    const existing = projectId ? Model.projectById(state, projectId) : null;
    const name = h('input', { type: 'text', id: 'project-name', maxlength: 120, autocomplete: 'off', value: existing ? existing.name : '', 'data-autofocus': true });
    const nameField = field('Project name', name, existing ? null : 'New projects start with To do, Doing and Done lanes. You can change them afterwards.');
    const submit = (event) => {
      event.preventDefault();
      const text = name.value.trim();
      if (!text) { nameField.setError('Enter a name for the project.'); return; }
      const taken = state.projects.some((p) => p !== existing && p.name.toLowerCase() === text.toLowerCase());
      if (taken) { nameField.setError('Another project already has this name.'); return; }
      Modal.close();
      if (existing) Actions.renameProject(existing.id, text);
      else Actions.addProject(text);
    };
    Modal.open({
      title: existing ? 'Rename project' : 'New project',
      render: (body) => body.replaceChildren(h('form', { class: 'form', novalidate: true, onSubmit: submit }, nameField, actionsRow(existing ? 'Save name' : 'Create project'))),
    });
  }

  return { field, openCard, openLane, openDeleteLane, openProject, memberOptions, priorityOptions, MAX_TITLE };
})();
