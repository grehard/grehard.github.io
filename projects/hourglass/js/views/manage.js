// Projects page: budgets, plus create, edit and delete for projects, clients and tags.
(function (HG) {
  'use strict';
  const { h, icon } = HG;
  const T = HG.time;
  const C = HG.calc;
  const MAX_MONEY = 100000;
  const MAX_BUDGET = 1000000;
  let tab = 'projects';
  let search = '';

  /** Reads an optional non-negative number. Returns { value } or { error }. */
  function readNumber(input, label, max) {
    const raw = input.value.trim();
    if (!raw) return { value: null };
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return { error: `${label} must be a positive number.` };
    if (n > max) return { error: `${label} can't be more than ${max.toLocaleString('en-US')}.` };
    return { value: Math.round(n * 100) / 100 };
  }

  function formActions(save, label) {
    return [
      h('button', { type: 'button', class: 'btn', onclick: HG.ui.closeModal }, 'Cancel'),
      h('button', { type: 'button', class: 'btn btn-primary', id: 'manage-save', onclick: save }, label),
    ];
  }

  function nameIsTaken(list, name, id) {
    return list.some((item) => item.id !== id && item.name.trim().toLowerCase() === name.toLowerCase());
  }

  function openProjectForm(project) {
    const { state } = HG.store;
    let color = project ? project.color : HG.ui.SWATCHES[state.projects.length % HG.ui.SWATCHES.length];
    const name = h('input', { type: 'text', id: 'project-name', maxlength: 120, value: project ? project.name : '' });
    const client = h('select', { id: 'project-client' }, h('option', { value: '' }, 'No client'),
      state.clients.map((c) => h('option', { value: c.id, selected: project && project.clientId === c.id }, c.name)));
    const rate = h('input', { type: 'number', id: 'project-rate', min: 0, step: '0.01', value: project && project.rate !== null ? project.rate : '', placeholder: 'Use client rate' });
    const budget = h('input', { type: 'number', id: 'project-budget', min: 0, step: '0.5', value: project && project.budgetHours !== null ? project.budgetHours : '', placeholder: 'No budget' });
    const billable = h('input', { type: 'checkbox', id: 'project-billable', checked: project ? project.billable : true });
    const error = HG.ui.fieldError();

    const save = () => {
      const trimmed = name.value.trim();
      const rateValue = readNumber(rate, 'Hourly rate', MAX_MONEY);
      const budgetValue = readNumber(budget, 'Budget', MAX_BUDGET);
      const problem = !trimmed ? 'Give the project a name.'
        : nameIsTaken(HG.store.state.projects, trimmed, project && project.id) ? 'There is already a project with this name.'
          : rateValue.error || budgetValue.error;
      HG.ui.setError(error, problem || '');
      if (problem) return;
      const record = { id: project ? project.id : HG.store.newId('p'), name: trimmed, clientId: client.value || null, rate: rateValue.value,
        budgetHours: budgetValue.value, color, billable: billable.checked };
      HG.ui.closeModal();
      HG.store.commit((s) => {
        if (project) s.projects = s.projects.map((p) => (p.id === project.id ? record : p));
        else s.projects.push(record);
      });
      HG.ui.toast(project ? 'Project updated' : 'Project added');
    };

    HG.ui.showModal({
      title: project ? 'Edit project' : 'Add project',
      body: h('form', { class: 'form-grid', onsubmit: (e) => { e.preventDefault(); save(); } },
        HG.ui.field('Name', name, { className: 'span-2' }),
        HG.ui.field('Client', client, { className: 'span-2' }),
        HG.ui.field(`Hourly rate (${state.settings.currency})`, rate),
        HG.ui.field('Budget (hours)', budget),
        h('div', { class: 'field span-2' }, h('span', { class: 'label' }, 'Color'), HG.ui.colorPicker(color, (value) => { color = value; })),
        h('label', { class: 'check span-2' }, billable, 'New time on this project is billable'),
        h('div', { class: 'span-2' }, error),
        h('button', { type: 'submit', hidden: true, tabindex: '-1', 'aria-hidden': 'true' })),
      footer: formActions(save, project ? 'Save changes' : 'Add project'),
      focus: name,
    });
  }

  function openClientForm(client) {
    const { state } = HG.store;
    let color = client ? client.color : HG.ui.SWATCHES[state.clients.length % HG.ui.SWATCHES.length];
    const name = h('input', { type: 'text', id: 'client-name', maxlength: 120, value: client ? client.name : '' });
    const rate = h('input', { type: 'number', id: 'client-rate', min: 0, step: '0.01', value: client && client.rate !== null ? client.rate : '', placeholder: 'Default rate' });
    const budget = h('input', { type: 'number', id: 'client-budget', min: 0, step: '0.5', value: client && client.budgetHours !== null ? client.budgetHours : '', placeholder: 'No budget' });
    const error = HG.ui.fieldError();
    const save = () => {
      const trimmed = name.value.trim();
      const rateValue = readNumber(rate, 'Hourly rate', MAX_MONEY);
      const budgetValue = readNumber(budget, 'Budget', MAX_BUDGET);
      const problem = !trimmed ? 'Give the client a name.'
        : nameIsTaken(HG.store.state.clients, trimmed, client && client.id) ? 'There is already a client with this name.'
          : rateValue.error || budgetValue.error;
      HG.ui.setError(error, problem || '');
      if (problem) return;
      const record = { id: client ? client.id : HG.store.newId('c'), name: trimmed, rate: rateValue.value, budgetHours: budgetValue.value, color };
      HG.ui.closeModal();
      HG.store.commit((s) => {
        if (client) s.clients = s.clients.map((c) => (c.id === client.id ? record : c));
        else s.clients.push(record);
      });
      HG.ui.toast(client ? 'Client updated' : 'Client added');
    };
    HG.ui.showModal({
      title: client ? 'Edit client' : 'Add client',
      body: h('form', { class: 'form-grid', onsubmit: (e) => { e.preventDefault(); save(); } },
        HG.ui.field('Name', name, { className: 'span-2' }),
        HG.ui.field(`Hourly rate (${state.settings.currency})`, rate),
        HG.ui.field('Budget (hours)', budget),
        h('div', { class: 'field span-2' }, h('span', { class: 'label' }, 'Color'), HG.ui.colorPicker(color, (value) => { color = value; })),
        h('div', { class: 'span-2' }, error),
        h('button', { type: 'submit', hidden: true, tabindex: '-1', 'aria-hidden': 'true' })),
      footer: formActions(save, client ? 'Save changes' : 'Add client'),
      focus: name,
    });
  }

  function openTagForm(tag) {
    const name = h('input', { type: 'text', id: 'tag-name', maxlength: 60, value: tag ? tag.name : '' });
    const error = HG.ui.fieldError();
    const save = () => {
      const trimmed = name.value.trim();
      const problem = !trimmed ? 'Give the tag a name.' : nameIsTaken(HG.store.state.tags, trimmed, tag && tag.id) ? 'There is already a tag with this name.' : '';
      HG.ui.setError(error, problem);
      if (problem) return;
      HG.ui.closeModal();
      HG.store.commit((s) => {
        if (tag) s.tags = s.tags.map((t) => (t.id === tag.id ? { ...t, name: trimmed } : t));
        else s.tags.push({ id: HG.store.newId('t'), name: trimmed });
      });
      HG.ui.toast(tag ? 'Tag updated' : 'Tag added');
    };
    HG.ui.showModal({
      title: tag ? 'Edit tag' : 'Add tag',
      body: h('form', { class: 'form-grid', onsubmit: (e) => { e.preventDefault(); save(); } }, HG.ui.field('Name', name, { className: 'span-2' }), h('div', { class: 'span-2' }, error)),
      footer: formActions(save, tag ? 'Save changes' : 'Add tag'),
      focus: name,
    });
  }

  function deleteProject(project) {
    const count = HG.store.state.entries.filter((e) => e.projectId === project.id).length;
    HG.ui.undoable(`Deleted ${project.name}${count ? `. ${count} entries kept without a project.` : ''}`, (s) => {
      s.projects = s.projects.filter((p) => p.id !== project.id);
      s.entries.forEach((e) => { if (e.projectId === project.id) e.projectId = null; });
      if (s.task.projectId === project.id) s.task.projectId = null;
    });
  }

  function deleteClient(client) {
    HG.ui.undoable(`Deleted ${client.name}. Its projects were kept.`, (s) => {
      s.clients = s.clients.filter((c) => c.id !== client.id);
      s.projects.forEach((p) => { if (p.clientId === client.id) p.clientId = null; });
    });
  }

  function deleteTag(tag) {
    HG.ui.undoable(`Deleted tag ${tag.name}`, (s) => {
      s.tags = s.tags.filter((t) => t.id !== tag.id);
      s.entries.forEach((e) => { e.tagIds = e.tagIds.filter((id) => id !== tag.id); });
      s.task.tagIds = s.task.tagIds.filter((id) => id !== tag.id);
    });
  }

  function budgetCell(item) {
    if (item.status === 'none') {
      return h('div', { class: 'budget-cell' }, h('span', { class: 'hint' }, `${T.hours(item.usedMs)} h, no budget`));
    }
    const text = `${T.hours(item.usedMs)} of ${item.budgetHours} h`;
    return h('div', { class: 'budget-cell' },
      h('div', { class: 'budget-line' },
        h('span', { class: 'budget-text' }, text),
        item.status === 'over' && h('span', { class: 'badge badge-danger' }, icon('warn', 12), `${T.hours(item.usedMs - item.budgetMs)} h over`),
        item.status === 'near' && h('span', { class: 'badge badge-warn' }, `${Math.round(item.ratio * 100)}% used`)),
      HG.ui.progressBar(item));
  }

  const matches = (name) => name.toLowerCase().includes(search.trim().toLowerCase());

  function projectsList(state, usage) {
    const maps = C.lookups(state);
    const byId = new Map(usage.projects.map((u) => [u.id, u]));
    const items = state.projects.filter((p) => {
      const client = maps.client.get(p.clientId);
      return matches(p.name) || (client && matches(client.name));
    }).sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) return HG.ui.emptyState(state.projects.length ? 'No project matches your search' : 'No projects yet', 'Projects hold your rates, budgets and colors.');
    return h('ul', { class: 'manage-list', id: 'project-list' }, items.map((p) => {
      const client = maps.client.get(p.clientId);
      const rate = C.rateCents(p.id, state, maps);
      const inherited = p.rate === null;
      return h('li', { class: 'manage-row', 'data-project': p.name },
        h('div', { class: 'manage-name' }, HG.ui.dot(p.color),
          h('div', { class: 'manage-text' }, h('span', { class: 'strong', title: p.name }, p.name), h('span', { class: 'hint', title: client ? client.name : '' }, client ? client.name : 'No client'))),
        h('div', { class: 'manage-rate' }, h('span', null, `${C.money(rate, state.settings.currency)}/h`), h('span', { class: 'hint' }, !p.billable ? 'Non-billable' : inherited ? 'From client' : 'Project rate')),
        budgetCell(byId.get(p.id)),
        h('div', { class: 'row-actions' },
          HG.ui.iconButton('report', `Report for ${p.name}`, () => HG.views.reports.showProject(p.id)),
          HG.ui.iconButton('edit', `Edit ${p.name}`, () => openProjectForm(p)),
          HG.ui.iconButton('trash', `Delete ${p.name}`, () => deleteProject(p))));
    }));
  }

  function clientsList(state, usage) {
    const byId = new Map(usage.clients.map((u) => [u.id, u]));
    const items = state.clients.filter((c) => matches(c.name)).sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) return HG.ui.emptyState(state.clients.length ? 'No client matches your search' : 'No clients yet', 'Clients give their projects a default rate.');
    return h('ul', { class: 'manage-list', id: 'client-list' }, items.map((c) => {
      const count = state.projects.filter((p) => p.clientId === c.id).length;
      return h('li', { class: 'manage-row', 'data-client': c.name },
        h('div', { class: 'manage-name' }, HG.ui.dot(c.color),
          h('div', { class: 'manage-text' }, h('span', { class: 'strong', title: c.name }, c.name), h('span', { class: 'hint' }, `${count} ${count === 1 ? 'project' : 'projects'}`))),
        h('div', { class: 'manage-rate' }, h('span', null, c.rate === null ? 'Default rate' : `${C.money(Math.round(c.rate * 100), state.settings.currency)}/h`)),
        budgetCell(byId.get(c.id)),
        h('div', { class: 'row-actions' },
          HG.ui.iconButton('edit', `Edit ${c.name}`, () => openClientForm(c)),
          HG.ui.iconButton('trash', `Delete ${c.name}`, () => deleteClient(c))));
    }));
  }

  function tagsList(state) {
    const items = state.tags.filter((t) => matches(t.name)).sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) return HG.ui.emptyState(state.tags.length ? 'No tag matches your search' : 'No tags yet', 'Tags let you report across projects, such as all meetings.');
    return h('ul', { class: 'manage-list', id: 'tag-list' }, items.map((t) => {
      const count = state.entries.filter((e) => e.tagIds.includes(t.id)).length;
      return h('li', { class: 'manage-row manage-row-tag', 'data-tag': t.name },
        h('div', { class: 'manage-name' }, icon('tag'), h('div', { class: 'manage-text' }, h('span', { class: 'strong', title: t.name }, t.name), h('span', { class: 'hint' }, `${count} ${count === 1 ? 'entry' : 'entries'}`))),
        h('div', { class: 'row-actions' },
          HG.ui.iconButton('edit', `Edit ${t.name}`, () => openTagForm(t)),
          HG.ui.iconButton('trash', `Delete ${t.name}`, () => deleteTag(t))));
    }));
  }

  function alertsPanel(state, now) {
    const alerts = HG.budget.alerts(state, now);
    if (!alerts.length) return null;
    return h('section', { class: 'panel alerts-panel', id: 'budget-alerts', 'aria-label': 'Budget alerts' },
      h('h2', { class: 'panel-title' }, 'Budget alerts'),
      h('ul', { class: 'alert-list' }, alerts.map((a) => h('li', { class: a.status === 'over' ? 'is-over' : 'is-near' },
        icon('warn'), h('span', null, h('strong', null, a.status === 'over' ? 'Over budget. ' : 'Near budget. '), HG.budget.alertText(a))))));
  }

  function render() {
    const { state } = HG.store;
    const now = Date.now();
    const usage = HG.budget.usage(state, now);
    const tabs = [['projects', `Projects (${state.projects.length})`], ['clients', `Clients (${state.clients.length})`], ['tags', `Tags (${state.tags.length})`]];
    const addLabel = { projects: 'Add project', clients: 'Add client', tags: 'Add tag' }[tab];
    const add = { projects: () => openProjectForm(null), clients: () => openClientForm(null), tags: () => openTagForm(null) }[tab];
    const list = { projects: () => projectsList(state, usage), clients: () => clientsList(state, usage), tags: () => tagsList(state) }[tab]();

    return h('div', { class: 'manage-view' },
      h('div', { class: 'view-head' },
        h('h1', null, 'Projects and budgets'),
        h('div', { class: 'head-actions' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'manage-add', onclick: add }, icon('plus'), addLabel))),
      alertsPanel(state, now),
      h('div', { class: 'manage-tools' },
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Show' }, tabs.map(([value, label]) => h('button', {
          type: 'button', class: 'seg-btn', id: `tab-${value}`, 'data-fk': `tab-${value}`, 'aria-pressed': String(tab === value),
          onclick: () => { tab = value; search = ''; HG.app.render(); },
        }, label))),
        h('input', { type: 'search', id: 'manage-search', 'data-fk': 'manage-search', 'aria-label': `Search ${tab}`, placeholder: `Search ${tab}`, value: search,
          oninput: (e) => { search = e.target.value; HG.app.render(); } })),
      h('section', { class: 'panel', 'aria-label': tab }, list));
  }

  HG.views = HG.views || {};
  HG.views.manage = { render };
})(window.HG);
