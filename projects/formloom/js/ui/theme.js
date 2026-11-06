// App light/dark preference, and the color math behind each form's published theme.
FL.theme = (function () {
  const KEY = 'formloom.theme';
  const listeners = [];

  function stored() {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch (err) {
      return null;
    }
  }

  let choice = stored();

  function systemDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function isDark() {
    return choice ? choice === 'dark' : systemDark();
  }

  function apply() {
    if (choice) document.documentElement.setAttribute('data-theme', choice);
    else document.documentElement.removeAttribute('data-theme');
    listeners.forEach((fn) => fn());
  }

  function toggle() {
    choice = isDark() ? 'light' : 'dark';
    try { localStorage.setItem(KEY, choice); } catch (err) { /* the choice lasts for this session */ }
    apply();
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  if (window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    if (media.addEventListener) media.addEventListener('change', () => { if (!choice) apply(); });
  }

  function rgb(hex) {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }

  function toHex(parts) {
    return `#${parts.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  }

  function mix(hexA, hexB, amountOfB) {
    const a = rgb(hexA);
    const b = rgb(hexB);
    return toHex(a.map((c, i) => c + (b[i] - c) * amountOfB));
  }

  function luminance(hex) {
    const [r, g, b] = rgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(hexA, hexB) {
    const a = luminance(hexA);
    const b = luminance(hexB);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function toHsl(hex) {
    const [r, g, b] = rgb(hex).map((c) => c / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const light = (max + min) / 2;
    if (!delta) return [0, 0, light];
    const sat = delta / (1 - Math.abs(2 * light - 1));
    let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    return [hue, sat, light];
  }

  function fromHsl(hue, sat, light) {
    const amplitude = sat * Math.min(light, 1 - light);
    const channel = (n) => {
      const k = (n + hue / 30) % 12;
      return (light - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
    };
    return toHex([channel(0), channel(8), channel(4)].map((c) => Math.max(0, Math.min(255, c))));
  }

  /** Dark surfaces hide a deep accent. Raising lightness alone keeps its hue, where mixing with white would gray it. */
  function readableAccent(accent, surface) {
    const [hue, sat, startLight] = toHsl(accent);
    let light = startLight;
    let color = accent;
    while (light < 0.95 && contrast(color, surface) < 4.5) {
      light += 0.03;
      color = fromHsl(hue, sat, light);
    }
    return color;
  }

  const FONTS = {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
    mono: 'ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace',
  };
  const RADII = { square: '2px', soft: '6px', round: '10px' };
  const LIGHT_BACKGROUNDS = { white: '#ffffff', paper: '#f5f4ef', mist: '#eef1f4' };

  /** CSS variables for a published form in the current light or dark mode. */
  function formVars(theme) {
    const dark = isDark();
    const card = dark ? '#1b1f1d' : '#ffffff';
    const accent = dark ? readableAccent(theme.accent, card) : theme.accent;
    const background = dark
      ? mix(theme.background === 'tint' ? accent : '#141716', '#141716', theme.background === 'tint' ? 0.86 : 0)
      : (LIGHT_BACKGROUNDS[theme.background] || mix(theme.accent, '#ffffff', 0.9));
    return {
      '--f-accent': accent,
      '--f-on-accent': contrast('#ffffff', accent) >= 4.5 ? '#ffffff' : '#111513',
      '--f-soft': mix(accent, card, 0.88),
      '--f-bg': background,
      '--f-card': card,
      '--f-text': dark ? '#e9ece9' : '#1b1f1d',
      '--f-muted': dark ? '#a6ada8' : '#5a625d',
      '--f-line': dark ? '#3a403c' : '#c9cdc8',
      '--f-input': dark ? '#141716' : '#ffffff',
      '--f-error': dark ? '#ff9c92' : '#b3261e',
      '--f-radius': RADII[theme.corners] || RADII.soft,
      '--f-font': FONTS[theme.font] || FONTS.sans,
    };
  }

  apply();
  return { isDark, toggle, onChange, formVars, contrast };
})();
