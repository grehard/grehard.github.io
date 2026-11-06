// Writes the project list into index.html from each projects/<slug>/project.json.
// Usage: node tools/build.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const GITHUB_USER = 'KazelWeb';
// Turn on once each project is pushed to github.com/KazelWeb/<slug>, so a Source link is never broken.
const REPOS_PUBLISHED = true;
const ORDER = ['gridlens', 'driftboard', 'coinpath', 'stockroom', 'billcraft', 'laneboard', 'formloom', 'marginalia', 'recallo', 'mise', 'hourglass', 'rhythm'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const projects = ORDER.map((slug) => {
  const file = path.join(ROOT, 'projects', slug, 'project.json');
  if (!fs.existsSync(file)) { console.warn(`skipped ${slug}: no project.json`); return null; }
  return { ...JSON.parse(fs.readFileSync(file, 'utf8')), slug };
}).filter(Boolean);

function projectRow(p) {
  const url = `projects/${p.slug}/index.html`;
  const source = REPOS_PUBLISHED
    ? `\n            <a class="link-quiet" href="https://github.com/${GITHUB_USER}/${p.slug}" target="_blank" rel="noopener">Source on GitHub</a>`
    : '';
  return `
      <article class="project" id="${p.slug}" style="--accent:${esc(p.accent)}">
        <div class="player">
          <video preload="none" playsinline poster="assets/posters/${p.slug}.jpg" aria-label="One-minute overview of ${esc(p.name)}, with on-screen captions">
            <source src="assets/videos/${p.slug}.mp4" type="video/mp4">
          </video>
          <button type="button" class="play" aria-label="Play the one-minute overview of ${esc(p.name)}">
            <span class="play-chip"><svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path d="M0 0l12 7-12 7z" fill="currentColor"/></svg>Watch overview, 1:00</span>
          </button>
        </div>
        <div class="info">
          <p class="meta"><span class="dot"></span>${esc(p.category)}</p>
          <h2>${esc(p.name)}</h2>
          <p class="desc">${esc(p.description)}</p>
          <ul class="scope">${p.scope.map((s) => `\n            <li>${esc(s)}</li>`).join('')}
          </ul>
          <p class="stack">${p.stack.map(esc).join(', ')}</p>
          <div class="actions">
            <a class="btn" href="${url}" data-try="${p.slug}" data-name="${esc(p.name)}" data-accent="${esc(p.accent)}">Try it</a>${source}
          </div>
        </div>
      </article>`;
}

const indexList = `
      <ol class="index">${projects.map((p) => `
        <li><a href="#${p.slug}"><strong>${esc(p.name)}</strong><span>${esc(p.category)}</span></a></li>`).join('')}
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
html = replaceBetween(html, 'projects', projects.map(projectRow).join('\n') + '\n      ');
fs.writeFileSync(file, html);
console.log(`index.html: ${projects.length} projects`);
