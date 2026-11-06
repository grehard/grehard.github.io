// The Forms view: every form, search, new from template, import and reset.
FL.library = (function () {
  const { h, clear, plural, formatDateTime } = FL.util;
  const { icon } = FL.icons;
  const { allFields, isQuestion } = FL.fields;
  let searchTerm = '';

  function createFromTemplate(template) {
    const form = template ? FL.templates.instantiate(template) : FL.schema.blankForm('Untitled form');
    FL.store.addForm(form);
    FL.ui.closeAllModals();
    FL.app.go(`#/build/${form.id}`);
  }

  function openNewForm() {
    const card = (name, description, iconName, onclick, id) => h('button', { class: 'template-card', type: 'button', 'data-template': id, onclick },
      h('span', { class: 'template-icon' }, icon(iconName, 18)),
      h('span', { class: 'template-name' }, name),
      h('span', { class: 'template-desc' }, description));
    FL.ui.modal({
      title: 'New form',
      wide: true,
      body: h('div', { class: 'template-grid' },
        card('Blank form', 'Start with an empty page.', 'plus', () => createFromTemplate(null), 'blank'),
        FL.templates.list().map((template) => card(template.name, template.description, template.icon, () => createFromTemplate(template), template.key))),
    });
  }

  function formRow(form, rerender) {
    const questions = allFields(form).filter(isQuestion).length;
    const responses = FL.store.responsesFor(form.id).length;
    const remove = () => {
      const restore = FL.store.deleteForm(form.id);
      rerender();
      FL.ui.toast(`Deleted "${form.title}".`, { undo: () => { restore(); rerender(); } });
    };
    const duplicate = () => {
      FL.store.duplicateForm(form.id);
      rerender();
      FL.ui.toast(`Duplicated "${form.title}" without its responses.`);
    };
    const tool = (name, label, onclick, danger) => h('button', {
      class: `btn-icon${danger ? ' is-danger' : ''}`, type: 'button', 'aria-label': `${label}: ${form.title}`, title: label, onclick,
    }, icon(name));
    return h('li', { class: 'form-row', 'data-form': form.id },
      h('a', { class: 'form-row-main', href: `#/build/${form.id}` },
        h('span', { class: 'form-row-title' }, form.title),
        h('span', { class: 'form-row-meta' }, `${plural(questions, 'question')}, ${plural(form.pages.length, 'page')}. Edited ${formatDateTime(form.updatedAt)}`)),
      h('a', { class: 'form-row-count', href: `#/responses/${form.id}`, 'aria-label': `${plural(responses, 'response')} for ${form.title}` },
        h('strong', null, responses.toLocaleString('en-US')), h('span', null, responses === 1 ? 'response' : 'responses')),
      h('div', { class: 'form-row-tools' },
        tool('share', 'Share', () => FL.share.open(form)),
        tool('copy', 'Duplicate', duplicate),
        tool('trash', 'Delete', remove, true)));
  }

  function mount(container) {
    const list = h('div', { class: 'form-list-wrap' });

    function paint() {
      const needle = searchTerm.trim().toLowerCase();
      const forms = FL.store.listForms();
      const shown = forms.filter((form) => !needle || form.title.toLowerCase().includes(needle) || form.description.toLowerCase().includes(needle));
      clear(list);
      if (!forms.length) {
        list.append(h('div', { class: 'empty-state' },
          h('p', { class: 'empty-title' }, 'No forms yet'),
          h('p', null, 'Create a form from a template, or restore the demo data.'),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: openNewForm }, icon('plus'), 'New form')));
      } else if (!shown.length) {
        list.append(h('div', { class: 'empty-state' }, h('p', { class: 'empty-title' }, 'No forms match your search')));
      } else {
        list.append(h('ul', { class: 'form-list' }, shown.map((form) => formRow(form, paint))));
      }
    }

    clear(container).append(h('div', { class: 'library scroll-view' },
      h('div', { class: 'library-inner' },
        h('div', { class: 'library-head' },
          h('h1', null, 'Forms'),
          h('div', { class: 'library-actions' },
            h('button', { class: 'btn btn-primary', type: 'button', id: 'new-form', onclick: openNewForm }, icon('plus'), 'New form'),
            h('button', { class: 'btn', type: 'button', id: 'import-form', onclick: () => FL.share.openImport() }, icon('upload'), 'Import'),
            h('button', { class: 'btn', type: 'button', id: 'reset-demo', onclick: () => FL.app.resetDemo() }, icon('reset'), 'Reset demo data'))),
        h('div', { class: 'search-box library-search' }, icon('search', 15), h('input', {
          class: 'input', type: 'search', placeholder: 'Search forms', 'aria-label': 'Search forms', value: searchTerm,
          oninput: (event) => { searchTerm = event.target.value; paint(); },
        })),
        list)));
    paint();
  }

  return { mount, openNewForm };
})();
