// Two behaviours: one video plays at a time, and Try it opens the app in a panel on this same page.
(function () {
  'use strict';

  // Project cards rise in once as they scroll into view.
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.project').forEach((card) => {
      card.classList.add('reveal');
      observer.observe(card);
    });
  }

  const players = Array.from(document.querySelectorAll('.player'));

  function pauseVideosExcept(current) {
    players.forEach((player) => {
      const video = player.querySelector('video');
      if (video !== current && !video.paused) video.pause();
    });
  }

  players.forEach((player) => {
    const video = player.querySelector('video');
    player.querySelector('.play').addEventListener('click', () => {
      player.classList.add('playing');
      video.controls = true;
      video.play().catch(() => {}); // If the browser refuses, the native controls are still there.
      video.focus({ preventScroll: true });
    });
    video.addEventListener('play', () => pauseVideosExcept(video));
    video.addEventListener('ended', () => {
      player.classList.remove('playing');
      video.controls = false;
      video.load(); // Returns to the poster image.
    });
  });

  const dialog = document.getElementById('try');
  const frameBox = dialog.querySelector('.try-frame');
  const nameEl = document.getElementById('try-name');
  const dotEl = document.getElementById('try-dot');
  const openLink = document.getElementById('try-open');
  const tryButtons = new Map(Array.from(document.querySelectorAll('[data-try]')).map((b) => [b.dataset.try, b]));
  let opener = null;

  // A new iframe each time: changing an existing iframe's src adds a history entry, and then the
  // browser's Back button would step through old apps instead of closing the panel.
  function mountApp(url, title) {
    removeApp();
    const iframe = document.createElement('iframe');
    iframe.id = 'try-iframe';
    iframe.title = title;
    iframe.src = url;
    iframe.addEventListener('load', () => frameBox.classList.add('ready'));
    frameBox.classList.remove('ready');
    frameBox.appendChild(iframe);
  }

  function removeApp() {
    const iframe = document.getElementById('try-iframe');
    if (iframe) iframe.remove();
  }

  function openPanel(slug) {
    const button = tryButtons.get(slug);
    if (!button) return;
    pauseVideosExcept(null);
    opener = button;
    nameEl.textContent = button.dataset.name;
    dotEl.style.setProperty('--accent', button.dataset.accent);
    openLink.href = button.getAttribute('href');
    mountApp(button.getAttribute('href'), `${button.dataset.name}, live app`);
    if (!dialog.open) dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
  }

  function closePanel() {
    if (dialog.open) dialog.close();
    removeApp();
    document.documentElement.style.overflow = '';
    if (opener) opener.focus({ preventScroll: true });
  }

  function closeAndClearHash() {
    closePanel();
    history.pushState(null, '', location.pathname + location.search);
  }

  tryButtons.forEach((button, slug) => {
    button.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return; // Leave "open in new tab" alone.
      event.preventDefault();
      history.pushState(null, '', `#try/${slug}`);
      openPanel(slug);
    });
  });

  document.getElementById('try-close').addEventListener('click', closeAndClearHash);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeAndClearHash(); });

  // Makes the browser's Back button close the panel, and #try/<slug> links open it directly.
  function syncWithHash() {
    const match = /^#try\/([\w-]+)$/.exec(location.hash);
    if (match && tryButtons.has(match[1])) openPanel(match[1]);
    else if (dialog.open) closePanel();
  }
  window.addEventListener('popstate', syncWithHash);
  syncWithHash();
})();
