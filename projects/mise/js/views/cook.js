// Cook mode: one step at a time in large type, with timers and the scaled ingredients alongside.
Mise.Views.cook = (() => {
  const { h, icon, field, setFieldError, keepFocus } = Mise.Dom;
  const { detect, clock } = Mise.Durations;
  const { scaledIngredient, factorFor } = Mise.Scaling;
  const Timers = Mise.Timers;
  const Store = Mise.Store;

  let stepIndex = 0;
  let activeRecipeId = null;
  let ticked = new Set();
  let timerHost = null;
  let timerSignature = '';

  function ingredientsInStep(recipe, stepText) {
    const lower = stepText.toLowerCase();
    return recipe.ingredients.filter((ingredient) => {
      const lastWord = Mise.Names.key(ingredient.name).split(' ').pop();
      return new RegExp(`\\b${lastWord.replace(/[^a-z-]/g, '')}(?:s|es)?\\b`).test(lower);
    });
  }

  function timerRow(timer) {
    return h('li', { class: `timer ${timer.done ? 'is-done' : ''}`, 'data-timer': timer.id },
      h('div', { class: 'timer-text' },
        h('span', { class: 'timer-time', 'data-time': timer.id, role: 'timer' }, timer.done ? 'Done' : clock(timer.left)),
        h('span', { class: 'timer-label' }, timer.label)),
      h('div', { class: 'item-actions' },
        timer.done ? null : h('button', { type: 'button', class: 'icon-btn small', 'data-fk': `pause-${timer.id}`, 'aria-label': timer.paused ? `Resume ${timer.label}` : `Pause ${timer.label}`, onclick: () => Timers.togglePause(timer.id) }, icon(timer.paused ? 'play' : 'pause', 15)),
        h('button', { type: 'button', class: 'icon-btn small', 'data-fk': `restart-${timer.id}`, 'aria-label': `Restart ${timer.label}`, onclick: () => Timers.restart(timer.id) }, icon('reset', 15)),
        h('button', { type: 'button', class: 'icon-btn small', 'data-fk': `remove-${timer.id}`, 'aria-label': `Remove ${timer.label}`, onclick: () => Timers.remove(timer.id) }, icon('close', 15))));
  }

  // Rows are rebuilt only when their controls change. Rebuilding on every tick would drop focus.
  function drawTimers() {
    if (!timerHost || !timerHost.isConnected) return;
    const timers = Timers.list();
    const signature = timers.map((timer) => `${timer.id}:${timer.done}:${timer.paused}`).join('|');
    if (signature !== timerSignature) {
      timerSignature = signature;
      keepFocus(() => {
        timerHost.replaceChildren(...(timers.length ? timers.map(timerRow) : [h('li', { class: 'hint' }, 'No timers running.')]));
      });
      return;
    }
    timers.forEach((timer) => {
      const time = timerHost.querySelector(`[data-time="${timer.id}"]`);
      if (time && !timer.done) time.textContent = clock(timer.left);
    });
  }

  function customTimerForm(recipe) {
    const minutes = h('input', { type: 'number', id: 'timer-minutes', min: 0, max: 600, value: 5, inputmode: 'numeric' });
    const seconds = h('input', { type: 'number', id: 'timer-seconds', min: 0, max: 59, value: 0, inputmode: 'numeric' });
    const submit = (event) => {
      event.preventDefault();
      const total = Math.round(Number(minutes.value) * 60 + Number(seconds.value));
      const valid = Number.isFinite(total) && total > 0 && Number(minutes.value) >= 0 && Number(seconds.value) >= 0 && total <= 36000;
      setFieldError(seconds, valid ? '' : 'Set a time between 1 second and 10 hours.');
      if (!valid) return;
      Timers.start({ label: total < 60 ? `${total} sec` : `${Math.round(total / 60)} min`, seconds: total, recipeId: recipe.id });
    };
    return h('form', { class: 'timer-form', novalidate: true, onsubmit: submit },
      field('Minutes', minutes),
      field('Seconds', seconds),
      h('button', { type: 'submit', class: 'btn', id: 'timer-add' }, 'Add timer'));
  }

  function stepTimerButtons(recipe, text) {
    return detect(text).map((time, index) => h('button', {
      type: 'button',
      class: 'btn step-timer',
      'data-fk': `step-timer-${stepIndex}-${index}`,
      onclick: () => Timers.start({ label: `Step ${stepIndex + 1}, ${time.label}`, seconds: time.seconds, recipeId: recipe.id }),
    }, icon('clock', 16), `Start ${time.label} timer`));
  }

  function stepBody(recipe, servings) {
    const text = recipe.steps[stepIndex];
    const factor = factorFor(recipe, servings);
    const used = ingredientsInStep(recipe, text);
    const buttons = stepTimerButtons(recipe, text);
    return h('div', { class: 'cook-step' },
      h('p', { class: 'cook-text', id: 'cook-text', 'aria-live': 'polite' }, text),
      buttons.length ? h('div', { class: 'step-timers' }, buttons) : null,
      used.length ? h('div', { class: 'cook-uses' },
        h('h2', null, 'In this step'),
        h('ul', { class: 'plain-list' }, used.map((ingredient) => {
          const shown = scaledIngredient(ingredient, factor);
          return h('li', null, shown.amount ? h('strong', null, `${shown.amount} `) : null, shown.name);
        }))) : null);
  }

  function goToStep(index) {
    const recipe = Store.recipeById(activeRecipeId);
    if (!recipe) return;
    stepIndex = Math.min(recipe.steps.length - 1, Math.max(0, index));
    Mise.App.render();
  }

  function stepNav(recipe) {
    const last = stepIndex === recipe.steps.length - 1;
    return h('div', { class: 'cook-nav' },
      h('div', { class: 'cook-progress' },
        h('p', { class: 'cook-count', id: 'cook-count' }, `Step ${stepIndex + 1} of ${recipe.steps.length}`),
        h('div', { class: 'cook-dots', 'aria-hidden': 'true' }, recipe.steps.map((step, index) => h('span', { class: `cook-dot ${index <= stepIndex ? 'on' : ''}` })))),
      h('button', { type: 'button', class: 'btn', id: 'cook-prev', 'data-fk': 'cook-prev', disabled: stepIndex === 0, onclick: () => goToStep(stepIndex - 1) }, icon('left', 16), 'Back'),
      last
        ? h('a', { class: 'btn primary', href: `#/recipes/${encodeURIComponent(recipe.id)}`, id: 'cook-finish' }, icon('check', 16), 'Finish')
        : h('button', { type: 'button', class: 'btn primary', id: 'cook-next', 'data-fk': 'cook-next', onclick: () => goToStep(stepIndex + 1) }, 'Next', icon('right', 16)));
  }

  function ingredientChecklist(recipe, servings) {
    const factor = factorFor(recipe, servings);
    return h('ul', { class: 'plain-list cook-ingredients' }, recipe.ingredients.map((ingredient, index) => {
      const shown = scaledIngredient(ingredient, factor);
      const id = `cook-ing-${index}`;
      return h('li', { class: ticked.has(index) ? 'is-ticked' : '' },
        h('input', {
          type: 'checkbox',
          id,
          checked: ticked.has(index),
          onchange: (event) => {
            if (event.target.checked) ticked.add(index);
            else ticked.delete(index);
            event.target.closest('li').classList.toggle('is-ticked', event.target.checked);
          },
        }),
        h('label', { for: id }, shown.amount ? h('strong', null, `${shown.amount} `) : null, shown.name));
    }));
  }

  function notFound() {
    return h('div', { class: 'view' }, h('div', { class: 'empty' },
      h('h1', null, 'Recipe not found'),
      h('a', { class: 'btn', href: '#/recipes' }, 'Back to recipes')));
  }

  function onKey(event) {
    if (event.target.matches && event.target.matches('input, textarea, select')) return;
    if (Mise.Modal.isOpen) return;
    if (event.key === 'ArrowRight') goToStep(stepIndex + 1);
    if (event.key === 'ArrowLeft') goToStep(stepIndex - 1);
    if (event.key === 'Escape' && activeRecipeId) location.hash = `#/recipes/${encodeURIComponent(activeRecipeId)}`;
  }

  function render({ id }) {
    const recipe = Store.recipeById(id);
    if (!recipe) return notFound();
    if (activeRecipeId !== id) {
      activeRecipeId = id;
      stepIndex = 0;
      ticked = new Set();
    }
    const servings = Mise.Views.recipeDetail.servingsFor(recipe);
    timerHost = h('ul', { class: 'plain-list timer-list', id: 'timer-list' });
    timerSignature = null;
    const unsubscribe = Timers.subscribe(drawTimers);
    document.addEventListener('keydown', onKey);
    Mise.App.onLeave(() => {
      unsubscribe();
      document.removeEventListener('keydown', onKey);
    });
    queueMicrotask(drawTimers);

    return h('div', { class: 'cook-view' },
      h('header', { class: 'cook-head' },
        h('a', { class: 'btn', href: `#/recipes/${encodeURIComponent(recipe.id)}`, id: 'cook-exit' }, icon('close', 16), 'Exit'),
        h('h1', null, recipe.title),
        h('p', { class: 'cook-servings' }, `${servings} ${servings === 1 ? 'serving' : 'servings'}`)),
      h('div', { class: 'cook-layout' },
        h('div', { class: 'cook-main' }, stepNav(recipe), stepBody(recipe, servings)),
        h('aside', { class: 'cook-side' },
          h('section', null, h('h2', null, 'Timers'), timerHost, customTimerForm(recipe)),
          h('section', null, h('h2', null, 'Ingredients'), ingredientChecklist(recipe, servings)))));
  }

  return { render };
})();
