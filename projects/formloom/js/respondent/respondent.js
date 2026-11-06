// The form as respondents see it: pages, live logic, validation and the confirmation screen.
FL.respondent = (function () {
  const { h, clear, uid } = FL.util;
  const { icon } = FL.icons;
  const { allFields, isQuestion, displayValue } = FL.fields;

  /**
   * options.mode: 'preview' records nothing, 'live' stores the response.
   * options.onSubmit(response) is called for live submissions and may return extra nodes for the confirmation.
   * options.footer is an optional node placed below the sheet.
   */
  function mount(root, options) {
    const { form, mode, onSubmit } = options;
    const answers = {};
    const errors = {};
    let pageId = null;
    let controls = new Map();
    let finished = null;

    const shell = h('div', { class: 'f-scope f-page', 'data-mode': mode });
    const sheet = h('main', { class: 'f-sheet' });
    shell.append(sheet);
    if (options.banner) shell.prepend(options.banner);
    if (options.footer) shell.append(options.footer);
    clear(root).append(shell);

    function applyTheme() {
      const vars = FL.theme.formVars(form.theme);
      Object.keys(vars).forEach((name) => shell.style.setProperty(name, vars[name]));
      shell.setAttribute('data-corners', form.theme.corners);
    }

    function currentPages() {
      return FL.logic.visiblePages(form, answers);
    }

    function pageIndex(pages) {
      return pages.findIndex((page) => page.id === pageId);
    }

    function ensurePage() {
      const pages = currentPages();
      if (pages.length && pageIndex(pages) < 0) pageId = pages[0].id;
      return pages;
    }

    function headerBlock() {
      const band = form.theme.header === 'band';
      return h('header', { class: `f-header${band ? ' is-band' : ''}` },
        h('h1', null, form.title),
        form.description ? h('p', { class: 'f-description' }, form.description) : null);
    }

    function progressBlock() {
      const bar = h('div', { class: 'f-progress-bar' }, h('span', { class: 'f-progress-fill' }));
      const textLine = h('span', { class: 'f-progress-text' });
      return h('div', { class: 'f-progress', role: 'group', 'aria-label': 'Progress' }, textLine, bar);
    }

    function updateProgress(pages) {
      const block = sheet.querySelector('.f-progress');
      if (!block) return;
      const index = pageIndex(pages);
      block.hidden = pages.length < 2 || !form.theme.showProgress;
      block.querySelector('.f-progress-text').textContent = `Page ${index + 1} of ${pages.length}`;
      block.querySelector('.f-progress-fill').style.width = `${((index + 1) / pages.length) * 100}%`;
    }

    function updateNav(pages) {
      const index = pageIndex(pages);
      const back = sheet.querySelector('.f-back');
      const next = sheet.querySelector('.f-next');
      if (!back || !next) return;
      back.hidden = index <= 0;
      clear(next).append(index < pages.length - 1 ? 'Next' : form.settings.submitLabel);
    }

    function applyVisibility() {
      const { visible } = FL.logic.computeVisibility(form, answers);
      controls.forEach((control, id) => {
        control.el.hidden = !visible[id];
        if (!visible[id] && errors[id]) {
          delete errors[id];
          control.setError(null);
        }
      });
      updateFormError();
      const pages = currentPages();
      updateProgress(pages);
      updateNav(pages);
    }

    function updateFormError(message) {
      const box = sheet.querySelector('.f-form-error');
      if (!box) return;
      const count = Object.keys(errors).length;
      const text = message || (count ? `${FL.util.plural(count, 'question needs', 'questions need')} attention.` : '');
      box.textContent = text;
      box.hidden = !text;
    }

    function revalidate(field) {
      const message = FL.validate.validateField(field, answers[field.id]);
      if (message) errors[field.id] = message; else delete errors[field.id];
      const control = controls.get(field.id);
      if (control) control.setError(message);
    }

    function fieldControl(field) {
      return FL.controls.render(field, {
        idBase: 'fill',
        value: answers[field.id],
        onChange(value) {
          answers[field.id] = value;
          if (errors[field.id]) revalidate(field);
          applyVisibility();
        },
        onBlur() {
          // Format errors appear on leaving the field, but an untouched empty field stays quiet until Next.
          if (answers[field.id]) { revalidate(field); updateFormError(); }
        },
      });
    }

    function renderPage(moveFocus) {
      const pages = ensurePage();
      clear(sheet);
      sheet.append(headerBlock());
      if (!pages.length) {
        sheet.append(h('p', { class: 'f-empty' }, 'This form has no questions yet.'));
        return;
      }
      const page = pages[pageIndex(pages)];
      controls = new Map();
      const body = h('form', { class: 'f-body', novalidate: true, onsubmit: onNext });
      body.append(progressBlock());
      const heading = h('h2', { class: 'f-page-title', tabindex: '-1' }, page.title);
      if (form.pages.length > 1) body.append(heading);
      page.fields.forEach((field) => {
        const control = fieldControl(field);
        controls.set(field.id, control);
        if (errors[field.id]) control.setError(errors[field.id]);
        body.append(control.el);
      });
      body.append(h('p', { class: 'f-form-error', role: 'alert', hidden: true }));
      body.append(h('div', { class: 'f-nav' },
        h('button', { class: 'f-btn f-back', type: 'button', onclick: onBack }, icon('left'), 'Back'),
        h('button', { class: 'f-btn f-next is-primary', type: 'submit' }, 'Next')));
      sheet.append(body);
      applyVisibility();
      if (moveFocus) {
        shell.scrollTop = 0;
        if (form.pages.length > 1) heading.focus({ preventScroll: true });
      }
    }

    function validateFields(fields) {
      const { visible } = FL.logic.computeVisibility(form, answers);
      let firstBad = null;
      fields.forEach((field) => {
        if (!visible[field.id] || !isQuestion(field)) return;
        const message = FL.validate.validateField(field, answers[field.id]);
        if (message) {
          errors[field.id] = message;
          if (!firstBad) firstBad = field;
        } else {
          delete errors[field.id];
        }
      });
      return firstBad;
    }

    function focusField(field) {
      const control = controls.get(field.id);
      if (!control) return;
      const target = control.el.querySelector('input, select, textarea');
      if (target) target.focus();
      control.el.scrollIntoView({ block: 'nearest' });
    }

    function pageOfField(field) {
      return form.pages.find((page) => page.fields.includes(field));
    }

    function onBack() {
      const pages = currentPages();
      const index = pageIndex(pages);
      if (index > 0) { pageId = pages[index - 1].id; renderPage(true); }
    }

    function onNext(event) {
      event.preventDefault();
      const pages = currentPages();
      const index = pageIndex(pages);
      const bad = validateFields(pages[index].fields);
      if (bad) {
        renderErrorsInPlace();
        focusField(bad);
        return;
      }
      if (index < pages.length - 1) {
        pageId = pages[index + 1].id;
        renderPage(true);
      } else {
        submit();
      }
    }

    function renderErrorsInPlace() {
      controls.forEach((control, id) => control.setError(errors[id] || null));
      updateFormError();
    }

    function submit() {
      // An earlier page may have become invalid if logic revealed a question there after it was passed.
      const bad = validateFields(allFields(form));
      if (bad) {
        pageId = pageOfField(bad).id;
        renderPage(false);
        renderErrorsInPlace();
        focusField(bad);
        return;
      }
      const response = { id: uid('r'), submittedAt: Date.now(), answers: FL.validate.finalizeAnswers(form, answers) };
      const extra = mode === 'live' && onSubmit ? onSubmit(response) : null;
      finished = { response, extra };
      renderConfirmation();
    }

    function summaryList(response) {
      const items = allFields(form).filter((field) => isQuestion(field) && response.answers[field.id] !== undefined);
      if (!items.length) return null;
      return h('section', { class: 'f-answers' },
        h('h2', null, 'Your answers'),
        h('dl', null, items.map((field) => [
          h('dt', null, field.label),
          h('dd', null, displayValue(field, response.answers[field.id])),
        ])));
    }

    function startAgain() {
      Object.keys(answers).forEach((key) => delete answers[key]);
      Object.keys(errors).forEach((key) => delete errors[key]);
      pageId = null;
      finished = null;
      renderPage(true);
    }

    function renderConfirmation() {
      clear(sheet);
      const { settings } = form;
      const title = h('h1', { tabindex: '-1' }, settings.confirmTitle || 'Thank you');
      sheet.append(h('div', { class: 'f-confirm' },
        h('span', { class: 'f-confirm-mark' }, icon('check', 22)),
        title,
        settings.confirmMessage ? h('p', { class: 'f-description' }, settings.confirmMessage) : null,
        mode === 'preview' ? h('p', { class: 'f-note' }, 'This was a preview, so nothing was recorded.') : null,
        finished.extra,
        settings.showSummary ? summaryList(finished.response) : null,
        settings.allowAnother ? h('button', { class: 'f-btn', type: 'button', onclick: startAgain }, 'Submit another response') : null));
      shell.scrollTop = 0;
      title.focus({ preventScroll: true });
    }

    function refresh() {
      applyTheme();
      if (finished) renderConfirmation(); else renderPage(false);
    }

    refresh();
    return { refreshTheme: applyTheme };
  }

  return { mount };
})();
