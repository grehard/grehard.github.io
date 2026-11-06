// [[wiki link]] autocomplete for the editor textarea. Focus stays in the textarea and
// aria-activedescendant points at the highlighted option.
(function (MG) {
  'use strict';

  const { h } = MG.Dom;
  const MAX_OPTIONS = 7;
  const POPUP_WIDTH = 300;
  const MIRRORED_STYLES = [
    'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'tabSize', 'wordBreak', 'overflowWrap',
  ];

  /** Pixel position of a caret: a hidden copy of the textarea lays out the same text so we can measure it. */
  function caretPosition(textarea, position) {
    const style = window.getComputedStyle(textarea);
    const mirror = h('div', { 'aria-hidden': 'true' });
    MIRRORED_STYLES.forEach((prop) => { mirror.style[prop] = style[prop]; });
    Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', top: '0', left: '-9999px' });
    mirror.textContent = textarea.value.slice(0, position);
    const marker = h('span', null, '\u200b');
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const point = { top: marker.offsetTop - textarea.scrollTop, left: marker.offsetLeft, height: parseFloat(style.lineHeight) || 20 };
    mirror.remove();
    return point;
  }

  /** Prefix matches first, then matches inside the title. */
  function rankTitles(query, titles) {
    const q = query.trim().toLowerCase();
    return titles
      .map((title) => ({ title, at: title.toLowerCase().indexOf(q) }))
      .filter((entry) => entry.at >= 0)
      .sort((a, b) => a.at - b.at || a.title.localeCompare(b.title))
      .map((entry) => entry.title);
  }

  function create(textarea, popup, { getTitles, applyEdit, createNote }) {
    let open = false;
    let options = [];
    let active = 0;
    let range = null;

    function close() {
      if (!open) return;
      open = false;
      popup.hidden = true;
      popup.textContent = '';
      textarea.removeAttribute('aria-activedescendant');
    }

    function currentQuery() {
      const caret = textarea.selectionStart;
      if (caret !== textarea.selectionEnd) return null;
      const lineStart = textarea.value.lastIndexOf('\n', caret - 1) + 1;
      const match = /\[\[([^\[\]|\n]*)$/.exec(textarea.value.slice(lineStart, caret));
      return match ? { query: match[1], from: caret - match[1].length, to: caret } : null;
    }

    function buildOptions(query) {
      const list = rankTitles(query, getTitles()).slice(0, MAX_OPTIONS).map((title) => ({ title, create: false }));
      const clean = query.trim().replace(/\s+/g, ' ');
      const exact = getTitles().some((title) => title.toLowerCase() === clean.toLowerCase());
      if (clean && !exact) list.push({ title: clean, create: true });
      return list;
    }

    function renderOptions() {
      popup.textContent = '';
      options.forEach((option, i) => {
        const id = `wiki-option-${i}`;
        const row = h('div', {
          id, role: 'option', class: i === active ? 'wiki-option is-active' : 'wiki-option',
          'aria-selected': i === active ? 'true' : 'false',
          onmousedown: (event) => event.preventDefault(),
          onclick: () => accept(i),
        }, option.create ? `Create note "${option.title}"` : option.title);
        popup.appendChild(row);
      });
      textarea.setAttribute('aria-activedescendant', `wiki-option-${active}`);
    }

    function place() {
      const point = caretPosition(textarea, range.to);
      const host = textarea.parentElement;
      const maxLeft = Math.max(0, host.clientWidth - POPUP_WIDTH - 8);
      popup.style.left = `${Math.min(point.left, maxLeft)}px`;
      const below = point.top + point.height + 4;
      const fitsBelow = below + popup.offsetHeight < host.clientHeight;
      popup.style.top = `${fitsBelow ? below : Math.max(0, point.top - popup.offsetHeight - 4)}px`;
    }

    function update() {
      const found = currentQuery();
      if (!found) {
        close();
        return;
      }
      range = found;
      options = buildOptions(found.query);
      if (!options.length) {
        close();
        return;
      }
      active = Math.min(active, options.length - 1);
      open = true;
      popup.hidden = false;
      renderOptions();
      place();
    }

    function accept(index) {
      const option = options[index];
      if (!option) return;
      const value = textarea.value;
      // When editing inside an existing link, replace its old target and keep any alias.
      const existing = /^[^\[\]\n|]*(\|[^\[\]\n]*)?\]\]/.exec(value.slice(range.to));
      const insert = `${option.title}${existing && existing[1] ? existing[1] : ''}]]`;
      const end = range.to + (existing ? existing[0].length : 0);
      const caret = range.from + insert.length;
      applyEdit({ value: value.slice(0, range.from) + insert + value.slice(end), start: caret, end: caret });
      close();
      if (option.create) createNote(option.title);
    }

    function refreshIfOpen() {
      if (open) update();
    }

    function onKeyDown(event) {
      if (open && !currentQuery()) close();
      if (!open) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        active = (active + step + options.length) % options.length;
        renderOptions();
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        accept(active);
      } else if (event.key === 'Escape') {
        close();
      } else {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    // Moving the caret out of a link closes the list; only typing can open it.
    textarea.addEventListener('keyup', refreshIfOpen);
    textarea.addEventListener('click', refreshIfOpen);
    textarea.addEventListener('blur', close);
    return { update, close, onKeyDown, get isOpen() { return open; } };
  }

  MG.Autocomplete = { create, rankTitles };
})(window.MG = window.MG || {});
