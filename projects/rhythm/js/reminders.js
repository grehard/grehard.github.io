// Optional reminders while the tab is open. A system notification when the browser allows one,
// otherwise an in-app toast, so a denied permission or an iframe never costs the user the reminder.
(function (R) {
  'use strict';
  const FIRED_KEY = 'rhythm:reminders-fired';
  let fired = null;

  const isEmbedded = () => { try { return window.parent !== window; } catch (e) { return true; } };

  /** unsupported | embedded | default | granted | denied */
  function permissionState() {
    if (!('Notification' in window) || !window.isSecureContext) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (isEmbedded()) return 'embedded';
    return Notification.permission;
  }

  /** Asks only where a prompt can actually appear, and never lets a browser quirk surface as an error. */
  async function requestPermission() {
    if (permissionState() !== 'default') return permissionState();
    try {
      await Notification.requestPermission();
    } catch (e) {
      return 'denied';
    }
    return permissionState();
  }

  function loadFired(today) {
    if (fired && fired.date === today) return fired;
    fired = { date: today, ids: [] };
    try {
      const saved = JSON.parse(R.Store.readRaw(FIRED_KEY));
      if (saved && saved.date === today && Array.isArray(saved.ids)) fired = saved;
    } catch (e) { /* unreadable record: at worst a reminder repeats */ }
    return fired;
  }

  function systemNotify(body) {
    if (permissionState() !== 'granted') return false;
    try {
      new Notification('Rhythm', { body, tag: 'rhythm-reminder' });
      return true;
    } catch (e) {
      // Some mobile browsers report "granted" yet only allow notifications from a service worker.
      return false;
    }
  }

  function fire(habit, today) {
    const message = `Reminder: ${habit.name}`;
    if (systemNotify(message)) return;
    R.overlays.toast(message, { actionLabel: 'Mark done', onAction: () => R.Store.setEntry(habit.id, today, { value: R.Streaks.goal(habit) }) });
  }

  function check() {
    const store = R.Store.get();
    if (!store.settings.reminders) return;
    const today = R.Select.today();
    const now = new Date();
    const record = loadFired(today);
    const isOutstanding = (habit) => ['due', 'partial'].includes(R.Select.dayStatus(habit, today));
    const due = R.ReminderRules.dueReminders(store.habits, now.getHours() * 60 + now.getMinutes(), record.ids, isOutstanding);
    if (!due.length) return;
    due.forEach((habit) => { fire(habit, today); record.ids.push(habit.id); });
    R.Store.writeRaw(FIRED_KEY, JSON.stringify(record));
  }

  function sendTest() {
    if (!systemNotify('Test reminder. Reminders look like this.')) {
      R.overlays.toast('Test reminder. Reminders appear here while notifications are off.');
    }
  }

  R.Reminders = { permissionState, requestPermission, check, sendTest };
})(window.Rhythm);
