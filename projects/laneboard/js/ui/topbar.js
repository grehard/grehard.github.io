// Project title, view switcher, undo and the main add action.
const Topbar = (() => {
  const { h, icon, iconButton } = Dom;

  const VIEWS = [
    { id: 'board', label: 'Board', icon: 'board' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'table', label: 'Table', icon: 'table' },
    { id: 'archive', label: 'Archive', icon: 'archive' },
  ];

  function projectMenu(anchor, project, state) {
    const onlyProject = state.projects.length === 1;
    Menu.open(anchor, [
      { label: 'Rename project', icon: 'edit', onSelect: () => Forms.openProject(project.id) },
      { label: 'Delete project', icon: 'trash', danger: true, disabled: onlyProject, note: onlyProject ? 'Only project' : null, onSelect: () => Actions.deleteProject(project.id) },
    ], `Project ${project.name}`);
  }

  function viewTabs(project, current) {
    return h('nav', { class: 'view-tabs', 'aria-label': 'Views' }, VIEWS.map((view) => h('button', {
      type: 'button', class: `view-tab${view.id === current ? ' is-current' : ''}`, 'aria-current': view.id === current ? 'page' : null,
      'data-fkey': `view-${view.id}`, onClick: () => App.setView(view.id),
    }, icon(view.icon, 15), view.label, view.id === 'archive' && project.archive.length ? h('span', { class: 'tab-count' }, project.archive.length) : null)));
  }

  function render(element, ctx) {
    const { project, state, ui } = ctx;
    const last = Undo.peek();
    const projectMenuButton = iconButton('more', `Project actions for ${project.name}`, () => projectMenu(projectMenuButton, project, state), { 'aria-haspopup': 'menu', 'data-fkey': 'project-menu' });
    element.replaceChildren(
      iconButton('menu', 'Open menu', () => App.setRailOpen(true), { class: 'rail-open-btn', 'data-fkey': 'rail-open' }),
      h('div', { class: 'topbar-title' }, h('h1', { title: project.name }, project.name), projectMenuButton),
      viewTabs(project, ui.view),
      h('div', { class: 'topbar-actions' },
        h('button', {
          type: 'button', class: 'btn undo-btn', id: 'undo-btn', disabled: !last, 'data-fkey': 'undo',
          title: last ? `Undo ${last.label} (Ctrl+Z)` : 'Nothing to undo', 'aria-label': last ? `Undo ${last.label}` : 'Undo',
          onClick: Actions.undo,
        }, icon('undo', 15), h('span', { class: 'btn-text' }, 'Undo')),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'add-card', 'data-fkey': 'add-card', onClick: () => Forms.openCard() }, icon('plus', 15), h('span', { class: 'btn-text' }, 'Add card'))));
  }

  return { render };
})();
