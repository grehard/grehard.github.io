// Builds new forms and normalizes anything loaded from storage, a file or a share link.
// Nothing outside the app is trusted: every value is coerced or rejected here.
FL.schema = (function () {
  const { uid } = FL.util;
  const { TYPES, create } = FL.fields;

  const LIMITS = { pages: 50, fields: 500, options: 200, title: 300, label: 500, text: 4000 };
  const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
  const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
  const THEME_CHOICES = {
    background: ['paper', 'white', 'mist', 'tint'],
    font: ['sans', 'serif', 'mono'],
    corners: ['soft', 'square', 'round'],
    header: ['plain', 'band'],
  };
  const OPERATORS = ['equals', 'not_equals', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte', 'answered', 'not_answered'];

  function defaultTheme() {
    return { accent: '#1c5a45', background: 'paper', font: 'sans', corners: 'soft', header: 'plain', showProgress: true };
  }

  function defaultSettings() {
    return {
      submitLabel: 'Submit',
      confirmTitle: 'Thank you',
      confirmMessage: 'Your response has been recorded.',
      allowAnother: true,
      showSummary: true,
    };
  }

  function blankForm(title) {
    const now = Date.now();
    return {
      id: uid('form'),
      title: title || 'Untitled form',
      description: '',
      createdAt: now,
      updatedAt: now,
      pages: [{ id: uid('p'), title: 'Page 1', fields: [] }],
      theme: defaultTheme(),
      settings: defaultSettings(),
    };
  }

  function text(value, max, fallback) {
    if (typeof value !== 'string' && typeof value !== 'number') return fallback === undefined ? '' : fallback;
    return String(value).slice(0, max);
  }

  function finiteOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function cleanOptions(raw) {
    const seen = new Set();
    const options = [];
    (Array.isArray(raw) ? raw : []).forEach((item) => {
      const label = text(item, LIMITS.label).trim();
      if (label && !seen.has(label) && options.length < LIMITS.options) {
        seen.add(label);
        options.push(label);
      }
    });
    return options;
  }

  function cleanValidation(raw, base) {
    const source = isObject(raw) ? raw : {};
    const dateOrNumber = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : finiteOrNull(value));
    return {
      min: dateOrNumber(source.min),
      max: dateOrNumber(source.max),
      integer: source.integer === true,
      pattern: text(source.pattern, 500, base.pattern),
      message: text(source.message, LIMITS.label, base.message),
    };
  }

  function cleanRule(raw) {
    if (!isObject(raw) || typeof raw.fieldId !== 'string') return null;
    return {
      fieldId: raw.fieldId,
      op: OPERATORS.includes(raw.op) ? raw.op : 'equals',
      value: text(raw.value, LIMITS.label),
    };
  }

  function cleanLogic(raw) {
    const source = isObject(raw) ? raw : {};
    const rules = (Array.isArray(source.rules) ? source.rules : []).map(cleanRule).filter(Boolean);
    return { match: source.match === 'any' ? 'any' : 'all', rules };
  }

  function clampInt(value, low, high, fallback) {
    const num = Math.round(Number(value));
    return Number.isFinite(num) ? Math.min(high, Math.max(low, num)) : fallback;
  }

  function cleanField(raw, usedIds) {
    const field = create(raw.type);
    if (typeof raw.id === 'string' && ID_PATTERN.test(raw.id) && !usedIds.has(raw.id)) field.id = raw.id;
    usedIds.add(field.id);
    field.label = text(raw.label, LIMITS.label, field.label);
    field.help = text(raw.help, LIMITS.text);
    field.placeholder = text(raw.placeholder, LIMITS.label);
    field.required = raw.required === true && field.type !== 'section';
    if (TYPES[field.type].options && raw.options !== undefined) field.options = cleanOptions(raw.options);
    field.validation = cleanValidation(raw.validation, field.validation);
    field.logic = cleanLogic(raw.logic);
    field.ratingMax = clampInt(raw.ratingMax, 3, 10, 5);
    field.scaleMin = clampInt(raw.scaleMin, -10, 10, 1);
    field.scaleMax = clampInt(raw.scaleMax, field.scaleMin + 1, field.scaleMin + 20, Math.max(5, field.scaleMin + 1));
    field.minLabel = text(raw.minLabel, 100);
    field.maxLabel = text(raw.maxLabel, 100);
    field.accept = text(raw.accept, 200);
    field.maxSizeKB = finiteOrNull(raw.maxSizeKB);
    return field;
  }

  function cleanTheme(raw) {
    const source = isObject(raw) ? raw : {};
    const theme = defaultTheme();
    if (typeof source.accent === 'string' && HEX_PATTERN.test(source.accent)) theme.accent = source.accent.toLowerCase();
    Object.keys(THEME_CHOICES).forEach((key) => {
      if (THEME_CHOICES[key].includes(source[key])) theme[key] = source[key];
    });
    if (source.showProgress === false) theme.showProgress = false;
    return theme;
  }

  function cleanSettings(raw) {
    const source = isObject(raw) ? raw : {};
    const base = defaultSettings();
    return {
      submitLabel: text(source.submitLabel, 60, base.submitLabel) || base.submitLabel,
      confirmTitle: text(source.confirmTitle, LIMITS.label, base.confirmTitle),
      confirmMessage: text(source.confirmMessage, LIMITS.text, base.confirmMessage),
      allowAnother: source.allowAnother !== false,
      showSummary: source.showSummary !== false,
    };
  }

  /** Drops rules that point at a field that no longer exists and reports how many went. */
  function dropDanglingRules(pages) {
    const ids = new Set();
    pages.forEach((page) => page.fields.forEach((field) => { if (field.type !== 'section') ids.add(field.id); }));
    let dropped = 0;
    pages.forEach((page) => page.fields.forEach((field) => {
      const kept = field.logic.rules.filter((rule) => ids.has(rule.fieldId));
      dropped += field.logic.rules.length - kept.length;
      field.logic.rules = kept;
    }));
    return dropped;
  }

  function cleanPages(rawPages, errors) {
    const usedIds = new Set();
    let fieldCount = 0;
    const pages = rawPages.slice(0, LIMITS.pages).map((rawPage, pageIndex) => {
      const page = isObject(rawPage) ? rawPage : {};
      const rawFields = Array.isArray(page.fields) ? page.fields : [];
      const fields = [];
      rawFields.forEach((rawField, fieldIndex) => {
        const where = `Page ${pageIndex + 1}, field ${fieldIndex + 1}`;
        if (!isObject(rawField)) errors.push(`${where} is not an object.`);
        else if (!TYPES[rawField.type]) errors.push(`${where} has an unknown type: "${text(rawField.type, 40)}".`);
        else if (fieldCount >= LIMITS.fields) errors.push(`A form can have at most ${LIMITS.fields} fields.`);
        else { fields.push(cleanField(rawField, usedIds)); fieldCount++; }
      });
      const pageId = typeof page.id === 'string' && ID_PATTERN.test(page.id) ? page.id : uid('p');
      return { id: pageId, title: text(page.title, LIMITS.title, `Page ${pageIndex + 1}`), fields };
    });
    return pages;
  }

  /**
   * Returns { form, errors, warnings }. form is null when errors is non-empty.
   * Unknown field types are errors, because silently dropping a question changes what is asked.
   */
  function normalizeForm(raw) {
    const errors = [];
    const warnings = [];
    if (!isObject(raw)) return { form: null, errors: ['The form data is not an object.'], warnings };
    if (!Array.isArray(raw.pages) || raw.pages.length === 0) {
      return { form: null, errors: ['The form has no "pages" list.'], warnings };
    }
    const pages = cleanPages(raw.pages, errors);
    if (errors.length) return { form: null, errors: Array.from(new Set(errors)), warnings };
    const dropped = dropDanglingRules(pages);
    if (dropped) warnings.push(`${dropped} logic ${dropped === 1 ? 'rule pointed' : 'rules pointed'} at a missing field and ${dropped === 1 ? 'was' : 'were'} removed.`);
    const now = Date.now();
    const form = {
      id: typeof raw.id === 'string' && ID_PATTERN.test(raw.id) ? raw.id : uid('form'),
      title: text(raw.title, LIMITS.title, 'Untitled form') || 'Untitled form',
      description: text(raw.description, LIMITS.text),
      createdAt: finiteOrNull(raw.createdAt) || now,
      updatedAt: finiteOrNull(raw.updatedAt) || now,
      pages,
      theme: cleanTheme(raw.theme),
      settings: cleanSettings(raw.settings),
    };
    return { form, errors, warnings };
  }

  function cleanAnswer(value) {
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return value;
    if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
    if (isObject(value) && typeof value.name === 'string') {
      return { name: value.name.slice(0, 300), size: Number(value.size) || 0, type: text(value.type, 120) };
    }
    return undefined;
  }

  function normalizeResponse(raw) {
    if (!isObject(raw) || !isObject(raw.answers)) return null;
    const submittedAt = Number(raw.submittedAt);
    if (!Number.isFinite(submittedAt)) return null;
    const answers = {};
    Object.keys(raw.answers).forEach((key) => {
      const clean = cleanAnswer(raw.answers[key]);
      if (clean !== undefined) answers[key] = clean;
    });
    return {
      id: typeof raw.id === 'string' && ID_PATTERN.test(raw.id) ? raw.id : uid('r'),
      submittedAt,
      answers,
    };
  }

  /** Deep copy with fresh page and field ids. Rules and response keys are remapped through idMap. */
  function cloneWithNewIds(form) {
    const copy = JSON.parse(JSON.stringify(form));
    const idMap = {};
    copy.id = uid('form');
    copy.createdAt = Date.now();
    copy.updatedAt = copy.createdAt;
    copy.pages.forEach((page) => {
      page.id = uid('p');
      page.fields.forEach((field) => {
        const fresh = uid('f');
        idMap[field.id] = fresh;
        field.id = fresh;
      });
    });
    copy.pages.forEach((page) => page.fields.forEach((field) => {
      field.logic.rules.forEach((rule) => { rule.fieldId = idMap[rule.fieldId] || rule.fieldId; });
    }));
    return { form: copy, idMap };
  }

  /** Reads an exported form file. Returns { form, responses, errors, warnings }. */
  function parseFormFile(fileText) {
    let data;
    try {
      data = JSON.parse(fileText);
    } catch (err) {
      return { form: null, responses: [], errors: ['This file is not valid JSON.'], warnings: [] };
    }
    if (!isObject(data)) return { form: null, responses: [], errors: ['This file is not a Formloom form.'], warnings: [] };
    const wrapped = data.format === 'formloom-form';
    const rawForm = wrapped ? data.form : data;
    if (!wrapped && !Array.isArray(data.pages)) {
      return { form: null, responses: [], errors: ['This file is not a Formloom form: it has no "pages" list.'], warnings: [] };
    }
    const result = normalizeForm(rawForm);
    const rawResponses = wrapped && Array.isArray(data.responses) ? data.responses : [];
    const responses = rawResponses.map(normalizeResponse).filter(Boolean);
    if (rawResponses.length !== responses.length) {
      result.warnings.push(`${rawResponses.length - responses.length} damaged responses were skipped.`);
    }
    return { form: result.form, responses, errors: result.errors, warnings: result.warnings };
  }

  return { LIMITS, defaultTheme, defaultSettings, blankForm, normalizeForm, normalizeResponse, cloneWithNewIds, parseFormFile };
})();
