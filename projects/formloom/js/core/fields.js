// The field type registry: what each type is, its defaults, and how its answers read back as text.
FL.fields = (function () {
  const { uid, formatDate, formatBytes } = FL.util;

  // kind drives logic operators, sorting and charts. limits names what validation min/max mean for the type.
  const TYPES = {
    short_text: { label: 'Short text', group: 'Text', kind: 'text', limits: 'length', pattern: true, newLabel: 'Short answer' },
    long_text: { label: 'Long text', group: 'Text', kind: 'text', limits: 'length', pattern: true, newLabel: 'Tell us more' },
    email: { label: 'Email', group: 'Text', kind: 'text', limits: null, pattern: true, newLabel: 'Email address' },
    phone: { label: 'Phone', group: 'Text', kind: 'text', limits: null, pattern: true, newLabel: 'Phone number' },
    number: { label: 'Number', group: 'Values', kind: 'number', limits: 'value', pattern: false, newLabel: 'How many?' },
    date: { label: 'Date', group: 'Values', kind: 'date', limits: 'date', pattern: false, newLabel: 'Pick a date' },
    rating: { label: 'Rating', group: 'Values', kind: 'number', limits: null, pattern: false, newLabel: 'How would you rate this?' },
    scale: { label: 'Scale', group: 'Values', kind: 'number', limits: null, pattern: false, newLabel: 'How likely are you to agree?' },
    single_choice: { label: 'Single choice', group: 'Choices', kind: 'choice', limits: null, pattern: false, newLabel: 'Choose one', options: true },
    multi_choice: { label: 'Multiple choice', group: 'Choices', kind: 'multi', limits: 'count', pattern: false, newLabel: 'Choose all that apply', options: true },
    dropdown: { label: 'Dropdown', group: 'Choices', kind: 'choice', limits: null, pattern: false, newLabel: 'Select an option', options: true },
    file: { label: 'File name capture', group: 'Other', kind: 'file', limits: null, pattern: false, newLabel: 'Attach a file' },
    section: { label: 'Section break', group: 'Other', kind: 'section', limits: null, pattern: false, newLabel: 'New section' },
  };

  const GROUPS = ['Text', 'Values', 'Choices', 'Other'];

  function create(type) {
    const def = TYPES[type];
    return {
      id: uid('f'),
      type,
      label: def.newLabel,
      help: '',
      placeholder: '',
      required: false,
      options: def.options ? ['Option 1', 'Option 2', 'Option 3'] : [],
      validation: { min: null, max: null, integer: false, pattern: '', message: '' },
      logic: { match: 'all', rules: [] },
      ratingMax: 5,
      scaleMin: 1,
      scaleMax: 5,
      minLabel: '',
      maxLabel: '',
      accept: '',
      maxSizeKB: null,
    };
  }

  function isQuestion(field) {
    return field.type !== 'section';
  }

  function kindOf(field) {
    return TYPES[field.type].kind;
  }

  function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return !value.name;
    return false;
  }

  /** All fields of a form in display order, each with the page it lives on. */
  function allFields(form) {
    const list = [];
    form.pages.forEach((page) => page.fields.forEach((field) => list.push(field)));
    return list;
  }

  function findField(form, fieldId) {
    return allFields(form).find((field) => field.id === fieldId) || null;
  }

  /** The numeric choices offered by a rating or scale field. */
  function steps(field) {
    const from = field.type === 'rating' ? 1 : field.scaleMin;
    const to = field.type === 'rating' ? field.ratingMax : field.scaleMax;
    const list = [];
    for (let n = from; n <= to; n++) list.push(n);
    return list;
  }

  /** How an answer reads on screen. */
  function displayValue(field, value) {
    if (isEmpty(value)) return '';
    if (Array.isArray(value)) return value.join('; ');
    if (field.type === 'date') return formatDate(value);
    if (field.type === 'file') return `${value.name} (${formatBytes(value.size)})`;
    if (field.type === 'number') return Number(value).toLocaleString('en-US', { maximumFractionDigits: 10 });
    return String(value);
  }

  return { TYPES, GROUPS, create, isQuestion, kindOf, isEmpty, allFields, findField, steps, displayValue };
})();
