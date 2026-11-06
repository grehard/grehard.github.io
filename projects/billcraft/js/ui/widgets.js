// Shared interface pieces: modals, toasts, form fields, badges, page headers.
(function () {
  const BC = window.BC;
  const { h, icon, uid } = BC.dom;

  /* Toast */
  let toastTimer = null;
  function hideToast() {
    clearTimeout(toastTimer);
    document.getElementById('toast-root').replaceChildren();
  }

  function toast(message, options) {
    const opts = options || {};
    const root = document.getElementById('toast-root');
    clearTimeout(toastTimer);
    const undo = opts.undo && h('button', {
      class: 'toast-action',
      type: 'button',
      onclick: () => { hideToast(); opts.undo(); },
    }, 'Undo');
    root.replaceChildren(h('div', { class: `toast${opts.tone === 'error' ? ' toast-error' : ''}` }, h('span', {}, message), undo));
    toastTimer = setTimeout(hideToast, opts.undo ? 8000 : 4000);
  }

  // An undo restores the exact earlier state, so any later change closes the offer.
  BC.store.subscribe(hideToast);

  function undoable(message, change) {
    const before = BC.store.snapshot();
    const result = change();
    toast(message, { undo: () => BC.store.restore(before) });
    return result;
  }

  /* Modal */
  const modalStack = [];
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

  function closeTop() {
    const top = modalStack.pop();
    if (!top) return;
    top.node.remove();
    if (top.opener && top.opener.isConnected) top.opener.focus();
    else if (!modalStack.length) { const main = document.getElementById('main'); if (main) main.focus({ preventScroll: true }); }
  }

  function trapFocus(event, panel) {
    if (event.key !== 'Tab') return;
    const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  // Opens a modal. `content` is a node; `footer` an array of buttons.
  function modal({ title, content, footer, wide }) {
    const titleId = uid('modal-title');
    const panel = h('div', { class: `modal${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('header', { class: 'modal-head' },
        h('h2', { id: titleId }, title),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeTop }, icon('close'))),
      h('div', { class: 'modal-body' }, content),
      footer && h('footer', { class: 'modal-foot' }, footer));
    const backdrop = h('div', {
      class: 'modal-backdrop',
      onmousedown: (event) => { if (event.target === backdrop) closeTop(); },
      onkeydown: (event) => {
        if (event.key === 'Escape') { event.stopPropagation(); closeTop(); }
        else trapFocus(event, panel);
      },
    }, panel);
    modalStack.push({ node: backdrop, opener: document.activeElement });
    document.getElementById('modal-root').appendChild(backdrop);
    const target = panel.querySelector('.modal-body input, .modal-body select, .modal-body textarea') || panel.querySelector('.modal-foot button') || panel.querySelector('button');
    if (target) target.focus();
    return { close: closeTop };
  }

  function confirmAction({ title, message, action, danger, onConfirm, cancelLabel }) {
    const dialog = modal({
      title,
      content: h('p', { class: 'modal-text' }, message),
      footer: [
        h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, cancelLabel || 'Cancel'),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', onclick: () => { dialog.close(); onConfirm(); } }, action),
      ],
    });
  }

  /* Form fields */
  // options: { label, value, type, as, choices, hint, placeholder, required, rows, inputmode, autocomplete, onInput, id }
  function field(options) {
    const id = options.id || uid('f');
    const errorId = `${id}-error`;
    const attrs = {
      id, name: options.name, placeholder: options.placeholder, inputmode: options.inputmode, autocomplete: options.autocomplete,
      'aria-describedby': errorId, oninput: options.onInput, onchange: options.onChange, required: options.required,
    };
    let control;
    if (options.as === 'textarea') {
      control = h('textarea', { ...attrs, rows: options.rows || 3 });
      control.value = options.value || '';
    } else if (options.as === 'select') {
      control = h('select', attrs, options.choices.map((c) => h('option', { value: c.value }, c.label)));
      control.value = options.value;
    } else {
      control = h('input', { ...attrs, type: options.type || 'text', value: options.value === undefined ? '' : options.value });
    }
    const error = h('p', { class: 'field-error', id: errorId, hidden: true });
    const root = h('div', { class: `field${options.class ? ' ' + options.class : ''}` },
      h('label', { for: id }, options.label),
      control,
      options.hint && h('p', { class: 'field-hint' }, options.hint),
      error);
    function setError(message) {
      error.textContent = message || '';
      error.hidden = !message;
      if (message) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    }
    control.addEventListener('input', () => setError(''));
    return { el: root, input: control, setError, get value() { return control.value; } };
  }

  function focusFirstError(root) {
    const bad = root.querySelector('[aria-invalid="true"]');
    if (bad) bad.focus();
  }

  /* Small pieces */
  const STATUS_LABEL = {
    draft: 'Draft', sent: 'Sent', partial: 'Partially paid', overdue: 'Overdue', paid: 'Paid',
    accepted: 'Accepted', declined: 'Declined', expired: 'Expired', converted: 'Converted',
  };

  const badge = (status) => h('span', { class: `badge badge-${status}` }, STATUS_LABEL[status] || status);

  function button(label, iconName, onclick, variant) {
    return h('button', { class: `btn ${variant || ''}`.trim(), type: 'button', onclick }, iconName && icon(iconName), label);
  }

  function linkButton(label, iconName, href, variant) {
    return h('a', { class: `btn ${variant || ''}`.trim(), href }, iconName && icon(iconName), label);
  }

  function pageHeader(title, subtitle, actions, back) {
    return h('header', { class: 'page-head' },
      h('div', { class: 'page-head-text' },
        back && h('a', { class: 'back-link', href: back.href }, icon('back', 14), back.label),
        h('h1', {}, title),
        subtitle && h('p', { class: 'page-sub' }, subtitle)),
      actions && h('div', { class: 'page-actions' }, actions));
  }

  function emptyState(title, text, action) {
    return h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), text && h('p', {}, text), action);
  }

  function searchBox(label, value, onInput) {
    return h('div', { class: 'search' }, icon('search', 15),
      h('input', { type: 'search', 'aria-label': label, placeholder: label, value, oninput: (e) => onInput(e.target.value) }));
  }

  function money(cents) { return BC.money.format(cents, BC.store.state.profile.currency); }

  // Sortable table headers driven by a { key, dir } object.
  function sortHeader(label, key, sort, onChange, numeric) {
    const active = sort.key === key;
    return h('th', { class: numeric ? 'num' : null, 'aria-sort': active ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none', scope: 'col' },
      h('button', {
        class: 'th-sort',
        type: 'button',
        'data-sort': key,
        onclick: () => {
          if (active) sort.dir = -sort.dir;
          else { sort.key = key; sort.dir = numeric ? -1 : 1; }
          onChange();
          const again = document.querySelector(`.th-sort[data-sort="${key}"]`);
          if (again) again.focus();
        },
      }, label, active && h('span', { 'aria-hidden': 'true', class: 'th-arrow' }, icon(sort.dir > 0 ? 'up' : 'down', 12))));
  }

  // Reads an image file into a data URL, rejecting anything too big to keep in localStorage.
  function readImage(file, maxBytes) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.type)) { reject(new Error('Choose a PNG, JPEG, GIF, WebP or SVG image.')); return; }
      if (file.size > maxBytes) { reject(new Error(`That image is too large. The limit is ${Math.round(maxBytes / 1024)} KB.`)); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('That file could not be read.'));
      reader.readAsDataURL(file);
    });
  }

  BC.ui = {
    toast, undoable, modal, confirmAction, field, focusFirstError, badge, button, linkButton, pageHeader,
    emptyState, searchBox, money, sortHeader, readImage, STATUS_LABEL,
  };
})();
