// Small reusable controls for the inspector: color swatch rows and segmented button rows.
(function (DB) {
  'use strict';
  const { el } = DB.util;
  const { resolve } = DB.palette;

  function setPressed(buttons, value) {
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.value === String(value))));
  }

  function swatchRow({ label, tokens, custom, onPick }) {
    const buttons = Object.entries(tokens).map(([token, def]) => {
      const button = el('button', {
        type: 'button', class: `swatch${token === 'none' ? ' swatch-none' : ''}`, 'data-value': token,
        'aria-label': `${label}: ${def.label}`, title: def.label, onclick: () => onPick(token),
      });
      return button;
    });
    const row = el('div', { class: 'swatches', role: 'group', 'aria-label': label }, ...buttons);
    const input = el('input', { type: 'color', class: 'swatch-custom', 'aria-label': custom, title: custom });
    input.addEventListener('input', () => onPick(input.value, true));
    input.addEventListener('change', () => onPick(input.value, false));
    row.append(input);
    return {
      node: row,
      update(value, theme) {
        buttons.forEach((button) => {
          const token = button.dataset.value;
          if (token !== 'none') button.style.background = resolve(token, theme);
        });
        setPressed(buttons, value);
        input.value = /^#/.test(value) ? value : (value === 'none' ? '#ffffff' : resolve(value, theme));
      },
    };
  }

  function segmented({ label, options, onPick }) {
    const buttons = options.map((option) => {
      const button = el('button', {
        type: 'button', class: 'segment', 'data-value': option.value, 'aria-label': `${label}: ${option.label}`, title: option.label,
        onclick: () => onPick(option.value),
      });
      if (option.svg) button.insertAdjacentHTML('afterbegin', option.svg);
      else button.textContent = option.label;
      return button;
    });
    return {
      node: el('div', { class: 'segments', role: 'group', 'aria-label': label }, ...buttons),
      update(value) { setPressed(buttons, value); },
    };
  }

  function dashSample(pattern) {
    return `<svg width="40" height="10" viewBox="0 0 40 10" aria-hidden="true"><line x1="2" y1="5" x2="38" y2="5" stroke="currentColor" stroke-width="2"${pattern}/></svg>`;
  }

  DB.inspectorControls = { swatchRow, segmented, dashSample };
})(window.DB);
