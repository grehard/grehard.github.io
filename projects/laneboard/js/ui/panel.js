// Card details beside the board on wide screens, full screen on phones. Fields save when they
// lose focus. The whole panel redraws after each change; App.render restores focus and scroll.
const Panel = (() => {
  const { h, icon, iconButton, select } = Dom;
  const drafts = { cardId: null, checklist: '', note: '' };

  function resetDraftsFor(cardId) {
    if (drafts.cardId === cardId) return;
    drafts.cardId = cardId;
    drafts.checklist = '';
    drafts.note = '';
  }

  function titleField(card) {
    const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
    const input = h('textarea', {
      id: 'card-title', class: 'panel-title', rows: 1, 'data-card-id': card.id, maxlength: Forms.MAX_TITLE, 'aria-label': 'Card title', 'data-fkey': 'panel-title', value: card.title,
      onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
      onChange: (e) => {
        const text = e.target.value.replace(/\s+/g, ' ').trim();
        error.textContent = text ? '' : "A card needs a title. The previous title was kept.";
        error.hidden = !!text;
        if (!text) { e.target.value = card.title; return; }
        Actions.updateCard(card.id, { title: text });
      },
    });
    return [input, error];
  }

  function laneField(project, card, at) {
    if (at.archived) {
      const from = card.archivedFrom ? `Archived from ${card.archivedFrom.columnName}` : 'Archived';
      return h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Lane'), h('span', { class: 'panel-static' }, from));
    }
    const options = project.columns.map((c) => ({ value: c.id, label: c.name }));
    const control = select(options, at.columnId, { id: 'card-lane', 'data-fkey': 'panel-lane', onChange: (e) => Actions.moveCard(card.id, e.target.value, null) });
    return Forms.field('Lane', control);
  }

  function propertyFields(project, state, card, at) {
    const assignee = select(Forms.memberOptions(state), card.assigneeId || '', { id: 'card-assignee', 'data-fkey': 'panel-assignee', onChange: (e) => Actions.updateCard(card.id, { assigneeId: e.target.value || null }) });
    const priority = select(Forms.priorityOptions(), card.priority, { id: 'card-priority', 'data-fkey': 'panel-priority', onChange: (e) => Actions.updateCard(card.id, { priority: e.target.value }) });
    const due = h('input', {
      type: 'date', id: 'card-due', 'data-fkey': 'panel-due', value: card.due || '',
      onChange: (e) => { if (!e.target.value || Dates.isValid(e.target.value)) Actions.updateCard(card.id, { due: e.target.value || null }); },
    });
    return h('div', { class: 'form-grid' }, laneField(project, card, at), Forms.field('Assignee', assignee), Forms.field('Priority', priority), Forms.field('Due date', due));
  }

  function labelsSection(state, card) {
    const options = state.labels.map((label) => h('label', { class: `label-option${card.labelIds.includes(label.id) ? ' is-on' : ''}` },
      h('input', {
        type: 'checkbox', checked: card.labelIds.includes(label.id), 'data-fkey': `panel-label-${label.id}`,
        onChange: (e) => Actions.toggleLabel(card.id, label.id, e.target.checked),
      }),
      h('span', { class: 'label-dot', style: `background:${label.color}` }), label.name));
    return h('section', { class: 'panel-section' },
      h('h3', null, 'Labels'),
      options.length ? h('div', { class: 'label-options' }, options) : h('p', { class: 'muted' }, 'No labels yet.'),
      h('button', { type: 'button', class: 'link-btn panel-minor', 'data-fkey': 'panel-edit-labels', onClick: Editors.openLabels }, 'Edit labels'));
  }

  function descriptionSection(card) {
    return h('section', { class: 'panel-section' },
      h('label', { class: 'field' }, h('span', { class: 'field-label heading-like' }, 'Description'),
        h('textarea', {
          id: 'card-description', rows: 4, 'data-fkey': 'panel-description', placeholder: 'Add the context someone needs to pick this up', value: card.description,
          onChange: (e) => Actions.updateCard(card.id, { description: e.target.value.trim() }),
        })));
  }

  function checklistItem(card, item) {
    return h('li', { class: `check-item${item.done ? ' is-done' : ''}` },
      h('input', { type: 'checkbox', checked: item.done, 'aria-label': `Done: ${item.text}`, 'data-fkey': `check-${item.id}`, onChange: (e) => Actions.toggleChecklistItem(card.id, item.id, e.target.checked) }),
      h('input', {
        type: 'text', class: 'check-text', value: item.text, maxlength: Forms.MAX_TITLE, 'aria-label': 'Checklist item', 'data-fkey': `check-text-${item.id}`,
        onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
        onChange: (e) => {
          const text = e.target.value.trim();
          if (text) Actions.renameChecklistItem(card.id, item.id, text);
          else e.target.value = item.text;
        },
      }),
      iconButton('x', `Remove ${item.text}`, () => Actions.removeChecklistItem(card.id, item.id), { 'data-fkey': `check-remove-${item.id}` }));
  }

  function checklistSection(card) {
    const { done, total, percent } = Model.checklistProgress(card);
    const input = h('input', {
      type: 'text', id: 'check-new', placeholder: 'Add an item', maxlength: Forms.MAX_TITLE, 'aria-label': 'New checklist item', 'data-fkey': 'check-new', value: drafts.checklist,
      onInput: (e) => { drafts.checklist = e.target.value; },
    });
    const submit = (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      drafts.checklist = '';
      Actions.addChecklistItem(card.id, text);
    };
    return h('section', { class: 'panel-section' },
      h('div', { class: 'section-head' }, h('h3', null, 'Checklist'), total ? h('span', { class: 'check-summary' }, `${done} of ${total} (${percent}%)`) : null),
      total ? h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': percent, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Checklist progress' }, h('span', { style: `width:${percent}%` })) : null,
      h('ul', { class: 'check-list' }, card.checklist.map((item) => checklistItem(card, item))),
      h('form', { class: 'inline-form', onSubmit: submit }, input, h('button', { type: 'submit', class: 'btn btn-small', 'aria-label': 'Add checklist item' }, icon('plus', 14), 'Add')));
  }

  function activitySection(card) {
    const input = h('input', {
      type: 'text', id: 'note-new', placeholder: 'Add a note', maxlength: 600, 'aria-label': 'New note', 'data-fkey': 'note-new', value: drafts.note,
      onInput: (e) => { drafts.note = e.target.value; },
    });
    const submit = (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      drafts.note = '';
      Actions.addNote(card.id, text);
    };
    const entries = card.activity.slice().reverse().map((entry) => h('li', { class: 'activity-entry' },
      h('time', { datetime: entry.at }, Dates.formatStamp(entry.at)),
      h('span', { class: 'activity-text' }, entry.text)));
    return h('section', { class: 'panel-section' },
      h('h3', null, 'Activity'),
      h('form', { class: 'inline-form', onSubmit: submit }, input, h('button', { type: 'submit', class: 'btn btn-small' }, 'Save note')),
      h('ol', { class: 'activity' }, entries));
  }

  function footer(card, at) {
    const primary = at.archived
      ? h('button', { type: 'button', class: 'btn', onClick: () => Actions.restoreCard(card.id) }, icon('undo', 14), 'Restore')
      : h('button', { type: 'button', class: 'btn', onClick: () => Actions.archiveCard(card.id) }, icon('archive', 14), 'Archive');
    return h('footer', { class: 'panel-foot' }, primary,
      h('button', { type: 'button', class: 'btn btn-danger', onClick: () => Actions.deleteCard(card.id) }, icon('trash', 14), 'Delete'));
  }

  // A redraw replaces the panel's fields, so text typed but not yet blurred is saved first.
  function saveOpenEdits(cardId) {
    const title = document.getElementById('card-title');
    if (!cardId || !title || title.dataset.cardId !== cardId) return;
    const description = document.getElementById('card-description');
    const patch = { description: description.value.trim() };
    const titleText = title.value.replace(/\s+/g, ' ').trim();
    if (titleText) patch.title = titleText;
    Actions.updateCard(cardId, patch);
  }

  function render(element, ctx) {
    const { project, state, ui, today } = ctx;
    const card = ui.cardId ? project.cards[ui.cardId] : null;
    element.hidden = !card;
    document.body.classList.toggle('panel-open', !!card);
    if (!card) { element.replaceChildren(); resetDraftsFor(null); return; }
    resetDraftsFor(card.id);
    const at = Model.locate(project, card.id);
    const key = Model.cardKey(project, card);
    element.setAttribute('aria-label', `Card ${key}`);
    const overdue = Model.isOverdue(project, card, today);
    element.replaceChildren(
      h('div', { class: 'panel-head' },
        h('span', { class: 'card-key' }, key),
        at.archived ? h('span', { class: 'status-pill' }, 'Archived') : null,
        overdue ? h('span', { class: 'status-pill is-overdue' }, icon('alert', 13), 'Overdue') : null,
        iconButton('x', 'Close details', () => App.closeCard(), { class: 'panel-close', 'data-fkey': 'panel-close' })),
      h('div', { class: 'panel-body', 'data-scroll-key': 'panel' },
        titleField(card),
        propertyFields(project, state, card, at),
        labelsSection(state, card),
        descriptionSection(card),
        checklistSection(card),
        activitySection(card)),
      footer(card, at));
  }

  return { render, saveOpenEdits };
})();
