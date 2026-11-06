// One "question / operator / value" row. Used by the logic editor and by the responses filter.
FL.ruleRow = (function () {
  const { h } = FL.util;
  const { kindOf, steps, findField } = FL.fields;
  const { opsFor, needsValue } = FL.logic;

  function valueOptions(source) {
    if (source.type === 'rating' || source.type === 'scale') return steps(source).map(String);
    return source.options;
  }

  function valueControl(source, rule, onValue, fk, label) {
    const kind = kindOf(source);
    const shared = { class: 'input', 'data-fk': `${fk}-value`, 'aria-label': label };
    const fixedChoices = kind === 'choice' || kind === 'multi' || source.type === 'rating' || source.type === 'scale';
    if (fixedChoices) {
      return h('select', Object.assign({}, shared, { value: rule.value, onchange: (event) => onValue(event.target.value, true) }),
        h('option', { value: '' }, 'Choose...'),
        valueOptions(source).map((option) => h('option', { value: option }, option)));
    }
    const type = kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text';
    return h('input', Object.assign({}, shared, { type, value: rule.value, oninput: (event) => onValue(event.target.value, false) }));
  }

  /**
   * options: { form, rule, sources, isBlocked(id), onChange(patch, structural), onRemove, fk, removeLabel }
   * structural is true when the row's controls need redrawing, for example after the source question changes.
   */
  function render(options) {
    const { form, rule, sources, isBlocked, onChange, onRemove, fk } = options;
    const source = findField(form, rule.fieldId);
    const sourceSelect = h('select', {
      class: 'input',
      'data-fk': `${fk}-source`,
      'aria-label': 'Question',
      value: source ? source.id : '',
      onchange: (event) => {
        const next = findField(form, event.target.value);
        const ops = next ? opsFor(next) : [];
        onChange({ fieldId: event.target.value, op: ops.length ? ops[0].value : 'answered', value: '' }, true);
      },
    },
    h('option', { value: '' }, 'Choose a question...'),
    sources.map((item) => {
      const blocked = isBlocked && isBlocked(item.id);
      return h('option', { value: item.id, disabled: blocked }, `${item.label}${blocked ? ' (would create a loop)' : ''}`);
    }));

    const parts = [sourceSelect];
    if (source) {
      parts.push(h('select', {
        class: 'input',
        'data-fk': `${fk}-op`,
        'aria-label': 'Condition',
        value: rule.op,
        onchange: (event) => onChange({ op: event.target.value }, true),
      }, opsFor(source).map((op) => h('option', { value: op.value }, op.label))));
      if (needsValue(rule.op)) {
        parts.push(valueControl(source, rule, (value, structural) => onChange({ value }, structural), fk, 'Value'));
      }
    }
    return h('div', { class: 'rule-row', 'data-rule': fk },
      h('div', { class: 'rule-fields' }, parts),
      onRemove ? h('button', {
        class: 'btn-icon', type: 'button', 'aria-label': options.removeLabel || 'Remove condition', 'data-fk': `${fk}-remove`, onclick: onRemove,
      }, FL.icons.icon('close')) : null);
  }

  return { render };
})();
