// Conditional logic: "show this field when...".
//
// A field's rules read other fields. Three decisions keep the results predictable:
// 1. A hidden field counts as unanswered, even if the respondent typed in it earlier,
//    so hiding one field in a chain collapses everything downstream of it.
// 2. An unanswered source makes every condition false except "is not answered".
// 3. Fields on a cycle are found up front and hidden, so the outcome doesn't depend on evaluation order.
FL.logic = (function () {
  const { allFields, findField, isEmpty, kindOf, isQuestion } = FL.fields;

  const TEXT_OPS = ['equals', 'not_equals', 'contains', 'not_contains', 'answered', 'not_answered'];
  const OPS_BY_KIND = {
    text: TEXT_OPS,
    number: ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'answered', 'not_answered'],
    date: ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'answered', 'not_answered'],
    choice: ['equals', 'not_equals', 'answered', 'not_answered'],
    multi: ['contains', 'not_contains', 'answered', 'not_answered'],
    file: ['answered', 'not_answered'],
  };
  const OP_LABELS = {
    equals: 'is', not_equals: 'is not', contains: 'contains', not_contains: 'does not contain',
    gt: 'is more than', gte: 'is at least', lt: 'is less than', lte: 'is at most',
    answered: 'is answered', not_answered: 'is not answered',
  };
  const DATE_LABELS = { gt: 'is after', gte: 'is on or after', lt: 'is before', lte: 'is on or before' };
  const MULTI_LABELS = { contains: 'includes', not_contains: 'does not include' };

  function opLabel(op, kind) {
    if (kind === 'date' && DATE_LABELS[op]) return DATE_LABELS[op];
    if (kind === 'multi' && MULTI_LABELS[op]) return MULTI_LABELS[op];
    return OP_LABELS[op] || op;
  }

  function opsFor(field) {
    const kind = kindOf(field);
    return (OPS_BY_KIND[kind] || []).map((op) => ({ value: op, label: opLabel(op, kind) }));
  }

  function needsValue(op) {
    return op !== 'answered' && op !== 'not_answered';
  }

  const normal = (value) => String(value).trim().toLowerCase();

  function compareOrdered(kind, op, left, right) {
    const a = kind === 'number' ? Number(left) : String(left);
    const b = kind === 'number' ? Number(right) : String(right);
    if (kind === 'number' && (!Number.isFinite(a) || !Number.isFinite(b))) return false;
    if (op === 'gt') return a > b;
    if (op === 'gte') return a >= b;
    if (op === 'lt') return a < b;
    if (op === 'lte') return a <= b;
    return false;
  }

  function matchesEquals(kind, left, right) {
    if (kind === 'number') return Number(left) === Number(right);
    if (Array.isArray(left)) return left.some((item) => normal(item) === normal(right));
    return normal(left) === normal(right);
  }

  function matchesContains(left, right) {
    if (Array.isArray(left)) return left.some((item) => normal(item) === normal(right));
    return normal(left).includes(normal(right));
  }

  /** Evaluates one condition against the source field's current answer. */
  function evaluateRule(rule, sourceField, value) {
    const empty = isEmpty(value);
    if (rule.op === 'answered') return !empty;
    if (rule.op === 'not_answered') return empty;
    if (empty || isEmpty(rule.value) || !sourceField) return false; // unanswered or half-written conditions are false
    const kind = kindOf(sourceField);
    switch (rule.op) {
      case 'equals': return matchesEquals(kind, value, rule.value);
      case 'not_equals': return !matchesEquals(kind, value, rule.value);
      case 'contains': return matchesContains(value, rule.value);
      case 'not_contains': return !matchesContains(value, rule.value);
      case 'gt': case 'gte': case 'lt': case 'lte': return compareOrdered(kind, rule.op, value, rule.value);
      default: return false;
    }
  }

  function dependencyMap(form) {
    const deps = new Map();
    allFields(form).forEach((field) => {
      deps.set(field.id, field.logic.rules.map((rule) => rule.fieldId));
    });
    return deps;
  }

  /** Tarjan's strongly connected components. A field is cyclic if its component loops back on itself. */
  function findCycleMembers(form) {
    const deps = dependencyMap(form);
    const index = new Map();
    const low = new Map();
    const onStack = new Set();
    const stack = [];
    const cyclic = new Set();
    let counter = 0;

    function visit(id) {
      index.set(id, counter);
      low.set(id, counter);
      counter++;
      stack.push(id);
      onStack.add(id);
      (deps.get(id) || []).forEach((next) => {
        if (!deps.has(next)) return;
        if (!index.has(next)) {
          visit(next);
          low.set(id, Math.min(low.get(id), low.get(next)));
        } else if (onStack.has(next)) {
          low.set(id, Math.min(low.get(id), index.get(next)));
        }
      });
      if (low.get(id) !== index.get(id)) return;
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== id);
      if (component.length > 1 || (deps.get(id) || []).includes(id)) component.forEach((m) => cyclic.add(m));
    }

    deps.forEach((_, id) => { if (!index.has(id)) visit(id); });
    return cyclic;
  }

  /** Would "target shows when source..." close a loop? True if source already depends on target. */
  function wouldCreateCycle(form, targetId, sourceId) {
    if (targetId === sourceId) return true;
    const deps = dependencyMap(form);
    const seen = new Set();
    const queue = [sourceId];
    while (queue.length) {
      const id = queue.pop();
      if (id === targetId) return true;
      if (!seen.has(id)) {
        seen.add(id);
        (deps.get(id) || []).forEach((next) => queue.push(next));
      }
    }
    return false;
  }

  /** Returns { visible: { fieldId: boolean }, cyclic: Set } for the given answers. */
  function computeVisibility(form, answers) {
    const cyclic = findCycleMembers(form);
    const byId = new Map(allFields(form).map((field) => [field.id, field]));
    const visible = {};

    function isVisible(id) {
      if (id in visible) return visible[id];
      if (cyclic.has(id)) { visible[id] = false; return false; }
      const field = byId.get(id);
      if (!field) return false;
      const rules = field.logic.rules.filter((rule) => rule.fieldId); // a condition with no question chosen yet is ignored
      const test = (rule) => {
        const source = byId.get(rule.fieldId);
        const value = source && isVisible(rule.fieldId) ? answers[rule.fieldId] : undefined;
        return evaluateRule(rule, source, value);
      };
      const shown = !rules.length || (field.logic.match === 'any' ? rules.some(test) : rules.every(test));
      visible[id] = shown;
      return shown;
    }

    byId.forEach((_, id) => isVisible(id));
    return { visible, cyclic };
  }

  /** Pages the respondent should step through: those with at least one visible question. */
  function visiblePages(form, answers) {
    const { visible } = computeVisibility(form, answers);
    return form.pages.filter((page) => page.fields.some((field) => isQuestion(field) && visible[field.id]));
  }

  function sourcesFor(form, target) {
    return allFields(form).filter((field) => isQuestion(field) && field.id !== target.id);
  }

  function dependentsOf(form, fieldId) {
    return allFields(form).filter((field) => field.logic.rules.some((rule) => rule.fieldId === fieldId));
  }

  /** Plain sentence for the canvas, e.g. Shown when "Rating" is at most 2. */
  function describe(form, field) {
    const rules = field.logic.rules.filter((rule) => rule.fieldId);
    if (!rules.length) return '';
    const parts = rules.map((rule) => {
      const source = findField(form, rule.fieldId);
      if (!source) return 'a removed field';
      const words = `"${source.label}" ${opLabel(rule.op, kindOf(source))}`;
      return needsValue(rule.op) ? `${words} ${rule.value === '' ? '...' : rule.value}` : words;
    });
    return `Shown when ${parts.join(field.logic.match === 'any' ? ' or ' : ' and ')}`;
  }

  /** A rule whose source appears later in the form can't be answered before the field is reached. */
  function hasLaterSource(form, field) {
    const order = allFields(form).map((item) => item.id);
    const own = order.indexOf(field.id);
    return field.logic.rules.some((rule) => order.indexOf(rule.fieldId) > own);
  }

  return {
    opsFor, opLabel, needsValue, evaluateRule, findCycleMembers, wouldCreateCycle, computeVisibility,
    visiblePages, sourcesFor, dependentsOf, describe, hasLaterSource,
  };
})();
