// Create and edit entries. End time earlier than start means "next day", the usual case for late work.
(function (HG) {
  'use strict';
  const { h, icon } = HG;
  const T = HG.time;
  const MAX_DAYS = 7;

  function deleteEntry(entry) {
    HG.ui.undoable(`Deleted "${entry.description || 'Untitled entry'}"`, (s) => {
      s.entries = s.entries.filter((e) => e.id !== entry.id);
    });
  }

  /** Entries to warn about. The running timer counts too, since it's occupying the time up to now. */
  function occupied(state) {
    const list = state.entries.slice();
    if (state.timerStart !== null) {
      list.push({ id: '__timer', description: state.task.description || 'Running timer', start: state.timerStart, end: Date.now() });
    }
    return list;
  }

  function overlapMessage(hits) {
    const shown = hits.slice(0, 3).map((hit) => {
      const name = hit.entry.description || 'Untitled entry';
      return `"${name}" ${T.timeOfDay(hit.entry.start)} to ${T.timeOfDay(hit.entry.end)} by ${T.duration(hit.ms)}`;
    });
    const more = hits.length > 3 ? ` and ${hits.length - 3} more` : '';
    return `Overlaps ${shown.join(', ')}${more}. You can still save it.`;
  }

  /**
   * Opens the entry form. Pass entry to edit, or defaults ({ start, end }) to create.
   * Seconds from a timer are kept unless the user actually changes that time.
   */
  function open({ entry, defaults } = {}) {
    const { state } = HG.store;
    const isEdit = !!entry;
    const baseStart = isEdit ? entry.start : defaults.start;
    const baseEnd = isEdit ? entry.end : defaults.end;
    const draft = {
      tagIds: isEdit ? entry.tagIds.slice() : (defaults.tagIds || []),
    };

    const description = h('input', { type: 'text', id: 'entry-description', maxlength: 300, value: isEdit ? entry.description : (defaults.description || ''), placeholder: 'What did you work on?' });
    const project = HG.ui.projectSelect(state, isEdit ? entry.projectId : (defaults.projectId || null), { id: 'entry-project' });
    const billable = h('input', { type: 'checkbox', id: 'entry-billable', checked: isEdit ? entry.billable : (defaults.billable !== undefined ? defaults.billable : state.settings.defaultBillable) });
    const startDate = h('input', { type: 'date', id: 'entry-date', value: T.dayKey(baseStart) });
    const startTime = h('input', { type: 'time', id: 'entry-start', value: T.timeOfDay(baseStart) });
    const endDate = h('input', { type: 'date', id: 'entry-end-date', value: T.dayKey(baseEnd) });
    const endTime = h('input', { type: 'time', id: 'entry-end', value: T.timeOfDay(baseEnd) });
    const summary = h('output', { class: 'entry-summary', id: 'entry-duration' });
    const warning = h('div', { class: 'overlap-warning', id: 'entry-overlap', hidden: true, role: 'status' });
    const error = HG.ui.fieldError();
    let endDateTouched = T.dayKey(baseEnd) !== expectedEndDate(T.dayKey(baseStart), T.timeOfDay(baseStart), T.timeOfDay(baseEnd));

    function expectedEndDate(dateValue, fromTime, toTime) {
      return toTime <= fromTime ? T.addDays(dateValue, 1) : dateValue;
    }

    function instants() {
      const keepStart = startDate.value === T.dayKey(baseStart) && startTime.value === T.timeOfDay(baseStart);
      const keepEnd = endDate.value === T.dayKey(baseEnd) && endTime.value === T.timeOfDay(baseEnd);
      return {
        start: keepStart ? baseStart : T.combine(startDate.value, startTime.value),
        end: keepEnd ? baseEnd : T.combine(endDate.value, endTime.value),
      };
    }

    function refresh() {
      if (!endDateTouched && startDate.value && startTime.value && endTime.value) {
        endDate.value = expectedEndDate(startDate.value, startTime.value, endTime.value);
      }
      const { start, end } = instants();
      const valid = Number.isFinite(start) && Number.isFinite(end) && end > start;
      const crosses = valid && T.dayKey(start) !== T.dayKey(end);
      summary.textContent = valid ? `Duration ${T.duration(end - start)}${crosses ? ` · ends ${T.shortDate(T.dayKey(end))}` : ''}` : 'Duration 0:00';
      const hits = valid ? HG.calc.overlapsWith({ id: isEdit ? entry.id : null, start, end }, occupied(HG.store.state)) : [];
      warning.hidden = !hits.length;
      warning.replaceChildren(...(hits.length ? [icon('warn'), h('span', null, overlapMessage(hits))] : []));
    }

    function validate(start, end) {
      if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Enter a date, a start time and an end time.';
      if (end <= start) return 'The end has to be after the start.';
      if (end - start > MAX_DAYS * 24 * T.HOUR) return `An entry can't be longer than ${MAX_DAYS} days.`;
      return '';
    }

    function save() {
      const { start, end } = instants();
      const problem = validate(start, end);
      HG.ui.setError(error, problem);
      if (problem) return;
      const before = HG.budget.alerts(HG.store.state, start);
      const record = {
        id: isEdit ? entry.id : HG.store.newId('e'), description: description.value.trim(), projectId: project.value || null,
        tagIds: draft.tagIds, billable: billable.checked, start, end, focus: isEdit ? entry.focus : false,
      };
      HG.ui.closeModal();
      HG.store.commit((s) => {
        if (isEdit) s.entries = s.entries.map((e) => (e.id === entry.id ? record : e));
        else s.entries.push(record);
      });
      HG.ui.toast(isEdit ? 'Entry updated' : 'Entry added');
      HG.timer.announceBudgets(before);
    }

    project.addEventListener('change', () => {
      const chosen = HG.store.state.projects.find((p) => p.id === project.value);
      if (chosen) billable.checked = chosen.billable;
    });
    [startDate, startTime, endTime].forEach((input) => input.addEventListener('input', refresh));
    endDate.addEventListener('input', () => { endDateTouched = true; refresh(); });

    const form = h('form', { class: 'form-grid form-grid-4', id: 'entry-form', onsubmit: (e) => { e.preventDefault(); save(); } },
      HG.ui.field('Description', description, { className: 'span-4' }),
      HG.ui.field('Project', project, { className: 'span-2' }),
      h('label', { class: 'check billable-check span-2' }, billable, 'Billable'),
      h('div', { class: 'field span-4' }, h('span', { class: 'label' }, 'Tags'), HG.ui.tagChips(state, draft.tagIds, (ids) => { draft.tagIds = ids; })),
      HG.ui.field('Date', startDate),
      HG.ui.field('Start', startTime),
      HG.ui.field('End date', endDate),
      HG.ui.field('End', endTime),
      h('div', { class: 'span-4' }, summary, h('span', { class: 'hint entry-hint' }, 'An end time before the start moves to the next day.')),
      h('div', { class: 'span-4' }, warning),
      h('div', { class: 'span-4' }, error),
      h('button', { type: 'submit', hidden: true, tabindex: '-1', 'aria-hidden': 'true' }));

    const footer = [
      isEdit && h('button', { type: 'button', class: 'btn btn-quiet-danger foot-left', id: 'entry-delete', onclick: () => { HG.ui.closeModal(); deleteEntry(entry); } }, icon('trash'), 'Delete'),
      isEdit && h('button', { type: 'button', class: 'btn', id: 'entry-split', onclick: () => HG.splitForm.open(entry) }, icon('split'), 'Split'),
      h('button', { type: 'button', class: 'btn', onclick: HG.ui.closeModal }, 'Cancel'),
      h('button', { type: 'button', class: 'btn btn-primary', id: 'entry-save', onclick: save }, isEdit ? 'Save changes' : 'Add entry'),
    ];
    refresh();
    HG.ui.showModal({ title: isEdit ? 'Edit entry' : 'Add entry', body: form, footer, focus: description });
  }

  function suggestSlot(dayKey) {
    const base = T.dayStart(dayKey);
    const isToday = dayKey === T.today();
    const end = isToday ? Math.floor(Date.now() / T.MIN) * T.MIN : base + 10 * T.HOUR;
    const start = isToday ? Math.max(base, end - T.HOUR) : base + 9 * T.HOUR;
    return end > start ? { start, end } : { start: base + 9 * T.HOUR, end: base + 10 * T.HOUR };
  }

  HG.entryForm = { open, deleteEntry, suggestSlot };
})(window.HG);
