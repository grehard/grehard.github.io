// Finds cooking times in a step's text so cook mode can offer a timer for each.
Mise.Durations = (() => {
  const { parse: parseNumber } = Mise.Fractions;
  const NUMBER = '\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d*\\.\\d+|\\d+';
  const UNIT = 'hours?|hrs?|minutes?|mins?|seconds?|secs?';
  const TIME_RE = new RegExp(`(${NUMBER})(?:\\s*(?:-|–|to)\\s*(${NUMBER}))?[\\s-]*(${UNIT})\\b(?:\\s*(?:and\\s*)?(\\d+)[\\s-]*(?:minutes?|mins?)\\b)?`, 'gi');
  const HALF_HOUR_RE = /\bhalf an hour\b/i;
  const AN_HOUR_RE = /\b(?:an|one) hour\b/i;

  function unitSeconds(unit) {
    const first = unit[0].toLowerCase();
    if (first === 'h') return 3600;
    return first === 'm' ? 60 : 1;
  }

  function shortLabel(seconds) {
    if (seconds < 60) return `${seconds} sec`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds - hours * 3600) / 60);
    if (!hours) return `${minutes} min`;
    return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }

  function fromMatch(match) {
    const per = unitSeconds(match[3]);
    // A range starts on its low end, so the cook checks early rather than overshooting.
    const seconds = Math.round(parseNumber(match[1]) * per) + (match[4] ? +match[4] * 60 : 0);
    const unitWord = { 3600: 'hr', 60: 'min', 1: 'sec' }[per];
    return { seconds, label: match[2] ? `${match[1]}–${match[2]} ${unitWord}` : shortLabel(seconds) };
  }

  /** Returns [{ seconds, label }] for every time mentioned, in order of appearance. */
  function detect(text) {
    const found = [...String(text).matchAll(TIME_RE)].map(fromMatch).filter((time) => time.seconds > 0);
    if (HALF_HOUR_RE.test(text)) found.push({ seconds: 1800, label: '30 min' });
    else if (AN_HOUR_RE.test(text)) found.push({ seconds: 3600, label: '1 hr' });
    return found;
  }

  /** "12:03" or "1:05:00". */
  function clock(totalSeconds) {
    const seconds = Math.max(0, Math.ceil(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = String(seconds % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
  }

  return { detect, clock };
})();
