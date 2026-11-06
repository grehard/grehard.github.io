// Kitchen timers. They store a finish time rather than counting ticks, so they stay accurate
// when the browser throttles a background tab, and keep running if the cook leaves cook mode.
Mise.Timers = (() => {
  let timers = [];
  let ticking = null;
  const listeners = new Set();
  let nextId = 1;

  function remaining(timer) {
    if (timer.done) return 0;
    if (timer.pausedLeft !== null) return timer.pausedLeft;
    return Math.max(0, (timer.endsAt - Date.now()) / 1000);
  }

  function notify() {
    listeners.forEach((listener) => listener());
  }

  // Three short tones. Silent if the browser refuses audio; the toast still tells the cook.
  function chime() {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.28, 0.56].forEach((delay) => {
        const tone = context.createOscillator();
        const gain = context.createGain();
        tone.frequency.value = 880;
        gain.gain.setValueAtTime(0.18, context.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + delay + 0.22);
        tone.connect(gain).connect(context.destination);
        tone.start(context.currentTime + delay);
        tone.stop(context.currentTime + delay + 0.24);
      });
    } catch (error) {
      // No audio available.
    }
  }

  function tick() {
    timers.forEach((timer) => {
      if (!timer.done && timer.pausedLeft === null && remaining(timer) <= 0) {
        timer.done = true;
        chime();
        Mise.Toast.show(`Timer done: ${timer.label}`, { sticky: true });
      }
    });
    notify();
    if (!timers.some((timer) => !timer.done && timer.pausedLeft === null)) stopTicking();
  }

  function startTicking() {
    if (!ticking) ticking = setInterval(tick, 250);
  }

  function stopTicking() {
    clearInterval(ticking);
    ticking = null;
  }

  function start({ label, seconds, recipeId }) {
    timers.push({ id: nextId++, label, seconds, recipeId, endsAt: Date.now() + seconds * 1000, pausedLeft: null, done: false });
    startTicking();
    notify();
  }

  function find(id) {
    return timers.find((timer) => timer.id === id);
  }

  function togglePause(id) {
    const timer = find(id);
    if (!timer || timer.done) return;
    if (timer.pausedLeft === null) {
      timer.pausedLeft = remaining(timer);
    } else {
      timer.endsAt = Date.now() + timer.pausedLeft * 1000;
      timer.pausedLeft = null;
      startTicking();
    }
    notify();
  }

  function restart(id) {
    const timer = find(id);
    if (!timer) return;
    Object.assign(timer, { endsAt: Date.now() + timer.seconds * 1000, pausedLeft: null, done: false });
    startTicking();
    notify();
  }

  function remove(id) {
    timers = timers.filter((timer) => timer.id !== id);
    notify();
  }

  function list() {
    return timers.map((timer) => ({ ...timer, left: remaining(timer), paused: timer.pausedLeft !== null }));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { start, togglePause, restart, remove, list, subscribe };
})();
