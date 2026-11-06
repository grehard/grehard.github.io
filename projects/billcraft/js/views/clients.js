// Client directory: searchable table plus the add and edit form.
(function () {
  const BC = window.BC;
  const { h, icon } = BC.dom;
  const { calc, dates, exporter, store, ui } = BC;
  const { money } = ui;
  const view = { search: '', sort: { key: 'name', dir: 1 } };

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function clientModal(existing, onSaved) {
    const c = existing || {};
    const name = ui.field({ label: 'Name', value: c.name || '', required: true, autocomplete: 'organization' });
    const contact = ui.field({ label: 'Contact person', value: c.contact || '' });
    const email = ui.field({ label: 'Email', type: 'email', value: c.email || '', autocomplete: 'email' });
    const address = ui.field({ label: 'Address', as: 'textarea', rows: 3, value: c.address || '' });
    const taxId = ui.field({ label: 'Tax ID', value: c.taxId || '' });
    const days = ui.field({ label: 'Default payment days', inputmode: 'numeric', value: String(c.paymentDays === undefined ? store.state.profile.paymentDays : c.paymentDays) });
    const notes = ui.field({ label: 'Notes', as: 'textarea', rows: 2, value: c.notes || '', hint: 'For you only. Not shown on documents.' });

    const save = () => {
      let ok = true;
      const nameValue = name.value.trim();
      if (!nameValue) { name.setError('Enter the client name.'); ok = false; }
      else if (store.state.clients.some((other) => other.id !== c.id && other.name.toLowerCase() === nameValue.toLowerCase())) {
        name.setError('A client with this name already exists.');
        ok = false;
      }
      if (email.value.trim() && !EMAIL.test(email.value.trim())) { email.setError('Enter a valid email address.'); ok = false; }
      const dayCount = Number(days.value);
      if (!/^\d+$/.test(days.value.trim()) || dayCount > 365) { days.setError('Enter a whole number of days from 0 to 365.'); ok = false; }
      if (!ok) { ui.focusFirstError(form); return; }
      dialog.close();
      const saved = store.saveRecord('clients', {
        name: nameValue, contact: contact.value.trim(), email: email.value.trim(), address: address.value.trim(),
        taxId: taxId.value.trim(), paymentDays: dayCount, notes: notes.value.trim(),
      }, c.id);
      ui.toast(`${saved.name} saved.`);
      if (onSaved) onSaved(saved);
    };

    const form = h('form', { class: 'form-grid', novalidate: true, onsubmit: (event) => { event.preventDefault(); save(); } },
      name.el, contact.el, email.el, taxId.el, h('div', { class: 'span-2' }, address.el), days.el, h('div', { class: 'span-2' }, notes.el),
      h('button', { type: 'submit', hidden: true, tabindex: -1 }));
    const dialog = ui.modal({
      title: existing ? `Edit ${c.name}` : 'New client',
      content: form,
      wide: true,
      footer: [ui.button('Cancel', null, () => dialog.close()), ui.button('Save client', null, save, 'btn-primary')],
    });
  }

  function deleteClient(client) {
    const invoices = store.docsForClient('invoice', client.id).length;
    const quotes = store.docsForClient('quote', client.id).length;
    if (invoices + quotes > 0) {
      const parts = [invoices && `${invoices} invoice${invoices === 1 ? '' : 's'}`, quotes && `${quotes} quote${quotes === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
      const dialog = ui.modal({
        title: `${client.name} can't be deleted yet`,
        content: h('p', { class: 'modal-text' }, `This client has ${parts}. Those records need a client on them, so delete them first.`),
        footer: [ui.button('OK', null, () => dialog.close(), 'btn-primary')],
      });
      return;
    }
    ui.undoable(`${client.name} deleted.`, () => {
      if (location.hash.startsWith(`#/clients/${client.id}`)) location.hash = '#/clients';
      store.deleteRecord('clients', client.id);
    });
  }

  function clientRow(client, today) {
    const invoices = store.docsForClient('invoice', client.id);
    const summaries = invoices.map((inv) => calc.summarize(inv, today)).filter((s) => s.status !== 'draft');
    const open = summaries.reduce((sum, s) => sum + s.balance, 0);
    const overdue = summaries.filter((s) => s.status === 'overdue').reduce((sum, s) => sum + s.balance, 0);
    const billed = summaries.reduce((sum, s) => sum + s.totals.total, 0);
    return { client, open, overdue, billed, name: client.name.toLowerCase() };
  }

  function table(rows, redraw) {
    const header = (label, key, numeric) => ui.sortHeader(label, key, view.sort, redraw, numeric);
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table table-rows' },
      h('thead', {}, h('tr', {},
        header('Name', 'name'),
        h('th', { scope: 'col' }, 'Contact'),
        header('Billed', 'billed', true), header('Unpaid', 'open', true), header('Overdue', 'overdue', true),
        h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', {}, rows.map(({ client, open, overdue, billed }) => h('tr', {
        onclick: (event) => { if (!event.target.closest('a, button')) location.hash = `#/clients/${client.id}`; },
      },
        h('td', { class: 'cell-long' }, h('a', { class: 'strong', href: `#/clients/${client.id}` }, client.name)),
        h('td', { class: 'cell-long' }, h('span', { class: 'cell-stack' }, client.contact, client.email && h('span', { class: 'muted' }, client.email))),
        h('td', { class: 'num' }, money(billed)),
        h('td', { class: 'num' }, money(open)),
        h('td', { class: `num${overdue ? ' text-danger strong' : ' muted'}` }, money(overdue)),
        h('td', { class: 'row-actions' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Edit ${client.name}`, onclick: () => clientModal(client) }, icon('edit', 15)),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Delete ${client.name}`, onclick: () => deleteClient(client) }, icon('trash', 15))))))));
  }

  BC.views.clientModal = clientModal;
  BC.views.deleteClient = deleteClient;

  BC.views.clients = function clientsView() {
    const today = dates.today();
    const all = store.state.clients.map((client) => clientRow(client, today));
    const host = h('div', {});
    function redraw() {
      const q = view.search.trim().toLowerCase();
      const rows = all.filter(({ client }) => `${client.name} ${client.contact} ${client.email}`.toLowerCase().includes(q));
      const key = view.sort.key;
      rows.sort((a, b) => (a[key] === b[key] ? a.name.localeCompare(b.name) : (a[key] < b[key] ? -1 : 1) * view.sort.dir));
      if (!all.length) host.replaceChildren(ui.emptyState('No clients yet', 'Add a client to start invoicing them.', ui.button('New client', 'plus', () => clientModal(), 'btn-primary')));
      else if (!rows.length) host.replaceChildren(ui.emptyState('No clients match', 'Try a different search.'));
      else host.replaceChildren(table(rows, redraw));
    }
    redraw();
    return h('div', { class: 'page' },
      ui.pageHeader('Clients', `${all.length} in your directory`, [
        ui.button('Export CSV', 'download', () => { exporter.clients(); ui.toast('Clients exported to CSV.'); }),
        ui.button('New client', 'plus', () => clientModal(), 'btn-primary'),
      ]),
      h('div', { class: 'toolbar' }, ui.searchBox('Search clients', view.search, (value) => { view.search = value; redraw(); })),
      host);
  };
})();
