import type { LVPTEvent } from '../types/event';

export const events: LVPTEvent[] = [
  {
    id: 'evt-neo-2026',
    eventName: 'Neo Reunion 2026 Poker Experience',
    company: 'Mosaic Events / Neo',
    contactName: 'Demo Planner',
    contactEmail: 'planner@example.com',
    contactPhone: '555-0100',
    eventType: 'Corporate Poker Training + Tournament',
    status: 'Quote Needed',
    eventDate: '2026-10-03',
    startTime: '2:00 PM',
    endTime: '10:00 PM',
    city: 'Marana',
    state: 'AZ',
    venue: 'Ritz-Carlton Dove Mountain',
    guestCount: 150,
    studentCount: 40,
    skillLevel: 'Mixed corporate audience',
    leadSource: 'Repeat Client',
    probabilityToClose: 85,
    eventGoal: 'Repeat premium poker training and tournament experience with stronger year-two execution.',
    eventFormat: 'Afternoon training block, evening tournament, 4-5 instructors, branded materials likely.',
    clientExpectations: 'Bring back a strong pro team, keep the event polished, and improve guest access to pros.',
    knownRisks: ['Venue compliance packet', 'Instructor availability', 'Branded card/chip production timing', 'Tournament scope creep'],
    nextAction: 'Prepare year-two quote with inflation adjustment and improvement recommendations.',
    nextActionDue: '2026-06-07',
    quote: [
      { id: 'qli-1', category: 'Training', name: 'Premium instructor team', quantity: 5, unitPrice: 4500, internalCost: 2500 },
      { id: 'qli-2', category: 'Tournament', name: 'Tournament operations package', quantity: 1, unitPrice: 14500, internalCost: 8500 },
      { id: 'qli-3', category: 'Assets', name: 'Branded cards and chips allowance', quantity: 1, unitPrice: 4000, internalCost: 2600, optional: true }
    ],
    payment: {
      quoteTotal: 41000,
      amountPaid: 0,
      depositRequired: 20500,
      depositPaid: false,
      balanceDueDate: '2026-09-23',
      status: 'Not Invoiced'
    },
    staff: [
      { id: 'staff-1', name: 'Kenna James', role: 'Lead Pro / MC', confirmed: false, arrivalTime: '1:00 PM', rate: 0, notes: 'Requested if available.' },
      { id: 'staff-2', name: 'Instructor TBD', role: 'Poker Instructor', confirmed: false, arrivalTime: '1:00 PM', rate: 0 },
      { id: 'staff-3', name: 'Dealer Team TBD', role: 'Dealers', confirmed: false, arrivalTime: '5:30 PM', rate: 0 }
    ],
    compliance: [
      { id: 'coi', name: 'Certificate of Insurance', status: 'Needed', dueDate: '2026-09-01' },
      { id: 'license', name: 'Venue business license requirement', status: 'Pending', dueDate: '2026-09-01' },
      { id: 'vendor-code', name: 'Vendor policies and code of conduct', status: 'Pending', dueDate: '2026-09-01' }
    ],
    tasks: [
      { id: 'task-1', title: 'Build revised year-two quote', owner: 'Matt', dueDate: '2026-06-07', priority: 'Critical', status: 'Open' },
      { id: 'task-2', title: 'Confirm preferred instructor availability', owner: 'Matt', dueDate: '2026-06-14', priority: 'High', status: 'Open' }
    ],
    postEvent: {
      clientFeedback: '',
      whatWentWell: 'Prior year feedback was strong; client appears open to repeating and upgrading.',
      painPoints: 'Guests may have wanted more time with pros. Year-two design should protect instructor interaction time.',
      changesForNextTime: 'Add more pro access, clarify tournament facilitation scope, begin compliance earlier.',
      reviewRequested: false,
      reviewReceived: false,
      rebookingLikelihood: 'High'
    }
  },
  {
    id: 'evt-vegas-corp-demo',
    eventName: 'Venetian Corporate Poker Workshop',
    company: 'WFM Restoration Demo Account',
    contactName: 'Demo Contact',
    contactEmail: 'contact@example.com',
    contactPhone: '555-0110',
    eventType: 'Corporate Poker Training',
    status: 'Proposal Sent',
    eventDate: '2026-07-18',
    startTime: '6:00 PM',
    endTime: '9:00 PM',
    city: 'Las Vegas',
    state: 'NV',
    venue: 'Venetian Poker Room',
    guestCount: 40,
    studentCount: 18,
    skillLevel: 'Beginner to intermediate',
    leadSource: 'Corporate Events Page',
    probabilityToClose: 65,
    eventGoal: 'Premium Las Vegas client entertainment with real poker training and optional tournament play.',
    eventFormat: '90-minute guided hand analysis followed by casual dealer-run Sit & Go tables.',
    clientExpectations: 'High-touch, polished, easy for beginners, impressive for executives.',
    knownRisks: ['Private table availability', 'Food and beverage coordination', 'Guest count may change'],
    nextAction: 'Follow up on proposal and confirm whether custom cards are desired.',
    nextActionDue: '2026-06-03',
    quote: [
      { id: 'qli-4', category: 'Training', name: 'Corporate training package', quantity: 1, unitPrice: 6900, internalCost: 3300 },
      { id: 'qli-5', category: 'Venue', name: 'Venetian private table option', quantity: 1, unitPrice: 1500, internalCost: 1200, optional: true },
      { id: 'qli-6', category: 'Assets', name: 'Custom cards', quantity: 1, unitPrice: 2000, internalCost: 1200, optional: true }
    ],
    payment: {
      quoteTotal: 10400,
      amountPaid: 0,
      depositRequired: 5200,
      depositPaid: false,
      balanceDueDate: '2026-07-08',
      status: 'Invoice Sent'
    },
    staff: [
      { id: 'staff-4', name: 'Lead Pro TBD', role: 'Lead Instructor', confirmed: false, arrivalTime: '5:15 PM', rate: 450 },
      { id: 'staff-5', name: 'Dealer TBD', role: 'Dealer', confirmed: false, arrivalTime: '5:30 PM', rate: 250 }
    ],
    compliance: [
      { id: 'venue-confirm', name: 'Private table confirmation', status: 'Pending', dueDate: '2026-06-21' },
      { id: 'fb-confirm', name: 'Food and beverage confirmation', status: 'Pending', dueDate: '2026-06-28' }
    ],
    tasks: [
      { id: 'task-3', title: 'Follow up on proposal', owner: 'Matt', dueDate: '2026-06-03', priority: 'High', status: 'Open' },
      { id: 'task-4', title: 'Confirm Venetian table availability', owner: 'Matt', dueDate: '2026-06-21', priority: 'High', status: 'Open' }
    ],
    postEvent: {
      clientFeedback: '',
      whatWentWell: '',
      painPoints: '',
      changesForNextTime: '',
      reviewRequested: false,
      reviewReceived: false,
      rebookingLikelihood: 'Medium'
    }
  },
  {
    id: 'evt-private-beginner-demo',
    eventName: 'Beginner Friends Private Lesson',
    company: 'Private Group Demo',
    contactName: 'Demo Guest',
    contactEmail: 'guest@example.com',
    contactPhone: '555-0120',
    eventType: 'Private Poker Lesson',
    status: 'Needs Discovery',
    eventDate: '2026-09-12',
    startTime: '1:00 PM',
    endTime: '4:00 PM',
    city: 'Las Vegas',
    state: 'NV',
    venue: 'Client suite or Spanish Trail',
    guestCount: 6,
    studentCount: 6,
    skillLevel: 'Beginner',
    leadSource: 'Organic SEO',
    probabilityToClose: 50,
    eventGoal: 'Help a beginner group learn enough to feel confident before playing in Las Vegas.',
    eventFormat: '2-3 hour beginner-friendly private group lesson with world-class pro instructor.',
    clientExpectations: 'Fun, not intimidating, clear basics, table confidence.',
    knownRisks: ['Location not confirmed', 'Group may need simple pricing explanation'],
    nextAction: 'Send tightened pricing options for 2-hour and 3-hour lessons.',
    nextActionDue: '2026-06-02',
    quote: [
      { id: 'qli-7', category: 'Training', name: '3-hour private beginner group lesson', quantity: 1, unitPrice: 2850, internalCost: 1350 },
      { id: 'qli-8', category: 'Venue', name: 'Spanish Trail private setting fee', quantity: 1, unitPrice: 100, internalCost: 100, optional: true }
    ],
    payment: {
      quoteTotal: 2950,
      amountPaid: 0,
      depositRequired: 1475,
      depositPaid: false,
      balanceDueDate: '2026-09-02',
      status: 'Not Invoiced'
    },
    staff: [
      { id: 'staff-6', name: 'Instructor TBD', role: 'Private Lesson Pro', confirmed: false, arrivalTime: '12:30 PM', rate: 450 }
    ],
    compliance: [
      { id: 'location', name: 'Lesson location confirmation', status: 'Pending', dueDate: '2026-08-12' }
    ],
    tasks: [
      { id: 'task-5', title: 'Send private lesson pricing options', owner: 'Matt', dueDate: '2026-06-02', priority: 'High', status: 'Open' }
    ],
    postEvent: {
      clientFeedback: '',
      whatWentWell: '',
      painPoints: '',
      changesForNextTime: '',
      reviewRequested: false,
      reviewReceived: false,
      rebookingLikelihood: 'Medium'
    }
  }
];
