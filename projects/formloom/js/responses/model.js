// Filtering, sorting and per-question statistics for stored responses. No DOM in this file.
FL.responseModel = (function () {
  const { allFields, isQuestion, isEmpty, kindOf, findField, displayValue } = FL.fields;
  const { isoDate } = FL.util;

  function matchesSearch(form, response, term) {
    if (!term) return true;
    const needle = term.trim().toLowerCase();
    return allFields(form).some((field) => {
      if (!isQuestion(field)) return false;
      return displayValue(field, response.answers[field.id]).toLowerCase().includes(needle);
    });
  }

  function matchesRule(form, response, rule) {
    if (!rule || !rule.fieldId) return true;
    const source = findField(form, rule.fieldId);
    if (!source) return true;
    if (FL.logic.needsValue(rule.op) && isEmpty(rule.value)) return true; // a filter still being typed filters nothing
    return FL.logic.evaluateRule(rule, source, response.answers[rule.fieldId]);
  }

  function matchesDates(response, from, to) {
    const day = isoDate(new Date(response.submittedAt));
    return (!from || day >= from) && (!to || day <= to);
  }

  function filter(form, responses, filters) {
    return responses.filter((response) => matchesSearch(form, response, filters.search)
      && matchesRule(form, response, filters.rule)
      && matchesDates(response, filters.from, filters.to));
  }

  function sortValue(field, value) {
    if (isEmpty(value)) return null;
    if (kindOf(field) === 'number') return Number(value);
    if (Array.isArray(value)) return value.join('; ').toLowerCase();
    if (typeof value === 'object') return value.name.toLowerCase();
    return String(value).toLowerCase();
  }

  /** Stable sort by a question or by submission time. Blank answers always sort last. */
  function sort(form, responses, key, direction) {
    const sign = direction === 'asc' ? 1 : -1;
    const field = key === 'submitted' ? null : findField(form, key);
    const read = (response) => (field ? sortValue(field, response.answers[field.id]) : response.submittedAt);
    return responses.slice().sort((a, b) => {
      const left = read(a);
      const right = read(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * sign;
      return String(left).localeCompare(String(right), 'en', { numeric: true }) * sign;
    });
  }

  function countOptions(field, answered) {
    const counts = new Map(field.options.map((option) => [option, 0]));
    answered.forEach((value) => {
      (Array.isArray(value) ? value : [value]).forEach((item) => {
        counts.set(item, (counts.get(item) || 0) + 1); // answers to options later renamed or removed still count
      });
    });
    return Array.from(counts, ([label, count]) => ({ label, count }));
  }

  function median(sorted) {
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function numberStats(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const total = sorted.reduce((sum, value) => sum + value, 0);
    return { min: sorted[0], max: sorted[sorted.length - 1], mean: total / sorted.length, median: median(sorted) };
  }

  const MAX_DISTINCT_BARS = 8;
  const BIN_COUNT = 6;

  function numberBins(values, format) {
    const distinct = Array.from(new Set(values)).sort((a, b) => a - b);
    if (distinct.length <= MAX_DISTINCT_BARS) {
      return distinct.map((value) => ({ label: format(value), count: values.filter((item) => item === value).length }));
    }
    const low = distinct[0];
    const size = (distinct[distinct.length - 1] - low) / BIN_COUNT;
    const bins = [];
    for (let i = 0; i < BIN_COUNT; i++) {
      const start = low + size * i;
      bins.push({ label: `${format(start)}+`, count: 0 });
    }
    values.forEach((value) => {
      bins[Math.min(BIN_COUNT - 1, Math.floor((value - low) / size))].count++;
    });
    return bins;
  }

  function stepCounts(field, answered) {
    return FL.fields.steps(field).map((step) => ({
      label: String(step),
      count: answered.filter((value) => Number(value) === step).length,
    }));
  }

  function monthCounts(dates) {
    const counts = new Map();
    dates.slice().sort().forEach((date) => {
      const month = date.slice(0, 7);
      counts.set(month, (counts.get(month) || 0) + 1);
    });
    return Array.from(counts, ([month, count]) => ({ label: month, count }));
  }

  /** Responses per day across the last n days, ending today. */
  function dailyCounts(responses, days) {
    const today = new Date();
    const points = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = isoDate(FL.util.addDays(today, -i));
      points.push({ day, label: FL.util.formatDate(day), count: 0 });
    }
    const byDay = new Map(points.map((point) => [point.day, point]));
    responses.forEach((response) => {
      const point = byDay.get(isoDate(new Date(response.submittedAt)));
      if (point) point.count++;
    });
    return points;
  }

  function answeredValues(field, responses) {
    return responses.map((response) => response.answers[field.id]).filter((value) => !isEmpty(value));
  }

  return { filter, sort, countOptions, numberStats, numberBins, stepCounts, monthCounts, dailyCounts, answeredValues };
})();
