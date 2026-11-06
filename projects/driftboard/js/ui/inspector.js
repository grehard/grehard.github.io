// The right-hand panel: geometry fields, style controls and arrange commands for the selection.
// With nothing selected, the style controls set the defaults for the next shape drawn.
(function (DB) {
  'use strict';
  const { el, round } = DB.util;
  const { isLine, unionBounds, TEXT_TYPES } = DB.geometry;
  const A = DB.actions;
  const C = DB.inspectorControls;

  const TYPE_NAMES = {
    rect: 'Rectangle', ellipse: 'Ellipse', diamond: 'Diamond', line: 'Line', arrow: 'Arrow', pen: 'Freehand stroke', text: 'Text', sticky: 'Sticky note',
  };
  const WIDTHS = [1, 2, 3, 5];
  const parts = {};

  function describe(s) {
    const name = TYPE_NAMES[s.type] || 'Shape';
    return s.text ? `${name}: ${s.text.split('\n')[0].slice(0, 40)}` : name;
  }

  function section(title, ...children) {
    return el('section', { class: 'panel-section' }, el('h3', { text: title }), ...children);
  }

  function fieldRow(label, control, stacked) {
    return el('div', { class: `field-row${stacked ? ' is-stacked' : ''}` }, el('span', { class: 'field-label', text: label }), control);
  }

  function geometryField(key, label, title) {
    const input = el('input', { id: `geo-${key}`, type: 'number', step: 'any', class: 'num-input', 'aria-label': title, title });
    const commit = () => {
      if (input.value === '') { refresh(); return; }
      A.setGeometry(key, Number(input.value));
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { ev.stopPropagation(); refresh(true); input.blur(); }
    });
    return { key, input, node: el('label', { class: 'geo-field', for: `geo-${key}` }, el('span', { text: label }), input) };
  }

  function buildGeometry() {
    const fields = [
      ['x', 'X', 'Left edge'], ['y', 'Y', 'Top edge'], ['w', 'W', 'Width'], ['h', 'H', 'Height'], ['rotation', 'R', 'Rotation in degrees'],
      ['x1', 'X1', 'Start X'], ['y1', 'Y1', 'Start Y'], ['x2', 'X2', 'End X'], ['y2', 'Y2', 'End Y'],
    ].map(([key, label, title]) => geometryField(key, label, title));
    parts.geo = Object.fromEntries(fields.map((f) => [f.key, f]));
    parts.attached = el('p', { class: 'panel-note', id: 'connector-info' });
    parts.geoSection = section('Position and size', el('div', { class: 'geo-grid' }, ...fields.map((f) => f.node)), parts.attached);
    return parts.geoSection;
  }

  function buildStyle() {
    parts.stroke = C.swatchRow({ label: 'Stroke color', tokens: DB.palette.STROKES, custom: 'Custom stroke color', onPick: (v, live) => A.applyStyle({ stroke: v }, !!live) });
    parts.fill = C.swatchRow({ label: 'Fill color', tokens: DB.palette.FILLS, custom: 'Custom fill color', onPick: (v, live) => A.applyStyle({ fill: v }, !!live) });
    parts.width = C.segmented({ label: 'Stroke width', options: WIDTHS.map((w) => ({ value: w, label: String(w) })), onPick: (v) => A.applyStyle({ width: v }) });
    parts.dash = C.segmented({
      label: 'Line style',
      options: [
        { value: 'solid', label: 'Solid', svg: C.dashSample('') },
        { value: 'dashed', label: 'Dashed', svg: C.dashSample(' stroke-dasharray="7 4"') },
        { value: 'dotted', label: 'Dotted', svg: C.dashSample(' stroke-dasharray="0.01 5" stroke-linecap="round"') },
      ],
      onPick: (v) => A.applyStyle({ dash: v }),
    });
    parts.route = C.segmented({
      label: 'Connector route', options: [{ value: 'straight', label: 'Straight' }, { value: 'elbow', label: 'Elbow' }], onPick: (v) => A.applyStyle({ route: v }),
    });
    parts.opacity = el('input', { id: 'style-opacity', type: 'range', min: 10, max: 100, step: 5, 'aria-label': 'Opacity in percent' });
    parts.opacityValue = el('output', { class: 'mono range-value', for: 'style-opacity' });
    parts.opacity.addEventListener('input', () => {
      parts.opacityValue.textContent = `${parts.opacity.value}%`;
      A.applyStyle({ opacity: Number(parts.opacity.value) / 100 }, true);
    });
    parts.opacity.addEventListener('change', A.commitLiveStyle);
    parts.fontSize = el('input', { id: 'style-font', type: 'number', min: 6, max: 200, step: 1, class: 'num-input', 'aria-label': 'Font size' });
    parts.fontSize.addEventListener('change', () => {
      const value = Number(parts.fontSize.value);
      if (!Number.isFinite(value) || parts.fontSize.value === '') { refresh(true); return; }
      A.applyStyle({ fontSize: DB.util.clamp(Math.round(value), DB.transforms.MIN_FONT, DB.transforms.MAX_FONT) });
      refresh(true);
    });
    parts.rows = {
      stroke: fieldRow('Stroke', parts.stroke.node, true),
      fill: fieldRow('Fill', parts.fill.node, true),
      width: fieldRow('Width', parts.width.node),
      dash: fieldRow('Line', parts.dash.node),
      route: fieldRow('Route', parts.route.node),
      opacity: fieldRow('Opacity', el('div', { class: 'range-row' }, parts.opacity, parts.opacityValue)),
      fontSize: fieldRow('Font size', parts.fontSize),
    };
    return section('Style', ...Object.values(parts.rows));
  }

  function iconButton(icon, label, onClick, id) {
    return el('button', { type: 'button', id, class: 'icon-button', 'data-icon': icon, 'aria-label': label, title: label, onclick: onClick });
  }

  function buildArrange() {
    const groupButton = iconButton('group', 'Group (Ctrl+G)', A.group, 'action-group');
    const ungroupButton = iconButton('ungroup', 'Ungroup (Ctrl+Shift+G)', A.ungroup, 'action-ungroup');
    parts.lockButton = iconButton('lock', 'Lock or unlock (Ctrl+Shift+L)', A.toggleLock, 'action-lock');
    parts.groupButton = groupButton;
    parts.ungroupButton = ungroupButton;
    parts.alignButtons = [
      ['alignLeft', 'Align left', 'left'], ['alignCenterX', 'Align horizontal centers', 'centerX'], ['alignRight', 'Align right', 'right'],
      ['alignTop', 'Align top', 'top'], ['alignCenterY', 'Align vertical centers', 'centerY'], ['alignBottom', 'Align bottom', 'bottom'],
    ].map(([icon, label, edge]) => iconButton(icon, label, () => A.align(edge), `align-${edge}`));
    parts.arrangeSection = section(
      'Arrange',
      fieldRow('Layer', el('div', { class: 'icon-row' },
        iconButton('front', 'Bring to front (Shift+])', () => A.reorder('front'), 'layer-front'),
        iconButton('forward', 'Bring forward (])', () => A.reorder('forward'), 'layer-forward'),
        iconButton('backward', 'Send backward ([)', () => A.reorder('backward'), 'layer-backward'),
        iconButton('back', 'Send to back (Shift+[)', () => A.reorder('back'), 'layer-back'))),
      fieldRow('Align', el('div', { class: 'icon-row' }, ...parts.alignButtons), true),
      fieldRow('Rotate', el('div', { class: 'icon-row' },
        iconButton('rotateLeft', 'Rotate 90 degrees left', () => A.rotateBy(-90), 'rotate-left'),
        iconButton('rotateRight', 'Rotate 90 degrees right', () => A.rotateBy(90), 'rotate-right'))),
      fieldRow('Item', el('div', { class: 'icon-row' }, groupButton, ungroupButton, parts.lockButton,
        iconButton('copy', 'Duplicate (Ctrl+D)', A.duplicate, 'action-duplicate'),
        iconButton('trash', 'Delete (Del)', A.deleteSelection, 'action-delete'))),
    );
    return parts.arrangeSection;
  }

  function setRowVisible(key, visible) { parts.rows[key].hidden = !visible; }

  function formatNumber(v) { return String(round(v)); }

  function setField(key, value, enabled) {
    const { input, node } = parts.geo[key];
    node.hidden = value === null;
    if (value === null) return;
    if (document.activeElement !== input) input.value = formatNumber(value);
    input.disabled = !enabled;
  }

  function attachmentText(line) {
    const doc = DB.boards.current();
    const name = (end) => {
      const s = end && doc.shapes.get(end.id);
      return s ? (s.text ? s.text.split('\n')[0].slice(0, 28) : TYPE_NAMES[s.type]) : 'free end';
    };
    if (!line.start && !line.end) return 'Not attached. Drag an end onto a shape to attach it.';
    return `Attached: ${name(line.start)} to ${name(line.end)}`;
  }

  function refreshGeometry(selected) {
    const editable = selected.some((s) => !s.locked);
    const fields = { x: null, y: null, w: null, h: null, rotation: null, x1: null, y1: null, x2: null, y2: null };
    parts.attached.hidden = true;
    if (selected.length === 1 && isLine(selected[0])) {
      const pts = selected[0].points;
      [fields.x1, fields.y1] = pts[0];
      [fields.x2, fields.y2] = pts[pts.length - 1];
      parts.attached.hidden = false;
      parts.attached.textContent = attachmentText(selected[0]);
    } else if (selected.length === 1) {
      const [s] = selected;
      Object.assign(fields, { x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rotation });
    } else {
      const b = unionBounds(selected);
      Object.assign(fields, { x: b.x, y: b.y, w: b.w, h: b.h });
    }
    Object.entries(fields).forEach(([key, value]) => setField(key, value, editable));
  }

  function refreshStyle(selected) {
    const { defaults } = DB.app.settings;
    const source = selected[0] || defaults;
    const theme = DB.app.theme();
    const none = selected.length === 0;
    const anyBox = none || selected.some((s) => !isLine(s) && s.type !== 'pen' && s.type !== 'text');
    const anyStroked = none || selected.some((s) => s.type !== 'text' && s.type !== 'sticky');
    const anyText = none || selected.some((s) => TEXT_TYPES.has(s.type));
    const anyLine = none || selected.some(isLine);
    parts.stroke.update(source.stroke || defaults.stroke, theme);
    parts.fill.update(source.fill || defaults.fill, theme);
    parts.width.update(source.width);
    parts.dash.update(source.dash);
    parts.route.update(source.route || defaults.route);
    setRowVisible('fill', anyBox);
    setRowVisible('width', anyStroked);
    setRowVisible('dash', anyStroked);
    setRowVisible('route', anyLine);
    setRowVisible('fontSize', anyText);
    const percent = String(Math.round((source.opacity === undefined ? 1 : source.opacity) * 100));
    if (document.activeElement !== parts.opacity) parts.opacity.value = percent;
    parts.opacityValue.textContent = `${parts.opacity.value}%`;
    if (document.activeElement !== parts.fontSize) parts.fontSize.value = String(source.fontSize || defaults.fontSize);
  }

  function refreshArrange(selected) {
    const editable = selected.filter((s) => !s.locked);
    const allLocked = selected.length > 0 && editable.length === 0;
    parts.groupButton.disabled = editable.length < 2;
    parts.ungroupButton.disabled = !editable.some((s) => s.groupId);
    parts.alignButtons.forEach((button) => { button.disabled = editable.length < 2; });
    parts.lockButton.innerHTML = DB.icons.svg(allLocked ? 'unlock' : 'lock');
    parts.lockButton.setAttribute('aria-pressed', String(allLocked));
  }

  function refreshHeader(selected) {
    const locked = selected.length > 0 && selected.every((s) => s.locked);
    if (!selected.length) parts.title.textContent = 'New shape defaults';
    else if (selected.length === 1) parts.title.textContent = describe(selected[0]);
    else parts.title.textContent = `${selected.length} shapes selected`;
    parts.subtitle.hidden = !(selected.length > 1 && selected[0].groupId && selected.every((s) => s.groupId === selected[0].groupId)) && !locked;
    if (locked) parts.subtitle.textContent = 'Locked';
    else parts.subtitle.textContent = 'Grouped';
  }

  function refresh() {
    const selected = A.selectedShapes();
    refreshHeader(selected);
    parts.geoSection.hidden = selected.length === 0;
    parts.arrangeSection.hidden = selected.length === 0;
    parts.hint.hidden = selected.length > 0;
    if (selected.length) {
      refreshGeometry(selected);
      refreshArrange(selected);
    }
    refreshStyle(selected);
  }

  let pending = false;
  function requestRefresh() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; refresh(); });
  }

  function build(root) {
    parts.title = el('h2', { id: 'selection-title', class: 'panel-title' });
    parts.subtitle = el('span', { class: 'panel-tag' });
    parts.closeButton = el('button', { type: 'button', class: 'icon-button panel-close', 'data-icon': 'close', 'aria-label': 'Close style panel', onclick: () => DB.app.toggleSetting('inspector') });
    parts.hint = el('p', { class: 'panel-note', text: 'Select a shape to see its size and arrange it. These styles apply to the next shape you draw.' });
    root.append(
      el('div', { class: 'panel-head' }, parts.title, parts.subtitle, parts.closeButton),
      parts.hint,
      buildGeometry(),
      buildStyle(),
      buildArrange(),
    );
    DB.icons.hydrate(root);
    refresh();
    ['selection', 'history', 'doc'].forEach((name) => DB.bus.on(name, requestRefresh));
    DB.bus.on('scene', requestRefresh);
    DB.bus.on('board', requestRefresh);
    DB.bus.on('theme', requestRefresh);
  }

  DB.inspector = { build, refresh, describe };
})(window.DB);
