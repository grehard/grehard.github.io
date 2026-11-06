// Builds DOM nodes directly. Text only ever becomes text nodes, so user content can't turn into markup.
Mise.Dom = (() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const ICONS = {
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    close: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    left: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
    edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
    trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 11v5M13.5 11v5',
    print: 'M7 9V4h10v5M7 17H4v-8h16v8h-3M7 14h10v6H7z',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4',
    moon: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z',
    download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14',
    upload: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M5 20h14',
    reset: 'M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5v4h4',
    play: 'M7 4.5v15l12-7.5z',
    pause: 'M8 5v14M16 5v14',
    pot: 'M5 10h14v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7zM3 10h18M9 6.5c0-1 1-1 1-2M14 6.5c0-1 1-1 1-2',
    calendar: 'M4 6h16v14H4zM4 10h16M8 3.5V7M16 3.5V7',
    basket: 'M4 9h16l-1.5 11h-13L4 9zM8 9l3-5M16 9l-3-5',
  };

  function setProp(node, name, value) {
    if (value === null || value === undefined || value === false) return;
    if (name.startsWith('on') && typeof value === 'function') node.addEventListener(name.slice(2), value);
    else if (name === 'class') node.setAttribute('class', value);
    else if (name === 'value' && 'value' in node) node.value = value;
    else if (name === 'checked' || name === 'disabled' || name === 'selected') node[name] = !!value;
    else node.setAttribute(name, value === true ? '' : value);
  }

  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach((item) => append(parent, item));
    else parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  /** h('button', { class: 'x', onclick: fn }, 'Label') */
  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([name, value]) => setProp(node, name, value));
    append(node, children);
    return node;
  }

  function svg(tag, props, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(props || {}).forEach(([name, value]) => {
      if (value === null || value === undefined) return;
      if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
      else node.setAttribute(name, value);
    });
    append(node, children);
    return node;
  }

  function icon(name, size = 18) {
    return svg('svg', { class: 'icon', width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d: ICONS[name] }));
  }

  /** A labelled form field with a slot for a validation message below it. */
  function field(label, control, { hint, error, className } = {}) {
    const id = control.id || `f-${Math.random().toString(36).slice(2, 9)}`;
    control.id = id;
    const errorId = `${id}-error`;
    if (error) {
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', errorId);
    }
    return h('div', { class: `field ${className || ''}` },
      h('label', { for: id }, label),
      control,
      hint ? h('p', { class: 'hint' }, hint) : null,
      h('p', { class: 'field-error', id: errorId, hidden: !error }, error || ''));
  }

  /** Marks a field built by field() as invalid, or clears it. */
  function setFieldError(control, message) {
    const slot = document.getElementById(`${control.id}-error`);
    if (message) {
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', `${control.id}-error`);
    } else {
      control.removeAttribute('aria-invalid');
      control.removeAttribute('aria-describedby');
    }
    if (slot) {
      slot.textContent = message || '';
      slot.hidden = !message;
    }
  }

  function selectOptions(options, selected) {
    return options.map(([value, label]) => h('option', { value, selected: value === selected }, label));
  }

  function downloadText(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = h('a', { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Runs a re-render and puts focus back on the element with the same data-fk. */
  function keepFocus(render) {
    const active = document.activeElement;
    const fk = active && active.dataset ? active.dataset.fk : null;
    render();
    if (!fk) return;
    const next = document.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
    if (next) next.focus({ preventScroll: true });
  }

  return { h, svg, icon, keepFocus, field, setFieldError, selectOptions, downloadText };
})();
