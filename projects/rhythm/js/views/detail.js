// One habit in depth: streaks, its year heatmap, trend and weekday pattern.
(function (R) {
  'use strict';
  const { h, icon, button } = R.dom;
  const D = R.Dates;
  const Sel = R.Select;
  const Stats = R.Stats;
  const Store = R.Store;
  const { withUndo } = R.overlays;

  const viewState = { range: 'past' };

  function tile(label, value, note, testid) {
    return h('div', { class: 'tile', data: { testid } },
      h('span', { class: 'tile-label' }, label),
      h('span', { class: 'tile-value' }, value),
      note ? h('span', { class: 'tile-note' }, note) : null);
  }

  function heatCell(habit, date) {
    const entry = Store.logFor(habit.id)[date];
    if (entry && entry.skipped) return { shade: 0, skipped: true, label: 'skipped' };
    if (!entry) return { shade: 0, label: 'nothing logged' };
    const goal = R.Streaks.goal(habit);
    const label = habit.target.type === 'count'
      ? `${Sel.formatValue(entry.value)} of ${Sel.describeGoal(habit)}`
      : 'done';
    return { shade: Stats.shade(Math.min(1, entry.value / goal)), label };
  }

  function heatSection(habit, today) {
    const select = h('select', { 'aria-label': 'Heatmap range', data: { fk: 'detail-range' }, onChange: (e) => { viewState.range = e.target.value; R.app.render(); } },
      R.charts.heatmapRanges(Sel.firstYear([habit]), today).map((o) => h('option', { value: o.value, selected: o.value === viewState.range }, o.label)));
    return h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Year'), select),
      R.charts.heatmap({
        rangeKey: viewState.range, today, weekStart: Sel.weekStart(), label: `Year of activity for ${habit.name}`,
        cell: (date) => heatCell(habit, date),
        onSelect: (date) => R.ui.openLogDialog(habit, date),
      }),
      h('p', { class: 'hint' }, 'Click a day to log or change it.'));
  }

  function actions(habit) {
    const toggleArchive = () => {
      const archived = !!habit.archivedOn;
      withUndo(`${archived ? 'Restored' : 'Archived'} ${habit.name}.`, () => Store.setArchived(habit.id, !archived));
    };
    const remove = () => {
      withUndo(`Deleted ${habit.name} and its history.`, () => Store.deleteHabit(habit.id));
      location.hash = '#/habits';
    };
    return h('div', { class: 'head-actions' },
      button('Edit', () => R.ui.openHabitForm(habit), { data: { fk: 'detail-edit' } }),
      button(habit.archivedOn ? 'Restore' : 'Archive', toggleArchive, { data: { fk: 'detail-archive' } }),
      button('Delete', remove, { class: 'btn btn-danger-text' }));
  }

  function render(params) {
    const habit = Store.habitById(params[0]);
    if (!habit) {
      return h('div', { class: 'view' }, h('div', { class: 'empty' }, h('h2', {}, 'This habit no longer exists'),
        h('a', { class: 'btn', href: '#/habits' }, 'Back to habits')));
    }
    const today = Sel.today();
    const weekStart = Sel.weekStart();
    const { streaks, timeline, log } = Sel.info(habit);
    const rate30 = Stats.rateInRange([timeline], D.addDays(today, -29), today);
    const total = Object.values(log).filter((entry) => R.Streaks.isComplete(habit, entry)).length;
    const skips = Object.values(log).filter((entry) => entry.skipped).length;
    const trendWeeks = Stats.weeklyTrend([timeline], today, weekStart);
    const rates = Stats.weekdayRates([{ habit, log }], D.addDays(today, -83), today, today, weekStart);
    const best = Stats.bestWeekday(rates);

    return h('div', { class: 'view view-detail' },
      h('a', { class: 'back-link', href: '#/habits' }, icon('left', 15), 'Habits'),
      h('header', { class: 'view-head' },
        h('div', { class: 'detail-title' }, h('h1', {}, habit.name),
          h('p', { class: 'muted' }, [R.Schedule.describe(habit.schedule, weekStart), Sel.describeGoal(habit),
            `Since ${D.formatShort(habit.startDate)}, ${D.yearOf(habit.startDate)}`, habit.archivedOn ? `Archived ${D.formatShort(habit.archivedOn)}` : null].filter(Boolean).join(' · '))),
        actions(habit)),
      h('div', { class: 'tiles' },
        tile('Current streak', Sel.formatStreak(habit, streaks.current), null, 'current-streak'),
        tile('Best streak', Sel.formatStreak(habit, streaks.best), null, 'best-streak'),
        tile('Last 30 days', Stats.percent(rate30.rate), rate30.expected ? `${rate30.done} of ${rate30.expected}` : 'Nothing expected', 'rate-30'),
        tile('Completions', total.toLocaleString('en-US'), `${R.dom.plural(skips, 'skip')}`, 'total')),
      h('p', { class: 'streak-rule' }, R.Schedule.streakRule(habit)),
      heatSection(habit, today),
      h('div', { class: 'split' },
        h('section', { class: 'card split-wide' }, h('h2', {}, '12-week trend'), R.charts.trend(trendWeeks)),
        h('section', { class: 'card' }, h('h2', {}, 'By weekday'), R.charts.weekdays(rates, best ? best.day : null))));
  }

  R.views = R.views || {};
  R.views.habit = { render, title: 'Habit', navKey: 'habits' };
})(window.Rhythm);
