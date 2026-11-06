// Focus-session chimes, synthesized with the Web Audio API so no sound files are needed.
(function (HG) {
  'use strict';
  const PATTERNS = {
    break: [[659.25, 0], [523.25, 0.22]],
    work: [[523.25, 0], [783.99, 0.22]],
    done: [[523.25, 0], [659.25, 0.2], [783.99, 0.4]],
    test: [[659.25, 0], [783.99, 0.22]],
  };
  let context = null;

  function getContext() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!context) context = new Ctor();
    return context;
  }

  /** Browsers only start audio after a gesture, so call this from a click. */
  function unlock() {
    try {
      const ctx = getContext();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { /* sound is optional */ }
  }

  function tone(ctx, frequency, at, gainLevel) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    // A quick attack and exponential decay read as a bell. A flat tone would click at both ends.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainLevel), at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.72);
  }

  function play(kind, settings) {
    if (!settings.sound || settings.volume <= 0) return false;
    try {
      const ctx = getContext();
      if (!ctx) return false;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const level = (settings.volume / 100) * 0.5;
      (PATTERNS[kind] || PATTERNS.test).forEach(([frequency, delay]) => tone(ctx, frequency, ctx.currentTime + delay, level));
      return true;
    } catch (e) {
      return false;
    }
  }

  HG.audio = { unlock, play };
})(window.HG);
