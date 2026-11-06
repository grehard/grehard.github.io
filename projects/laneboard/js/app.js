// Startup, routing and the render loop. Everything shown is derived from `state` plus the view
// state in `ui`; the location hash carries project, view and open card so links and Back work.
const App = (() => {
  const VIEW_IDS = ['board', 'calendar', 'table', 'archive'];
  const VIEW_RENDERERS = { board: BoardView, calendar: CalendarView, table: TableView, archive: ArchiveView };
  
  let state = null;
  const ui = {
    projectId: null,
    view: 'board',
    cardId: null,
    filter: Model.emptyFilter(),
    sort: { key: 'due', dir: 'asc' },
    month: null,
  };
  let pointerIsDown = false;
  let focusIsMoving = false;
  let renderIsPending = false;

  const el = (id) => document.getElementById(id);
  const getState = () => state;
  const project = () => Model.projectById(state, ui.projectId) || state.projects[0];

  function setState(next) {
    state = next;
    ui.projectId = Model.projectById(state, ui.projectId) ? ui.projectId : state.activeProjectId;
    ui.cardId = null;
    ui.month = null;
    Object.assign(ui.filter, Model.emptyFilter());
    syncActiveProject();
  }

  function syncActiveProject() {
    state.activeProjectId = project().id;
  }

  function isVisible(p, cardId) {
    return Model.matchesFilter(p, p.cards[cardId], ui.filter, Dates.today());
  }

  function viewCardIds(p) {
    if (ui.view === 'archive') return p.archive;
    return p.columns.flatMap((c) => c.cardIds);
  }

  function context() {
    const p = project();
    const today = Dates.today();
    const filtering = Model.filterIsActive(ui.filter);
    const isCardVisible = (card) => Model.matchesFilter(p, card, ui.filter, today);
    return {
      state, ui, project: p, today, filtering,
      isVisible: isCardVisible,
      visibleCards: () => viewCardIds(p).map((id) => p.cards[id]).filter(isCardVisible),
      counts: () => {
        const ids = viewCardIds(p);
        return { total: ids.length, shown: ids.filter((id) => isCardVisible(p.cards[id])).length };
      },
    };
  }

  // --- Focus and scroll survive a redraw ---------------------------------------------------

  function captureUiPosition() {
    const scroll = new Map();
    document.querySelectorAll('[data-scroll-key]').forEach((node) => scroll.set(node.dataset.scrollKey, [node.scrollLeft, node.scrollTop]));
    const active = document.activeElement;
    const fkey = active && active.dataset ? active.dataset.fkey : null;
    const hasCaret = !!active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type === 'text'));
    return { scroll, fkey, selection: hasCaret ? [active.selectionStart, active.selectionEnd] : null };
  }

  function restoreUiPosition({ scroll, fkey, selection }) {
    document.querySelectorAll('[data-scroll-key]').forEach((node) => {
      const saved = scroll.get(node.dataset.scrollKey);
      if (saved) { node.scrollLeft = saved[0]; node.scrollTop = saved[1]; }
    });
    if (!fkey || (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.fkey === fkey)) return;
    const target = document.querySelector(`[data-fkey="${CSS.escape(fkey)}"]`);
    if (!target) return;
    target.focus();
    if (selection && target.setSelectionRange) target.setSelectionRange(selection[0], selection[1]);
  }

  // --- Rendering ---------------------------------------------------------------------------

  // Text fields save when they lose focus, and a redraw at that moment would do damage: it would
  // replace the button under a held pointer and lose its click, or replace the field that focus
  // is on its way to. So a redraw requested during either one waits until it has finished.
  function render() {
    if (pointerIsDown || focusIsMoving || Drag.isActive()) { renderIsPending = true; return; }
    renderIsPending = false;
    if (!Model.projectById(state, ui.projectId)) ui.projectId = state.projects[0].id;
    const p = project();
    if (ui.cardId && !p.cards[ui.cardId]) ui.cardId = null;
    Panel.saveOpenEdits(ui.cardId);
    const position = captureUiPosition();
    const ctx = context();
    Rail.render(el('rail'), ctx);
    Topbar.render(el('topbar'), ctx);
    FilterBar.render(el('filters'), ctx);
    VIEW_RENDERERS[ui.view].render(el('view'), ctx);
    Panel.render(el('panel'), ctx);
    Modal.refresh();
    restoreUiPosition(position);
    document.title = `${p.name} - Laneboard`;
    writeHash();
  }

  function renderView() {
    const position = captureUiPosition();
    VIEW_RENDERERS[ui.view].render(el('view'), context());
    restoreUiPosition(position);
  }

  function renderFiltered() {
    const ctx = context();
    renderView();
    FilterBar.renderCount(ctx);
    Rail.render(el('rail'), ctx);
  }

  function renderIfPending() {
    if (renderIsPending) render();
  }

  function holdRendersWhileFocusMoves() {
    window.addEventListener('change', (event) => {
      const isTextEntry = event.target.tagName === 'TEXTAREA' || (event.target.tagName === 'INPUT' && !['checkbox', 'radio', 'file'].includes(event.target.type));
      if (!isTextEntry || pointerIsDown || document.activeElement === event.target) return;
      focusIsMoving = true;
      setTimeout(() => { focusIsMoving = false; renderIfPending(); }, 0);
    }, true);
  }

  function trackPointer() {
    const release = () => {
      pointerIsDown = false;
      if (renderIsPending) setTimeout(renderIfPending, 0); // Fallback for a press that ends without a click.
    };
    window.addEventListener('click', renderIfPending);
    window.addEventListener('pointerdown', () => { pointerIsDown = true; }, true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', release);
    window.addEventListener('pointermove', (event) => { if (pointerIsDown && event.buttons === 0) release(); }, true);
  }

  // --- Routing -----------------------------------------------------------------------------

  function hashForUi() {
    return `#/${encodeURIComponent(ui.projectId)}/${ui.view}${ui.cardId ? `/${encodeURIComponent(ui.cardId)}` : ''}`;
  }

  function writeHash() {
    const next = hashForUi();
    if (location.hash === next) return;
    // The first write replaces the entry, so Back leaves the app instead of bouncing to the bare URL.
    if (location.hash) location.hash = next;
    else location.replace(next);
  }

  function readHash() {
    const [projectId, view, cardId] = location.hash.replace(/^#\/?/, '').split('/').map((part) => { try { return decodeURIComponent(part); } catch (e) { return ''; } });
    const p = Model.projectById(state, projectId);
    if (!p) return false;
    ui.projectId = p.id;
    ui.view = VIEW_IDS.includes(view) ? view : 'board';
    ui.cardId = cardId && p.cards[cardId] ? cardId : null;
    syncActiveProject();
    return true;
  }

  function onHashChange() {
    if (location.hash === hashForUi()) return;
    const hadCard = ui.cardId;
    if (readHash()) render();
    else writeHash();
    if (hadCard && !ui.cardId) focusCard(hadCard);
  }

  // --- Navigation helpers ------------------------------------------------------------------

  function focusCard(cardId) {
    const target = document.querySelector(`[data-card-id="${CSS.escape(cardId)}"] button`);
    if (target) target.focus();
  }

  function openProject(projectId) {
    if (ui.projectId !== projectId) { ui.cardId = null; ui.month = null; }
    ui.projectId = projectId;
    syncActiveProject();
    Store.save(state);
  }

  function setView(view) {
    ui.view = view;
    const p = project();
    if (ui.cardId && !viewCardIds(p).includes(ui.cardId)) ui.cardId = null;
    render();
  }

  function openCard(cardId) {
    ui.cardId = cardId;
    render();
    el('panel').focus();
  }

  function closeCard() {
    const closed = ui.cardId;
    if (document.activeElement && document.activeElement.blur && el('panel').contains(document.activeElement)) document.activeElement.blur();
    ui.cardId = null;
    render();
    if (closed) focusCard(closed);
  }

  function closeCardIfOpen(cardId) {
    if (ui.cardId === cardId) ui.cardId = null;
  }

  function afterUndo(projectId) {
    if (projectId && Model.projectById(state, projectId)) openProject(projectId);
  }

  function toggleFilter(field, value) {
    ui.filter[field] = ui.filter[field] === value ? '' : value;
    render();
    setRailOpen(false);
  }

  function clearFilterValue(field, value) {
    if (ui.filter[field] === value) ui.filter[field] = '';
  }

  function clearFilters() {
    Object.assign(ui.filter, Model.emptyFilter());
    render();
  }

  function setRailOpen(open) {
    document.body.classList.toggle('rail-is-open', open);
  }

  // --- Global keys -------------------------------------------------------------------------

  function isTextField(node) {
    return !!node && (node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || (node.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'file'].includes(node.type)));
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      if (Menu.isOpen()) { Menu.close(); return; }
      if (Modal.isOpen()) { Modal.close(); return; }
      if (document.body.classList.contains('rail-is-open')) { setRailOpen(false); return; }
      if (ui.cardId) closeCard();
      return;
    }
    const isUndoKey = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
    if (isUndoKey && !isTextField(document.activeElement) && !Modal.isOpen()) {
      event.preventDefault();
      Actions.undo();
    }
  }

  function init() {
    const { state: loaded, damaged } = Store.load();
    state = loaded;
    ui.projectId = state.activeProjectId;
    readHash();
    syncActiveProject();
    Drag.attach(el('view'));
    trackPointer();
    holdRendersWhileFocusMoves();
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('keydown', onKeydown);
    el('rail-scrim').addEventListener('click', () => setRailOpen(false));
    Store.save(state);
    render();
    if (damaged) Toast.show('Saved data could not be read, so the demo data was loaded instead.');
  }

  return {
    getState, setState, project, render, renderView, renderFiltered, isVisible, openProject, setView, openCard, closeCard, closeCardIfOpen,
    afterUndo, toggleFilter, clearFilterValue, clearFilters, setRailOpen, init,
  };
})();

App.init();
