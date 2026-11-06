// Today: what needs doing, grouped by time of day, with one-tap completion and a quick log.
(function (R) {
  'use strict';
  const { h, svg, icon, iconButton } = R.dom;
  const D = R.Dates;
  const Sel = R.Select;
  const Store = R.Store;

  const GROUPS = [
    { key: 'morning', label: 'Morning', icon: 'sunrise' },
    { key: 'afternoon', label: 'Afternoon', icon: 'noon' },
    { key: 'evening', label: 'Evening', icon: 'moon' },
  ];
  const LISTED = ['due', 'partial', 'done', 'skipped'];

  /** A ring that fills with progress, a check when complete, a skip arrow when skipped. */
  function completionButton(habit, status, today) {
    const entry = Store.logFor(habit.id)[today];
    const value = entry && !entry.skipped ? entry.value : 0;
    const progress = Math.min(1, value / R.Streaks.goal(habit));
    const R_RING = 13;
    const circumference = 2 * Math.PI * R_RING;
    const ring = svg('svg', { class: 'ring', viewBox: '0 0 32 32', width: 32, height: 32, 'aria-hidden': 'true' },
      svg('circle', { class: 'ring-track', cx: 16, cy: 16, r: R_RING }),
      status === 'partial' ? svg('circle', { class: 'ring-fill', cx: 16, cy: 16, r: R_RING,
        'stroke-dasharray': `${circumference * progress} ${circumference}`, transform: 'rotate(-90 16 16)' }) : null);
    const glyph = status === 'done' ? icon('check', 18) : status === 'skipped' ? icon('skip', 16) : null;
    return h('button', {
      type: 'button',
      class: `tick tick-${status}`,
      'aria-pressed': status === 'done' ? 'true' : 'false',
      'aria-label': status === 'done' ? `Undo ${habit.name}` : `Complete ${habit.name}`,
      data: { fk: `tick-${habit.id}` },
      onClick: () => Store.toggleDone(habit.id, today),
    }, ring, glyph);
  }

  function quickLog(habit, today) {
    const { unit } = habit.target;
    const entry = Store.logFor(habit.id)[today];
    const value = entry && !entry.skipped ? entry.value : 0;
    return h('div', { class: 'quick-log' },
      iconButton('minus', `Log less ${habit.name}`, () => Store.adjustValue(habit.id, today, -1), { disabled: value <= 0, data: { fk: `minus-${habit.id}` } }),
      h('button', { type: 'button', class: 'quick-value', title: 'Enter an exact amount', data: { fk: `value-${habit.id}` },
        'aria-label': `${Sel.formatValue(value)} of ${Sel.describeGoal(habit)}. Enter an exact amount for ${habit.name}`,
        onClick: () => R.ui.openLogDialog(habit, today) },
      h('strong', {}, Sel.formatValue(value)), ` / ${Sel.formatValue(habit.target.amount)}`, unit ? h('span', { class: 'quick-unit' }, ` ${unit}`) : null),
      iconButton('plus', `Log more ${habit.name}`, () => Store.adjustValue(habit.id, today, 1), { data: { fk: `plus-${habit.id}` } }));
  }

  function currentPeriod(habit, today) {
    return Sel.info(habit).lookup[today];
  }

  function nextScheduledDay(habit, today) {
    for (let i = 1; i <= 7; i++) {
      const date = D.addDays(today, i);
      if (habit.schedule.days.includes(D.weekday(date))) return date;
    }
    return null;
  }

  function scheduleNote(habit, today) {
    const s = habit.schedule;
    const period = currentPeriod(habit, today);
    if (s.type === 'weekly' && period) return `${period.done} of ${period.requiredAfterSkips} this week`;
    if (s.type === 'interval' && period) {
      const sameDay = period.end === today;
      return period.status === 'met' ? `Every ${s.every} days, done this cycle` : `Every ${s.every} days, ${sameDay ? 'due today' : `due by ${D.formatShort(period.end)}`}`;
    }
    return R.Schedule.describe(s, Sel.weekStart());
  }

  function restReason(habit, today) {
    const s = habit.schedule;
    const period = currentPeriod(habit, today);
    if (s.type === 'weekdays') return `Next on ${D.dayShort(D.weekday(nextScheduledDay(habit, today)))}`;
    if (s.type === 'weekly') return period && period.status === 'excused' ? 'Skipped this week' : 'Done for this week';
    if (s.type === 'interval' && period) return `Next cycle starts ${D.formatShort(D.addDays(period.end, 1))}`;
    return 'Not needed today';
  }

  function streakLabel(habit) {
    const { current } = Sel.info(habit).streaks;
    return h('span', { class: 'row-streak', title: 'Current streak' }, Sel.formatStreak(habit, current));
  }

  function habitRow(habit, status, today) {
    const skipped = status === 'skipped';
    return h('li', { class: `habit-row is-${status}`, data: { habit: habit.id } },
      completionButton(habit, status, today),
      h('div', { class: 'row-main' },
        h('a', { class: 'row-name', href: `#/habit/${encodeURIComponent(habit.id)}` }, habit.name),
        h('span', { class: 'row-meta' }, skipped ? 'Skipped today. Your streak is safe.' : scheduleNote(habit, today),
          h('span', { class: 'meta-streak' }, ` · ${Sel.formatStreak(habit, Sel.info(habit).streaks.current)}`))),
      habit.target.type === 'count' && !skipped ? quickLog(habit, today) : null,
      streakLabel(habit),
      h('button', { type: 'button', class: 'btn-quiet row-skip', data: { fk: `skip-${habit.id}` },
        'aria-label': `${skipped ? 'Unskip' : 'Skip'} ${habit.name} today`,
        onClick: () => Store.toggleSkip(habit.id, today) }, skipped ? 'Unskip' : 'Skip'));
  }

  function group(def, rows, today) {
    if (!rows.length) return null;
    const finished = rows.filter((r) => r.status === 'done' || r.status === 'skipped').length;
    return h('section', { class: 'today-group', 'aria-label': def.label },
      h('h2', { class: 'group-title' }, icon(def.icon, 16), def.label, h('span', { class: 'group-count' }, `${finished} of ${rows.length}`)),
      h('ul', { class: 'habit-list' }, rows.map((r) => habitRow(r.habit, r.status, today))));
  }

  function restSection(rows, today) {
    if (!rows.length) return null;
    return h('section', { class: 'today-rest', 'aria-label': 'Not due today' },
      h('h2', { class: 'group-title' }, 'Not due today'),
      h('ul', { class: 'rest-list' }, rows.map(({ habit }) => h('li', {},
        h('a', { href: `#/habit/${encodeURIComponent(habit.id)}` }, habit.name),
        h('span', { class: 'row-meta' }, restReason(habit, today)),
        h('button', { type: 'button', class: 'btn-quiet', data: { fk: `extra-${habit.id}` }, 'aria-label': `Log ${habit.name} anyway`,
          onClick: () => Store.toggleDone(habit.id, today) }, 'Log anyway')))));
  }

  function header(today, counted, done) {
    const progress = counted ? done / counted : 0;
    return h('header', { class: 'view-head' },
      h('div', { class: 'today-summary' },
        h('h1', {}, D.formatLong(today)),
        h('p', { class: 'muted', data: { testid: 'today-progress' } }, counted ? `${done} of ${counted} done` : 'Nothing scheduled'),
        counted ? h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Done today', 'aria-valuemin': 0, 'aria-valuemax': counted, 'aria-valuenow': done },
          h('span', { style: `width:${progress * 100}%` })) : null),
      h('button', { type: 'button', class: 'btn btn-primary', data: { fk: 'add-habit' }, onClick: () => R.ui.openHabitForm(null) }, icon('plus', 16), 'Add habit'));
  }

  function pastWeekStrip(habits, today) {
    const days = D.eachDay(D.addDays(today, -6), today);
    return h('section', { class: 'card week-strip', 'aria-label': 'Past seven days' },
      h('h2', { class: 'label' }, 'Past 7 days'),
      h('div', { class: 'strip' }, days.map((date) => {
        const { done, total, ratio } = Sel.dayOverall(habits, date);
        return h('a', { class: 'strip-day', href: `#/week/${date}`, title: `${D.formatWeekday(date)}: ${done} of ${total} done`, 'aria-label': `${D.formatWeekday(date)}: ${done} of ${total} done` },
          h('span', { class: `swatch swatch-${R.Stats.shade(ratio)}` }), D.dayShort(D.weekday(date)).slice(0, 2));
      })));
  }

  function emptyState() {
    return h('div', { class: 'empty' },
      h('h2', {}, 'No habits yet'),
      h('p', { class: 'muted' }, 'Add one small thing you want to do regularly.'),
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => R.ui.openHabitForm(null) }, icon('plus', 16), 'Add habit'));
  }

  function render() {
    const today = Sel.today();
    const habits = Sel.activeHabits().filter((h2) => h2.startDate <= today);
    const rows = habits.map((habit) => ({ habit, status: Sel.dayStatus(habit, today) }));
    const listed = rows.filter((r) => LISTED.includes(r.status));
    const counted = listed.filter((r) => r.status !== 'skipped');
    const done = counted.filter((r) => r.status === 'done').length;
    const rest = rows.filter((r) => r.status === 'rest');
    const allFinished = listed.length > 0 && listed.every((r) => r.status === 'done' || r.status === 'skipped');
    const onlyFutureHabits = !habits.length && Sel.activeHabits().length > 0;

    const main = habits.length
      ? h('div', { class: 'today-main' },
        allFinished ? h('p', { class: 'all-done' }, 'Everything for today is finished.') : null,
        GROUPS.map((def) => group(def, listed.filter((r) => r.habit.timeOfDay === def.key), today)),
        restSection(rest, today))
      : onlyFutureHabits ? h('div', { class: 'empty' }, h('p', { class: 'muted' }, 'Your habits start on a later date.')) : emptyState();

    return h('div', { class: 'view view-today' },
      header(today, counted.length, done),
      h('div', { class: 'today-layout' }, main,
        h('aside', { class: 'today-side' },
          h('section', { class: 'card' }, R.ui.noteEditor(today, { rows: 7 })),
          habits.length ? pastWeekStrip(habits, today) : null)));
  }

  R.views = R.views || {};
  R.views.today = { render, title: 'Today' };
})(window.Rhythm);
