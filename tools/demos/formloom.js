// Scripted demo: a bike shop adds a question, publishes the form, fills it in and reads the results.
const QUICK_MOVE_MS = 230;

module.exports = {
  name: 'Formloom',
  tagline: 'Drag-and-drop form and survey builder that needs no server',
  scope: [
    'Three-pane builder with validation and conditional logic',
    'Respondent view and share links with the form in the URL',
    'Response table, per-question charts and CSV export',
  ],
  accent: '#1c5a45',
  run: async (d) => {
    const { page } = d;

    const tap = async (target, hold = 150) => {
      await d.move(target, QUICK_MOVE_MS);
      await page.mouse.down();
      await d.wait(40);
      await page.mouse.up();
      await d.wait(hold);
    };
    const choose = async (target, value, hold = 200) => {
      await d.move(target, QUICK_MOVE_MS);
      await page.locator(target).first().selectOption(value);
      await d.wait(hold);
    };
    const enter = async (target, text, delay, hold = 100) => {
      await tap(target, 60);
      await page.keyboard.press('Control+A');
      await page.keyboard.type(text, { delay });
      await d.wait(hold);
    };

    await d.caption('A palette of 13 field types, the form canvas, and a property panel.', 2600);

    await d.caption('Drag a field to where it belongs. Every edit can be undone and redone.', 100);
    const secondCard = await page.locator('.field-card').nth(1).boundingBox();
    await d.drag('.palette-item[data-type="short_text"]', { x: secondCard.x + secondCard.width / 2, y: secondCard.y + 6 }, { ms: 500 });
    await tap('#undo', 250);
    await tap('#redo', 250);
    await enter('#prop-label', 'Work order number', 18);

    await d.caption('Validation covers required, min/max, regex and custom messages.', 100);
    await enter('#val-pattern', 'WO-\\d{4}', 25);
    await enter('#val-message', 'Use the format WO-1234.', 12, 250);

    await d.caption('Logic reads like a sentence: show this field when another answer matches.', 100);
    await tap('[data-fk="rule-add"]');
    await choose('[data-rule="rule-0"] select[aria-label="Question"]', { label: 'What did we work on?' });
    await choose('[data-rule="rule-0"] select[aria-label="Value"]', 'Full overhaul', 1000);
    await d.poster();

    await d.caption('Theme settings restyle the form your respondents see.', 100);
    await tap('.panel-tab:has-text("Form and theme")', 120);
    await tap('.swatch[aria-label="Ink navy"]', 200);
    await choose('#theme-header', 'band', 700);

    await tap('#share', 80);
    await d.caption('The whole form is compressed into the link itself, so no server is involved.', 2500);
    await tap('#share-open', 200);

    await d.caption('The link opens straight into the form, ready to send to real customers.', 1400);
    await d.scroll(150, '.f-page', 350);
    await tap('.f-next', 900);
    await d.caption('Nothing gets through until it is right, and logic updates as you answer.', 100);
    await choose('.f-field:has-text("What did we work on?") select', 'Full overhaul', 300);
    await enter('.f-field:has-text("Work order number") input', 'WO-22', 40, 40);
    await page.locator('.f-field:has-text("Work order number") input').blur();
    await d.wait(800);
    await enter('.f-field:has-text("Work order number") input', 'WO-2291', 25, 40);

    await tap(page.locator('.f-star').nth(1), 200);
    await d.caption('A low rating opens a chain: what went wrong, then an offer to call back.', 100);
    await enter('.f-field:has-text("What went wrong") textarea', 'Rear brake still rubs, "fixed" twice now.', 8, 120);
    await tap('.f-option:has-text("No, thank you")', 250);
    await tap('.f-next', 300);

    await tap(page.locator('.f-scale-step').nth(4), 150);
    await tap('.f-next', 300);
    await d.caption('A confirmation screen closes the loop, and the response is stored.', 2000);

    await tap('.f-foot-link', 120);
    await tap(page.locator('.form-row-count').first(), 200);
    await d.caption('Responses land in a sortable, filterable table.', 100);
    await tap('.th-sort:has-text("How would you rate")', 900);
    await enter('input[aria-label="Search answers"]', 'overhaul', 40, 900);
    await tap('.link-button:has-text("Clear filters")', 500);

    await tap('.segment:has-text("Summary")', 100);
    await d.caption('Each question gets a summary with hand-built SVG charts.', 2000);
    await d.scroll(380, '.responses', 700);
    await d.wait(500);

    await d.caption('CSV export handles commas, quotes and line breaks in real answers.', 100);
    await tap('button:has-text("Export CSV")', 2300);
  },
};
