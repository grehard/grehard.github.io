// Journal: every daily note in one place, searchable, next to what happened that day.
(function (R) {
  'use strict';
  const { h, icon, iconButton, button, plural } = R.dom;
  const D = R.Dates;
  const Sel = R.Select;
  const Store = R.Store;
  const SNIPPET_LENGTH = 90;

  const viewState = { query: '' };

  function noteRows(selected) {
    const query = viewState.query.trim().toLowerCase();
    const notes = Store.get().notes;
    const dates = Object.keys(notes).sort().reverse()
      .filter((date) => !query || notes[date].toLowerCase().includes(query));
    if (!dates.length) {
      return h('p', { class: 'muted list-empty' }, query ? `No notes contain "${viewState.query.trim()}".` : 'No notes yet. Write your first one here.');
    }
    return h('ul', { class: 'note-list' }, dates.map((date) => h('li', {},
      h('a', { href: `#/journal/${date}`, class: date === selected ? 'is-current' : '', 'aria-current': date === selected ? 'true' : null },
        h('span', { class: 'note-date' }, D.formatWeekday(date), D.yearOf(date) !== D.yearOf(Sel.today()) ? `, ${D.yearOf(date)}` : ''),
        h('span', { class: 'note-snippet' }, notes[date].length > SNIPPET_LENGTH ? `${notes[date].slice(0, SNIPPET_LENGTH)}...` : notes[date])))));
  }

  /** What the habits did that day: the context that makes an old note worth rereading. */
  function daySummary(date) {
    const today = Sel.today();
    const habits = Store.get().habits.filter((habit) => habit.startDate <= date);
    const done = habits.filter((habit) => Sel.dayStatus(habit, date) === 'done');
    const skipped = habits.filter((habit) => Sel.dayStatus(habit, date) === 'skipped');
    if (date > today || (!done.length && !skipped.length)) return h('p', { class: 'muted day-summary' }, 'No habits logged on this day.');
    return h('div', { class: 'day-summary' },
      done.length ? h('p', {}, h('strong', {}, `Done: `), done.map((habit) => habit.name).join(', ')) : null,
      skipped.length ? h('p', {}, h('strong', {}, `Skipped: `), skipped.map((habit) => habit.name).join(', ')) : null);
  }

  function render(params) {
    const today = Sel.today();
    const selected = D.isValid(params[0]) && params[0] <= today ? params[0] : today;
    const listBox = h('div', { class: 'note-list-box' }, noteRows(selected));
    const refreshList = () => listBox.replaceChildren(noteRows(selected));
    const hasNote = !!Store.get().notes[selected];
    const go = (date) => { location.hash = `#/journal/${date}`; };
    const remove = () => withDelete(selected);

    return h('div', { class: 'view view-journal' },
      h('header', { class: 'view-head' }, h('div', {}, h('h1', {}, 'Journal'),
        h('p', { class: 'muted' }, plural(Object.keys(Store.get().notes).length, 'note')))),
      h('div', { class: 'journal-layout' },
        h('section', { class: 'card journal-editor', 'aria-label': 'Note editor' },
          h('div', { class: 'journal-editor-head' },
            iconButton('left', 'Previous day', () => go(D.addDays(selected, -1)), { data: { fk: 'journal-prev' } }),
            h('h2', {}, D.formatFull(selected)),
            iconButton('right', 'Next day', () => go(D.addDays(selected, 1)), { disabled: selected >= today, data: { fk: 'journal-next' } }),
            h('input', { type: 'date', 'aria-label': 'Go to date', value: selected, max: today, class: 'journal-date', data: { fk: 'journal-date' },
              onChange: (e) => { if (D.isValid(e.target.value) && e.target.value <= today) go(e.target.value); } })),
          R.ui.noteEditor(selected, { label: 'Note', rows: 10, onChange: refreshList, focusKey: 'journal-note' }),
          daySummary(selected),
          hasNote ? h('div', { class: 'journal-actions' }, button('Delete note', remove, { class: 'btn btn-danger-text', data: { fk: 'journal-delete' } })) : null),
        h('section', { class: 'journal-list', 'aria-label': 'All notes' },
          h('div', { class: 'search' }, icon('search', 16),
            h('input', { type: 'search', 'aria-label': 'Search notes', placeholder: 'Search notes', value: viewState.query, data: { fk: 'journal-search' },
              onInput: (e) => { viewState.query = e.target.value; refreshList(); } })),
          listBox)));
  }

  function withDelete(date) {
    R.overlays.withUndo(`Deleted the note for ${D.formatShort(date)}.`, () => Store.deleteNote(date));
  }

  R.views = R.views || {};
  R.views.journal = { render, title: 'Journal' };
})(window.Rhythm);
