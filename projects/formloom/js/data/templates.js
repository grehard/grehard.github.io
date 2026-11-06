// Starter forms. Each is written with readable ids, then given fresh ids when instantiated.
FL.templates = (function () {
  const { blankForm, cloneWithNewIds, normalizeForm } = FL.schema;

  function q(id, type, label, extra) {
    return Object.assign({ id, type, label }, extra);
  }

  function when(fieldId, op, value) {
    return { match: 'all', rules: [{ fieldId, op, value: value === undefined ? '' : String(value) }] };
  }

  function makeForm(title, description, pages, overrides) {
    const base = blankForm(title);
    base.description = description;
    base.pages = pages.map((page, index) => ({ id: `page${index + 1}`, title: page.title, fields: page.fields }));
    Object.assign(base.settings, overrides && overrides.settings);
    Object.assign(base.theme, overrides && overrides.theme);
    return normalizeForm(base).form;
  }

  const customerFeedback = () => makeForm(
    'Customer feedback',
    'Two minutes of your time helps us get better.',
    [{
      title: 'Your experience',
      fields: [
        q('overall', 'rating', 'How was your experience overall?', { required: true }),
        q('wrong', 'long_text', 'What went wrong?', { required: true, logic: when('overall', 'lte', 2) }),
        q('recommend', 'scale', 'How likely are you to recommend us?', { scaleMin: 0, scaleMax: 10, minLabel: 'Not likely', maxLabel: 'Very likely', required: true }),
        q('liked', 'multi_choice', 'What did you like?', { options: ['Quality', 'Price', 'Speed', 'Friendly service'] }),
        q('contact', 'email', 'Email, if you would like a reply'),
      ],
    }],
    { settings: { confirmTitle: 'Thanks for your feedback', confirmMessage: 'We read every response.' } }
  );

  const eventRegistration = () => makeForm(
    'Event registration',
    'Save your place. We will send details closer to the day.',
    [
      {
        title: 'About you',
        fields: [
          q('name', 'short_text', 'Full name', { required: true }),
          q('email', 'email', 'Email', { required: true }),
          q('phone', 'phone', 'Mobile number', { help: 'Only used for changes on the day.' }),
        ],
      },
      {
        title: 'Your place',
        fields: [
          q('ticket', 'single_choice', 'Ticket', { required: true, options: ['General admission', 'Student', 'Speaker or staff'] }),
          q('institution', 'short_text', 'Where do you study?', { required: true, logic: when('ticket', 'equals', 'Student') }),
          q('sessions', 'multi_choice', 'Which sessions will you join?', { options: ['Morning talks', 'Lunch roundtable', 'Afternoon workshop'], validation: { min: 1 } }),
          q('guests', 'number', 'How many guests are you bringing?', { validation: { min: 0, max: 4, integer: true } }),
        ],
      },
      {
        title: 'Food and access',
        fields: [
          q('diet', 'single_choice', 'Do you have dietary needs?', { required: true, options: ['No', 'Yes'] }),
          q('dietDetail', 'short_text', 'Tell us what you need', { required: true, logic: when('diet', 'equals', 'Yes') }),
          q('access', 'long_text', 'Anything we can do to make the event easier for you?'),
        ],
      },
    ],
    { settings: { submitLabel: 'Register', confirmTitle: 'You are registered', confirmMessage: 'See you there.' } }
  );

  const jobApplication = () => makeForm(
    'Job application',
    'Tell us about yourself. This takes about five minutes.',
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
          q('years', 'number', 'Years of relevant experience', { required: true, validation: { min: 0, max: 60 } }),
          q('portfolio', 'short_text', 'Portfolio or work sample link', {
            placeholder: 'https://',
            validation: { pattern: 'https?://\\S+', message: 'Enter a full web address starting with http:// or https://.' },
          }),
          q('resume', 'file', 'Resume', { required: true, accept: 'pdf, doc, docx', maxSizeKB: 5120 }),
          q('why', 'long_text', 'Why do you want this role?', { required: true, validation: { min: 50, max: 1500 } }),
        ],
      },
      {
        title: 'Availability',
        fields: [
          q('start', 'date', 'Earliest start date', { required: true }),
          q('visa', 'single_choice', 'Will you need visa sponsorship?', { required: true, options: ['No', 'Yes'] }),
          q('visaDetail', 'short_text', 'Which visa type?', { logic: when('visa', 'equals', 'Yes') }),
        ],
      },
    ],
    { settings: { submitLabel: 'Send application', confirmTitle: 'Application received', confirmMessage: 'We reply to every applicant within two weeks.' } }
  );

  const supportRequest = () => makeForm(
    'Support request',
    'Tell us what happened and we will get back to you.',
    [{
      title: 'Your request',
      fields: [
        q('email', 'email', 'Your email', { required: true }),
        q('category', 'dropdown', 'What is this about?', { required: true, options: ['Billing', 'A bug', 'My account', 'Something else'] }),
        q('invoice', 'short_text', 'Invoice number', { required: true, help: 'Two letters, a hyphen and four digits.', placeholder: 'AB-1234', logic: when('category', 'equals', 'Billing'), validation: { pattern: '[A-Z]{2}-\\d{4}', message: 'Invoice numbers look like AB-1234.' } }),
        q('steps', 'long_text', 'What were you doing when it happened?', { required: true, logic: when('category', 'equals', 'A bug') }),
        q('details', 'long_text', 'How can we help?', { required: true, validation: { max: 2000 } }),
        q('urgency', 'scale', 'How urgent is this?', { minLabel: 'Whenever', maxLabel: 'Blocking my work' }),
        q('screenshot', 'file', 'Screenshot file name', { accept: 'png, jpg, pdf' }),
      ],
    }],
    { settings: { submitLabel: 'Send request', confirmTitle: 'Request received', confirmMessage: 'We usually reply within one working day.' }, theme: { accent: '#1b3054', background: 'mist' } }
  );

  const volunteerSignup = () => makeForm(
    'Volunteer sign-up',
    'Choose when you can help. Every shift makes a difference.',
    [{
      title: 'Sign up',
      fields: [
        q('name', 'short_text', 'Full name', { required: true }),
        q('email', 'email', 'Email', { required: true }),
        q('days', 'multi_choice', 'Which days can you help?', { required: true, options: ['Friday', 'Saturday', 'Sunday'] }),
        q('role', 'dropdown', 'Preferred role', { options: ['Welcome desk', 'Setup and pack down', 'Food stall', 'Anywhere needed'] }),
        q('driver', 'single_choice', 'Do you have a driving licence?', { options: ['Yes', 'No'] }),
        q('vehicle', 'single_choice', 'Could you bring a vehicle for setup?', { options: ['Yes', 'No'], logic: when('driver', 'equals', 'Yes') }),
        q('shirt', 'dropdown', 'T-shirt size', { options: ['S', 'M', 'L', 'XL'] }),
      ],
    }],
    { settings: { confirmTitle: 'Thanks for volunteering', confirmMessage: 'We will email your shift times a week before.' }, theme: { accent: '#7a3b12' } }
  );

  const CATALOG = [
    { key: 'customer-feedback', name: 'Customer feedback', description: 'Rating, recommendation score and a follow-up when things went wrong.', icon: 'rating', build: customerFeedback },
    { key: 'event-registration', name: 'Event registration', description: 'Three pages covering attendees, tickets and dietary needs.', icon: 'date', build: eventRegistration },
    { key: 'job-application', name: 'Job application', description: 'Contact details, experience, resume file name and availability.', icon: 'file', build: jobApplication },
    { key: 'support-request', name: 'Support request', description: 'Routes billing and bug reports to the right follow-up questions.', icon: 'email', build: supportRequest },
    { key: 'volunteer-signup', name: 'Volunteer sign-up', description: 'Availability, role preference and a vehicle question for drivers.', icon: 'multi_choice', build: volunteerSignup },
  ];

  function instantiate(template) {
    return cloneWithNewIds(template.build()).form;
  }

  return { list: () => CATALOG, instantiate, q, when, makeForm };
})();
