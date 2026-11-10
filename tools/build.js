// Writes the project list into index.html from each projects/<slug>/project.json.
// Usage: node tools/build.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const GITHUB_USER = 'grehard';
// Turn on once each project is pushed to github.com/grehard/<slug>, so a Source link is never broken.
const REPOS_PUBLISHED = true;
const ORDER = ['gridlens', 'driftboard', 'coinpath', 'stockroom', 'billcraft', 'laneboard', 'formloom', 'marginalia', 'recallo', 'mise', 'hourglass', 'rhythm'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const projects = ORDER.map((slug) => {
  const file = path.join(ROOT, 'projects', slug, 'project.json');
  if (!fs.existsSync(file)) { console.warn(`skipped ${slug}: no project.json`); return null; }
  return { ...JSON.parse(fs.readFileSync(file, 'utf8')), slug };
}).filter(Boolean);

const GITHUB_ICON = '<svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';
const ARROW = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';

function projectRow(p, i) {
  const url = `projects/${p.slug}/index.html`;
  const number = String(i + 1).padStart(2, '0');
  const source = REPOS_PUBLISHED
    ? `\n            <a class="btn-ghost" href="https://github.com/${GITHUB_USER}/${p.slug}" target="_blank" rel="noopener">${GITHUB_ICON}Source</a>`
    : '';
  return `
      <article class="project" id="${p.slug}" style="--accent:${esc(p.accent)}">
        <div class="frame">
          <div class="frame-bar" aria-hidden="true"><i></i><i></i><i></i><span>${esc(p.name)}</span><b>1:00</b></div>
          <div class="player">
            <video preload="none" playsinline poster="assets/posters/${p.slug}.jpg" aria-label="One-minute overview of ${esc(p.name)}, with on-screen captions">
              <source src="assets/videos/${p.slug}.mp4" type="video/mp4">
            </video>
            <button type="button" class="play" aria-label="Play the one-minute overview of ${esc(p.name)}">
              <span class="play-chip"><svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path d="M0 0l12 7-12 7z" fill="currentColor"/></svg>Watch overview</span>
            </button>
          </div>
        </div>
        <div class="info">
          <p class="meta"><span class="dot"></span>${esc(p.category)}<span class="num">${number}</span></p>
          <h3>${esc(p.name)}</h3>
          <p class="desc">${esc(p.description)}</p>
          <ul class="scope">${p.scope.map((s) => `\n            <li>${esc(s)}</li>`).join('')}
          </ul>
          <ul class="stack" aria-label="Built with">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
          <div class="actions">
            <a class="btn" href="${url}" data-try="${p.slug}" data-name="${esc(p.name)}" data-accent="${esc(p.accent)}">Try it${ARROW}</a>${source}
          </div>
        </div>
      </article>`;
}

const indexList = `
      <ol class="index">${projects.map((p) => `
        <li style="--accent:${esc(p.accent)}"><a href="#${p.slug}"><span class="dot"></span><strong>${esc(p.name)}</strong><span>${esc(p.category)}</span></a></li>`).join('')}
      </ol>
      `;

function replaceBetween(html, name, content) {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(html)) throw new Error(`index.html is missing the ${name} markers`);
  return html.replace(re, (_, start, end) => start + content + end);
}

const file = path.join(ROOT, 'index.html');
let html = fs.readFileSync(file, 'utf8');
html = replaceBetween(html, 'index', indexList);
const printList = `
      <ol>${projects.map((p) => `
        <li><strong>${esc(p.name)}</strong>: ${esc(p.tagline)}<span>${p.stack.map(esc).join(', ')}</span></li>`).join('')}
      </ol>
      <p>Live demos and source: grehard.github.io and github.com/${GITHUB_USER}</p>
      `;
html = replaceBetween(html, 'printlist', printList);
html = replaceBetween(html, 'projects', projects.map((p, i) => projectRow(p, i)).join('\n') + '\n      ');
fs.writeFileSync(file, html);
console.log(`index.html: ${projects.length} projects`);
