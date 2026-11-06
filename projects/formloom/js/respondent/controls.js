// Renders one question. The same code draws the live form and the read-only preview on the builder canvas.
FL.controls = (function () {
  const { h, formatBytes } = FL.util;
  const { icon } = FL.icons;
  const { steps, isEmpty } = FL.fields;

  const INPUT_ATTRS = {
    short_text: { type: 'text', autocomplete: 'off' },
    email: { type: 'email', autocomplete: 'email', inputmode: 'email' },
    phone: { type: 'tel', autocomplete: 'tel', inputmode: 'tel' },
    number: { type: 'text', inputmode: 'decimal', autocomplete: 'off' }, // text, so "abc" reaches our validator
    date: { type: 'date' },
  };
  const FILE_NOTE = "Only the file's name, size and type are recorded. The file itself is not uploaded or stored.";

  function labelContent(field) {
    return [
      h('span', { class: 'f-label-text' }, field.label || 'Untitled question'),
      field.required ? h('span', { class: 'f-req' }, h('span', { 'aria-hidden': 'true' }, ' *'), h('span', { class: 'sr-only' }, ' (required)')) : null,
    ];
  }

  function textInput(field, ctx) {
    const value = ctx.value === undefined || ctx.value === null ? '' : String(ctx.value);
    const shared = {
      id: ctx.id,
      class: 'f-input',
      value,
      placeholder: field.placeholder || null,
      'aria-required': field.required ? 'true' : null,
      'aria-describedby': ctx.describedBy,
      oninput: (event) => ctx.onChange(event.target.value),
      onblur: () => ctx.onBlur(),
    };
    if (field.type === 'long_text') return h('textarea', Object.assign({ rows: 4 }, shared));
    const extra = {};
    if (field.type === 'date') {
      if (typeof field.validation.min === 'string') extra.min = field.validation.min;
      if (typeof field.validation.max === 'string') extra.max = field.validation.max;
    }
    return h('input', Object.assign({}, INPUT_ATTRS[field.type], extra, shared));
  }

  function dropdown(field, ctx) {
    return h('select', {
      id: ctx.id,
      class: 'f-input f-select',
      value: ctx.value || '',
      'aria-required': field.required ? 'true' : null,
      'aria-describedby': ctx.describedBy,
      onchange: (event) => ctx.onChange(event.target.value),
    },
    h('option', { value: '' }, field.placeholder || 'Select an option'),
    field.options.map((option) => h('option', { value: option }, option)));
  }

  function clearButton(field, ctx, visible, onClear) {
    if (field.required) return null;
    return h('button', { class: 'f-clear', type: 'button', hidden: !visible, onclick: onClear }, 'Clear selection');
  }

  function singleChoice(field, ctx) {
    const inputs = [];
    const clear = clearButton(field, ctx, !isEmpty(ctx.value), () => {
      inputs.forEach((input) => { input.checked = false; });
      clear.hidden = true;
      ctx.onChange('');
    });
    const rows = field.options.map((option) => {
      const input = h('input', {
        type: 'radio', name: ctx.id, value: option, checked: ctx.value === option,
        onchange: () => { if (clear) clear.hidden = false; ctx.onChange(option); },
      });
      inputs.push(input);
      return h('label', { class: 'f-option' }, input, h('span', null, option));
    });
    return h('div', { class: 'f-options' }, rows, clear);
  }

  function multiChoice(field, ctx) {
    const selected = new Set(Array.isArray(ctx.value) ? ctx.value : []);
    const rows = field.options.map((option) => h('label', { class: 'f-option' },
      h('input', {
        type: 'checkbox', value: option, checked: selected.has(option),
        onchange: (event) => {
          if (event.target.checked) selected.add(option); else selected.delete(option);
          ctx.onChange(field.options.filter((item) => selected.has(item))); // keeps the form's order
        },
      }),
      h('span', null, option)));
    return h('div', { class: 'f-options' }, rows);
  }

  function ratingControl(field, ctx) {
    const labels = [];
    const paint = (value) => labels.forEach((label, index) => label.classList.toggle('is-on', index < value));
    const clear = clearButton(field, ctx, !isEmpty(ctx.value), () => {
      group.querySelectorAll('input').forEach((input) => { input.checked = false; });
      paint(0);
      clear.hidden = true;
      ctx.onChange('');
    });
    const stars = steps(field).map((step) => {
      const label = h('label', { class: 'f-star' },
        h('input', {
          type: 'radio', name: ctx.id, value: step, checked: Number(ctx.value) === step,
          onchange: () => { paint(step); if (clear) clear.hidden = false; ctx.onChange(step); },
        }),
        icon('star', 28),
        h('span', { class: 'sr-only' }, `${step} out of ${field.ratingMax}`));
      labels.push(label);
      return label;
    });
    const group = h('div', { class: 'f-stars' }, stars);
    paint(Number(ctx.value) || 0);
    return h('div', { class: 'f-rating' }, group, clear);
  }

  function scaleControl(field, ctx) {
    const clear = clearButton(field, ctx, !isEmpty(ctx.value), () => {
      boxes.querySelectorAll('input').forEach((input) => { input.checked = false; });
      clear.hidden = true;
      ctx.onChange('');
    });
    const boxes = h('div', { class: 'f-scale-row' }, steps(field).map((step) => h('label', { class: 'f-scale-step' },
      h('input', {
        type: 'radio', name: ctx.id, value: step, checked: ctx.value !== '' && ctx.value !== undefined && Number(ctx.value) === step,
        onchange: () => { if (clear) clear.hidden = false; ctx.onChange(step); },
      }),
      h('span', null, step))));
    const ends = field.minLabel || field.maxLabel
      ? h('div', { class: 'f-scale-ends' }, h('span', null, field.minLabel), h('span', null, field.maxLabel))
      : null;
    return h('div', { class: 'f-scale' }, boxes, ends, clear);
  }

  function fileMeta(value) {
    return `${value.name} (${formatBytes(value.size)}${value.type ? `, ${value.type}` : ''})`;
  }

  function fileControl(field, ctx) {
    const recorded = h('p', { class: 'f-file-recorded' });
    const remove = h('button', { class: 'f-clear', type: 'button', onclick: () => {
      input.value = '';
      show(null);
      ctx.onChange(null);
    } }, 'Remove');
    const row = h('div', { class: 'f-file-row' }, recorded, remove);
    const show = (value) => {
      row.hidden = !value;
      recorded.textContent = value ? `Recorded: ${fileMeta(value)}` : '';
    };
    const accept = field.accept.split(',').map((item) => item.trim()).filter(Boolean)
      .map((item) => (item.startsWith('.') ? item : `.${item}`)).join(',');
    const input = h('input', {
      id: ctx.id,
      type: 'file',
      class: 'f-file',
      accept: accept || null,
      'aria-required': field.required ? 'true' : null,
      'aria-describedby': ctx.describedBy,
      onchange: (event) => {
        // The File object goes out of scope here; its contents are never read.
        const file = event.target.files[0];
        const meta = file ? { name: file.name, size: file.size, type: file.type } : null;
        show(meta);
        ctx.onChange(meta);
      },
    });
    show(isEmpty(ctx.value) ? null : ctx.value);
    return h('div', { class: 'f-file-wrap' }, input, row, h('p', { class: 'f-file-note' }, FILE_NOTE));
  }

  function sectionBlock(field) {
    return {
      el: h('div', { class: 'f-section', 'data-field': field.id },
        h('h3', null, field.label),
        field.help ? h('p', { class: 'f-help' }, field.help) : null),
      setError() {},
    };
  }

  function buildControl(field, ctx) {
    switch (field.type) {
      case 'dropdown': return { node: dropdown(field, ctx), group: false };
      case 'single_choice': return { node: singleChoice(field, ctx), group: true };
      case 'multi_choice': return { node: multiChoice(field, ctx), group: true };
      case 'rating': return { node: ratingControl(field, ctx), group: true };
      case 'scale': return { node: scaleControl(field, ctx), group: true };
      case 'file': return { node: fileControl(field, ctx), group: false };
      default: return { node: textInput(field, ctx), group: false };
    }
  }

  /** Returns { el, setError }. options: { idBase, value, onChange, onBlur, preview }. */
  function render(field, options) {
    if (field.type === 'section') return sectionBlock(field);
    const opts = options || {};
    const id = `${opts.idBase || 'q'}-${field.id}`;
    const helpId = field.help ? `${id}-help` : null;
    const errorId = `${id}-error`;
    const ctx = {
      id,
      value: opts.value,
      describedBy: [helpId, errorId].filter(Boolean).join(' '),
      onChange: opts.onChange || (() => {}),
      onBlur: opts.onBlur || (() => {}),
    };
    const built = buildControl(field, ctx);
    const help = field.help ? h('p', { class: 'f-help', id: helpId }, field.help) : null;
    const error = h('p', { class: 'f-error', id: errorId, hidden: true });
    const inner = h('div', { class: 'f-control', inert: opts.preview ? true : null }, built.node);
    const el = built.group
      ? h('fieldset', { class: 'f-field', 'data-field': field.id, 'aria-describedby': ctx.describedBy },
        h('legend', { class: 'f-label' }, labelContent(field)), help, inner, error)
      : h('div', { class: 'f-field', 'data-field': field.id },
        h('label', { class: 'f-label', for: id }, labelContent(field)), help, inner, error);

    function setError(message) {
      el.classList.toggle('has-error', Boolean(message));
      error.hidden = !message;
      error.textContent = message || '';
      el.querySelectorAll('input, select, textarea').forEach((node) => {
        if (message) node.setAttribute('aria-invalid', 'true');
        else node.removeAttribute('aria-invalid');
      });
    }

    return { el, setError };
  }

  return { render, fileMeta, FILE_NOTE };
})();
