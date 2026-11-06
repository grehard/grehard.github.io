// Focus view: the countdown ring and the session settings.
(function (HG) {
  'use strict';
  const { h, s, icon } = HG;
  const T = HG.time;
  const RING_RADIUS = 104;
  const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
  const PRESETS = [[25, 5], [50, 10], [90, 20]];
  let ring = null;

  function numberField(label, id, value, min, max, disabled) {
    return HG.ui.field(label, h('input', { type: 'number', id, value, min, max, step: 1, inputmode: 'numeric', disabled }));
  }

  function readInt(id) {
    const raw = document.getElementById(id).value;
    return /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
  }

  function startFromForm(errorNode) {
    const workMin = readInt('focus-work');
    const breakMin = readInt('focus-break');
    const rounds = readInt('focus-rounds');
    if (!(workMin >= 1 && workMin <= 180)) return HG.ui.setError(errorNode, 'Work length must be a whole number from 1 to 180 minutes.');
    if (!(breakMin >= 1 && breakMin <= 60)) return HG.ui.setError(errorNode, 'Break length must be a whole number from 1 to 60 minutes.');
    if (!(rounds >= 1 && rounds <= 12)) return HG.ui.setError(errorNode, 'Rounds must be a whole number from 1 to 12.');
    HG.ui.setError(errorNode, '');
    HG.focus.start({ workMin, breakMin, rounds });
    return null;
  }

  function buildRing() {
    const progress = s('circle', { cx: 120, cy: 120, r: RING_RADIUS, class: 'ring-progress', 'stroke-dasharray': RING_LENGTH.toFixed(2), transform: 'rotate(-90 120 120)' });
    const time = h('div', { class: 'ring-time', id: 'focus-remaining', role: 'timer' });
    const phase = h('div', { class: 'ring-phase', id: 'focus-phase' });
    const round = h('div', { class: 'ring-round', id: 'focus-round' });
    ring = { progress, time, phase, round };
    return h('div', { class: 'ring' },
      s('svg', { viewBox: '0 0 240 240', class: 'ring-svg', 'aria-hidden': 'true' },
        s('circle', { cx: 120, cy: 120, r: RING_RADIUS, class: 'ring-track' }), progress),
      h('div', { class: 'ring-center' }, phase, time, round));
  }

  /** Updates the ring from timestamps. Called on each tick while this view is showing. */
  function tick(now) {
    if (!ring || !ring.progress.isConnected) return;
    const { state } = HG.store;
    const f = state.focus;
    const s_ = state.settings;
    if (!f) {
      ring.time.textContent = T.countdown(s_.focusWork * T.MIN);
      ring.phase.textContent = 'Ready';
      ring.round.textContent = `${s_.focusRounds} ${s_.focusRounds === 1 ? 'round' : 'rounds'}`;
      ring.progress.setAttribute('stroke-dashoffset', '0');
      ring.progress.classList.remove('is-break');
      return;
    }
    const left = HG.focus.remaining(now);
    ring.time.textContent = T.countdown(left);
    ring.phase.textContent = f.phase === 'work' ? 'Focus' : 'Break';
    ring.round.textContent = `Round ${f.round} of ${f.rounds}`;
    ring.progress.setAttribute('stroke-dashoffset', (RING_LENGTH * (1 - left / HG.focus.phaseLength(f))).toFixed(2));
    ring.progress.classList.toggle('is-break', f.phase === 'break');
  }

  function todaysFocus(state) {
    const today = T.today();
    return state.entries.filter((e) => e.focus && HG.calc.touchesDay(e, today));
  }

  function render() {
    const { state } = HG.store;
    const active = HG.focus.isActive();
    const f = state.focus;
    const st = state.settings;
    const error = HG.ui.fieldError();
    const task = state.task.description.trim();
    const done = todaysFocus(state);
    const doneMs = done.reduce((sum, e) => sum + HG.calc.msInDay(e, T.today()), 0);
    const maps = HG.calc.lookups(state);
    const project = maps.project.get(state.task.projectId);

    const controls = active
      ? [
        h('button', { type: 'button', class: 'btn', id: 'focus-skip', onclick: () => HG.focus.skip() }, icon('skip'), f.phase === 'work' ? 'Skip to break' : 'Skip break'),
        h('button', { type: 'button', class: 'btn btn-quiet-danger', id: 'focus-end', onclick: () => HG.focus.end() }, icon('stop'), 'End session'),
      ]
      : [h('button', { type: 'button', class: 'btn btn-primary btn-large', id: 'focus-start', onclick: () => startFromForm(error) }, icon('play'), 'Start focus session')];

    const presetButtons = PRESETS.map(([w, b]) => h('button', {
      type: 'button', class: 'chip', disabled: active, 'aria-pressed': String(st.focusWork === w && st.focusBreak === b),
      onclick: () => { document.getElementById('focus-work').value = w; document.getElementById('focus-break').value = b; HG.store.commit((x) => { x.settings.focusWork = w; x.settings.focusBreak = b; }); },
    }, `${w} / ${b}`));

    const node = h('div', { class: 'focus-view' },
      h('section', { class: 'panel focus-main' },
        buildRing(),
        h('p', { class: 'focus-task', id: 'focus-task' },
          task ? task : 'No task named. Describe it in the timer bar above.',
          project && ` · ${project.name}`),
        h('div', { class: 'focus-controls' }, controls),
        error),
      h('section', { class: 'panel focus-side' },
        h('h1', null, 'Focus session'),
        h('p', { class: 'hint' }, 'Work intervals run the timer and land on your timeline as separate entries. Breaks are not tracked.'),
        h('div', { class: 'label' }, 'Presets, work / break'),
        h('div', { class: 'chips' }, presetButtons),
        h('div', { class: 'form-grid form-grid-3' },
          numberField('Work (min)', 'focus-work', active ? f.workMin : st.focusWork, 1, 180, active),
          numberField('Break (min)', 'focus-break', active ? f.breakMin : st.focusBreak, 1, 60, active),
          numberField('Rounds', 'focus-rounds', active ? f.rounds : st.focusRounds, 1, 12, active)),
        h('div', { class: 'sound-row' },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'focus-sound', checked: st.sound, onchange: (e) => HG.store.commit((x) => { x.settings.sound = e.target.checked; }) }), 'Sound at phase changes'),
          h('button', { type: 'button', class: 'btn', id: 'focus-test-sound', onclick: () => {
            HG.audio.unlock();
            if (!HG.audio.play('test', { sound: true, volume: HG.store.state.settings.volume })) HG.ui.toast('Sound is unavailable in this browser, or the volume is at zero.');
          } }, icon('sound'), 'Test sound')),
        HG.ui.field('Volume', h('input', { type: 'range', id: 'focus-volume', min: 0, max: 100, step: 5, value: st.volume, onchange: (e) => HG.store.commit((x) => { x.settings.volume = Number(e.target.value); }) })),
        h('div', { class: 'focus-today' },
          h('span', { class: 'stat-label' }, 'Focus today'),
          h('span', { class: 'stat-value', id: 'focus-today' }, `${done.length} ${done.length === 1 ? 'interval' : 'intervals'} · ${T.duration(doneMs)}`))));
    node.mount = () => tick(Date.now());
    return node;
  }

  HG.views = HG.views || {};
  HG.views.focus = { render, tick };
})(window.HG);
