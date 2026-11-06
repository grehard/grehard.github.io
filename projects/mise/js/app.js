// Hash routing and start-up. Every route is inside location.hash so the app works in an iframe.
Mise.App = (() => {
  const { h } = Mise.Dom;
  const Views = Mise.Views;
  let main = null;
  let lastRoute = null;
  let lastWeek = null;
  let leaveHandlers = [];

  function rememberWeek(monday) {
    lastWeek = monday;
  }

  function onLeave(handler) {
    leaveHandlers.push(handler);
  }

  function runLeaveHandlers() {
    leaveHandlers.forEach((handler) => handler());
    leaveHandlers = [];
  }

  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const [section, first, second] = parts;
    if (section === 'planner') return { section, view: Views.planner, params: { week: first } };
    if (section === 'groceries') return { section, view: Views.groceries, params: { week: first } };
    if (section === 'pantry') return { section, view: Views.pantry, params: {} };
    if (section === 'cook' && first) return { section: 'cook', view: Views.cook, params: { id: first } };
    if (section === 'recipes' && first === 'new') return { section: 'recipes', view: Views.recipeEditor, params: {} };
    if (section === 'recipes' && first && second === 'edit') return { section: 'recipes', view: Views.recipeEditor, params: { id: first } };
    if (section === 'recipes' && first) return { section: 'recipes', view: Views.recipeDetail, params: { id: first } };
    return { section: 'recipes', view: Views.recipes, params: {} };
  }

  function render() {
    const route = parseRoute();
    runLeaveHandlers();
    const isCooking = route.section === 'cook';
    document.body.classList.toggle('cooking', isCooking);
    const y = window.scrollY;
    Mise.Dom.keepFocus(() => {
      const content = route.view.render(route.params);
      Views.shell.setActive(route.section, lastWeek || Mise.Dates.mondayOf(Mise.Dates.todayKey()));
      main.replaceChildren(content);
    });
    window.scrollTo(0, y);
  }

  function onRouteChange() {
    if (Mise.Modal.isOpen) Mise.Modal.close();
    render();
    if (location.hash !== lastRoute) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }
    lastRoute = location.hash;
  }

  function warnIfStorageBlocked() {
    if (!Mise.Store.storageWorks) Mise.Toast.show("Browser storage is blocked, so changes won't be kept after this visit.");
  }

  function start() {
    Mise.Store.load();
    const shell = document.getElementById('shell');
    main = h('main', { id: 'main', tabindex: '-1' });
    shell.replaceChildren(Views.shell.build(), main);
    Mise.Store.onChange = render;
    window.addEventListener('hashchange', onRouteChange);
    lastRoute = location.hash;
    render();
    warnIfStorageBlocked();
  }

  return { start, render, rememberWeek, onLeave };
})();

Mise.App.start();
