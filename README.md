# Grehard: Web Portfolio

A one-page portfolio of 12 complete web apps. Each project has a one-minute captioned video and a Try it button that opens the working app on the same page.

## Run it

```bash
npm start
```

Then open http://localhost:4173. The page and apps need no build step or backend. Node is only used for this local server and the tools below.

## Structure

| Path | What it is |
| --- | --- |
| `index.html`, `css/`, `js/` | The portfolio page |
| `projects/<slug>/` | One self-contained app, ready to become its own repo |
| `assets/videos/`, `assets/posters/` | The one-minute videos and their poster images |
| `tools/` | Page generator, demo recorder and tests |

## Commands

```bash
node tools/build.js
```
Regenerates the project list in `index.html` from each `projects/<slug>/project.json`. Set `REPOS_PUBLISHED` to `true` in that file once the repos are on GitHub to show the Source links.

```bash
npm test
```
Runs the feature tests for all 12 apps in headless Chrome.

```bash
node tools/test-portfolio.js
```
Checks the page itself: every video plays and seeks, and every Try it panel opens and closes.

```bash
node tools/demo.js <slug> --record
```
Re-records one project's video from its script in `tools/demos/`. Use `--all` in place of the slug to record all of them.
