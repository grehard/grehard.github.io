// Share link and form file export, plus the JSON import dialog.
FL.share = (function () {
  const { h, plural, slugify } = FL.util;
  const { icon } = FL.icons;
  const SAFE_LINK_LENGTH = 8000; // some email clients and browsers cut longer URLs

  function baseUrl() {
    return location.href.split('#')[0];
  }

  function formLink(form) {
    return `${baseUrl()}#/f/${FL.codec.encodeForm(form)}`;
  }

  function replyLink(formId, response) {
    return `${baseUrl()}#/reply/${FL.codec.encodeReply(formId, response)}`;
  }

  function downloadForm(form, includeResponses) {
    const payload = { format: 'formloom-form', version: 1, form };
    if (includeResponses) payload.responses = FL.store.responsesFor(form.id);
    FL.util.download(`${slugify(form.title)}.formloom.json`, JSON.stringify(payload, null, 2), 'application/json');
    FL.ui.toast(includeResponses ? `Exported the form and ${plural(payload.responses.length, 'response')}.` : 'Exported the form.');
  }

  function open(form) {
    const link = formLink(form);
    const json = JSON.stringify(form).length;
    const responseCount = FL.store.responsesFor(form.id).length;
    const linkInput = h('input', { class: 'input input-mono', id: 'share-link', type: 'text', readOnly: true, value: link, onfocus: (event) => event.target.select() });
    const copyButton = h('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: async () => {
        const copied = await FL.util.copyText(link);
        FL.ui.toast(copied ? 'Link copied.' : 'Copying is blocked here. Select the link and copy it by hand.', { error: !copied });
      },
    }, icon('copy'), 'Copy link');
    const includeBox = h('input', { type: 'checkbox', id: 'share-include' });
    const body = [
      h('section', { class: 'share-block' },
        h('h3', null, 'Share by link'),
        h('p', { class: 'muted' }, 'The whole form is compressed into this link, and it opens straight into the form. No account or server is involved.'),
        h('label', { class: 'prop-label', for: 'share-link' }, 'Link to this version of the form'),
        linkInput,
        h('p', { class: 'share-stat', id: 'share-stat' }, `${json.toLocaleString('en-US')} characters of form data, packed into a ${link.length.toLocaleString('en-US')}-character link.`),
        link.length > SAFE_LINK_LENGTH ? h('p', { class: 'prop-error' }, 'This link is long, and some email clients may cut it off. Consider sending the form file instead.') : null,
        h('div', { class: 'share-actions' },
          copyButton,
          h('a', { class: 'btn', href: `#/f/${link.split('#/f/')[1]}`, id: 'share-open', onclick: () => FL.ui.closeAllModals() }, icon('eye'), 'Open as a respondent')),
        h('p', { class: 'muted share-note' }, 'Later edits need a new link. Answers stay in the browser that filled the form: on another device, the confirmation screen gives the respondent a reply link to send back to you.')),
      h('section', { class: 'share-block' },
        h('h3', null, 'Form file'),
        h('p', { class: 'muted' }, 'A JSON copy of the form, for backup or to import into another browser.'),
        h('label', { class: 'prop-check', for: 'share-include' }, includeBox, h('span', null, `Include ${plural(responseCount, 'response')}`)),
        h('div', { class: 'share-actions' },
          h('button', { class: 'btn', type: 'button', id: 'share-download', onclick: () => downloadForm(form, includeBox.checked) }, icon('download'), 'Export JSON'))),
    ];
    FL.ui.modal({ title: `Share "${form.title}"`, body, wide: true });
  }

  function importErrors(list, messages) {
    FL.util.clear(list);
    list.hidden = !messages.length;
    messages.slice(0, 6).forEach((message) => list.append(h('li', null, message)));
  }

  function openImport() {
    const errorList = h('ul', { class: 'import-errors', role: 'alert', hidden: true });
    const dialog = FL.ui.modal({
      title: 'Import a form',
      body: [
        h('p', { class: 'muted' }, 'Choose a .json file exported from Formloom. It is added as a new form, and nothing is overwritten.'),
        h('label', { class: 'prop-label', for: 'import-file' }, 'Form file'),
        h('input', {
          id: 'import-file', type: 'file', accept: '.json,application/json', class: 'input',
          onchange: async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const parsed = FL.schema.parseFormFile(await file.text());
            if (parsed.errors.length) {
              importErrors(errorList, parsed.errors);
              event.target.value = '';
              return;
            }
            const form = FL.store.importForm(parsed.form, parsed.responses);
            dialog.close();
            const note = parsed.warnings.length ? ` ${parsed.warnings.join(' ')}` : '';
            FL.ui.toast(`Imported "${form.title}" with ${plural(parsed.responses.length, 'response')}.${note}`);
            FL.app.go(`#/build/${form.id}`);
          },
        }),
        errorList,
      ],
    });
  }

  return { open, openImport, formLink, replyLink };
})();
