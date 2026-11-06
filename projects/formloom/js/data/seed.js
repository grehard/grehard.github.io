// First-run data: three fictional organisations' forms, with believable responses dated relative to today.
// A seeded generator keeps the numbers identical after every reset.
FL.seed = (function () {
  const { q, when, makeForm } = FL.templates;
  const { addDays, isoDate, seededRandom } = FL.util;

  const FIRST = ['Maya', 'Tomas', 'Anika', 'Jonah', 'Lucia', 'Owen', 'Farah', 'Dimitri', 'Hana', 'Felix', 'Noor', 'Callum', 'Ines', 'Rafael', 'Greta', 'Kofi', 'Elise', 'Mateo', 'Sana', 'Bram'];
  const LAST = ['Okafor', 'Lindqvist', 'Marchetti', 'Ferreira', 'Novak', 'Haddad', 'Whitlock', 'Tanaka', 'Rosales', 'Dvorak', 'Ashworth', 'Bellamy', 'Castellan', 'Mbeki', 'Fontaine', 'Sorensen'];

  const PRAISE = [
    'Quick turnaround and the shifting has never been smoother.',
    'Fixed my brakes in a day, and "no charge" for the extra cable. Will be back.',
    'Friendly staff, fair price, bike ready when they said.',
    'They explained what was worn, what could wait, and what it would cost.',
    'Great job on the wheel truing.\nIt rides straight for the first time in years.',
    'Booked online, dropped off before work, picked up the same evening.',
    'Really knowledgeable about e-bikes, which is rare around here.',
  ];
  const COMPLAINTS = [
    'The bike was ready two days later than promised, and nobody called.',
    'Rear brake started rubbing again after a week, so I had to bring it back.',
    'Charged more than the quote, without checking with me first.',
    'Scratched my top tube during the repair.\nStaff were apologetic, but it is still there.',
  ];
  const SUGGESTIONS = [
    'Text me when it is ready, please.',
    'Saturday afternoon hours would help a lot.',
    'A loaner bike during longer repairs would be great, even for a small fee.',
    'Keep doing what you are doing.',
    '',
    '',
    '',
  ];

  function serviceFeedbackForm() {
    return makeForm(
      'Harbor Lane Bike Repair: service feedback',
      'Tell us how your repair went. It takes about a minute.',
      [
        {
          title: 'Your repair',
          fields: [
            q('service', 'dropdown', 'What did we work on?', { required: true, options: ['Tune-up', 'Brake repair', 'Flat tire', 'Wheel truing', 'E-bike diagnostics', 'Full overhaul'] }),
            q('rating', 'rating', 'How would you rate the repair overall?', { required: true }),
            q('problem', 'long_text', 'Sorry to hear that. What went wrong?', { required: true, help: 'The shop manager reads every one of these.', logic: when('rating', 'lte', 2) }),
            q('callback', 'single_choice', 'Would you like the shop manager to call you?', { required: true, options: ['Yes, please call me', 'No, thank you'], logic: when('problem', 'answered') }),
            q('phone', 'phone', 'Best number to reach you', { required: true, logic: when('callback', 'equals', 'Yes, please call me') }),
            q('pickup', 'date', 'When did you pick up your bike?'),
          ],
        },
        {
          title: 'About the shop',
          fields: [
            q('recommend', 'scale', 'How likely are you to recommend us to another rider?', { required: true, scaleMin: 0, scaleMax: 10, minLabel: 'Not likely', maxLabel: 'Very likely' }),
            q('improve', 'multi_choice', 'What could we improve?', { options: ['Turnaround time', 'Pricing', 'Opening hours', 'Keeping me updated', 'Nothing comes to mind'], validation: { max: 3 } }),
            q('bikes', 'number', 'How many bikes do you ride regularly?', { validation: { min: 0, max: 20, integer: true } }),
            q('comments', 'long_text', 'Anything else you would like us to know?', { validation: { max: 1000 } }),
            q('email', 'email', 'Email, if you would like a reply'),
          ],
        },
      ],
      { settings: { submitLabel: 'Send feedback', confirmTitle: 'Thanks for your feedback', confirmMessage: 'We read every response, and it shapes how we run the shop.' } }
    );
  }

  function pick(random, list) {
    return list[Math.floor(random() * list.length)];
  }

  function person(random) {
    const first = pick(random, FIRST);
    const last = pick(random, LAST);
    return { first, last, name: `${first} ${last}`, email: `${first}.${last}@example.com`.toLowerCase() };
  }

  function phoneNumber(random) {
    return `+1 555 01${String(Math.floor(random() * 90) + 10)}`;
  }

  /** Runs raw answers through the real logic, so hidden questions are stored the same way a live submission is. */
  function makeResponse(form, id, submittedAt, answers) {
    return { id, submittedAt, answers: FL.validate.finalizeAnswers(form, answers) };
  }

  function daysAgo(today, days, random) {
    const date = addDays(today, -days);
    date.setHours(8 + Math.floor(random() * 11), Math.floor(random() * 60), 0, 0);
    return Math.min(date.getTime(), Date.now() - 60000);
  }

  function ratingFor(random) {
    const roll = random();
    if (roll < 0.46) return 5;
    if (roll < 0.72) return 4;
    if (roll < 0.84) return 3;
    return roll < 0.94 ? 2 : 1;
  }

  function serviceResponses(form, today) {
    const random = seededRandom(1207);
    const list = [];
    let complaints = 0;
    for (let i = 0; i < 42; i++) {
      const age = Math.floor(i * 0.68 + random() * 2);
      const rating = ratingFor(random);
      const unhappy = rating <= 2;
      const callback = random() < 0.6 ? 'Yes, please call me' : 'No, thank you';
      const buyer = person(random);
      const improve = unhappy ? ['Turnaround time', 'Keeping me updated'] : (random() < 0.45 ? ['Nothing comes to mind'] : [pick(random, ['Opening hours', 'Pricing', 'Turnaround time', 'Keeping me updated'])]);
      const comment = rating >= 4 ? pick(random, PRAISE) : pick(random, SUGGESTIONS);
      list.push(makeResponse(form, `r_service_${i}`, daysAgo(today, age, random), {
        service: pick(random, ['Tune-up', 'Tune-up', 'Brake repair', 'Brake repair', 'Flat tire', 'Flat tire', 'Wheel truing', 'E-bike diagnostics', 'Full overhaul']),
        rating,
        problem: unhappy ? COMPLAINTS[complaints++ % COMPLAINTS.length] : '',
        callback,
        phone: phoneNumber(random),
        pickup: random() < 0.75 ? isoDate(addDays(today, -(age + Math.floor(random() * 3)))) : '',
        recommend: Math.max(0, Math.min(10, rating * 2 + Math.floor(random() * 3) - 1)),
        improve,
        bikes: random() < 0.7 ? String(1 + Math.floor(random() * 3)) : '',
        comments: comment,
        email: random() < 0.5 ? buyer.email : '',
      }));
    }
    return list;
  }

  function fairForm(today) {
    const fairDay = isoDate(addDays(today, 38));
    return makeForm(
      'Riverside Makers Fair: stall application',
      `Apply for a stall at the fair on ${FL.util.formatDate(fairDay)}. Decisions go out two weeks before.`,
      [
        {
          title: 'About you',
          fields: [
            q('name', 'short_text', 'Contact name', { required: true }),
            q('email', 'email', 'Email', { required: true }),
            q('business', 'short_text', 'Stall or business name', { required: true, validation: { min: 2, max: 60 } }),
          ],
        },
        {
          title: 'Your stall',
          fields: [
            q('category', 'dropdown', 'What do you sell?', { required: true, options: ['Ceramics', 'Textiles', 'Woodwork', 'Jewellery', 'Prints and paper', 'Food and drink'] }),
            q('hygiene', 'short_text', 'Food hygiene certificate number', { required: true, help: 'Two letters followed by six digits.', logic: when('category', 'equals', 'Food and drink'), validation: { pattern: '[A-Z]{2}\\d{6}', message: 'Certificate numbers look like FH204417.' } }),
            q('size', 'single_choice', 'Stall size', { required: true, options: ['Small (2 m)', 'Medium (3 m)', 'Large (5 m)'] }),
            q('power', 'single_choice', 'Do you need a power socket?', { required: true, options: ['No', 'Yes'] }),
            q('watts', 'number', 'How many watts will you draw?', { required: true, logic: when('power', 'equals', 'Yes'), validation: { min: 1, max: 3000, integer: true } }),
          ],
        },
        {
          title: 'Practical details',
          fields: [
            q('arrival', 'date', 'When can you set up?', { help: 'Setup opens the day before the fair.', validation: { min: isoDate(addDays(today, 37)), max: fairDay } }),
            q('experience', 'scale', 'How many fairs have you sold at?', { scaleMin: 0, scaleMax: 5, minLabel: 'This is my first', maxLabel: 'Five or more' }),
            q('photo', 'file', 'Photo of your stall or work', { accept: 'jpg, jpeg, png, pdf', maxSizeKB: 10240 }),
            q('notes', 'long_text', 'Anything else we should know?'),
          ],
        },
      ],
      { settings: { submitLabel: 'Send application', confirmTitle: 'Application received', confirmMessage: 'We will email you with a decision two weeks before the fair.' }, theme: { accent: '#1b3054', background: 'mist', header: 'band' } }
    );
  }

  function fairResponses(form, today) {
    const random = seededRandom(5521);
    const stallWords = ['Tidewater', 'Hollow Oak', 'Saltmarsh', 'Little Kiln', 'Fenwick', 'Moss & Marrow', 'Bright Thread', 'Slow Morning'];
    const list = [];
    for (let i = 0; i < 18; i++) {
      const owner = person(random);
      const category = pick(random, ['Ceramics', 'Ceramics', 'Textiles', 'Woodwork', 'Jewellery', 'Prints and paper', 'Food and drink', 'Food and drink']);
      const power = category === 'Food and drink' || random() < 0.2 ? 'Yes' : 'No';
      list.push(makeResponse(form, `r_fair_${i}`, daysAgo(today, Math.floor(i * 1.3), random), {
        name: owner.name,
        email: owner.email,
        business: `${pick(random, stallWords)} ${pick(random, ['Studio', 'Workshop', 'Goods', 'Co.'])}`,
        category,
        hygiene: `FH${String(200000 + Math.floor(random() * 90000))}`,
        size: pick(random, ['Small (2 m)', 'Small (2 m)', 'Medium (3 m)', 'Medium (3 m)', 'Large (5 m)']),
        power,
        watts: String(200 + Math.floor(random() * 25) * 100),
        arrival: isoDate(addDays(today, random() < 0.6 ? 37 : 38)),
        experience: Math.floor(random() * 6),
        photo: random() < 0.7 ? { name: `stall-${i + 1}.jpg`, size: 200000 + Math.floor(random() * 2800000), type: 'image/jpeg' } : null,
        notes: random() < 0.3 ? 'We share a van with another stall, so a neighbouring pitch would help, if possible.' : '',
      }));
    }
    return list;
  }

  function mechanicForm() {
    return makeForm(
      'Junior mechanic application',
      'Harbor Lane Bike Repair is hiring. No workshop experience needed, only care and curiosity.',
      [
        {
          title: 'Contact details',
          fields: [
            q('name', 'short_text', 'Full name', { required: true }),
            q('email', 'email', 'Email', { required: true }),
            q('phone', 'phone', 'Phone', { required: true }),
          ],
        },
        {
          title: 'Your experience',
          fields: [
            q('years', 'number', 'Years working on bikes', { required: true, validation: { min: 0, max: 60 } }),
            q('skills', 'multi_choice', 'What have you done before?', { options: ['Fixed a flat', 'Adjusted brakes', 'Indexed gears', 'Trued a wheel', 'Worked with customers'] }),
            q('resume', 'file', 'Resume', { accept: 'pdf, doc, docx', maxSizeKB: 5120 }),
            q('why', 'long_text', 'Why would you like to work here?', { required: true, validation: { min: 30, max: 1500 } }),
          ],
        },
      ],
      { settings: { submitLabel: 'Send application', confirmTitle: 'Application received', confirmMessage: 'We reply to everyone within ten days.' }, theme: { accent: '#7a3b12', font: 'serif' } }
    );
  }

  function mechanicResponses(form, today) {
    const random = seededRandom(884);
    const reasons = [
      'I have rebuilt three bikes in my garage, and I want to learn to do it properly.',
      'I ride to work every day, and I would rather fix things than replace them.',
      'I volunteer at a community bike kitchen on weekends and would love to do this full time.',
      'After six years in retail I want a job that uses my hands, and customers already trust me.',
      'Your shop rescued my commuter bike last winter, and I liked how you explained the repair.',
      'I am finishing a mechanics course and need real workshop hours.',
    ];
    return reasons.map((why, i) => {
      const applicant = person(random);
      return makeResponse(form, `r_mech_${i}`, daysAgo(today, 2 + i * 3, random), {
        name: applicant.name,
        email: applicant.email,
        phone: phoneNumber(random),
        years: String(Math.floor(random() * 6)),
        skills: ['Fixed a flat', 'Adjusted brakes', 'Indexed gears', 'Trued a wheel', 'Worked with customers'].filter(() => random() < 0.6),
        resume: { name: `${applicant.last.toLowerCase()}-resume.pdf`, size: 60000 + Math.floor(random() * 300000), type: 'application/pdf' },
        why,
      });
    });
  }

  /** Gives seed forms stable, readable ids while keeping updated times in the recent past. */
  function finish(form, id, today, hoursAgo) {
    form.id = id;
    form.createdAt = addDays(today, -60).getTime();
    form.updatedAt = Date.now() - hoursAgo * 3600000;
    return form;
  }

  function build() {
    const today = new Date();
    const service = finish(serviceFeedbackForm(), 'form_service', today, 2);
    const fair = finish(fairForm(today), 'form_fair', today, 26);
    const mechanic = finish(mechanicForm(), 'form_mechanic', today, 75);
    return {
      forms: [service, fair, mechanic],
      responses: {
        [service.id]: serviceResponses(service, today),
        [fair.id]: fairResponses(fair, today),
        [mechanic.id]: mechanicResponses(mechanic, today),
      },
      lastFormId: service.id,
    };
  }

  return { build };
})();
