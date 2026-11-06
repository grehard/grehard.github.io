// The single source of truth: forms and responses, mirrored to localStorage.
// If storage is blocked or full the app keeps working in memory for the session.
FL.store = (function () {
  const KEY = 'formloom.v1';
  const { normalizeForm, normalizeResponse, cloneWithNewIds } = FL.schema;
  let state = { forms: [], responses: {}, lastFormId: null };
  let storageWorks = true;

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storageWorks = true;
    } catch (err) {
      storageWorks = false;
    }
  }

  function readSaved() {
    try {
      const text = localStorage.getItem(KEY);
      return text ? JSON.parse(text) : null;
    } catch (err) {
      return null;
    }
  }

  /** Rebuilds state from untrusted saved data. Returns null if nothing usable is there. */
  function validateSaved(saved) {
    if (!saved || typeof saved !== 'object' || !Array.isArray(saved.forms)) return null;
    const forms = saved.forms.map((raw) => normalizeForm(raw).form).filter(Boolean);
    const responses = {};
    if (saved.responses && typeof saved.responses === 'object') {
      Object.keys(saved.responses).forEach((formId) => {
        if (!Array.isArray(saved.responses[formId])) return;
        responses[formId] = saved.responses[formId].map(normalizeResponse).filter(Boolean);
      });
    }
    return { forms, responses, lastFormId: typeof saved.lastFormId === 'string' ? saved.lastFormId : null };
  }

  function seedState() {
    return FL.seed.build();
  }

  function init() {
    state = validateSaved(readSaved()) || seedState();
    save();
  }

  function snapshot() {
    return JSON.stringify(state);
  }

  function restore(text) {
    state = JSON.parse(text);
    save();
  }

  /** Replaces everything with fresh demo data and returns a function that undoes it. */
  function resetDemo() {
    const before = snapshot();
    state = seedState();
    save();
    return () => restore(before);
  }

  const listForms = () => state.forms.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  const getForm = (id) => state.forms.find((form) => form.id === id) || null;
  const responsesFor = (id) => state.responses[id] || [];

  function rememberForm(id) {
    if (state.lastFormId === id) return;
    state.lastFormId = id;
    save();
  }

  function lastForm() {
    return getForm(state.lastFormId) || listForms()[0] || null;
  }

  function addForm(form, responses) {
    state.forms.push(form);
    if (responses && responses.length) state.responses[form.id] = responses;
    save();
    return form;
  }

  function saveForm(form) {
    form.updatedAt = Date.now();
    const index = state.forms.findIndex((item) => item.id === form.id);
    if (index >= 0) state.forms[index] = form;
    else state.forms.push(form);
    save();
  }

  function duplicateForm(id) {
    const source = getForm(id);
    if (!source) return null;
    const { form } = cloneWithNewIds(source);
    form.title = `${source.title} (copy)`.slice(0, FL.schema.LIMITS.title);
    return addForm(form);
  }

  /** Adds an imported form under a fresh identity, moving any response keys with it. */
  function importForm(form, responses) {
    const { form: copy, idMap } = cloneWithNewIds(form);
    const moved = (responses || []).map((response) => {
      const answers = {};
      Object.keys(response.answers).forEach((key) => { answers[idMap[key] || key] = response.answers[key]; });
      return Object.assign({}, response, { answers });
    });
    return addForm(copy, moved);
  }

  function deleteForm(id) {
    const before = snapshot();
    state.forms = state.forms.filter((form) => form.id !== id);
    delete state.responses[id];
    if (state.lastFormId === id) state.lastFormId = null;
    save();
    return () => restore(before);
  }

  function addResponse(formId, response) {
    if (!state.responses[formId]) state.responses[formId] = [];
    state.responses[formId].push(response);
    save();
  }

  /** Adds a reply received as a link. Returns false if that response is already stored. */
  function addResponseOnce(formId, response) {
    if (responsesFor(formId).some((item) => item.id === response.id)) return false;
    addResponse(formId, response);
    return true;
  }

  function deleteResponses(formId, ids) {
    const before = snapshot();
    const gone = new Set(ids);
    state.responses[formId] = responsesFor(formId).filter((response) => !gone.has(response.id));
    save();
    return () => restore(before);
  }

  return {
    init, resetDemo, listForms, getForm, responsesFor, rememberForm, lastForm, addForm, saveForm,
    duplicateForm, importForm, deleteForm, addResponse, addResponseOnce, deleteResponses,
    isPersistent: () => storageWorks,
  };
})();
