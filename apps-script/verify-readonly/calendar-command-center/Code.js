
function setupLVPTCalendars() {
  const BUSINESS = 'book@pokertraininglasvegas.com';
  const PERSONAL = 'wsopamatt@gmail.com';
  const TIMEZONE = 'America/Los_Angeles';

  const account = CalendarApp.getDefaultCalendar()
    .getId().toLowerCase();

  if (account !== BUSINESS) {
    throw new Error(
      'Wrong Google account: ' + account +
      '. Sign in as ' + BUSINESS
    );
  }

  const calendars = [
    [
      'LVPT | Confirmed Events',
      '#18875d',
      'Confirmed LVPT events and scheduled experiences.'
    ],
    [
      'LVPT | Proposals & Holds',
      '#d99a21',
      'Prospective dates, proposals and event holds.'
    ],
    [
      'LVPT | Operations & Payments',
      '#3576df',
      'Production, vendors, payments and deadlines.'
    ],
    [
      'LVPT | Sales & Follow-Ups',
      '#8b5dc7',
      'Client replies, sales and follow-up reminders.'
    ]
  ];

  for (const [name, color, description] of calendars) {
    const matches = CalendarApp.getOwnedCalendarsByName(name);
    const created = matches.length === 0;

    const cal = created
      ? CalendarApp.createCalendar(name, {
          color,
          description,
          timeZone: TIMEZONE,
          selected: true
        })
      : matches[0];

    cal.setColor(color);
    cal.setDescription(description);
    cal.setTimeZone(TIMEZONE);
    cal.setSelected(true);

    const acl = Calendar.Acl.list(cal.getId());

    const existing = (acl.items || []).find(rule =>
      rule.scope &&
      rule.scope.type === 'user' &&
      (rule.scope.value || '').toLowerCase() === PERSONAL
    );

    if (!existing) {
      Calendar.Acl.insert({
        role: 'writer',
        scope: { type: 'user', value: PERSONAL }
      }, cal.getId());
    } else if (
      existing.role !== 'writer' &&
      existing.role !== 'owner'
    ) {
      Calendar.Acl.update({
        role: 'writer',
        scope: { type: 'user', value: PERSONAL }
      }, cal.getId(), existing.id);
    }

    console.log(
      (created ? 'CREATED: ' : 'ALREADY EXISTS: ') +
      name + ' | ID: ' + cal.getId()
    );
  }

  console.log('SUCCESS: All four LVPT calendars are ready.');
}
