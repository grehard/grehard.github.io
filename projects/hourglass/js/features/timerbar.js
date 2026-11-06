// The always-visible bar: what you're working on, the running clock and the start/stop button.
// It is built once and synced, so re-renders never disturb a field the user is typing in.
(function (HG) {
  'use strict';
  const { h, icon } = HG;
  const T = HG.time;
  const LONG_RUN_HOURS = 12;
  const refs = {};

  const editTask = (change) => HG.store.commitQuiet((s) => change(s.task));

  function onDescription(event) {
    editTask((task) => { task.description = event.target.value.slice(0, 300); });
  }

  function onProject(event) {
    const projectId = event.target.value || null;
    const project = HG.store.state.projects.find((p) => p.id === projectId);
    HG.store.commit((s) => {
      s.task.projectId = projectId;
      if (project) s.task.billable = project.billable;
    });
  }

  function closeTagMenu() {
    if (!refs.tagMenu.hidden) {
      refs.tagMenu.hidden = true;
      refs.tagButton.setAttribute('aria-expanded', 'false');
    }
  }

  function toggleTagMenu() {
    const opening = refs.tagMenu.hidden;
    refs.tagMenu.hidden = !opening;
    refs.tagButton.setAttribute('aria-expanded', String(opening));
    if (!opening) return;
    const { state } = HG.store;
    refs.tagMenu.replaceChildren(HG.ui.tagChips(state, state.task.tagIds, (ids) => {
      HG.store.commitQuiet((s) => { s.task.tagIds = ids; });
      syncTags();
    }));
    const first = refs.tagMenu.querySelector('button');
    if (first) first.focus();
  }

  function syncTags() {
    const count = HG.store.state.task.tagIds.length;
    refs.tagCount.textContent = count ? String(count) : '';
    refs.tagButton.setAttribute('aria-label', count ? `Tags, ${count} selected` : 'Tags');
  }

  function openStartEditor() {
    const running = HG.store.state.timerStart;
    const dateInput = h('input', { type: 'date', value: T.dayKey(running), id: 'timer-start-date' });
    const timeInput = h('input', { type: 'time', value: T.timeOfDay(running), id: 'timer-start-time' });
    const error = HG.ui.fieldError();
    const save = () => {
      const unchanged = dateInput.value === T.dayKey(running) && timeInput.value === T.timeOfDay(running);
      const at = HG.time.combine(dateInput.value, timeInput.value);
      if (Number.isNaN(at)) return HG.ui.setError(error, 'Enter a valid date and time.');
      if (at > Date.now()) return HG.ui.setError(error, "The start can't be in the future.");
      HG.ui.closeModal();
      if (!unchanged) HG.timer.setStart(at);
      return null;
    };
    HG.ui.showModal({
      title: 'Change start time',
      body: h('div', { class: 'form-grid' }, HG.ui.field('Start date', dateInput), HG.ui.field('Start time', timeInput), error),
      footer: [
        h('button', { type: 'button', class: 'btn', onclick: HG.ui.closeModal }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, 'Save'),
      ],
    });
  }

  function build() {
    const host = document.getElementById('timerbar');
    refs.description = h('input', { type: 'text', id: 'timer-description', placeholder: 'What are you working on?', maxlength: 300,
      autocomplete: 'off', 'aria-label': 'Task description', oninput: onDescription,
      onkeydown: (e) => { if (e.key === 'Enter' && !HG.timer.isRunning()) { e.preventDefault(); HG.timer.start(); } } });
    refs.project = h('select', { id: 'timer-project', 'aria-label': 'Project', onchange: onProject });
    refs.tagCount = h('span', { class: 'tag-count' });
    refs.tagButton = h('button', { type: 'button', id: 'timer-tags', class: 'icon-btn', 'aria-label': 'Tags', title: 'Tags', 'aria-expanded': 'false', onclick: toggleTagMenu }, icon('tag'), refs.tagCount);
    refs.tagMenu = h('div', { class: 'tag-menu', hidden: true, onkeydown: (e) => { if (e.key === 'Escape') { closeTagMenu(); refs.tagButton.focus(); } } });
    refs.billable = h('button', { type: 'button', id: 'timer-billable', class: 'icon-btn toggle-btn', 'aria-label': 'Billable', title: 'Billable', onclick: () => HG.store.commit((s) => { s.task.billable = !s.task.billable; }) }, icon('dollar'));
    refs.phase = h('span', { class: 'phase-chip', id: 'timer-phase', hidden: true });
    refs.clock = h('span', { class: 'timer-clock', id: 'timer-clock', role: 'timer' }, '0:00:00');
    refs.startEdit = h('button', { type: 'button', class: 'timer-started', id: 'timer-started', onclick: openStartEditor });
    refs.toggle = h('button', { type: 'button', class: 'btn btn-primary timer-toggle', id: 'timer-toggle', onclick: () => {
      if (HG.focus.isActive()) HG.focus.end();
      else if (HG.timer.isRunning()) HG.timer.stop();
      else HG.timer.start();
    } });
    refs.discard = HG.ui.iconButton('trash', 'Discard timer', () => HG.timer.discard(), { id: 'timer-discard' });
    refs.longRun = h('p', { class: 'timer-longrun', id: 'timer-longrun', hidden: true });

    host.append(
      h('div', { class: 'timerbar-task' }, refs.description),
      h('div', { class: 'timerbar-meta' }, refs.project, h('div', { class: 'tag-anchor' }, refs.tagButton, refs.tagMenu), refs.billable),
      h('div', { class: 'timerbar-run' }, refs.phase, h('div', { class: 'timer-readout' }, refs.clock, refs.startEdit), refs.toggle, refs.discard),
      refs.longRun,
    );
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.tag-anchor')) closeTagMenu();
    });
    refs.tagMenu.parentElement.addEventListener('focusout', (e) => {
      if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) closeTagMenu();
    });
  }

  function sync() {
    const { state } = HG.store;
    if (document.activeElement !== refs.description && refs.description.value !== state.task.description) {
      refs.description.value = state.task.description;
    }
    const open = document.activeElement === refs.project;
    if (!open) refs.project.replaceChildren(...HG.ui.projectOptions(state, state.task.projectId).flat().filter(Boolean));
    refs.billable.setAttribute('aria-pressed', String(state.task.billable));
    syncTags();
    const running = HG.timer.isRunning();
    const active = running || !!state.focus;
    refs.toggle.replaceChildren(icon(active ? 'stop' : 'play'), active ? 'Stop' : 'Start');
    refs.toggle.classList.toggle('is-running', active);
    refs.discard.hidden = !running;
    refs.startEdit.hidden = !running || !!state.focus;
    if (running) refs.startEdit.textContent = `from ${T.timeOfDay(state.timerStart)}`;
    if (running) refs.startEdit.setAttribute('aria-label', `Started at ${T.timeOfDay(state.timerStart)}. Change start time`);
    tick(Date.now());
  }

  function titleFor(now) {
    const { state } = HG.store;
    const task = state.task.description.trim();
    const suffix = task ? ` ${task}` : '';
    if (state.focus) {
      const label = state.focus.phase === 'work' ? 'Focus' : 'Break';
      return `${T.countdown(HG.focus.remaining(now))} ${label}${suffix} - Hourglass`;
    }
    if (HG.timer.isRunning()) return `${T.clock(HG.timer.elapsed(now))}${suffix} - Hourglass`;
    return 'Hourglass: time tracking and timesheets';
  }

  /** Called every half second. Only text changes here, so it's cheap. */
  function tick(now) {
    const { state } = HG.store;
    const onBreak = state.focus && state.focus.phase === 'break';
    const text = onBreak ? T.countdown(HG.focus.remaining(now)) : T.clock(HG.timer.elapsed(now));
    if (refs.clock.textContent !== text) refs.clock.textContent = text;
    const title = titleFor(now);
    if (document.title !== title) document.title = title;

    refs.phase.hidden = !state.focus;
    if (state.focus) {
      const label = `${state.focus.phase === 'work' ? 'Focus' : 'Break'} ${state.focus.round}/${state.focus.rounds}`;
      if (refs.phase.textContent !== label) refs.phase.textContent = label;
    }
    const tooLong = HG.timer.isRunning() && HG.timer.elapsed(now) >= LONG_RUN_HOURS * T.HOUR;
    refs.longRun.hidden = !tooLong;
    if (tooLong) refs.longRun.textContent = `This timer has been running for over ${LONG_RUN_HOURS} hours. Stop it, or change its start time if you forgot about it.`;
  }

  HG.timerbar = { build, sync, tick };
})(window.HG);
