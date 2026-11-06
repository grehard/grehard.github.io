// Left rail: projects, team, labels and workspace tools. On phones it slides in as a drawer.
const Rail = (() => {
  const { h, icon, iconButton } = Dom;

  function openCardCount(project) {
    return project.columns.reduce((sum, column) => sum + column.cardIds.length, 0);
  }

  function brand() {
    return h('div', { class: 'rail-brand' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
      h('span', { class: 'brand-name' }, 'Laneboard'),
      iconButton('x', 'Close menu', () => App.setRailOpen(false), { class: 'rail-close' }));
  }

  function projectsSection(state, active) {
    return h('section', { class: 'rail-section' },
      h('div', { class: 'rail-heading' }, h('h2', null, 'Projects'), iconButton('plus', 'New project', () => Forms.openProject(null), { 'data-fkey': 'rail-new-project' })),
      h('ul', { class: 'rail-list' }, state.projects.map((project) => h('li', null,
        h('button', {
          type: 'button', class: `rail-item${project.id === active.id ? ' is-current' : ''}`, title: project.name, 'data-fkey': `rail-project-${project.id}`,
          'aria-current': project.id === active.id ? 'page' : null,
          onClick: () => { App.openProject(project.id); App.setRailOpen(false); App.render(); },
        }, h('span', { class: 'rail-item-name' }, project.name), h('span', { class: 'rail-item-count' }, openCardCount(project)))))));
  }

  function teamSection(state, active, filter) {
    const assigned = (id) => active.columns.reduce((sum, column) => sum + column.cardIds.filter((cardId) => active.cards[cardId].assigneeId === id).length, 0);
    const rows = state.team.map((member) => h('li', null,
      h('button', {
        type: 'button', class: `rail-item rail-member${filter.assigneeId === member.id ? ' is-filtering' : ''}`, title: `Show only ${member.name}'s cards`,
        'aria-pressed': filter.assigneeId === member.id ? 'true' : 'false', 'data-fkey': `rail-member-${member.id}`,
        onClick: () => App.toggleFilter('assigneeId', member.id),
      }, Parts.avatar(member), h('span', { class: 'rail-item-name' }, member.name), h('span', { class: 'rail-item-count' }, assigned(member.id)))));
    return h('section', { class: 'rail-section' },
      h('div', { class: 'rail-heading' }, h('h2', null, 'Team'), h('button', { type: 'button', class: 'rail-edit', 'data-fkey': 'rail-edit-team', onClick: Editors.openTeam }, 'Edit')),
      rows.length ? h('ul', { class: 'rail-list' }, rows) : h('p', { class: 'muted rail-note' }, 'No team members yet.'));
  }

  function labelsSection(state, filter) {
    const chips = state.labels.map((label) => h('button', {
      type: 'button', class: `rail-label${filter.labelId === label.id ? ' is-filtering' : ''}`, title: `Show only cards labeled ${label.name}`,
      'aria-pressed': filter.labelId === label.id ? 'true' : 'false', 'data-fkey': `rail-label-${label.id}`,
      onClick: () => App.toggleFilter('labelId', label.id),
    }, h('span', { class: 'label-dot', style: `background:${label.color}` }), label.name));
    return h('section', { class: 'rail-section' },
      h('div', { class: 'rail-heading' }, h('h2', null, 'Labels'), h('button', { type: 'button', class: 'rail-edit', 'data-fkey': 'rail-edit-labels', onClick: Editors.openLabels }, 'Edit')),
      chips.length ? h('div', { class: 'rail-labels' }, chips) : h('p', { class: 'muted rail-note' }, 'No labels yet.'));
  }

  function tool(iconName, label, onClick, fkey) {
    return h('button', { type: 'button', class: 'rail-tool', 'data-fkey': fkey, onClick }, icon(iconName, 15), label);
  }

  function tools() {
    const dark = Theme.current() === 'dark';
    return h('div', { class: 'rail-tools' },
      tool('download', 'Export JSON', Actions.exportWorkspace, 'tool-export'),
      tool('upload', 'Import JSON', Editors.openImport, 'tool-import'),
      tool('reset', 'Reset demo data', Actions.resetDemo, 'tool-reset'),
      tool(dark ? 'sun' : 'moon', dark ? 'Light theme' : 'Dark theme', () => { Theme.toggle(); App.render(); }, 'tool-theme'));
  }

  function render(element, ctx) {
    element.replaceChildren(
      brand(),
      h('div', { class: 'rail-scroll', 'data-scroll-key': 'rail' },
        projectsSection(ctx.state, ctx.project),
        teamSection(ctx.state, ctx.project, ctx.ui.filter),
        labelsSection(ctx.state, ctx.ui.filter)),
      tools());
  }

  return { render };
})();
