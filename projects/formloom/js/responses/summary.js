// Per-question summary: each question type gets the chart that suits its answers.
FL.responseSummary = (function () {
  const { h, formatNumber, formatDate, formatBytes, plural } = FL.util;
  const { allFields, isQuestion, kindOf, displayValue } = FL.fields;
  const model = FL.responseModel;
  const charts = FL.charts;
  const TEXT_PREVIEW = 5;

  function numberBody(field, values) {
    const numbers = values.map(Number).filter(Number.isFinite);
    if (!numbers.length) return null;
    const stats = model.numberStats(numbers);
    const distribution = field.type === 'number'
      ? model.numberBins(numbers, formatNumber)
      : model.stepCounts(field, values);
    return [
      h('div', { class: 'stats-row' },
        charts.stat('Average', Number(stats.mean.toFixed(2))),
        charts.stat('Median', stats.median),
        charts.stat('Lowest', stats.min),
        charts.stat('Highest', stats.max)),
      charts.columns(distribution),
    ];
  }

  function dateBody(values) {
    const sorted = values.slice().sort();
    return [
      h('div', { class: 'stats-row' },
        charts.stat('Earliest', formatDate(sorted[0])),
        charts.stat('Latest', formatDate(sorted[sorted.length - 1]))),
      charts.columns(model.monthCounts(values)),
    ];
  }

  function textBody(field, values) {
    const list = h('ul', { class: 'text-answers' });
    const paint = (limit) => {
      FL.util.clear(list);
      values.slice().reverse().slice(0, limit).forEach((value) => list.append(h('li', null, displayValue(field, value))));
    };
    paint(TEXT_PREVIEW);
    let expanded = false;
    const toggle = values.length > TEXT_PREVIEW ? h('button', {
      class: 'link-button', type: 'button',
      onclick: (event) => {
        expanded = !expanded;
        paint(expanded ? values.length : TEXT_PREVIEW);
        event.currentTarget.textContent = expanded ? 'Show fewer' : `Show all ${values.length.toLocaleString('en-US')} answers`;
      },
    }, `Show all ${values.length.toLocaleString('en-US')} answers`) : null;
    return [list, toggle];
  }

  function fileBody(field, values) {
    const total = values.reduce((sum, value) => sum + (Number(value.size) || 0), 0);
    return [
      h('div', { class: 'stats-row' },
        charts.stat('Files named', values.length),
        charts.stat('Combined size', formatBytes(total))),
      h('p', { class: 'summary-note' }, 'Metadata only. No file contents are stored.'),
      textBody(field, values),
    ];
  }

  function bodyFor(field, values) {
    if (!values.length) return h('p', { class: 'summary-note' }, 'No answers yet.');
    switch (kindOf(field)) {
      case 'choice': return charts.horizontalBars(model.countOptions(field, values), values.length);
      case 'multi': return charts.horizontalBars(model.countOptions(field, values), values.length);
      case 'number': return numberBody(field, values);
      case 'date': return dateBody(values);
      case 'file': return fileBody(field, values);
      default: return textBody(field, values);
    }
  }

  function questionCard(form, field, index, responses) {
    const values = model.answeredValues(field, responses);
    const logicNote = field.logic.rules.length ? h('p', { class: 'summary-note' }, FL.logic.describe(form, field)) : null;
    return h('article', { class: 'summary-card', 'data-question': field.id },
      h('header', { class: 'summary-head' },
        h('h3', null, `${index + 1}. ${field.label}`),
        h('span', { class: 'summary-count' }, `${values.length.toLocaleString('en-US')} of ${plural(responses.length, 'response')}`)),
      logicNote,
      bodyFor(field, values));
  }

  function overview(responses) {
    const lastWeek = model.dailyCounts(responses, 7).reduce((sum, point) => sum + point.count, 0);
    const latest = responses.length ? Math.max(...responses.map((response) => response.submittedAt)) : null;
    return h('article', { class: 'summary-card summary-overview' },
      h('div', { class: 'stats-row' },
        charts.stat('Responses', responses.length),
        charts.stat('Last 7 days', lastWeek),
        charts.stat('Latest', latest ? FL.util.formatDate(FL.util.isoDate(new Date(latest))) : 'None')),
      h('h3', { class: 'summary-sub' }, 'Responses per day, last 30 days'),
      charts.timeline(model.dailyCounts(responses, 30)));
  }

  function render(form, responses) {
    const questions = allFields(form).filter(isQuestion);
    return h('div', { class: 'summary-grid' },
      overview(responses),
      questions.map((field, index) => questionCard(form, field, index, responses)));
  }

  return { render };
})();
