// Export dialog: PNG or SVG of the selection or whole board, and JSON of this board or all boards.
(function (DB) {
  'use strict';
  const { el, slugify, downloadBlob } = DB.util;

  function radioGroup(name, legend, options, value, onChange) {
    const inputs = options.map((option) => {
      const input = el('input', { type: 'radio', name, id: `${name}-${option.value}`, value: option.value, disabled: option.disabled });
      input.checked = option.value === value;
      input.addEventListener('change', () => { if (input.checked) onChange(option.value); });
      return el('label', { class: `choice${option.disabled ? ' is-disabled' : ''}`, for: `${name}-${option.value}` }, input, el('span', { text: option.label }));
    });
    return el('fieldset', { class: 'choices' }, el('legend', { text: legend }), ...inputs);
  }

  function open() {
    const doc = DB.boards.current();
    const selectedCount = DB.actions.selectedShapes().length;
    const state = { format: 'png', scope: selectedCount ? 'selection' : 'board', jsonScope: 'board', scale: 2, background: true };
    const body = el('div', { class: 'export-body' });
    const controls = el('div', { class: 'export-controls' });
    const preview = el('div', { class: 'export-preview' });
    body.append(controls, preview);

    let previewUrl = null;
    const shapesInScope = () => (state.scope === 'selection' ? DB.actions.selectedShapes() : doc.orderedShapes());

    function renderPreview() {
      preview.textContent = '';
      if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
      if (state.format === 'json') {
        const count = state.jsonScope === 'all' ? DB.boards.list.length : 1;
        preview.append(el('p', { class: 'panel-note', text: `Saves ${DB.actions.plural(count, 'board')} as a JSON file you can load again later.` }));
        return;
      }
      const shapes = shapesInScope();
      if (!shapes.length) {
        preview.append(el('p', { class: 'panel-note', text: 'This board is empty, so there is nothing to export yet.' }));
        return;
      }
      const svg = DB.exporter.toSvg(shapes, true);
      previewUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const box = DB.exporter.exportBounds(shapes);
      const size = state.format === 'png' ? `${Math.round(box.w * state.scale)} by ${Math.round(box.h * state.scale)} px` : `${box.w} by ${box.h} units`;
      preview.append(el('img', { src: previewUrl, alt: 'Preview of the export' }), el('p', { class: 'export-size mono', id: 'export-size', text: size }));
    }

    function renderControls() {
      controls.textContent = '';
      controls.append(radioGroup('export-format', 'Format', [
        { value: 'png', label: 'PNG image' }, { value: 'svg', label: 'SVG vector' }, { value: 'json', label: 'JSON save file' },
      ], state.format, (value) => { state.format = value; update(); }));
      if (state.format === 'json') {
        controls.append(radioGroup('export-json', 'Contents', [
          { value: 'board', label: 'This board' }, { value: 'all', label: `All boards (${DB.boards.list.length})` },
        ], state.jsonScope, (value) => { state.jsonScope = value; update(); }));
        return;
      }
      controls.append(radioGroup('export-scope', 'Area', [
        { value: 'selection', label: selectedCount ? `Selection (${selectedCount})` : 'Selection (none)', disabled: !selectedCount },
        { value: 'board', label: 'Whole board' },
      ], state.scope, (value) => { state.scope = value; update(); }));
      if (state.format === 'png') {
        controls.append(radioGroup('export-scale', 'Scale', [
          { value: '1', label: '1x' }, { value: '2', label: '2x' }, { value: '3', label: '3x' },
        ], String(state.scale), (value) => { state.scale = Number(value); update(); }));
      }
      const background = el('input', { type: 'checkbox', id: 'export-background' });
      background.checked = state.background;
      background.addEventListener('change', () => { state.background = background.checked; });
      controls.append(el('label', { class: 'choice', for: 'export-background' }, background, el('span', { text: 'Paper background' })));
    }

    function update() {
      const focusedId = document.activeElement ? document.activeElement.id : '';
      renderControls();
      renderPreview();
      const focused = focusedId && document.getElementById(focusedId);
      if (focused) focused.focus();
    }

    async function download() {
      const name = slugify(doc.name);
      if (state.format === 'json') {
        if (state.jsonScope === 'all') DB.exporter.saveAllJSON();
        else DB.exporter.saveBoardJSON(doc);
        DB.modal.close();
        return;
      }
      const shapes = shapesInScope();
      if (!shapes.length) {
        DB.modal.message('Nothing to export', 'Draw something on this board first.');
        return;
      }
      if (state.format === 'svg') {
        downloadBlob(`${name}.svg`, new Blob([DB.exporter.toSvg(shapes, state.background)], { type: 'image/svg+xml' }));
      } else {
        downloadBlob(`${name}.png`, await DB.exporter.toPngBlob(shapes, state.scale, state.background));
      }
      DB.modal.close();
    }

    update();
    DB.modal.open({
      title: 'Export',
      body,
      wide: true,
      onClose: () => { if (previewUrl) URL.revokeObjectURL(previewUrl); },
      actions: [
        el('button', { type: 'button', class: 'plain-button', text: 'Cancel', onclick: DB.modal.close }),
        el('button', { type: 'button', class: 'primary-button', id: 'export-download', text: 'Download', onclick: download, 'data-autofocus': true }),
      ],
    });
  }

  DB.exportDialog = { open };
})(window.DB);
