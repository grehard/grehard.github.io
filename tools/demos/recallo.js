// One-minute demo: make a small deck, study it with SM-2, then browse, import and read the stats.
const CSV = [
  'term,definition,tags',
  'el andén,the platform,travel',
  'la salida,the exit,travel',
  '"la llegada, el destino","the arrival, the destination",travel',
].join('\n');

module.exports = {
  name: 'Recallo',
  tagline: 'Spaced-repetition flashcards for students and language learners',
  scope: [
    'Nested decks with daily limits and four card types',
    'SM-2 study sessions with undo and a practice mode',
    'Card browser, statistics and file import',
  ],
  accent: '#0b7285',

  run: async (d) => {
    const pageHead = (name) => `.page-head button:has-text("${name}")`;
    const tab = (name) => `.tabs a:has-text("${name}")`;
    const modalButton = (name) => `.modal-foot button:has-text("${name}")`;
    // A brisker click than d.click, for steps that don't need the viewer to follow the cursor.
    const tap = async (target, hold = 120) => {
      await d.move(target, 260);
      await d.page.mouse.down();
      await d.wait(40);
      await d.page.mouse.up();
      await d.wait(hold);
    };

    // Decks
    await d.caption('Three nested seed decks with a year of review history.', 2100);

    await d.caption('Decks nest to any depth, each with daily new and review limits.', 0);
    await tap(pageHead('New deck'));
    await d.type('#deck-name', 'Trip to Madrid', { delay: 22, hold: 80 });
    await d.select('#deck-parent', { label: 'Spanish basics' }, { hold: 350 });
    await tap(modalButton('Create deck'), 150);

    // Cards
    await d.caption('A cloze note makes one card per deletion, previewed as you type.', 0);
    await tap(pageHead('Add card'));
    await tap('button[role=radio]:has-text("Cloze")');
    await d.type('#note-front', 'Quiero {{c1::un café}} y {{c2::la cuenta}}.', { delay: 20, hold: 800 });
    await tap(modalButton('Save and add another'));

    await d.caption('Typed-answer cards check what you type against the answer.', 0);
    await tap('button[role=radio]:has-text("Typed answer")');
    await d.type('#note-front', 'the train station', { delay: 16, hold: 40 });
    await d.type('#note-back', 'la estación de tren', { delay: 16, hold: 200 });
    await tap(modalButton('Save card'));

    // Study
    await d.caption('Study is calm, with large type. Space flips and 1 to 4 grade.', 0);
    await tap('.deck-panel a:has-text("Study now")', 2200);
    await d.press('Space', 300);
    await d.caption('Each grade button shows the exact next interval SM-2 will give.', 2100);
    await d.press('3', 250);

    await d.caption('Typed answers forgive case, accents, articles and small typos.', 0);
    await d.page.keyboard.type('estacion de trne', { delay: 35 });
    await d.press('Enter', 1900);
    await d.press('2', 300);

    await d.caption('Undo takes back the last grade and restores the card and counts.', 0);
    await tap('.study-top button:has-text("Undo")', 2500);
    await d.page.keyboard.press('Escape');
    await d.wait(120);

    // Practice
    await d.caption('Practice mode runs through a deck and changes no schedules.', 0);
    await tap('.deck-panel button:has-text("Practice")');
    await tap(modalButton('Start practice'), 1400);
    await d.page.keyboard.press('Escape');
    await d.wait(120);

    // Browser
    await d.caption('The browser searches every card, then tags or suspends in bulk.', 0);
    await tap(tab('Browse'));
    await d.type('#browse-search', 'tag:baltic', { delay: 22, hold: 150 });
    await tap('thead input[type=checkbox]', 150);
    await tap('.bulk-bar button:text-is("Tag")', 100);
    await d.type('#bulk-tag', 'exam-week', { delay: 22, hold: 80 });
    await tap(modalButton('Add tags'), 500);
    await tap('.bulk-bar button:text-is("Suspend")', 800);

    // Import
    await d.caption('CSV import previews the rows and lets you map each column.', 0);
    await tap(tab('Import and export'));
    await d.fill('#csv-paste', CSV, { hold: 120 });
    await tap('button:has-text("Preview import")', 1100);
    await tap('.wizard button:has-text("Import 3 notes")', 500);
    await tap('.toast button[aria-label="Dismiss"]', 50);

    // Statistics
    await d.caption('Heatmap, retention and forecast, all from the review log.', 0);
    await tap(tab('Statistics'), 1500);
    await d.poster();
    await d.scroll(330, null, 900);
    await d.wait(500);
    await d.caption('Everything stays in this browser, with JSON export as a backup.', 2500);
  },
};
