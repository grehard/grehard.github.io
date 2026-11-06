// Small DOM helpers. Text always goes in as text nodes, so user content can't
// become markup; the app never assigns innerHTML.
(function () {
  const ns = window.Coinpath;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let uidCounter = 0;

  function appendAll(parent, children) {
    children.forEach((child) => {
      if (child == null || child === false) return;
      if (Array.isArray(child)) appendAll(parent, child);
      else parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    });
  }

  function applyProp(node, key, value) {
    if (value == null) return;
    if (key === 'class') node.className = value;
    else if (key === 'for') node.htmlFor = value;
    else if (key === 'form') node.setAttribute('form', value);
    else if (/^on[A-Z]/.test(key)) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node && !key.includes('-')) node[key] = value;
    else if (value !== false) node.setAttribute(key, value === true ? '' : value);
  }

  /** el('button', { class: 'btn', onClick: fn }, 'Save') */
  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    Object.keys(props || {}).forEach((key) => applyProp(node, key, props[key]));
    appendAll(node, children);
    return node;
  }

  function svg(tag, attrs, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach((key) => {
      const value = attrs[key];
      if (value == null) return;
      if (/^on[A-Z]/.test(key)) node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value);
    });
    appendAll(node, children);
    return node;
  }

  const ICONS = {
    dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    budget: 'M12 3a9 9 0 1 0 9 9h-9z M15 3.5A8 8 0 0 1 20.5 9H15z',
    wallet: 'M4 7a2 2 0 0 1 2-2h12v4M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16 14h.01',
    repeat: 'M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4v-1',
    settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5h4v4h-4zM6 15h4v4H6z',
    plus: 'M12 5v14M5 12h14',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
    close: 'M6 6l12 12M18 6L6 18',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
    left: 'M15 6l-6 6 6 6',
    right: 'M9 6l6 6-6 6',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    pause: 'M8 5v14M16 5v14',
    play: 'M7 5l12 7-12 7z',
  };

  function icon(name, size) {
    return svg('svg', {
      class: 'icon', viewBox: '0 0 24 24', width: size || 16, height: size || 16, 'aria-hidden': 'true', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }, svg('path', { d: ICONS[name] }));
  }

  function uid(prefix) {
    uidCounter += 1;
    return prefix + '-' + uidCounter;
  }

  function button(label, opts) {
    const o = opts || {};
    return el('button', { type: 'button', class: 'btn ' + (o.variant || ''), onClick: o.onClick, disabled: !!o.disabled }, o.icon && icon(o.icon), label);
  }

  function iconButton(name, label, onClick, extraClass) {
    return el('button', { type: 'button', class: 'icon-btn ' + (extraClass || ''), 'aria-label': label, title: label, onClick }, icon(name));
  }

  function select(options, value, props) {
    const node = el('select', props, options.map((o) => el('option', { value: o.value }, o.label)));
    node.value = value == null ? '' : value;
    if (node.selectedIndex < 0) node.selectedIndex = 0;
    return node;
  }

  /** A labelled control with hint and error slots. showError finds the slot from the control. */
  function field(label, control, opts) {
    const o = opts || {};
    control.id = control.id || uid('field');
    const errorId = control.id + '-error';
    const hintId = control.id + '-hint';
    control.setAttribute('aria-describedby', (o.hint ? hintId + ' ' : '') + errorId);
    return el('div', { class: 'field ' + (o.class || ''), 'data-field': '' },
      el('label', { for: control.id }, label),
      control,
      o.hint && el('p', { class: 'field-hint', id: hintId }, o.hint),
      el('p', { class: 'field-error', id: errorId, hidden: true }));
  }

  function showError(control, message) {
    const slot = document.getElementById(control.id + '-error');
    if (slot) { slot.textContent = message || ''; slot.hidden = !message; }
    if (message) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
  }

  /** Runs [control, message] checks, shows each result, focuses the first failure. True when all pass. */
  function validate(checks) {
    let first = null;
    checks.forEach(([control, message]) => {
      showError(control, message);
      if (message && !first) first = control;
    });
    if (first) first.focus();
    return !first;
  }

  /** Radio group styled as a segmented control. */
  function segmented(legend, name, options, value, onChange) {
    const fieldset = el('fieldset', { class: 'segmented' }, el('legend', { class: 'field-label' }, legend),
      el('div', { class: 'segmented-row' }, options.map((o) => el('label', { class: 'segment' },
        el('input', { type: 'radio', name, value: o.value, checked: o.value === value, onChange: () => onChange && onChange(o.value) }),
        el('span', null, o.label)))));
    fieldset.getValue = () => fieldset.querySelector('input:checked').value;
    return fieldset;
  }

  function emptyState(title, message, action) {
    return el('div', { class: 'empty' }, el('p', { class: 'empty-title' }, title), message && el('p', null, message), action);
  }

  function swatch(color) {
    return el('span', { class: 'swatch', style: 'background:' + (color || 'var(--neutral-mark)'), 'aria-hidden': 'true' });
  }

  function pageHead(title, subtitle, actions) {
    return el('header', { class: 'page-head' },
      el('div', { class: 'page-title' },
        el('h1', { id: 'page-heading', tabIndex: -1 }, title),
        subtitle && el('p', null, subtitle)),
      actions && el('div', { class: 'page-actions' }, actions));
  }

  function tile(label, value, sub, opts) {
    const o = opts || {};
    return el('div', { class: 'tile', 'data-tile': label },
      el('div', { class: 'tile-label' }, label),
      el('div', { class: 'tile-value ' + (o.tone || '') }, value),
      sub && el('div', { class: 'tile-sub' }, sub));
  }

  /** Month back/forward control shared by the dashboard and budgets pages. */
  function monthStepper(month, onChange) {
    const { Dates } = ns;
    const current = Dates.monthOf(Dates.today());
    return el('div', { class: 'stepper', role: 'group', 'aria-label': 'Month' },
      iconButton('left', 'Previous month', () => onChange(Dates.shiftMonth(month, -1))),
      el('span', { class: 'stepper-label', 'aria-live': 'polite' }, Dates.monthLabel(month)),
      iconButton('right', 'Next month', () => onChange(Dates.shiftMonth(month, 1))),
      month !== current && el('button', { type: 'button', class: 'btn btn-quiet', onClick: () => onChange(current) }, 'This month'));
  }

  ns.Dom = { el, svg, icon, uid, button, iconButton, select, field, showError, validate, segmented, emptyState, swatch, pageHead, tile, monthStepper };
})();
