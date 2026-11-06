// Splits one entry into two at a chosen moment. The slider and the time field stay in sync,
// so it works by dragging, by arrow keys or by typing an exact time.
(function (HG) {
  'use strict';
  const { h } = HG;
  const T = HG.time;

  const toLocalInput = (ms) => `${T.dayKey(ms)}T${T.timeOfDay(ms)}`;

  function fromLocalInput(value) {
    const [date, time] = String(value).split('T');
    return T.combine(date, time);
  }

  function open(entry) {
    const minuteStart = Math.ceil((entry.start + 1) / T.MIN) * T.MIN;
    const minuteEnd = Math.floor((entry.end - 1) / T.MIN) * T.MIN;
    const midpoint = Math.round((entry.start + entry.end) / 2 / T.MIN) * T.MIN;
    let at = Math.min(minuteEnd, Math.max(minuteStart, midpoint));
    const tooShort = minuteEnd < minuteStart;

    const whenInput = h('input', { type: 'datetime-local', id: 'split-at', step: 60, value: toLocalInput(at) });
    const slider = h('input', { type: 'range', id: 'split-slider', min: minuteStart, max: minuteEnd, step: T.MIN, value: at, 'aria-label': 'Split point' });
    const secondName = h('input', { type: 'text', id: 'split-second-description', maxlength: 300, value: entry.description });
    const firstPart = h('output', { class: 'split-part', id: 'split-first' });
    const secondPart = h('output', { class: 'split-part', id: 'split-second' });
    const error = HG.ui.fieldError();

    function range(from, to) {
      const crosses = T.dayKey(from) !== T.dayKey(to);
      return `${T.timeOfDay(from)} to ${T.timeOfDay(to)}${crosses ? ' (next day)' : ''}, ${T.duration(to - from)}`;
    }

    function refresh() {
      const inside = at > entry.start && at < entry.end;
      firstPart.textContent = inside ? range(entry.start, at) : '';
      secondPart.textContent = inside ? range(at, entry.end) : '';
    }

    whenInput.addEventListener('input', () => {
      const value = fromLocalInput(whenInput.value);
      if (Number.isFinite(value)) {
        at = value;
        slider.value = value;
      } else {
        at = NaN;
      }
      refresh();
    });
    slider.addEventListener('input', () => {
      at = Number(slider.value);
      whenInput.value = toLocalInput(at);
      refresh();
    });

    function save() {
      const parts = HG.calc.splitEntry(entry, at, HG.store.newId('e'));
      if (!parts) {
        HG.ui.setError(error, `Pick a time between ${T.timeOfDay(entry.start)} and ${T.timeOfDay(entry.end)}.`);
        return;
      }
      parts[1].description = secondName.value.trim();
      HG.ui.closeModal();
      HG.ui.undoable('Entry split in two', (s) => {
        s.entries = s.entries.filter((e) => e.id !== entry.id).concat(parts);
      });
    }

    if (tooShort) {
      HG.ui.showModal({
        title: 'Split entry',
        body: h('p', { class: 'modal-text' }, 'This entry is under two minutes long, which is too short to split.'),
        footer: [h('button', { type: 'button', class: 'btn', onclick: HG.ui.closeModal }, 'Close')],
      });
      return;
    }

    refresh();
    HG.ui.showModal({
      title: 'Split entry',
      body: h('div', { class: 'form-grid', id: 'split-form' },
        h('p', { class: 'modal-text span-2' }, entry.description || 'Untitled entry'),
        HG.ui.field('Split at', whenInput, { className: 'span-2' }),
        h('div', { class: 'span-2' }, slider),
        h('div', { class: 'split-preview span-2' },
          h('div', null, h('span', { class: 'label' }, 'First part'), firstPart),
          h('div', null, h('span', { class: 'label' }, 'Second part'), secondPart)),
        HG.ui.field('Second part description', secondName, { className: 'span-2' }),
        h('div', { class: 'span-2' }, error)),
      footer: [
        h('button', { type: 'button', class: 'btn', onclick: HG.ui.closeModal }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'split-save', onclick: save }, 'Split entry'),
      ],
      focus: whenInput,
    });
  }

  HG.splitForm = { open };
})(window.HG);
