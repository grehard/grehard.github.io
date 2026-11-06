// Pure edits to a form definition. Each mutates the form it is given; the builder wraps them in undo steps.
FL.formOps = (function () {
  const { allFields, create } = FL.fields;
  const { uid } = FL.util;

  function locate(form, fieldId) {
    for (let p = 0; p < form.pages.length; p++) {
      const index = form.pages[p].fields.findIndex((field) => field.id === fieldId);
      if (index >= 0) return { pageIndex: p, page: form.pages[p], index };
    }
    return null;
  }

  function insertNew(form, type, pageId, index) {
    const page = form.pages.find((item) => item.id === pageId) || form.pages[form.pages.length - 1];
    const field = create(type);
    const at = index === undefined ? page.fields.length : index;
    page.fields.splice(at, 0, field);
    return field;
  }

  function moveTo(form, fieldId, pageId, index) {
    const from = locate(form, fieldId);
    const page = form.pages.find((item) => item.id === pageId);
    if (!from || !page) return;
    const [field] = from.page.fields.splice(from.index, 1);
    page.fields.splice(Math.min(index, page.fields.length), 0, field);
  }

  /** Moves one step, crossing onto the neighbouring page at either end of a page. */
  function moveBy(form, fieldId, delta) {
    const from = locate(form, fieldId);
    if (!from) return;
    const next = from.index + delta;
    if (next >= 0 && next < from.page.fields.length) {
      moveTo(form, fieldId, from.page.id, next);
      return;
    }
    const neighbour = form.pages[from.pageIndex + delta];
    if (neighbour) moveTo(form, fieldId, neighbour.id, delta < 0 ? neighbour.fields.length : 0);
  }

  function canMove(form, fieldId, delta) {
    const from = locate(form, fieldId);
    if (!from) return false;
    const next = from.index + delta;
    return (next >= 0 && next < from.page.fields.length) || Boolean(form.pages[from.pageIndex + delta]);
  }

  function duplicate(form, fieldId) {
    const from = locate(form, fieldId);
    const copy = JSON.parse(JSON.stringify(from.page.fields[from.index]));
    copy.id = uid('f');
    copy.label = `${copy.label} (copy)`.slice(0, FL.schema.LIMITS.label);
    from.page.fields.splice(from.index + 1, 0, copy);
    return copy;
  }

  function removeRulesFor(form, fieldIds) {
    const gone = new Set(fieldIds);
    let removed = 0;
    allFields(form).forEach((field) => {
      const kept = field.logic.rules.filter((rule) => !gone.has(rule.fieldId));
      removed += field.logic.rules.length - kept.length;
      field.logic.rules = kept;
    });
    return removed;
  }

  /** Removes a field and any rules that read it. Returns how many rules went with it. */
  function removeField(form, fieldId) {
    const from = locate(form, fieldId);
    if (!from) return 0;
    from.page.fields.splice(from.index, 1);
    return removeRulesFor(form, [fieldId]);
  }

  function addPage(form) {
    const page = { id: uid('p'), title: `Page ${form.pages.length + 1}`, fields: [] };
    form.pages.push(page);
    return page;
  }

  function removePage(form, pageId) {
    const page = form.pages.find((item) => item.id === pageId);
    if (!page || form.pages.length < 2) return;
    form.pages = form.pages.filter((item) => item !== page);
    removeRulesFor(form, page.fields.map((field) => field.id));
  }

  function movePage(form, pageId, delta) {
    const index = form.pages.findIndex((item) => item.id === pageId);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= form.pages.length) return;
    const [page] = form.pages.splice(index, 1);
    form.pages.splice(next, 0, page);
  }

  /** Keeps logic rules pointing at a choice when its label is renamed. */
  function renameOption(form, field, oldLabel, newLabel) {
    field.options = field.options.map((option) => (option === oldLabel ? newLabel : option));
    allFields(form).forEach((other) => other.logic.rules.forEach((rule) => {
      if (rule.fieldId === field.id && rule.value === oldLabel) rule.value = newLabel;
    }));
  }

  return { locate, insertNew, moveTo, moveBy, canMove, duplicate, removeField, addPage, removePage, movePage, renameOption };
})();
