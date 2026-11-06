// The right pane's Form tab: title, confirmation text and the published theme.
FL.formSettings = (function () {
  const { h } = FL.util;
  const { icon } = FL.icons;
  const SWATCHES = [
    { value: '#1c5a45', name: 'Forest' },
    { value: '#1b3054', name: 'Ink navy' },
    { value: '#7a3b12', name: 'Rust' },
    { value: '#0f5e6e', name: 'Deep teal' },
    { value: '#8a1c2b', name: 'Oxblood' },
    { value: '#33393f', name: 'Graphite' },
  ];
  const CHOICES = {
    background: { label: 'Page background', options: [['paper', 'Paper'], ['white', 'White'], ['mist', 'Mist'], ['tint', 'Accent tint']] },
    font: { label: 'Font', options: [['sans', 'Sans serif'], ['serif', 'Serif'], ['mono', 'Monospace']] },
    corners: { label: 'Corners', options: [['soft', 'Soft'], ['square', 'Square'], ['round', 'Round']] },
    header: { label: 'Header', options: [['plain', 'Plain'], ['band', 'Accent band']] },
  };

  function field(labelText, control, hint) {
    return h('div', { class: 'prop' },
      h('label', { class: 'prop-label', for: control.id }, labelText),
      control,
      hint ? h('p', { class: 'prop-hint' }, hint) : null);
  }

  function textInput(api, id, value, apply, options) {
    const opts = options || {};
    const tag = opts.multiline ? 'textarea' : 'input';
    return h(tag, {
      class: 'input', id, 'data-fk': id, value, rows: opts.multiline ? 3 : null, type: opts.multiline ? null : 'text',
      oninput: (event) => api.commit((form) => apply(form, event.target.value), { key: id, panel: false }),
    });
  }

  function details(api, form) {
    return h('section', { class: 'prop-group' },
      h('h3', null, 'Form'),
      field('Title', textInput(api, 'form-title', form.title, (live, value) => { live.title = value; })),
      field('Description', textInput(api, 'form-description', form.description, (live, value) => { live.description = value; }, { multiline: true })));
  }

  function confirmation(api, form) {
    const { settings } = form;
    return h('section', { class: 'prop-group' },
      h('h3', null, 'Submit and confirmation'),
      field('Submit button text', textInput(api, 'form-submit-label', settings.submitLabel, (live, value) => { live.settings.submitLabel = value; })),
      field('Confirmation title', textInput(api, 'form-confirm-title', settings.confirmTitle, (live, value) => { live.settings.confirmTitle = value; })),
      field('Confirmation message', textInput(api, 'form-confirm-message', settings.confirmMessage, (live, value) => { live.settings.confirmMessage = value; }, { multiline: true })),
      check(api, 'Show respondents a copy of their answers', settings.showSummary, (live, value) => { live.settings.showSummary = value; }, 'form-show-summary'),
      check(api, 'Allow another response', settings.allowAnother, (live, value) => { live.settings.allowAnother = value; }, 'form-allow-another'));
  }

  function check(api, labelText, checked, apply, fk) {
    return h('label', { class: 'prop-check' },
      h('input', {
        type: 'checkbox', checked, 'data-fk': fk,
        onchange: (event) => api.commit((form) => apply(form, event.target.checked), { panel: false }),
      }),
      h('span', null, labelText));
  }

  function paintSwatches(group, accent) {
    group.querySelectorAll('.swatch').forEach((button) => {
      const on = button.dataset.value === accent;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
      FL.util.clear(button);
      if (on) button.append(icon('check', 14));
    });
  }

  function swatchRow(api, theme) {
    const setAccent = (value) => api.commit((form) => { form.theme.accent = value; });
    const hexInput = h('input', {
      class: 'input input-mono', id: 'theme-accent', type: 'text', value: theme.accent, 'data-fk': 'theme-accent', maxlength: '7', spellcheck: 'false',
      onchange: (event) => {
        const value = event.target.value.trim().toLowerCase();
        const valid = /^#[0-9a-f]{6}$/.test(value);
        error.hidden = valid;
        if (!valid) { event.target.value = api.form().theme.accent; return; }
        // No panel redraw: this runs as focus leaves, and a redraw would swallow the click causing it.
        api.commit((form) => { form.theme.accent = value; }, { panel: false });
        paintSwatches(group, value);
      },
    });
    const error = h('p', { class: 'prop-error', hidden: true }, 'Enter a six-digit hex color, like #1c5a45.');
    const lowContrast = FL.theme.contrast(theme.accent, '#ffffff') < 3;
    const group = h('div', { class: 'swatches', role: 'group', 'aria-labelledby': 'accent-label' }, SWATCHES.map((swatch) => h('button', {
      class: 'swatch',
      type: 'button',
      style: { '--swatch': swatch.value },
      'data-value': swatch.value,
      'aria-label': swatch.name,
      title: swatch.name,
      'data-fk': `swatch-${swatch.value}`,
      onclick: () => setAccent(swatch.value),
    })));
    paintSwatches(group, theme.accent);
    return h('div', { class: 'prop' },
      h('span', { class: 'prop-label', id: 'accent-label' }, 'Accent color'),
      group,
      h('label', { class: 'prop-label prop-label-inline', for: 'theme-accent' }, 'Hex value'),
      hexInput,
      error,
      lowContrast ? h('p', { class: 'prop-error' }, 'This color is hard to see on white. Choose a darker one for respondents.') : null);
  }

  function themeSection(api, form) {
    const { theme } = form;
    const selects = Object.keys(CHOICES).map((key) => {
      const choice = CHOICES[key];
      const control = h('select', {
        class: 'input', id: `theme-${key}`, 'data-fk': `theme-${key}`, value: theme[key],
        onchange: (event) => api.commit((live) => { live.theme[key] = event.target.value; }),
      }, choice.options.map(([value, label]) => h('option', { value }, label)));
      return field(choice.label, control);
    });
    return h('section', { class: 'prop-group' },
      h('h3', null, 'Theme for the published form'),
      swatchRow(api, theme),
      selects,
      check(api, 'Show progress on multi-page forms', theme.showProgress, (live, value) => { live.theme.showProgress = value; }, 'theme-progress'));
  }

  function render(api, form) {
    return [details(api, form), themeSection(api, form), confirmation(api, form)];
  }

  return { render };
})();
