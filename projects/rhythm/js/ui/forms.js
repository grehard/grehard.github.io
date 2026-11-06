// Form building blocks: labelled fields with inline errors, and segmented radio groups.
(function (R) {
  'use strict';
  const { h } = R.dom;
  let idCounter = 0;
  const nextId = (prefix) => `${prefix}-${++idCounter}`;

  /** Wraps a control with a label, optional hint and an error slot wired up through aria-describedby. */
  function field(label, control, { hint, name } = {}) {
    const id = control.id || nextId('field');
    control.id = id;
    const errorId = `${id}-error`;
    const hintId = hint ? `${id}-hint` : null;
    if (hintId) control.setAttribute('aria-describedby', hintId);
    return h('div', { class: 'field', data: name ? { field: name } : {} },
      h('label', { htmlFor: id }, label),
      control,
      hint ? h('p', { class: 'hint', id: hintId }, hint) : null,
      h('p', { class: 'field-error', id: errorId, hidden: true }));
  }

  /** Shows errors keyed by field name, or clears them. Focuses the first problem. Returns true when clean. */
  function showErrors(root, errors) {
    let first = null;
    root.querySelectorAll('[data-field]').forEach((wrap) => {
      const message = errors[wrap.dataset.field];
      const slot = wrap.querySelector('.field-error');
      const control = wrap.querySelector('input, select, textarea');
      slot.hidden = !message;
      slot.textContent = message || '';
      if (control) {
        control.toggleAttribute('aria-invalid', !!message);
        if (message) control.setAttribute('aria-errormessage', slot.id);
        else control.removeAttribute('aria-errormessage');
      }
      if (message && !first) first = control;
    });
    if (first) first.focus();
    return !first;
  }

  /** A single-choice control made of real radio inputs, so arrow keys and screen readers just work. */
  function segmented(legend, options, value, onChange, { name, compact } = {}) {
    const group = name || nextId('seg');
    return h('div', { class: `segmented${compact ? ' segmented-compact' : ''}`, role: 'radiogroup', 'aria-label': legend },
      options.map((option) => h('label', { class: 'segment' },
        h('input', { type: 'radio', name: group, value: option.value, checked: option.value === value, onChange: () => onChange(option.value) }),
        h('span', {}, option.label))));
  }

  const radioValue = (root, name) => {
    const checked = root.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : null;
  };

  R.forms = { field, showErrors, segmented, radioValue, nextId };
})(window.Rhythm);
