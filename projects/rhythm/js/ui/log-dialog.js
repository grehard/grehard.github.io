// Exact logging for one habit on one day: type a value, mark it complete, skip it or clear it.
(function (R) {
  'use strict';
  const { h, button, iconButton } = R.dom;
  const D = R.Dates;
  const V = R.Validate;
  const { field, showErrors } = R.forms;

  function open(habit, date) {
    const entry = R.Store.logFor(habit.id)[date];
    let dialog = null;
    const finish = (change) => { dialog.close(); change(); };
    const clear = () => finish(() => R.Store.setEntry(habit.id, date, null));
    const skip = () => finish(() => R.Store.setEntry(habit.id, date, { skipped: true }));
    const complete = () => finish(() => R.Store.setEntry(habit.id, date, { value: R.Streaks.goal(habit) }));
    const title = `${habit.name}, ${D.formatWeekday(date)}`;
    const commonActions = [
      entry ? button('Clear', clear) : null,
      button('Skip this day', skip),
    ];

    if (habit.target.type !== 'count') {
      dialog = R.overlays.modal({
        title,
        body: h('p', { class: 'muted' }, entry && entry.skipped ? 'Marked as skipped.' : entry ? 'Marked as done.' : 'Nothing logged for this day.'),
        footer: [commonActions, h('button', { type: 'button', class: 'btn btn-primary', 'data-autofocus': true, onClick: complete }, 'Mark done')],
      });
      return;
    }

    const { amount, unit, step } = habit.target;
    const input = h('input', { type: 'number', min: 0, step: 'any', inputmode: 'decimal', 'data-autofocus': true,
      value: entry && !entry.skipped ? entry.value : '' });
    const nudge = (direction) => {
      const current = Number(input.value) || 0;
      input.value = V.roundValue(Math.max(0, current + direction * step));
      input.focus();
    };
    const body = h('div', { class: 'form-stack' },
      h('div', { class: 'log-entry' },
        field(`Amount${unit ? ` (${unit})` : ''}`, input, { name: 'value', hint: `Target: ${R.Select.describeGoal(habit)}` }),
        iconButton('minus', `Subtract ${step}`, () => nudge(-1)),
        iconButton('plus', `Add ${step}`, () => nudge(1)),
        button(`Set to ${R.Select.formatValue(amount)}`, () => { input.value = amount; input.focus(); })));
    const submit = () => {
      const value = V.parseNumber(input.value);
      const invalid = input.value.trim() !== '' && (!Number.isFinite(value) || value < 0 || value > V.MAX_VALUE);
      if (!showErrors(body, invalid ? { value: `Enter a number from 0 to ${V.MAX_VALUE.toLocaleString('en-US')}.` } : {})) return;
      finish(() => R.Store.setEntry(habit.id, date, value > 0 ? { value: V.roundValue(value) } : null));
    };
    dialog = R.overlays.modal({
      title,
      body,
      onSubmit: submit,
      footer: [commonActions, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save')],
    });
  }

  R.ui = R.ui || {};
  R.ui.openLogDialog = open;
})(window.Rhythm);
