// Reusable form pieces: labelled fields, project pickers, tag pickers and color swatches.
(function (HG) {
  'use strict';
  const { h, icon } = HG;

  const SWATCHES = ['#2F6DB5', '#D9661F', '#0A9A8C', '#A63D9A', '#7E9A12', '#7C5CD6', '#C99A00', '#CE3A5C'];

  function field(label, control, { hint, error, className } = {}) {
    const id = control.id || HG.store.newId('f');
    control.id = id;
    return h('div', { class: `field${className ? ` ${className}` : ''}` },
      h('label', { for: id }, label), control,
      hint && h('p', { class: 'hint' }, hint),
      error && h('p', { class: 'field-error', role: 'alert' }, error));
  }

  function fieldError(text) { return h('p', { class: 'field-error', role: 'alert', hidden: true }, text || ''); }

  function setError(node, text) {
    node.textContent = text || '';
    node.hidden = !text;
  }

  function option(value, label, selected) {
    return h('option', { value, selected: value === selected }, label);
  }

  /** A project dropdown grouped by client. Value is a project id, or "" for none. */
  function projectOptions(state, selectedId) {
    const value = selectedId || '';
    const inGroup = (clientId) => state.projects.filter((p) => p.clientId === clientId).sort((a, b) => a.name.localeCompare(b.name));
    const groups = state.clients.slice().sort((a, b) => a.name.localeCompare(b.name))
      .filter((c) => inGroup(c.id).length)
      .map((c) => h('optgroup', { label: c.name }, inGroup(c.id).map((p) => option(p.id, p.name, value))));
    const loose = inGroup(null);
    return [option('', 'No project', value), groups, loose.length ? h('optgroup', { label: 'No client' }, loose.map((p) => option(p.id, p.name, value))) : null];
  }

  function projectSelect(state, selectedId, attrs) {
    return h('select', attrs || {}, projectOptions(state, selectedId));
  }

  /** Toggle chips for tags. Calls onChange with the new list of ids. */
  function tagChips(state, selected, onChange) {
    const chosen = new Set(selected);
    if (!state.tags.length) return h('p', { class: 'hint' }, 'No tags yet. Add them under Projects.');
    return h('div', { class: 'chips', role: 'group', 'aria-label': 'Tags' }, state.tags.map((tag) => {
      const chip = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(chosen.has(tag.id)), 'data-tag': tag.name }, tag.name);
      chip.addEventListener('click', () => {
        if (chosen.has(tag.id)) chosen.delete(tag.id); else chosen.add(tag.id);
        chip.setAttribute('aria-pressed', String(chosen.has(tag.id)));
        onChange([...chosen]);
      });
      return chip;
    }));
  }

  /** Radio group of color swatches. Keeps a color from outside the palette selectable, for imported data. */
  function colorPicker(selected, onChange) {
    const name = HG.store.newId('color');
    const colors = SWATCHES.includes(selected) ? SWATCHES : SWATCHES.concat(selected);
    return h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' }, colors.map((color) => {
      const input = h('input', { type: 'radio', name, value: color, checked: color === selected, 'aria-label': `Color ${color}`,
        onchange: () => onChange(color) });
      return h('label', { class: 'swatch', style: { '--swatch': color } }, input, h('span', { 'aria-hidden': 'true' }));
    }));
  }

  function dot(color) { return h('span', { class: 'dot', style: { background: color || 'var(--faint)' }, 'aria-hidden': 'true' }); }

  function projectLabel(state, entry, maps) {
    const project = maps.project.get(entry.projectId);
    const client = project ? maps.client.get(project.clientId) : null;
    return { color: project ? project.color : null, project: project ? project.name : 'No project', client: client ? client.name : '' };
  }

  function emptyState(title, text, action) {
    return h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), text && h('p', { class: 'hint' }, text), action);
  }

  function iconButton(name, label, onClick, attrs) {
    return h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onclick: onClick, ...(attrs || {}) }, icon(name));
  }

  function stat(label, value, attrs) {
    return h('div', { class: 'stat', ...(attrs || {}) }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, value));
  }

  function progressBar(item) {
    const percent = Math.round(item.ratio * 100);
    const label = `${HG.time.hours(item.usedMs)} of ${item.budgetHours} hours used`;
    return h('div', { class: `progress progress-${item.status}`, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100',
      'aria-valuenow': String(Math.min(100, percent)), 'aria-label': label },
    h('span', { style: { width: `${Math.min(100, percent)}%` } }));
  }

  /** Alert strip listing budgets over or near their limit. Returns null when there's nothing to say. */
  function budgetStrip(state, now) {
    const alerts = HG.budget.alerts(state, now);
    if (!alerts.length) return null;
    const over = alerts.filter((a) => a.status === 'over').length;
    const near = alerts.length - over;
    const parts = [];
    if (over) parts.push(`${over} over budget`);
    if (near) parts.push(`${near} near budget`);
    return h('div', { class: `alert-strip${over ? ' alert-strip-over' : ''}`, 'data-testid': 'budget-strip' },
      icon('warn'),
      h('span', { class: 'alert-strip-text' }, h('strong', null, parts.join(', ')), ` · ${HG.budget.alertText(alerts[0])}`),
      h('a', { href: '#/projects', class: 'alert-strip-link' }, 'See budgets'));
  }

  HG.ui = HG.ui || {};
  Object.assign(HG.ui, {
    SWATCHES, field, fieldError, setError, option, projectOptions, projectSelect, tagChips, colorPicker, dot, projectLabel,
    emptyState, iconButton, stat, progressBar, budgetStrip,
  });
})(window.HG);
