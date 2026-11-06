// Coordinates the three builder panes and wraps every edit in an undo step.
FL.builder = (function () {
  const { h, clear, plural } = FL.util;
  const { icon } = FL.icons;
  const { TYPES, GROUPS, findField } = FL.fields;
  const ops = FL.formOps;

  const session = { formId: null, selectedId: null, panel: 'field', pane: 'canvas' };
  let panes = null;

  const form = () => FL.store.getForm(session.formId);

  function selectedField() {
    return session.selectedId ? findField(form(), session.selectedId) : null;
  }

  function renderCanvas() {
    if (panes) FL.canvas.render(panes.canvas, api);
  }

  function renderInspector() {
    if (!panes) return;
    const live = form();
    const field = selectedField(); // may be missing after an undo; a redo brings the selection back
    FL.util.keepFocus(panes.inspector, () => {
      const scrollTop = panes.inspectorBody ? panes.inspectorBody.scrollTop : 0;
      clear(panes.inspector);
      panes.inspector.append(inspectorTabs());
      const body = h('div', { class: 'inspector-body', id: 'inspector-body', role: 'tabpanel' },
        session.panel === 'form' ? FL.formSettings.render(api, live)
          : field ? FL.inspector.renderField(api, live, field) : FL.inspector.renderEmpty());
      panes.inspector.append(body);
      panes.inspectorBody = body;
      body.scrollTop = scrollTop;
    });
  }

  function inspectorTabs() {
    const tab = (id, label) => h('button', {
      class: `panel-tab${session.panel === id ? ' is-on' : ''}`,
      type: 'button',
      role: 'tab',
      'aria-selected': String(session.panel === id),
      'data-fk': `panel-${id}`,
      onclick: () => { session.panel = id; renderInspector(); },
    }, label);
    return h('div', { class: 'panel-tabs', role: 'tablist', 'aria-label': 'Properties' }, tab('field', 'Field'), tab('form', 'Form and theme'));
  }

  function syncChrome() {
    if (FL.app) FL.app.syncTopbar();
  }

  /** Every edit goes through here. Pass key to merge fast edits into one undo step. */
  function commit(mutate, options) {
    const opts = options || {};
    const live = form();
    FL.history.record(live, opts.key);
    mutate(live);
    FL.store.saveForm(live);
    if (opts.canvas !== false) renderCanvas();
    if (opts.panel !== false) renderInspector();
    syncChrome();
  }

  function applySnapshot(snapshot) {
    FL.store.saveForm(snapshot);
    renderCanvas();
    renderInspector();
    syncChrome();
  }

  function undo() {
    if (!form()) return;
    const snapshot = FL.history.undo(form());
    if (snapshot) { applySnapshot(snapshot); FL.ui.announce('Undone'); }
  }

  function redo() {
    if (!form()) return;
    const snapshot = FL.history.redo(form());
    if (snapshot) { applySnapshot(snapshot); FL.ui.announce('Redone'); }
  }

  function scrollCardIntoView(id) {
    const card = panes && panes.canvas.querySelector(`.field-card[data-id="${CSS.escape(id)}"]`);
    if (card) card.scrollIntoView({ block: 'nearest' });
  }

  function setPane(pane) {
    session.pane = pane;
    if (!panes) return;
    panes.root.setAttribute('data-pane', pane);
    panes.switcher.querySelectorAll('button').forEach((button) => {
      const on = button.dataset.pane === pane;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
    });
  }

  function select(id) {
    session.selectedId = id;
    session.panel = 'field';
    panes.canvas.querySelectorAll('.field-card').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.id === id);
    });
    renderInspector();
  }

  function addField(type, pageId, index) {
    let created = null;
    commit((live) => {
      let targetPage = pageId;
      let targetIndex = index;
      if (!targetPage && session.selectedId) {
        const at = ops.locate(live, session.selectedId);
        if (at) { targetPage = at.page.id; targetIndex = at.index + 1; }
      }
      created = ops.insertNew(live, type, targetPage, targetIndex);
      session.selectedId = created.id;
      session.panel = 'field';
    });
    scrollCardIntoView(created.id);
    FL.ui.announce(`Added ${TYPES[type].label}`);
    return created;
  }

  function positionText(live, id) {
    const at = ops.locate(live, id);
    return `Position ${at.index + 1} on page ${at.pageIndex + 1}`;
  }

  /** The API the canvas, inspector and settings panels call back into. */
  const api = {
    form,
    commit,
    renderInspector,
    select,
    selectedId: () => session.selectedId,
    scroller: () => panes.canvas,
    moveBy(id, delta) {
      commit((live) => ops.moveBy(live, id, delta), { panel: false });
      scrollCardIntoView(id);
      FL.ui.announce(positionText(form(), id));
    },
    moveTo(id, drop) {
      commit((live) => ops.moveTo(live, id, drop.pageId, drop.index), { panel: false });
      FL.ui.announce(positionText(form(), id));
    },
    editField(id) {
      select(id);
      setPane('panel');
    },
    showFormSettings() {
      session.panel = 'form';
      renderInspector();
      setPane('panel');
    },
    duplicate(id) {
      let copy = null;
      commit((live) => {
        copy = ops.duplicate(live, id);
        session.selectedId = copy.id;
      });
      scrollCardIntoView(copy.id);
    },
    remove(id) {
      const label = findField(form(), id).label;
      let lostRules = 0;
      commit((live) => { lostRules = ops.removeField(live, id); });
      const extra = lostRules ? ` and ${plural(lostRules, 'logic rule')}` : '';
      FL.ui.toast(`Deleted "${label}"${extra}.`, { undo });
    },
    addPage() {
      let page = null;
      commit((live) => { page = ops.addPage(live); });
      const block = panes.canvas.querySelector(`[data-page-id="${CSS.escape(page.id)}"]`);
      if (block) block.scrollIntoView({ block: 'nearest' });
    },
    renamePage(id, title) {
      commit((live) => { live.pages.find((page) => page.id === id).title = title; }, { key: `page:${id}`, canvas: false, panel: false });
    },
    movePage(id, delta) {
      commit((live) => ops.movePage(live, id, delta));
    },
    removePage(id) {
      const count = form().pages.find((page) => page.id === id).fields.length;
      commit((live) => ops.removePage(live, id));
      FL.ui.toast(`Deleted the page${count ? ` and ${plural(count, 'field')}` : ''}.`, { undo });
    },
    refreshLimitWarning(id) {
      const note = panes.inspector.querySelector('[data-limit-warning]');
      const field = findField(form(), id);
      if (!note || !field) return;
      const warning = FL.inspector.limitWarning(field);
      note.textContent = warning;
      note.hidden = !warning;
    },
  };

  function paletteItem(type) {
    const def = TYPES[type];
    return h('button', {
      class: 'palette-item',
      type: 'button',
      'data-type': type,
      title: `Drag onto the canvas, or press to add ${def.label.toLowerCase()}`,
      onclick: () => { addField(type); setPane('canvas'); },
      onpointerdown: (event) => {
        FL.drag.begin(event, {
          scroller: panes.canvas,
          ghost: () => [icon(type, 15), h('span', null, def.label)],
          onDrop: (drop) => addField(type, drop.pageId, drop.index),
        });
      },
    }, icon(type, 16), h('span', null, def.label));
  }

  function renderPalette() {
    const types = Object.keys(TYPES);
    return h('nav', { class: 'palette', 'aria-label': 'Field palette' },
      h('h2', { class: 'pane-title' }, 'Fields'),
      h('p', { class: 'pane-hint' }, 'Drag onto the canvas, or press to add.'),
      GROUPS.map((group) => h('div', { class: 'palette-group' },
        h('h3', null, group),
        types.filter((type) => TYPES[type].group === group).map(paletteItem))),
      h('button', { class: 'link-button palette-reset', type: 'button', onclick: () => FL.app.resetDemo() }, icon('reset', 14), 'Reset demo data'));
  }

  function paneSwitcher() {
    const button = (pane, label) => h('button', {
      type: 'button',
      class: `pane-switch${session.pane === pane ? ' is-on' : ''}`,
      'data-pane': pane,
      'aria-pressed': String(session.pane === pane),
      onclick: () => setPane(pane),
    }, label);
    return h('div', { class: 'pane-switcher', role: 'group', 'aria-label': 'Builder panes' },
      button('palette', 'Add fields'), button('canvas', 'Form'), button('panel', 'Properties'));
  }

  function mount(container, formId) {
    if (session.formId !== formId) {
      session.formId = formId;
      session.selectedId = null;
      session.panel = 'field';
    }
    const switcher = paneSwitcher();
    const canvas = h('div', { class: 'pane pane-canvas', id: 'canvas-pane' });
    const inspector = h('aside', { class: 'pane pane-panel', 'aria-label': 'Properties' });
    const palette = h('div', { class: 'pane pane-palette' }, renderPalette());
    const root = h('div', { class: 'builder', 'data-pane': session.pane }, switcher, h('div', { class: 'builder-panes' }, palette, canvas, inspector));
    clear(container).append(root);
    panes = { root, canvas, inspector, switcher, inspectorBody: null };
    renderCanvas();
    renderInspector();
  }

  function unmount() {
    panes = null;
  }

  function onKeydown(event) {
    if (!panes || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
    else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
  }
  document.addEventListener('keydown', onKeydown);

  function themeChanged() {
    if (panes) renderCanvas();
  }

  /** The top bar edits the title directly, so the panes need telling. */
  function refreshAfterRename() {
    renderCanvas();
    if (session.panel === 'form') renderInspector();
  }

  function reset() {
    session.formId = null;
    session.selectedId = null;
  }

  return { mount, unmount, undo, redo, themeChanged, refreshAfterRename, reset };
})();
