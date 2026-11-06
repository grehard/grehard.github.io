// First-run demo workspace. All dates are computed relative to today so it always looks current.
const Seed = (() => {
  const TEAM = [
    { id: 'ines', name: 'Ines Varga', color: '#be185d' },
    { id: 'tomas', name: 'Tomas Eklund', color: '#0f766e' },
    { id: 'noor', name: 'Noor Haddad', color: '#b45309' },
    { id: 'caleb', name: 'Caleb Whitford', color: '#475569' },
    { id: 'yuki', name: 'Yuki Tanabe', color: '#6d28d9' },
  ];

  const LABELS = [
    { id: 'design', name: 'Design', color: '#be185d' },
    { id: 'frontend', name: 'Front end', color: '#1d4ed8' },
    { id: 'content', name: 'Content', color: '#b45309' },
    { id: 'bug', name: 'Bug', color: '#dc2626' },
    { id: 'research', name: 'Research', color: '#0f766e' },
    { id: 'infra', name: 'Infrastructure', color: '#6d28d9' },
  ];

  const HARBOR = {
    id: 'harbor', name: 'Harbor Street site', key: 'HSR',
    columns: [
      { name: 'Backlog', cards: [
        { title: 'Migrate press archive from the old site', who: 'noor', labels: ['content'], priority: 'low', due: 21, age: 18,
          description: 'About 240 articles. Keep publish dates and bylines, drop the sidebar widgets.',
          checklist: [['Export articles as CSV', true], ['Map old categories to new tags', false], ['Spot check 20 migrated articles', false]] },
        { title: 'Audit redirects from the old URL structure', who: 'yuki', labels: ['infra'], priority: 'medium', due: 9, age: 15,
          description: 'Crawl the live site and list every URL that needs a 301 before launch.' },
        { title: 'Add structured data to event pages', who: 'tomas', labels: ['frontend'], priority: 'low', due: null, age: 12,
          description: 'Use the Event schema so listings show dates and venues in search results.' },
        { title: 'Interview three venue managers about booking', who: 'caleb', labels: ['research'], priority: 'medium', due: 12, age: 9,
          description: 'Find out where the current booking request form loses people.',
          checklist: [['Write interview guide', true], ['Schedule three calls', false]] },
      ] },
      { name: 'Ready', limit: 5, cards: [
        { title: 'Design the mobile navigation drawer', who: 'ines', labels: ['design'], priority: 'high', due: 4, age: 11,
          description: 'Six top-level sections, with the ticket link always visible.' },
        { title: 'Write copy for the membership page', who: 'noor', labels: ['content'], priority: 'medium', due: 6, age: 8,
          description: 'Three tiers. Lead with what members get, then the price.' },
        { title: 'Compress hero images below 200 KB', who: 'tomas', labels: ['frontend'], priority: 'medium', due: 2, age: 6,
          description: 'Serve WebP with a JPEG fallback and set explicit width and height.' },
      ] },
      { name: 'In progress', limit: 3, cards: [
        { title: 'Build the event listing filters', who: 'tomas', labels: ['frontend'], priority: 'high', due: -2, age: 10, moved: 'Ready',
          description: 'Filter by date range, venue and event type. Keep the selection in the URL so links can be shared.',
          checklist: [['Date range picker', true], ['Venue and type dropdowns', true], ['Sync filters to the URL', true], ['Empty result message', false], ['Keyboard pass', false]] },
        { title: 'Fix footer overlap on small screens', who: 'tomas', labels: ['bug', 'frontend'], priority: 'urgent', due: -1, age: 3, moved: 'Backlog',
          description: 'The newsletter form covers the legal links below 400 px wide.' },
        { title: 'Connect the booking form to the ticketing API', who: 'yuki', labels: ['infra'], priority: 'high', due: 1, age: 13, moved: 'Ready',
          description: 'Sandbox keys are in the team vault. Show a clear message when a date sells out mid-checkout.',
          checklist: [['Authenticate against sandbox', true], ['Submit a test booking', true], ['Handle sold-out response', false]] },
        { title: 'Redraw the venue map as SVG', who: 'ines', labels: ['design'], priority: 'medium', due: 5, age: 7, moved: 'Ready',
          description: 'The current PNG blurs on large screens and has no text alternative.' },
      ] },
      { name: 'In review', limit: 2, cards: [
        { title: 'Homepage layout, second round', who: 'ines', labels: ['design'], priority: 'high', due: 0, age: 14, moved: 'In progress',
          description: 'Feedback from round one: less scrolling before the first event, larger dates.',
          checklist: [['Apply round one notes', true], ['Review with Caleb', false]] },
        { title: 'Accessibility pass on the checkout steps', who: 'caleb', labels: ['bug'], priority: 'high', due: -3, age: 8, moved: 'In progress',
          description: 'Check focus order, error messages and color contrast on all three steps.',
          checklist: [['Step one', true], ['Step two', true], ['Step three', true], ['Screen reader run', false]] },
      ] },
      { name: 'Done', isDone: true, cards: [
        { title: 'Choose a type scale and color tokens', who: 'ines', labels: ['design'], priority: 'medium', due: -9, age: 24, moved: 'In review',
          description: 'Agreed on two weights and a five-step scale.', checklist: [['Type scale', true], ['Color tokens', true]] },
        { title: 'Set up staging and preview deploys', who: 'yuki', labels: ['infra'], priority: 'medium', due: -6, age: 22, moved: 'In review',
          description: 'Each branch now gets a preview link.' },
        { title: 'Content inventory of the old site', who: 'noor', labels: ['content'], priority: 'low', due: -12, age: 28, moved: 'In review',
          description: 'Spreadsheet of all 412 pages with keep, merge or drop decisions.' },
      ] },
    ],
    archive: [
      { title: 'Evaluate a headless CMS', who: 'yuki', labels: ['research', 'infra'], priority: 'medium', due: null, age: 30, from: 'Backlog',
        description: 'Decided to stay on the current CMS for launch and review again in the spring.' },
      { title: 'Draft a newsletter signup popup', who: 'noor', labels: ['content'], priority: 'low', due: null, age: 26, from: 'Ready',
        description: 'Dropped after testing. The footer form is enough for now.' },
    ],
  };

  const FIELD = {
    id: 'field', name: 'Field app 2.4 release', key: 'FLD',
    columns: [
      { name: 'Planned', cards: [
        { title: 'Offline queue for inspection photos', who: 'yuki', labels: ['infra'], priority: 'high', due: 14, age: 6,
          description: 'Inspectors lose signal in basements. Queue uploads and retry when back online.' },
        { title: 'Dark theme for night shifts', who: 'ines', labels: ['design'], priority: 'low', due: null, age: 5,
          description: 'Requested by the overnight crew.' },
        { title: 'Write release notes for 2.4', who: 'noor', labels: ['content'], priority: 'medium', due: 16, age: 2,
          description: 'Short list of what changed and what crews need to do.' },
      ] },
      { name: 'Building', limit: 2, cards: [
        { title: 'Barcode scanner crashes on older phones', who: 'tomas', labels: ['bug'], priority: 'urgent', due: 2, age: 4, moved: 'Planned',
          description: 'Reproduced on two devices. Happens when the camera permission is granted mid-scan.',
          checklist: [['Reproduce', true], ['Add permission guard', false], ['Test on both devices', false]] },
        { title: 'Signature capture on the handover form', who: 'tomas', labels: ['frontend'], priority: 'high', due: 7, age: 8, moved: 'Planned',
          description: 'Finger or stylus, saved with the inspection record.' },
      ] },
      { name: 'Testing', limit: 2, cards: [
        { title: 'Sync conflict message wording', who: 'caleb', labels: ['content', 'bug'], priority: 'medium', due: -1, age: 9, moved: 'Building',
          description: 'Crews read the current message as data loss. It is not.' },
      ] },
      { name: 'Shipped', isDone: true, cards: [
        { title: 'Faster start on low-memory devices', who: 'yuki', labels: ['infra'], priority: 'medium', due: -8, age: 20, moved: 'Testing',
          description: 'Cold start dropped from 6 seconds to 2.5.' },
        { title: 'Larger tap targets on the checklist screen', who: 'ines', labels: ['design'], priority: 'medium', due: -4, age: 16, moved: 'Testing',
          description: 'Crews wear gloves. Targets are now 56 px.' },
      ] },
    ],
    archive: [],
  };

  const ONBOARDING = {
    id: 'onboarding', name: 'Customer onboarding', key: 'ONB',
    columns: [
      { name: 'Ideas', cards: [
        { title: 'Short video on inviting teammates', who: 'noor', labels: ['content'], priority: 'low', due: null, age: 5,
          description: 'Under a minute, no narration, captions only.' },
        { title: 'Ask new accounts what they want to do first', who: 'caleb', labels: ['research'], priority: 'medium', due: 10, age: 3,
          description: 'One question on the first screen, used to pick the starting template.' },
      ] },
      { name: 'This month', limit: 4, cards: [
        { title: 'Rewrite the welcome email sequence', who: 'noor', labels: ['content'], priority: 'high', due: 5, age: 7,
          description: 'Four emails down to two, each with one clear next step.',
          checklist: [['Draft first email', true], ['Draft second email', false]] },
        { title: 'Sample project for new accounts', who: 'tomas', labels: ['frontend'], priority: 'medium', due: 8, age: 6,
          description: 'New accounts open on realistic data, not an empty screen.' },
      ] },
      { name: 'Doing', limit: 2, cards: [
        { title: 'Find where trials drop off', who: 'caleb', labels: ['research'], priority: 'high', due: 3, age: 11, moved: 'This month',
          description: 'Most leave at the import step. Confirm with session counts.' },
      ] },
      { name: 'Finished', isDone: true, cards: [
        { title: 'Shorten the signup form to two fields', who: 'tomas', labels: ['frontend'], priority: 'medium', due: -5, age: 19, moved: 'Doing',
          description: 'Removed company size and phone number.' },
      ] },
    ],
    archive: [],
  };

  function buildCard(spec, id, number, today, now, startLane) {
    const createdAt = new Date(now - spec.age * 86400000).toISOString();
    const activity = [{ at: createdAt, text: `Created in ${spec.from || startLane}` }];
    if (spec.moved) {
      const movedAt = new Date(now - Math.max(1, Math.floor(spec.age / 2)) * 86400000).toISOString();
      activity.push({ at: movedAt, text: `Moved from ${spec.moved} to ${startLane}` });
    }
    const checklist = (spec.checklist || []).map(([text, done], i) => ({ id: `${id}-item-${i}`, text, done }));
    return {
      id, number, title: spec.title, description: spec.description || '', assigneeId: spec.who || null,
      labelIds: [...(spec.labels || [])], priority: spec.priority || 'medium',
      due: spec.due === null || spec.due === undefined ? null : Dates.addDays(today, spec.due),
      checklist, activity, createdAt, archivedFrom: null,
    };
  }

  function buildProject(spec, today, now) {
    const cards = {};
    let number = 0;
    const columns = spec.columns.map((col, i) => {
      const columnId = `${spec.id}-col-${i}`;
      const cardIds = col.cards.map((cardSpec) => {
        number += 1;
        const card = buildCard(cardSpec, `${spec.id}-card-${number}`, number, today, now, col.name);
        cards[card.id] = card;
        return card.id;
      });
      return { id: columnId, name: col.name, limit: col.limit || null, isDone: !!col.isDone, cardIds };
    });
    const archive = spec.archive.map((cardSpec) => {
      number += 1;
      const card = buildCard(cardSpec, `${spec.id}-card-${number}`, number, today, now, cardSpec.from);
      const fromColumn = columns.find((c) => c.name === cardSpec.from);
      card.archivedFrom = { columnId: fromColumn.id, columnName: fromColumn.name, at: new Date(now - 2 * 86400000).toISOString() };
      Model.logActivity(card, 'Archived', card.archivedFrom.at);
      cards[card.id] = card;
      return card.id;
    });
    return { id: spec.id, name: spec.name, key: spec.key, nextNumber: number + 1, columns, archive, cards };
  }

  function build() {
    const today = Dates.today();
    const now = Date.now();
    return {
      format: 'laneboard',
      version: 1,
      activeProjectId: HARBOR.id,
      team: TEAM.map((m) => ({ ...m })),
      labels: LABELS.map((l) => ({ ...l })),
      projects: [HARBOR, FIELD, ONBOARDING].map((p) => buildProject(p, today, now)),
    };
  }

  return { build };
})();
