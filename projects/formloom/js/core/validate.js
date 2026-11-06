// Validation rules for answers. Every failure returns the sentence shown to the respondent.
FL.validate = (function () {
  const { isEmpty, allFields, isQuestion } = FL.fields;
  const { formatDate, formatNumber, formatBytes, plural } = FL.util;

  const REQUIRED = 'This question is required.';
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_CHARS = /^\+?[\d\s().-]+$/;
  const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;
  const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  // A quantified group holding another quantifier, like (a+)+. Patterns can arrive in a share link,
  // and this shape can backtrack long enough to freeze the respondent's tab.
  const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/;
  const MAX_PATTERN = 200;

  /** Returns why a pattern can't be used, or null when it is fine. */
  function patternProblem(pattern) {
    if (!pattern) return null;
    if (pattern.length > MAX_PATTERN) return `Keep the pattern under ${MAX_PATTERN} characters.`;
    if (NESTED_QUANTIFIER.test(pattern)) return 'Repeats inside repeats, like (a+)+, can freeze the form. Simplify the pattern.';
    try {
      new RegExp(pattern); // eslint-disable-line no-new
      return null;
    } catch (err) {
      return 'This is not a valid regular expression.';
    }
  }

  /** The pattern must match the whole answer, the same way the HTML pattern attribute works. */
  function patternMatches(pattern, value) {
    if (!pattern || patternProblem(pattern)) return true;
    return new RegExp(`^(?:${pattern})$`).test(value);
  }

  function isRealDate(value) {
    const match = ISO_DATE.exec(value);
    if (!match) return false;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
  }

  function checkLength(field, text) {
    const { min, max } = field.validation;
    const count = Array.from(text).length;
    if (typeof min === 'number' && count < min) return `Enter at least ${plural(min, 'character')}.`;
    if (typeof max === 'number' && count > max) return `Enter no more than ${plural(max, 'character')}.`;
    return null;
  }

  function checkNumber(field, raw) {
    const text = String(raw).trim();
    if (!NUMBER.test(text) || !Number.isFinite(Number(text))) return 'Enter a number.';
    const num = Number(text);
    const { min, max, integer } = field.validation;
    if (integer && !Number.isInteger(num)) return 'Enter a whole number.';
    if (typeof min === 'number' && num < min) return `Enter a number of at least ${formatNumber(min)}.`;
    if (typeof max === 'number' && num > max) return `Enter a number no greater than ${formatNumber(max)}.`;
    return null;
  }

  function checkDate(field, value) {
    if (!isRealDate(value)) return 'Enter a real date.';
    const { min, max } = field.validation;
    if (typeof min === 'string' && value < min) return `Choose a date on or after ${formatDate(min)}.`;
    if (typeof max === 'string' && value > max) return `Choose a date on or before ${formatDate(max)}.`;
    return null;
  }

  function checkCount(field, value) {
    const { min, max } = field.validation;
    if (typeof min === 'number' && value.length < min) return `Select at least ${plural(min, 'option')}.`;
    if (typeof max === 'number' && value.length > max) return `Select no more than ${plural(max, 'option')}.`;
    return null;
  }

  function acceptedExtensions(field) {
    return field.accept.split(',').map((item) => item.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
  }

  function checkFile(field, value) {
    const allowed = acceptedExtensions(field);
    const extension = (value.name.split('.').pop() || '').toLowerCase();
    if (allowed.length && !allowed.includes(extension)) return `Choose a file of type: ${allowed.join(', ')}.`;
    if (typeof field.maxSizeKB === 'number' && value.size > field.maxSizeKB * 1024) {
      return `Choose a file no larger than ${formatBytes(field.maxSizeKB * 1024)}.`;
    }
    return null;
  }

  function checkByType(field, value) {
    const text = typeof value === 'string' ? value.trim() : value;
    switch (field.type) {
      case 'short_text': case 'long_text': return checkLength(field, text);
      case 'email': return EMAIL.test(text) ? null : 'Enter a valid email address, like name@example.com.';
      case 'phone': {
        const digits = text.replace(/\D/g, '').length;
        return PHONE_CHARS.test(text) && digits >= 7 && digits <= 15 ? null : 'Enter a valid phone number, with 7 to 15 digits.';
      }
      case 'number': return checkNumber(field, value);
      case 'date': return checkDate(field, text);
      case 'multi_choice': return checkCount(field, value);
      case 'file': return checkFile(field, value);
      default: return null;
    }
  }

  function defaultMessage(field, value) {
    if (isEmpty(value)) return field.required ? REQUIRED : null;
    const problem = checkByType(field, value);
    if (problem) return problem;
    if (FL.fields.TYPES[field.type].pattern && !patternMatches(field.validation.pattern, String(value).trim())) {
      return "This answer doesn't match the expected format.";
    }
    return null;
  }

  /** Returns the message to show, or null when the answer passes. A custom message replaces any default. */
  function validateField(field, value) {
    if (!isQuestion(field)) return null;
    const message = defaultMessage(field, value);
    return message ? field.validation.message.trim() || message : null;
  }

  /** Keeps only answers to visible questions, with typed values, ready to be stored. */
  function finalizeAnswers(form, answers) {
    const { visible } = FL.logic.computeVisibility(form, answers);
    const clean = {};
    allFields(form).forEach((field) => {
      const value = answers[field.id];
      if (!visible[field.id] || !isQuestion(field) || isEmpty(value)) return;
      if (field.type === 'number') clean[field.id] = Number(String(value).trim());
      else clean[field.id] = typeof value === 'string' ? value.trim() : value;
    });
    return clean;
  }

  return { REQUIRED, patternProblem, patternMatches, validateField, finalizeAnswers };
})();
