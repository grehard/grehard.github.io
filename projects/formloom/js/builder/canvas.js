// The middle pane: pages and field cards, drawn with the form's own theme.
FL.canvas = (function () {
  const { h, clear, plural } = FL.util;
  const { icon } = FL.icons;
  const ops = () => FL.formOps;

  function iconButton(name, label, onclick, options) {
    const opts = options || {};
    return h('button', {
      class: `btn-icon${opts.danger ? ' is-danger' : ''}`,
      type: 'button',
      'aria-label': label,
      title: label,
      disabled: opts.disabled,
      'data-fk': opts.fk,
      onclick: (event) => { event.stopPropagation(); onclick(); },
    }, icon(name));
  }

  function fieldNotes(api, form, field, cyclic) {
    const notes = [];
    if (cyclic.has(field.id)) {
      notes.push(h('span', { class: 'note is-warn' }, icon('alert', 13), 'Circular logic: this field stays hidden until the loop is fixed.'));
    } else if (field.logic.rules.length) {
      notes.push(h('span', { class: 'note' }, icon('logic', 13), h('span', null, FL.logic.describe(form, field))));
      if (FL.logic.hasLaterSource(form, field)) {
        notes.push(h('span', { class: 'note is-warn' }, icon('alert', 13), 'Depends on a question that comes later in the form.'));
      }
    }
    return notes.length ? h('div', { class: 'card-notes' }, notes) : null;
  }

  function fieldCard(api, form, field, cyclic) {
    const id = field.id;
    const selected = api.selectedId() === id;
    const handle = h('button', {
      class: 'card-handle',
      type: 'button',
      'data-fk': `handle-${id}`,
      'aria-label': `Move ${field.label}. Use the up and down arrow keys.`,
      title: 'Drag to reorder, or use the arrow keys',
      onkeydown: (event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          api.moveBy(id, event.key === 'ArrowUp' ? -1 : 1);
        }
      },
      onclick: (event) => { event.stopPropagation(); api.select(id); },
    }, icon('grip', 16));

    const tools = h('div', { class: 'card-tools' },
      iconButton('up', 'Move up', () => api.moveBy(id, -1), { disabled: !ops().canMove(form, id, -1), fk: `up-${id}` }),
      iconButton('down', 'Move down', () => api.moveBy(id, 1), { disabled: !ops().canMove(form, id, 1), fk: `down-${id}` }),
      iconButton('edit', 'Edit properties', () => api.editField(id), { fk: `edit-${id}` }),
      iconButton('copy', 'Duplicate', () => api.duplicate(id), { fk: `dup-${id}` }),
      iconButton('trash', 'Delete field', () => api.remove(id), { danger: true, fk: `del-${id}` }));

    const preview = FL.controls.render(field, { idBase: 'canvas', preview: true });
    const card = h('div', {
      class: `field-card${selected ? ' is-selected' : ''}${field.type === 'section' ? ' is-section' : ''}`,
      'data-id': id,
      'data-type': field.type,
      'data-fk': `card-${id}`,
      tabindex: '0',
      role: 'group',
      'aria-label': `${FL.fields.TYPES[field.type].label}: ${field.label}${selected ? ', selected' : ''}`,
      onclick: () => api.select(id),
      onkeydown: (event) => {
        if (event.target !== card) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); api.editField(id); }
        if (event.key === 'Delete') { event.preventDefault(); api.remove(id); }
      },
      onpointerdown: (event) => {
        if (event.target.closest('.card-tools')) return;
        FL.drag.begin(event, {
          sourceId: id,
          scroller: api.scroller(),
          ghost: () => [icon(field.type, 15), h('span', null, field.label || 'Untitled question')],
          onDrop: (drop) => api.moveTo(id, drop),
        });
      },
    },
    h('div', { class: 'card-top' }, handle, h('span', { class: 'card-type' }, FL.fields.TYPES[field.type].label), tools),
    preview.el,
    fieldNotes(api, form, field, cyclic));
    return card;
  }

  function pageHeader(api, form, page, index) {
    const total = form.pages.length;
    return h('div', { class: 'page-head' },
      h('span', { class: 'page-number' }, `Page ${index + 1} of ${total}`),
      h('input', {
        class: 'page-title',
        type: 'text',
        value: page.title,
        'aria-label': `Title of page ${index + 1}`,
        'data-fk': `page-title-${page.id}`,
        oninput: (event) => api.renamePage(page.id, event.target.value),
      }),
      h('div', { class: 'page-tools' },
        iconButton('up', 'Move page up', () => api.movePage(page.id, -1), { disabled: index === 0, fk: `page-up-${page.id}` }),
        iconButton('down', 'Move page down', () => api.movePage(page.id, 1), { disabled: index === total - 1, fk: `page-down-${page.id}` }),
        iconButton('trash', 'Delete page', () => api.removePage(page.id), { disabled: total < 2, danger: true, fk: `page-del-${page.id}` })));
  }

  function pageBlock(api, form, page, index, cyclic) {
    const list = h('div', { class: 'page-fields', 'data-page': page.id },
      page.fields.map((field) => fieldCard(api, form, field, cyclic)));
    if (!page.fields.length) {
      list.append(h('p', { class: 'page-empty' }, 'Drag a field here, or choose one from the palette.'));
    }
    return h('section', { class: 'page-block', 'data-page-id': page.id, 'aria-label': `Page ${index + 1}` },
      pageHeader(api, form, page, index), list);
  }

  function formHead(api, form) {
    const count = FL.fields.allFields(form).filter(FL.fields.isQuestion).length;
    return h('button', {
      class: 'canvas-head', type: 'button',
      title: 'Edit the form title, description and theme',
      onclick: () => api.showFormSettings(),
    },
    h('span', { class: 'canvas-title' }, form.title),
    form.description ? h('span', { class: 'canvas-desc' }, form.description) : null,
    h('span', { class: 'canvas-meta' }, `${plural(count, 'question')} on ${plural(form.pages.length, 'page')}`));
  }

  function render(container, api) {
    const form = api.form();
    const cyclic = FL.logic.findCycleMembers(form);
    const vars = FL.theme.formVars(form.theme);
    Object.keys(vars).forEach((name) => container.style.setProperty(name, vars[name]));
    FL.util.keepFocus(container, () => {
      clear(container).append(
        h('div', { class: 'canvas-inner f-scope' },
          formHead(api, form),
          form.pages.map((page, index) => pageBlock(api, form, page, index, cyclic)),
          h('button', { class: 'btn add-page', type: 'button', 'data-fk': 'add-page', onclick: () => api.addPage() }, icon('plus'), 'Add page'))
      );
    });
  }

  return { render };
})();
