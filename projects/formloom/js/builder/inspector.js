// The right pane's Field tab: question text, options, validation and logic for the selected field.
FL.inspector = (function () {
  const { h } = FL.util;
  const { icon } = FL.icons;
  const { TYPES, findField, isQuestion } = FL.fields;

  const PATTERN_PRESETS = [
    { label: 'Insert a common pattern...', value: '' },
    { label: 'US ZIP code', value: '\\d{5}(-\\d{4})?' },
    { label: 'Order number, like AB-1234', value: '[A-Z]{2}-\\d{4}' },
    { label: 'Digits only', value: '\\d+' },
    { label: 'Letters and spaces only', value: '[A-Za-z ]+' },
    { label: 'Web address', value: 'https?://\\S+' },
  ];
  const LIMIT_WORDS = {
    length: { title: 'Length', min: 'Minimum characters', max: 'Maximum characters' },
    value: { title: 'Range', min: 'Minimum value', max: 'Maximum value' },
    date: { title: 'Date range', min: 'Earliest date', max: 'Latest date' },
    count: { title: 'Selections', min: 'Minimum selections', max: 'Maximum selections' },
  };

  function row(labelText, control, hint) {
    const id = control.id || `insp-${labelText.replace(/\W+/g, '-').toLowerCase()}`;
    control.id = id;
    return h('div', { class: 'prop' },
      h('label', { class: 'prop-label', for: id }, labelText),
      control,
      hint ? h('p', { class: 'prop-hint' }, hint) : null);
  }

  function checkRow(labelText, checked, onChange, fk) {
    return h('label', { class: 'prop-check' },
      h('input', { type: 'checkbox', checked, 'data-fk': fk, onchange: (event) => onChange(event.target.checked) }),
      h('span', null, labelText));
  }

  function textProp(api, field, key, labelText, options) {
    const opts = options || {};
    const tag = opts.multiline ? 'textarea' : 'input';
    const control = h(tag, {
      class: 'input',
      id: `prop-${key}`,
      'data-fk': `prop-${key}`,
      value: field[key],
      rows: opts.multiline ? 2 : null,
      type: opts.multiline ? null : 'text',
      oninput: (event) => api.commit((form) => { findField(form, field.id)[key] = event.target.value; }, { key: `${field.id}:${key}`, panel: false }),
    });
    return row(labelText, control, opts.hint);
  }

  function section(title, ...kids) {
    return h('section', { class: 'prop-group' }, h('h3', null, title), kids);
  }

  function basics(api, field) {
    const parts = [textProp(api, field, 'label', field.type === 'section' ? 'Heading' : 'Question')];
    parts.push(textProp(api, field, 'help', field.type === 'section' ? 'Text below the heading' : 'Help text', { multiline: true }));
    if (['short_text', 'long_text', 'email', 'phone', 'number', 'dropdown'].includes(field.type)) {
      parts.push(textProp(api, field, 'placeholder', 'Placeholder'));
    }
    if (isQuestion(field)) {
      parts.push(checkRow('Required', field.required, (value) => {
        api.commit((form) => { findField(form, field.id).required = value; }, { panel: false });
      }, 'prop-required'));
    }
    return section('Content', parts);
  }

  function optionRow(api, field, option, index) {
    let current = option;
    const message = h('p', { class: 'prop-error', hidden: true });
    const input = h('input', {
      class: 'input',
      type: 'text',
      value: option,
      'aria-label': `Option ${index + 1}`,
      'data-fk': `opt-${index}`,
      onchange: (event) => {
        const next = event.target.value.trim();
        const isDuplicate = field.options.some((other, i) => i !== index && other === next);
        if (!next || isDuplicate) {
          message.textContent = next ? 'Each option must be different.' : 'An option cannot be empty.';
          message.hidden = false;
          event.target.value = current;
          return;
        }
        message.hidden = true;
        if (next === current) return;
        const previous = current;
        current = next;
        // The panel isn't redrawn here: this runs as focus leaves, and a redraw would swallow the click causing it.
        api.commit((form) => {
          FL.formOps.renameOption(form, findField(form, field.id), previous, next);
        }, { panel: false });
      },
    });
    const move = (delta) => api.commit((form) => {
      const list = findField(form, field.id).options;
      const [item] = list.splice(index, 1);
      list.splice(index + delta, 0, item);
    });
    return h('div', { class: 'option-row' },
      h('div', { class: 'option-line' },
        input,
        h('button', { class: 'btn-icon', type: 'button', 'aria-label': `Move option ${index + 1} up`, disabled: index === 0, 'data-fk': `opt-up-${index}`, onclick: () => move(-1) }, icon('up')),
        h('button', { class: 'btn-icon', type: 'button', 'aria-label': `Move option ${index + 1} down`, disabled: index === field.options.length - 1, 'data-fk': `opt-down-${index}`, onclick: () => move(1) }, icon('down')),
        h('button', {
          class: 'btn-icon is-danger', type: 'button', 'aria-label': `Remove option ${index + 1}`, disabled: field.options.length < 2, 'data-fk': `opt-del-${index}`,
          onclick: () => api.commit((form) => {
            const live = findField(form, field.id);
            live.options = live.options.filter((item) => item !== current);
          }),
        }, icon('close'))),
      message);
  }

  function nextOptionLabel(options) {
    let n = options.length + 1;
    while (options.includes(`Option ${n}`)) n++;
    return `Option ${n}`;
  }

  function optionsSection(api, field) {
    if (!TYPES[field.type].options) return null;
    return section('Options',
      h('div', { class: 'option-list' }, field.options.map((option, index) => optionRow(api, field, option, index))),
      h('button', {
        class: 'btn btn-small', type: 'button', 'data-fk': 'opt-add',
        disabled: field.options.length >= FL.schema.LIMITS.options,
        onclick: () => api.commit((form) => {
          const live = findField(form, field.id);
          live.options.push(nextOptionLabel(live.options));
        }),
      }, icon('plus'), 'Add option'));
  }

  function numberSelect(labelText, value, choices, onChange, fk) {
    return row(labelText, h('select', {
      class: 'input', id: `prop-${fk}`, 'data-fk': fk, value: String(value),
      onchange: (event) => onChange(Number(event.target.value)),
    }, choices.map((choice) => h('option', { value: String(choice) }, choice))));
  }

  function rangeList(from, to) {
    const list = [];
    for (let n = from; n <= to; n++) list.push(n);
    return list;
  }

  function scaleSection(api, field) {
    if (field.type === 'rating') {
      return section('Rating', numberSelect('Number of stars', field.ratingMax, rangeList(3, 10), (value) => {
        api.commit((form) => { findField(form, field.id).ratingMax = value; });
      }, 'rating-max'));
    }
    if (field.type !== 'scale') return null;
    const update = (key, value) => api.commit((form) => {
      const live = findField(form, field.id);
      live[key] = value;
      if (live.scaleMax <= live.scaleMin) live.scaleMax = live.scaleMin + 1;
    });
    return section('Scale',
      h('div', { class: 'prop-pair' },
        numberSelect('From', field.scaleMin, rangeList(-10, 10), (value) => update('scaleMin', value), 'scale-min'),
        numberSelect('To', field.scaleMax, rangeList(field.scaleMin + 1, field.scaleMin + 20), (value) => update('scaleMax', value), 'scale-max')),
      textProp(api, field, 'minLabel', 'Label for the low end'),
      textProp(api, field, 'maxLabel', 'Label for the high end'));
  }

  function limitInput(api, field, key, labelText, type) {
    const value = field.validation[key];
    const control = h('input', {
      class: 'input',
      id: `val-${key}`,
      'data-fk': `val-${key}`,
      type,
      value: value === null ? '' : String(value),
      oninput: (event) => {
        const raw = event.target.value;
        let next = null;
        if (raw !== '') next = type === 'date' ? raw : Number(raw);
        api.commit((form) => { findField(form, field.id).validation[key] = next; }, { key: `${field.id}:val:${key}`, panel: false });
        api.refreshLimitWarning(field.id);
      },
    });
    return row(labelText, control);
  }

  function limitWarning(field) {
    const { min, max } = field.validation;
    return min !== null && max !== null && min > max ? 'The minimum is greater than the maximum, so no answer can pass.' : '';
  }

  function limitsBlock(api, field) {
    const words = LIMIT_WORDS[TYPES[field.type].limits];
    if (!words) return null;
    const type = TYPES[field.type].limits === 'date' ? 'date' : 'number';
    const warning = limitWarning(field);
    return [
      h('div', { class: 'prop-pair' },
        limitInput(api, field, 'min', words.min, type),
        limitInput(api, field, 'max', words.max, type)),
      h('p', { class: 'prop-error', 'data-limit-warning': '', hidden: !warning }, warning),
      field.type === 'number' ? checkRow('Whole numbers only', field.validation.integer, (value) => {
        api.commit((form) => { findField(form, field.id).validation.integer = value; }, { panel: false });
      }, 'val-integer') : null,
    ];
  }

  function patternTester(field) {
    const result = h('p', { class: 'prop-hint', 'aria-live': 'polite' });
    const input = h('input', { class: 'input', id: 'pattern-try', type: 'text', oninput: () => update() });
    const update = () => {
      if (!input.value) { result.textContent = ''; return; }
      result.textContent = FL.validate.patternMatches(field.validation.pattern, input.value) ? 'Matches the pattern.' : 'Does not match the pattern.';
    };
    return { el: h('div', { class: 'pattern-tester' }, row('Try a sample answer', input), result), update };
  }

  function patternBlock(api, field) {
    if (!TYPES[field.type].pattern) return null;
    const problem = FL.validate.patternProblem(field.validation.pattern);
    const setPattern = (value, opts) => api.commit((form) => { findField(form, field.id).validation.pattern = value; }, opts);
    const error = h('p', { class: 'prop-error', hidden: !problem }, problem || '');
    const tester = patternTester(field);
    tester.el.hidden = !field.validation.pattern || Boolean(problem);
    return [
      row('Pattern (regular expression)', h('input', {
        class: 'input input-mono',
        id: 'val-pattern',
        'data-fk': 'val-pattern',
        type: 'text',
        spellcheck: 'false',
        value: field.validation.pattern,
        oninput: (event) => {
          const value = event.target.value;
          setPattern(value, { key: `${field.id}:val:pattern`, panel: false });
          const next = FL.validate.patternProblem(value);
          error.textContent = next || '';
          error.hidden = !next;
          tester.el.hidden = !value || Boolean(next);
          tester.update();
        },
      }), 'The whole answer must match. Leave empty for no pattern.'),
      error,
      h('div', { class: 'prop' },
        h('select', {
          class: 'input', 'aria-label': 'Insert a common pattern', 'data-fk': 'val-preset', value: '',
          onchange: (event) => { if (event.target.value) setPattern(event.target.value); },
        }, PATTERN_PRESETS.map((preset) => h('option', { value: preset.value }, preset.label)))),
      tester.el,
    ];
  }

  function fileBlock(api, field) {
    if (field.type !== 'file') return null;
    const maxSize = h('input', {
      class: 'input', id: 'prop-max-size', type: 'number', min: '0', 'data-fk': 'prop-max-size',
      value: field.maxSizeKB === null ? '' : String(field.maxSizeKB),
      oninput: (event) => {
        const next = event.target.value === '' ? null : Number(event.target.value);
        api.commit((form) => { findField(form, field.id).maxSizeKB = next; }, { key: `${field.id}:maxSize`, panel: false });
      },
    });
    return [
      h('p', { class: 'prop-hint prop-note' }, 'This field stores the file name, size and type only. Respondents are told the file itself is not uploaded.'),
      textProp(api, field, 'accept', 'Allowed file types', { hint: 'Separated by commas, like pdf, docx. Leave empty for any.' }),
      row('Largest file size in KB', maxSize),
    ];
  }

  function validationSection(api, field) {
    if (!isQuestion(field)) return null;
    const message = h('input', {
      class: 'input', id: 'val-message', type: 'text', 'data-fk': 'val-message',
      value: field.validation.message,
      placeholder: 'Use the default message',
      oninput: (event) => api.commit((form) => { findField(form, field.id).validation.message = event.target.value; }, { key: `${field.id}:val:message`, panel: false }),
    });
    return section('Validation',
      limitsBlock(api, field),
      patternBlock(api, field),
      fileBlock(api, field),
      row('Custom error message', message, 'Replaces every default message for this question.'));
  }

  function logicSection(api, form, field) {
    const sources = FL.logic.sourcesFor(form, field);
    const rules = field.logic.rules;
    const dependents = FL.logic.dependentsOf(form, field.id);
    const isCyclic = FL.logic.findCycleMembers(form).has(field.id);
    const updateRule = (index, patch, structural) => api.commit((liveForm) => {
      Object.assign(findField(liveForm, field.id).logic.rules[index], patch);
    }, structural ? {} : { key: `${field.id}:rule:${index}`, panel: false });

    const list = rules.map((rule, index) => FL.ruleRow.render({
      form,
      rule,
      sources,
      fk: `rule-${index}`,
      isBlocked: (id) => id !== rule.fieldId && FL.logic.wouldCreateCycle(form, field.id, id),
      onChange: (patch, structural) => updateRule(index, patch, structural),
      onRemove: () => api.commit((liveForm) => { findField(liveForm, field.id).logic.rules.splice(index, 1); }),
    }));

    return section('Logic',
      isCyclic ? h('p', { class: 'prop-error' }, 'These conditions form a loop, so this field stays hidden. Remove a condition to fix it.') : null,
      rules.length > 1 ? row('Show this field when', h('select', {
        class: 'input', id: 'logic-match', 'data-fk': 'logic-match', value: field.logic.match,
        onchange: (event) => api.commit((liveForm) => { findField(liveForm, field.id).logic.match = event.target.value; }),
      }, h('option', { value: 'all' }, 'all of these are true'), h('option', { value: 'any' }, 'any of these are true'))) : null,
      rules.length === 1 ? h('p', { class: 'prop-label' }, 'Show this field when') : null,
      !rules.length ? h('p', { class: 'prop-hint' }, 'Always shown. Add a condition to show it only when another answer matches.') : null,
      list,
      h('button', {
        class: 'btn btn-small', type: 'button', 'data-fk': 'rule-add', disabled: !sources.length,
        onclick: () => api.commit((liveForm) => {
          findField(liveForm, field.id).logic.rules.push({ fieldId: '', op: 'equals', value: '' });
        }),
      }, icon('logic', 14), 'Add condition'),
      rules.length ? h('p', { class: 'prop-hint' }, 'A hidden or unanswered question makes its condition false, except "is not answered".') : null,
      dependents.length ? h('p', { class: 'prop-hint' }, `Used by: ${dependents.map((item) => item.label).join(', ')}`) : null);
  }

  function placement(api, form, field) {
    const located = FL.formOps.locate(form, field.id);
    if (form.pages.length < 2) return null;
    return h('div', { class: 'prop' },
      h('label', { class: 'prop-label', for: 'prop-page' }, 'Page'),
      h('select', {
        class: 'input', id: 'prop-page', 'data-fk': 'prop-page', value: located.page.id,
        onchange: (event) => api.commit((liveForm) => {
          const target = liveForm.pages.find((page) => page.id === event.target.value);
          FL.formOps.moveTo(liveForm, field.id, target.id, target.fields.length);
        }),
      }, form.pages.map((page, index) => h('option', { value: page.id }, `${index + 1}. ${page.title}`))));
  }

  function actions(api, field) {
    return h('div', { class: 'prop-actions' },
      h('button', { class: 'btn btn-small', type: 'button', 'data-fk': 'prop-dup', onclick: () => api.duplicate(field.id) }, icon('copy', 14), 'Duplicate'),
      h('button', { class: 'btn btn-small is-danger', type: 'button', 'data-fk': 'prop-del', onclick: () => api.remove(field.id) }, icon('trash', 14), 'Delete field'));
  }

  function renderField(api, form, field) {
    return [
      h('div', { class: 'prop-title' }, icon(field.type, 16), h('span', null, TYPES[field.type].label)),
      basics(api, field),
      optionsSection(api, field),
      scaleSection(api, field),
      validationSection(api, field),
      logicSection(api, form, field),
      section('Placement', placement(api, form, field), actions(api, field)),
    ];
  }

  function renderEmpty() {
    return h('div', { class: 'prop-empty' },
      h('p', { class: 'prop-empty-title' }, 'No field selected'),
      h('p', null, 'Select a field on the canvas to edit its question, validation and logic.'));
  }

  return { renderField, renderEmpty, limitWarning };
})();
