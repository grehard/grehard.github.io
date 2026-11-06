// Version history dialog: browse snapshots, see what changed, restore one.
(function (MG) {
  'use strict';

  const { Store, Diff, Overlays } = MG;
  const { h, icon, relativeTime, fullTime, plural } = MG.Dom;

  function diffSummary(lines) {
    const added = lines.filter((line) => line.type === 'add').length;
    const removed = lines.filter((line) => line.type === 'del').length;
    if (!added && !removed) return 'Identical to the current note';
    return `Since then: ${plural(added, 'line')} added, ${removed} removed`;
  }

  function diffRow(line) {
    const sign = { add: '+', del: '\u2212', same: ' ' }[line.type];
    return h('div', { class: `diff-line is-${line.type}` }, h('span', { class: 'diff-sign', 'aria-hidden': 'true' }, sign), h('span', { class: 'diff-text' }, line.text || ' '));
  }

  function open(noteId) {
    const note = Store.get(noteId);
    if (!note) return;
    MG.DocView.flushSave();

    const list = h('ul', { class: 'version-list', id: 'version-list' });
    const summary = h('p', { class: 'version-summary', id: 'version-summary', role: 'status' });
    const diff = h('div', { class: 'diff', tabindex: '0', 'aria-label': 'Changes since this version' });
    const restore = h('button', { class: 'btn primary', type: 'button', id: 'restore-version' }, icon('restore'), 'Restore this version');
    const saveNow = h('button', { class: 'btn', type: 'button', id: 'save-version' }, 'Save a version now');
    let selected = note.versions.length - 1;

    function select(index) {
      selected = index;
      const version = note.versions[index];
      list.querySelectorAll('button').forEach((btn) => {
        btn.setAttribute('aria-pressed', Number(btn.dataset.index) === index ? 'true' : 'false');
      });
      const lines = Diff.diffLines(version.body, note.body);
      summary.textContent = diffSummary(lines);
      diff.textContent = '';
      lines.forEach((line) => diff.appendChild(diffRow(line)));
      restore.disabled = version.body === note.body;
    }

    function renderList() {
      list.textContent = '';
      for (let i = note.versions.length - 1; i >= 0; i--) {
        const version = note.versions[i];
        list.appendChild(h('li', null, h('button', {
          class: 'version', type: 'button', 'data-index': i, onclick: () => select(i),
          title: fullTime(version.at),
        }, h('span', { class: 'version-when' }, relativeTime(version.at)), h('span', { class: 'version-label' }, version.label))));
      }
    }

    const empty = h('p', { class: 'modal-text', id: 'history-empty' }, 'No earlier versions yet. Marginalia saves one when you start editing a note, or you can save one now.');
    const detail = h('div', { class: 'version-detail' }, summary, diff, h('div', { class: 'modal-actions' }, restore));
    const layout = h('div', { class: 'version-layout' }, h('div', { class: 'version-side' }, list), detail);
    const content = h('div', null, empty, layout, h('div', { class: 'modal-actions between' }, h('span', { class: 'modal-hint' }, 'The 30 most recent versions are kept for each note.'), saveNow));

    function refresh() {
      const hasVersions = note.versions.length > 0;
      empty.hidden = hasVersions;
      layout.hidden = !hasVersions;
      if (hasVersions) {
        renderList();
        select(Math.min(selected < 0 ? note.versions.length - 1 : selected, note.versions.length - 1));
      }
    }

    const close = Overlays.openModal({ title: `History of ${note.title}`, wide: true, content });

    restore.addEventListener('click', () => {
      const snapshot = Store.checkpoint();
      Store.restoreVersion(note.id, selected);
      close();
      Overlays.toast('Version restored.', { undo: () => Store.rollback(snapshot) });
    });
    saveNow.addEventListener('click', () => {
      if (MG.DocView.captureManualVersion()) {
        selected = note.versions.length - 1;
        refresh();
      } else {
        Overlays.toast('Nothing has changed since the last version.');
      }
    });
    refresh();
  }

  MG.History = { open };
})(window.MG = window.MG || {});
