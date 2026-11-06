// Statistics across all active habits, or filtered to one.
(function (R) {
  'use strict';
  const { h } = R.dom;
  const D = R.Dates;
  const Sel = R.Select;
  const Stats = R.Stats;

  const WINDOW_DAYS = 84;
  const viewState = { habitId: 'all', range: 'past' };

  function tile(label, value, note, testid) {
    return h('div', { class: 'tile', data: { testid } },
      h('span', { class: 'tile-label' }, label),
      h('span', { class: 'tile-value' }, value),
      note ? h('span', { class: 'tile-note' }, note) : null);
  }

  function chosenHabits() {
    const active = Sel.activeHabits();
    if (viewState.habitId === 'all') return active;
    const chosen = R.Store.habitById(viewState.habitId);
    if (chosen) return [chosen];
    viewState.habitId = 'all';
    return active;
  }

  function habitPicker() {
    const active = Sel.activeHabits();
    const archived = Sel.archivedHabits();
    return h('select', { 'aria-label': 'Show statistics for', data: { fk: 'stats-habit' }, onChange: (e) => { viewState.habitId = e.target.value; R.app.render(); } },
      h('option', { value: 'all', selected: viewState.habitId === 'all' }, 'All active habits'),
      active.map((habit) => h('option', { value: habit.id, selected: viewState.habitId === habit.id }, habit.name)),
      archived.length ? h('optgroup', { label: 'Archived' }, archived.map((habit) => h('option', { value: habit.id, selected: viewState.habitId === habit.id }, habit.name))) : null);
  }

  function longestCurrent(habits) {
    let top = null;
    for (const habit of habits) {
      const { current } = Sel.info(habit).streaks;
      if (!top || current > top.current) top = { habit, current };
    }
    return top;
  }

  function heatCell(habits, date) {
    const { done, total, ratio } = Sel.dayOverall(habits, date);
    const skipped = total === 0 && habits.some((habit) => Sel.dayStatus(habit, date) === 'skipped');
    if (skipped) return { shade: 0, skipped: true, label: 'skipped' };
    return { shade: Stats.shade(ratio), label: total ? `${done} of ${total} done` : 'nothing due' };
  }

  function heatSection(habits, today) {
    const select = h('select', { 'aria-label': 'Heatmap range', data: { fk: 'stats-range' }, onChange: (e) => { viewState.range = e.target.value; R.app.render(); } },
      R.charts.heatmapRanges(Sel.firstYear(habits), today).map((o) => h('option', { value: o.value, selected: o.value === viewState.range }, o.label)));
    return h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, habits.length === 1 ? 'Year' : 'Overall year'), select),
      R.charts.heatmap({
        rangeKey: viewState.range, today, weekStart: Sel.weekStart(), label: 'Year of activity across habits',
        cell: (date) => heatCell(habits, date),
        onSelect: (date) => { location.hash = `#/week/${date}`; },
      }),
      h('p', { class: 'hint' }, 'Click a day to open its week.'));
  }

  function habitTable(today) {
    const habits = Sel.activeHabits();
    const from = D.addDays(today, -29);
    return h('section', { class: 'card card-flush' },
      h('h2', { class: 'card-title-pad' }, 'By habit'),
      h('div', { class: 'scroll-x', data: { scrollKey: 'stats-table' } },
        h('table', { class: 'data-table' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Habit'), h('th', { scope: 'col' }, 'Schedule'),
            h('th', { scope: 'col', class: 'num' }, '30 days'), h('th', { scope: 'col', class: 'num' }, 'Current'), h('th', { scope: 'col', class: 'num' }, 'Best'))),
          h('tbody', {}, habits.map((habit) => {
            const { timeline, streaks } = Sel.info(habit);
            const rate = Stats.rateInRange([timeline], from, today);
            return h('tr', { data: { habit: habit.id } },
              h('th', { scope: 'row' }, h('a', { href: `#/habit/${encodeURIComponent(habit.id)}` }, habit.name)),
              h('td', {}, R.Schedule.describe(habit.schedule, Sel.weekStart())),
              h('td', { class: 'num' }, Stats.percent(rate.rate)),
              h('td', { class: 'num' }, Sel.formatStreak(habit, streaks.current)),
              h('td', { class: 'num' }, Sel.formatStreak(habit, streaks.best)));
          })))));
  }

  function render() {
    const today = Sel.today();
    const weekStart = Sel.weekStart();
    const habits = chosenHabits();
    const head = h('header', { class: 'view-head' },
      h('div', {}, h('h1', {}, 'Statistics'), h('p', { class: 'muted' }, 'Skipped days are left out of every rate.')),
      habitPicker());
    if (!habits.length) {
      return h('div', { class: 'view' }, head, h('div', { class: 'empty' }, h('p', { class: 'muted' }, 'Statistics appear once you have an active habit.')));
    }

    const timelines = Sel.timelines(habits);
    const entries = Sel.entries(habits);
    const rate30 = Stats.rateInRange(timelines, D.addDays(today, -29), today);
    const thisWeek = Stats.rateInRange(timelines, D.startOfWeek(today, weekStart), D.endOfWeek(today, weekStart));
    const rates = Stats.weekdayRates(entries, D.addDays(today, -(WINDOW_DAYS - 1)), today, today, weekStart);
    const best = Stats.bestWeekday(rates);
    const top = longestCurrent(habits);

    return h('div', { class: 'view view-stats' },
      head,
      h('div', { class: 'tiles' },
        tile('Completion rate, 30 days', Stats.percent(rate30.rate), rate30.expected ? `${rate30.done} of ${rate30.expected}` : 'Nothing expected yet', 'stat-rate'),
        tile('This week so far', Stats.percent(thisWeek.rate), thisWeek.expected ? `${thisWeek.done} of ${thisWeek.expected}` : 'Nothing expected yet', 'stat-week'),
        tile('Best weekday', best ? D.dayName(best.day) : '-', best ? `${Stats.percent(best.rate)} completed` : 'Not enough data', 'stat-weekday'),
        tile('Longest current streak', top ? Sel.formatStreak(top.habit, top.current) : '-', top && habits.length > 1 ? top.habit.name : null, 'stat-streak')),
      h('div', { class: 'split' },
        h('section', { class: 'card split-wide' }, h('h2', {}, '12-week trend'), R.charts.trend(Stats.weeklyTrend(timelines, today, weekStart))),
        h('section', { class: 'card' }, h('h2', {}, 'By weekday, last 12 weeks'), R.charts.weekdays(rates, best ? best.day : null))),
      heatSection(habits, today),
      viewState.habitId === 'all' ? habitTable(today) : null);
  }

  R.views = R.views || {};
  R.views.stats = { render, title: 'Statistics' };
})(window.Rhythm);
