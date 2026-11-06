// First-run demo data. Everything is relative to today and generated from a hash of habit and date,
// so the history looks lived-in while staying the same on every reset.
(function (R) {
  'use strict';
  const D = R.Dates;

  const HABITS = [
    { id: 'seed-water', name: 'Drink water', timeOfDay: 'morning', schedule: { type: 'daily' }, target: { type: 'count', amount: 8, unit: 'glasses', step: 1 }, age: 430, base: 0.72, recent: 16, steady: [58, 94], reminder: '09:00' },
    { id: 'seed-stretch', name: 'Morning stretch', timeOfDay: 'morning', schedule: { type: 'daily' }, target: { type: 'check' }, age: 310, base: 0.74, recent: 23 },
    { id: 'seed-run', name: 'Run', timeOfDay: 'morning', schedule: { type: 'weekly', times: 3 }, target: { type: 'check' }, age: 380, base: 0.86, recent: 42, preferred: [2, 4, 6] },
    { id: 'seed-plants', name: 'Water the plants', timeOfDay: 'morning', schedule: { type: 'interval', every: 3 }, target: { type: 'check' }, age: 240, base: 0.86, recent: 30 },
    { id: 'seed-walk', name: 'Walk after lunch', timeOfDay: 'afternoon', schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] }, target: { type: 'count', amount: 20, unit: 'minutes', step: 5 }, age: 200, base: 0.7, recent: 11, steady: [40, 75], reminder: '13:00' },
    { id: 'seed-strength', name: 'Strength training', timeOfDay: 'afternoon', schedule: { type: 'weekdays', days: [1, 3, 5] }, target: { type: 'check' }, age: 280, base: 0.76, recent: 19 },
    { id: 'seed-spanish', name: 'Spanish practice', timeOfDay: 'evening', schedule: { type: 'weekly', times: 4 }, target: { type: 'count', amount: 15, unit: 'minutes', step: 5 }, age: 160, base: 0.88, recent: 28, preferred: [1, 2, 3, 4, 0] },
    { id: 'seed-read', name: 'Read before bed', timeOfDay: 'evening', schedule: { type: 'daily' }, target: { type: 'count', amount: 30, unit: 'minutes', step: 10 }, age: 400, base: 0.66, recent: 8, steady: [120, 141] },
    { id: 'seed-plan', name: 'Plan tomorrow', timeOfDay: 'evening', schedule: { type: 'weekdays', days: [0, 1, 2, 3, 4] }, target: { type: 'check' }, age: 120, base: 0.8, recent: 14, reminder: '21:00' },
    { id: 'seed-cold', name: 'Cold shower', timeOfDay: 'morning', schedule: { type: 'daily' }, target: { type: 'check' }, age: 210, base: 0.55, recent: 0, archivedAge: 62 },
  ];

  const NOTES = [
    [1, 'Slept badly, so I kept everything small today. It all still got done.'],
    [2, 'Back-to-back calls all afternoon. The walk after lunch was the only break, and it helped.'],
    [4, 'Spanish is going well, finally got the past tense endings straight. Short sessions work better than long ones.'],
    [6, 'The new fern needs less water than I thought, so every three days seems right.'],
    [9, 'Back from the weekend away. Picked everything up again without much friction.'],
    [13, 'Reading before bed instead of scrolling: asleep twenty minutes earlier, by my rough count.'],
    [17, 'Moved strength sessions to lunchtime. The gym is much quieter then and it leaves the evening free.'],
    [23, 'Ill for two days, marked them as skips. Nothing lost, started again gently today.'],
    [31, 'End of the month. The water target is easier with the big bottle on the desk.'],
    [40, 'First cold run of the year this week. Gloves next time.'],
    [62, 'Dropping cold showers for now. It was making mornings worse, not better.'],
    [75, 'Started planning the next day on the sofa rather than at the desk. Takes five minutes and I actually do it.'],
    [96, 'Long week. Only managed the basics, which is what the basics are for.'],
  ];

  /** The two sick days the journal mentions: everything planned for them is marked as skipped. */
  const SICK_DAY_AGES = [24, 25];

  /** Stable pseudo-random number in [0, 1) from a string (FNV-1a with a final mix). */
  function chance(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }

  /** Older days are a little less reliable, so the trend shows gradual improvement. */
  function likelihood(def, age) {
    return def.base + 0.14 * (1 - age / def.age);
  }

  const inSteadySpell = (def, age) => !!def.steady && age >= def.steady[0] && age <= def.steady[1];

  function shouldAttempt(def, date, age, startDate) {
    const day = D.weekday(date);
    const roll = chance(`${def.id}|${date}`);
    if (def.schedule.type === 'weekdays' && !def.schedule.days.includes(day)) return false;
    if (def.schedule.type === 'weekly') {
      const p = def.preferred.includes(day) ? likelihood(def, age) : 0.05;
      return age <= def.recent ? def.preferred.includes(day) : roll < p;
    }
    if (def.schedule.type === 'interval') {
      const offset = D.diffDays(date, startDate) % def.schedule.every;
      if (age <= def.recent) return offset === 0;
      return offset === 0 ? roll < likelihood(def, age) : roll < 0.12;
    }
    return age <= def.recent || inSteadySpell(def, age) || roll < likelihood(def, age);
  }

  function entryFor(def, date, age) {
    if (SICK_DAY_AGES.includes(age)) return { skipped: true };
    if (chance(`skip|${def.id}|${date}`) < 0.035 && age > 2) return { skipped: true };
    if (def.target.type === 'check') return { value: 1 };
    const { amount, step } = def.target;
    const roll = chance(`value|${def.id}|${date}`);
    const partial = age > def.recent && !inSteadySpell(def, age) && roll < 0.16;
    const ratio = partial ? 0.35 + roll * 3 : 1 + (roll - 0.16) * 0.5;
    return { value: Math.max(step, Math.round((amount * ratio) / step) * step) };
  }

  function buildLog(def, today) {
    const log = {};
    const startDate = D.addDays(today, -def.age);
    const newest = def.archivedAge || 1;
    for (let age = def.age; age >= newest; age--) {
      const date = D.addDays(today, -age);
      // A deliberate miss just before the recent run, so best streak and current streak differ.
      if (age === def.recent + 1) continue;
      if (shouldAttempt(def, date, age, startDate)) log[date] = entryFor(def, date, age);
    }
    return log;
  }

  /** Today starts part-way through: a couple of things already logged, plenty left to tap. */
  function logToday(logs, today) {
    logs['seed-stretch'][today] = { value: 1 };
    logs['seed-water'][today] = { value: 3 };
  }

  function build(today) {
    const logs = {};
    const habits = HABITS.map((def) => {
      const startDate = D.addDays(today, -def.age);
      logs[def.id] = buildLog(def, today);
      const schedule = def.schedule.type === 'interval' ? { ...def.schedule, anchor: startDate } : def.schedule;
      return {
        id: def.id,
        name: def.name,
        timeOfDay: def.timeOfDay,
        schedule,
        target: def.target,
        startDate,
        archivedOn: def.archivedAge ? D.addDays(today, -def.archivedAge) : null,
        reminder: def.reminder || null,
      };
    });
    logToday(logs, today);
    const notes = {};
    for (const [age, text] of NOTES) notes[D.addDays(today, -age)] = text;
    return { habits, logs, notes, settings: { weekStart: 1, reminders: false } };
  }

  R.Seed = { build };
})(window.Rhythm);
