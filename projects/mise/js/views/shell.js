// The page frame: wordmark, section navigation, data tools and the theme toggle.
Mise.Views.shell = (() => {
  const { h, icon, downloadText } = Mise.Dom;
  const Store = Mise.Store;
  const NAV = [
    { id: 'recipes', label: 'Recipes', href: () => '#/recipes' },
    { id: 'planner', label: 'Planner', href: (week) => `#/planner/${week}` },
    { id: 'groceries', label: 'Groceries', href: (week) => `#/groceries/${week}` },
    { id: 'pantry', label: 'Pantry', href: () => '#/pantry' },
  ];

  let nav = null;
  let timerPill = null;

  function exportData() {
    downloadText(`mise-export-${Mise.Dates.todayKey()}.json`, Store.exportText(), 'application/json');
    Mise.Toast.show('Exported your recipes, plan and pantry.');
  }

  function showImportErrors(errors) {
    Mise.Modal.open({
      title: "Couldn't import that file",
      content: (close) => [
        h('p', null, 'Nothing was changed. Here is what was wrong:'),
        h('ul', { class: 'error-list', id: 'import-errors' }, errors.slice(0, 8).map((error) => h('li', null, error))),
        errors.length > 8 ? h('p', { class: 'hint' }, `And ${errors.length - 8} more.`) : null,
        h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: close }, 'Close')),
      ],
    });
  }

  function confirmImport(next) {
    const planned = Object.values(next.plan).reduce((total, day) => total + day.breakfast.length + day.lunch.length + day.dinner.length, 0);
    Mise.Modal.open({
      title: 'Replace your data?',
      content: (close) => [
        h('p', { id: 'import-summary' }, `This file has ${next.recipes.length} recipes, ${planned} planned meals and ${next.pantry.length} pantry items. They will replace what is here now.`),
        h('div', { class: 'form-actions' },
          h('button', {
            type: 'button',
            class: 'btn primary',
            id: 'import-confirm',
            onclick: () => { close(); Store.replaceAll(next, 'Imported your data.'); },
          }, 'Replace'),
          h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel')),
      ],
    });
  }

  async function readImport(file) {
    let text;
    try {
      text = await file.text();
    } catch (error) {
      showImportErrors(['The file could not be read.']);
      return;
    }
    const result = Store.parseImport(text);
    if (result.errors) showImportErrors(result.errors);
    else confirmImport(result.state);
  }

  function toggleTheme() {
    Mise.Theme.toggle();
    drawThemeButton();
  }

  let themeButton = null;
  function drawThemeButton() {
    const dark = Mise.Theme.isDark();
    themeButton.replaceChildren(icon(dark ? 'sun' : 'moon'));
    themeButton.setAttribute('aria-label', dark ? 'Use light theme' : 'Use dark theme');
    themeButton.title = dark ? 'Use light theme' : 'Use dark theme';
  }

  function tools() {
    const fileInput = h('input', {
      type: 'file',
      id: 'import-file',
      accept: '.json,application/json',
      class: 'sr-only',
      tabindex: '-1',
      'aria-label': 'Choose an export file to import',
      onchange: (event) => {
        const [file] = event.target.files;
        if (file) readImport(file);
        event.target.value = '';
      },
    });
    themeButton = h('button', { type: 'button', class: 'icon-btn', id: 'theme-toggle', onclick: toggleTheme });
    drawThemeButton();
    return h('div', { class: 'tools no-print' },
      h('button', { type: 'button', class: 'tool-btn', id: 'export-data', 'aria-label': 'Export data', title: 'Export data as JSON', onclick: exportData }, icon('download', 16), h('span', { class: 'tool-label' }, 'Export')),
      h('button', { type: 'button', class: 'tool-btn', id: 'import-data', 'aria-label': 'Import data', title: 'Import a JSON export', onclick: () => fileInput.click() }, icon('upload', 16), h('span', { class: 'tool-label' }, 'Import')),
      fileInput,
      h('button', { type: 'button', class: 'tool-btn', id: 'reset-demo', onclick: () => Store.resetToSeed() }, icon('reset', 16), 'Reset demo data'),
      themeButton);
  }

  function drawTimerPill() {
    const running = Mise.Timers.list().filter((timer) => !timer.done);
    timerPill.hidden = !running.length;
    if (!running.length) return;
    const soonest = running.reduce((a, b) => (a.left < b.left ? a : b));
    timerPill.href = `#/cook/${encodeURIComponent(soonest.recipeId)}`;
    timerPill.replaceChildren(icon('clock', 14), Mise.Durations.clock(soonest.left));
    timerPill.setAttribute('aria-label', `${soonest.label} timer, back to cook mode`);
  }

  function build() {
    nav = h('nav', { class: 'main-nav no-print', 'aria-label': 'Sections' });
    timerPill = h('a', { class: 'timer-pill no-print', id: 'timer-pill', hidden: true });
    Mise.Timers.subscribe(drawTimerPill);
    return h('header', { class: 'app-header' },
      h('div', { class: 'header-inner' },
        h('a', { class: 'wordmark', href: '#/recipes' }, 'Mise'),
        nav,
        timerPill,
        tools()));
  }

  function setActive(section, week) {
    nav.replaceChildren(...NAV.map((item) => h('a', {
      href: item.href(week),
      id: `nav-${item.id}`,
      'aria-current': item.id === section ? 'page' : null,
    }, item.label)));
  }

  return { build, setActive };
})();
