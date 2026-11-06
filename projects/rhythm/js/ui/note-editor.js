// A daily note textarea shared by Today and Journal. Saves as you type, without re-rendering the view.
(function (R) {
  'use strict';
  const { h } = R.dom;
  const SAVED_NOTICE_MS = 1500;

  function noteEditor(date, { label = 'Daily note', rows = 6, onChange, focusKey } = {}) {
    const notes = R.Store.get().notes;
    const status = h('span', { class: 'note-status', role: 'status' });
    let timer = null;
    const textarea = h('textarea', {
      id: `note-${date}`,
      rows,
      value: notes[date] || '',
      maxlength: R.Validate.LIMITS.note,
      placeholder: 'How did today go?',
      data: { fk: focusKey || `note-${date}` },
      onInput: () => {
        R.Store.setNote(date, textarea.value);
        status.textContent = 'Saved';
        clearTimeout(timer);
        timer = setTimeout(() => { status.textContent = ''; }, SAVED_NOTICE_MS);
        if (onChange) onChange(textarea.value);
      },
    });
    return h('div', { class: 'note-editor' },
      h('div', { class: 'note-head' }, h('label', { htmlFor: textarea.id, class: 'label' }, label), status),
      textarea);
  }

  R.ui = R.ui || {};
  R.ui.noteEditor = noteEditor;
})(window.Rhythm);
