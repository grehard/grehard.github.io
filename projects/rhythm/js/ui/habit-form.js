// The add/edit habit modal.
(function (R) {
  'use strict';
  const { h, button } = R.dom;
  const D = R.Dates;
  const { field, segmented, showErrors, radioValue } = R.forms;

  const SCHEDULE_OPTIONS = [
    { value: 'daily', label: 'Every day' },
    { value: 'weekdays', label: 'Certain days' },
    { value: 'weekly', label: 'Times a week' },
    { value: 'interval', label: 'Every N days' },
  ];
  const WHEN_OPTIONS = [
    { value: 'morning', label: 'Morning' },
    { value: 'afternoon', label: 'Afternoon' },
    { value: 'evening', label: 'Evening' },
  ];
  const GOAL_OPTIONS = [
    { value: 'check', label: 'Yes or no' },
    { value: 'count', label: 'Measurable' },
  ];

  function weekdayPicker(selected) {
    return h('div', { class: 'day-picker', role: 'group', 'aria-label': 'Days of the week' },
      D.weekOrder(R.Select.weekStart()).map((day) => h('label', { class: 'day-chip' },
        h('input', { type: 'checkbox', value: day, checked: selected.includes(day), 'data-day': true }),
        h('span', {}, D.dayShort(day)))));
  }

  function defaults(habit) {
    const today = R.Select.today();
    if (!habit) {
      return { name: '', timeOfDay: 'morning', scheduleType: 'daily', days: [1, 3, 5], times: 3, every: 2,
        goalType: 'check', amount: 8, unit: '', step: 1, startDate: today, reminder: '' };
    }
    const { schedule: s, target: t } = habit;
    return {
      name: habit.name, timeOfDay: habit.timeOfDay, scheduleType: s.type,
      days: s.days || [1, 3, 5], times: s.times || 3, every: s.every || 2,
      goalType: t.type, amount: t.amount || 8, unit: t.unit || '', step: t.step || 1,
      startDate: habit.startDate, reminder: habit.reminder || '',
    };
  }

  function open(habit) {
    const v = defaults(habit);
    const nameInput = h('input', { type: 'text', value: v.name, maxlength: 120, autocomplete: 'off', 'data-autofocus': true, placeholder: 'For example, Evening walk' });

    const dayPanel = field('Which days', weekdayPicker(v.days), { name: 'days' });
    const timesInput = h('input', { type: 'number', min: 1, max: 7, step: 1, value: v.times, inputmode: 'numeric' });
    const everyInput = h('input', { type: 'number', min: 2, max: 365, step: 1, value: v.every, inputmode: 'numeric' });
    const timesPanel = field('Times per week', timesInput, { name: 'times', hint: 'Counted per calendar week, on any days you like.' });
    const everyPanel = field('Repeat every (days)', everyInput, { name: 'every', hint: 'Do it on any day within each cycle.' });
    const syncSchedule = (type) => {
      dayPanel.hidden = type !== 'weekdays';
      timesPanel.hidden = type !== 'weekly';
      everyPanel.hidden = type !== 'interval';
    };

    const amountInput = h('input', { type: 'number', min: 0, step: 'any', value: v.amount, inputmode: 'decimal' });
    const unitInput = h('input', { type: 'text', value: v.unit, maxlength: 40, placeholder: 'glasses, minutes, km' });
    const stepInput = h('input', { type: 'number', min: 0, step: 'any', value: v.step, inputmode: 'decimal' });
    const goalPanel = h('div', { class: 'field-row' },
      field('Daily target', amountInput, { name: 'amount' }),
      field('Unit', unitInput, { name: 'unit' }),
      field('Quick-log step', stepInput, { name: 'step' }));
    const syncGoal = (type) => { goalPanel.hidden = type !== 'count'; };

    const startInput = h('input', { type: 'date', value: v.startDate });
    const reminderInput = h('input', { type: 'time', value: v.reminder });

    const body = h('div', { class: 'form-stack' },
      field('Name', nameInput, { name: 'name' }),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Time of day'),
        segmented('Time of day', WHEN_OPTIONS, v.timeOfDay, () => {}, { name: 'habit-when' })),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Schedule'),
        segmented('Schedule', SCHEDULE_OPTIONS, v.scheduleType, syncSchedule, { name: 'habit-schedule' })),
      dayPanel, timesPanel, everyPanel,
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Goal'),
        segmented('Goal', GOAL_OPTIONS, v.goalType, syncGoal, { name: 'habit-goal' })),
      goalPanel,
      h('div', { class: 'field-row field-row-2' },
        field('Start date', startInput, { name: 'startDate' }),
        field('Reminder (optional)', reminderInput, { name: 'reminder', hint: 'Shown while this tab is open.' })));
    syncSchedule(v.scheduleType);
    syncGoal(v.goalType);

    const submit = () => {
      const { errors, fields } = R.Validate.habitFields({
        name: nameInput.value,
        timeOfDay: radioValue(body, 'habit-when'),
        scheduleType: radioValue(body, 'habit-schedule'),
        days: [...body.querySelectorAll('input[data-day]:checked')].map((c) => +c.value).sort((a, b) => a - b),
        times: timesInput.value,
        every: everyInput.value,
        goalType: radioValue(body, 'habit-goal'),
        amount: amountInput.value,
        unit: unitInput.value,
        step: stepInput.value,
        startDate: startInput.value,
        reminder: reminderInput.value,
      });
      if (!showErrors(body, errors)) return;
      dialog.close();
      if (habit) {
        R.Store.updateHabit(habit.id, fields);
        R.overlays.toast(`Saved ${fields.name}.`);
      } else {
        R.Store.addHabit(fields);
        R.overlays.toast(`Added ${fields.name}.`);
      }
    };

    const dialog = R.overlays.modal({
      title: habit ? 'Edit habit' : 'Add habit',
      body,
      onSubmit: submit,
      wide: true,
      footer: [
        button('Cancel', () => dialog.close()),
        h('button', { type: 'submit', class: 'btn btn-primary' }, habit ? 'Save changes' : 'Add habit'),
      ],
    });
  }

  R.ui = R.ui || {};
  R.ui.openHabitForm = open;
})(window.Rhythm);
