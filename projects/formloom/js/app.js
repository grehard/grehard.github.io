// Routing and the top bar. Every route lives in the location hash, so it works inside an iframe and from file://.
//   #/forms                 form library
//   #/build/<id>            builder
//   #/preview/<id>          respondent view, records nothing
//   #/responses/<id>        table and summary
//   #/f/<packed form>       share link: the respondent view alone
//   #/reply/<packed reply>  adds a respondent's answers to the owner's form
FL.app = (function () {
  const { h, clear } = FL.util;
  const { icon } = FL.icons;
  let route = { name: 'forms' };
  let topbarRefs = null;
  let activeRespondent = null;
  let themeButtons = [];

  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const [name, arg] = parts;
    if (name === 'f' || name === 'reply') return { name, code: arg || '' };
    if (['build', 'preview', 'responses'].includes(name)) return { name, formId: arg };
    if (name === 'forms') return { name };
    return { name: 'home' };
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function themeButton() {
    const button = h('button', { class: 'btn-icon theme-toggle', type: 'button', onclick: () => FL.theme.toggle() });
    const paint = () => {
      clear(button).append(icon(FL.theme.isDark() ? 'sun' : 'moon'));
      const label = FL.theme.isDark() ? 'Switch to light theme' : 'Switch to dark theme';
      button.setAttribute('aria-label', label);
      button.title = label;
    };
    paint();
    themeButtons.push(paint);
    return { button, paint };
  }

  function navTab(label, iconName, hash, active, badge) {
    return h('a', { class: `nav-tab${active ? ' is-on' : ''}`, href: hash, 'aria-current': active ? 'page' : null },
      icon(iconName, 15), h('span', null, label), badge);
  }

  function topbar(form) {
    const theme = themeButton();
    const brand = h('a', { class: 'brand', href: '#/forms', title: 'All forms' },
      h('span', { class: 'brand-mark' }, icon('forms', 18)),
      h('span', { class: 'brand-name' }, 'Formloom'));
    const refs = { theme };
    const bar = h('header', { class: 'topbar' }, brand);
    if (form) {
      refs.title = h('input', {
        class: 'topbar-title',
        type: 'text',
        'aria-label': 'Form title',
        value: form.title,
        oninput: (event) => renameForm(form.id, event.target.value),
      });
      refs.badge = h('span', { class: 'nav-badge' }, FL.store.responsesFor(form.id).length.toLocaleString('en-US'));
      refs.undo = h('button', { class: 'btn-icon', type: 'button', id: 'undo', 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', onclick: () => FL.builder.undo() }, icon('undo'));
      refs.redo = h('button', { class: 'btn-icon', type: 'button', id: 'redo', 'aria-label': 'Redo', title: 'Redo (Ctrl+Y)', onclick: () => FL.builder.redo() }, icon('redo'));
      bar.append(
        refs.title,
        h('nav', { class: 'nav-tabs', 'aria-label': 'Form views' },
          navTab('Build', 'edit', `#/build/${form.id}`, route.name === 'build'),
          navTab('Preview', 'eye', `#/preview/${form.id}`, route.name === 'preview'),
          navTab('Responses', 'table', `#/responses/${form.id}`, route.name === 'responses', refs.badge)),
        h('div', { class: 'topbar-actions' },
          route.name === 'build' ? [refs.undo, refs.redo] : null,
          h('button', { class: 'btn btn-primary topbar-share', type: 'button', id: 'share', onclick: () => FL.share.open(FL.store.getForm(form.id)) }, icon('share'), h('span', null, 'Share')),
          theme.button));
    } else {
      bar.append(h('div', { class: 'topbar-actions' }, theme.button));
    }
    topbarRefs = refs;
    syncTopbar();
    return bar;
  }

  function renameForm(formId, title) {
    const form = FL.store.getForm(formId);
    FL.history.record(form, `title:${formId}`);
    form.title = title;
    FL.store.saveForm(form);
    if (route.name === 'build') FL.builder.refreshAfterRename();
    syncTopbar();
  }

  function syncTopbar() {
    if (!topbarRefs) return;
    const form = route.formId ? FL.store.getForm(route.formId) : null;
    if (!form) return;
    if (topbarRefs.title && topbarRefs.title.value !== form.title) topbarRefs.title.value = form.title;
    if (topbarRefs.badge) topbarRefs.badge.textContent = FL.store.responsesFor(form.id).length.toLocaleString('en-US');
    if (topbarRefs.undo) topbarRefs.undo.disabled = !FL.history.canUndo(form.id);
    if (topbarRefs.redo) topbarRefs.redo.disabled = !FL.history.canRedo(form.id);
  }

  function resetDemo() {
    const restore = FL.store.resetDemo();
    FL.history.clearAll();
    const after = () => {
      FL.history.clearAll();
      FL.builder.reset();
      const last = FL.store.lastForm();
      if (route.name === 'forms' || !last) go('#/forms');
      else go(`#/build/${last.id}`);
    };
    after();
    FL.ui.toast('Demo data restored.', { undo: () => { restore(); after(); } });
  }

  function missingForm(root) {
    clear(root).append(h('div', { class: 'app-shell' }, topbar(null),
      h('div', { class: 'scroll-view' }, h('div', { class: 'empty-state' },
        h('p', { class: 'empty-title' }, 'This form no longer exists'),
        h('p', null, 'It may have been deleted, or the link came from another browser.'),
        h('a', { class: 'btn', href: '#/forms' }, 'See all forms')))));
  }

  function shell(root, form, mountView) {
    const view = h('div', { class: 'app-view' });
    clear(root).append(h('div', { class: 'app-shell' }, topbar(form), view));
    mountView(view);
  }

  function previewBanner() {
    return h('div', { class: 'preview-banner' }, icon('eye', 15), h('span', null, 'Preview. Answers are validated but not saved.'));
  }

  function renderPreview(root, form) {
    shell(root, form, (view) => {
      const holder = h('div', { class: 'respondent-holder' });
      view.append(holder);
      activeRespondent = FL.respondent.mount(holder, { form, mode: 'preview', banner: previewBanner() });
    });
  }

  function respondentFooter(owned) {
    const theme = themeButton();
    return h('footer', { class: 'f-foot' },
      h('a', { href: '#/forms', class: 'f-foot-link' }, owned ? 'Back to Formloom' : 'Made with Formloom'),
      h('span', { class: 'f-foot-note' }, 'Answers are stored in this browser.'),
      theme.button);
  }

  /** Shown only where the form isn't owned here, because the answers would otherwise stay on this device. */
  function replyPanel(form, response) {
    const link = FL.share.replyLink(form.id, response);
    return h('section', { class: 'f-reply' },
      h('h2', null, 'One more step'),
      h('p', null, 'This form runs without a server. To deliver your answers, copy this link and send it to whoever shared the form.'),
      h('label', { class: 'sr-only', for: 'reply-link' }, 'Link with your answers'),
      h('input', { class: 'f-input', id: 'reply-link', type: 'text', readOnly: true, value: link, onfocus: (event) => event.target.select() }),
      h('button', {
        class: 'f-btn is-primary', type: 'button',
        onclick: async () => {
          const copied = await FL.util.copyText(link);
          FL.ui.toast(copied ? 'Link copied.' : 'Copying is blocked here. Select the link and copy it by hand.', { error: !copied });
        },
      }, icon('copy'), 'Copy link'));
  }

  function renderShared(root) {
    const form = FL.codec.decodeForm(route.code);
    if (!form) {
      clear(root).append(h('div', { class: 'link-error' },
        h('span', { class: 'link-error-mark' }, icon('alert', 22)),
        h('h1', null, 'This form link is incomplete'),
        h('p', null, 'Part of the link may have been cut off when it was sent. Ask the sender for a new link.'),
        h('a', { class: 'btn', href: '#/forms' }, 'Go to Formloom')));
      return;
    }
    document.title = form.title;
    const owned = Boolean(FL.store.getForm(form.id));
    const holder = h('div', { class: 'respondent-holder is-standalone' });
    clear(root).append(holder);
    activeRespondent = FL.respondent.mount(holder, {
      form,
      mode: 'live',
      footer: respondentFooter(owned),
      onSubmit(response) {
        FL.store.addResponse(form.id, response);
        return owned ? null : replyPanel(form, response);
      },
    });
  }

  function renderReply(root) {
    const reply = FL.codec.decodeReply(route.code);
    const form = reply ? FL.store.getForm(reply.formId) : null;
    if (!form) {
      clear(root).append(h('div', { class: 'link-error' },
        h('span', { class: 'link-error-mark' }, icon('alert', 22)),
        h('h1', null, reply ? 'That form is not in this browser' : 'This reply link is incomplete'),
        h('p', null, reply ? 'Open the link in the browser where you built the form.' : 'Part of the link may have been cut off. Ask the respondent to send it again.'),
        h('a', { class: 'btn', href: '#/forms' }, 'Go to Formloom')));
      return;
    }
    const added = FL.store.addResponseOnce(form.id, reply.response);
    FL.ui.toast(added ? `Added a response to "${form.title}".` : 'That response was already added.');
    location.replace(`#/responses/${form.id}`);
  }

  function render() {
    route = parseRoute();
    const root = document.getElementById('app');
    FL.builder.unmount();
    activeRespondent = null;
    themeButtons = [];
    document.title = 'Formloom: form and survey builder';
    if (route.name === 'f') { topbarRefs = null; renderShared(root); return; }
    if (route.name === 'reply') { topbarRefs = null; renderReply(root); return; }
    if (route.name === 'home') {
      const last = FL.store.lastForm();
      route = last ? { name: 'build', formId: last.id } : { name: 'forms' };
    }
    if (route.name === 'forms') {
      shell(root, null, (view) => FL.library.mount(view));
      return;
    }
    const form = FL.store.getForm(route.formId);
    if (!form) { topbarRefs = null; missingForm(root); return; }
    FL.store.rememberForm(form.id);
    document.title = `${form.title} - Formloom`;
    if (route.name === 'build') shell(root, form, (view) => FL.builder.mount(view, form.id));
    if (route.name === 'preview') renderPreview(root, form);
    if (route.name === 'responses') shell(root, form, (view) => FL.responsesView.mount(view, form.id));
    syncTopbar();
  }

  /** Repaints in place, so a half-filled form keeps its answers and the toggle keeps focus. */
  function onThemeChange() {
    themeButtons.forEach((paint) => paint());
    if (activeRespondent) activeRespondent.refreshTheme();
    FL.builder.themeChanged();
  }

  function start() {
    FL.store.init();
    window.addEventListener('hashchange', () => { FL.ui.closeAllModals(); render(); });
    FL.theme.onChange(onThemeChange);
    render();
  }

  return { start, go, render, syncTopbar, resetDemo };
})();

FL.app.start();
