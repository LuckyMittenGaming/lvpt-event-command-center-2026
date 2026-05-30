export type EventStatus =
  | 'New Lead'
  | 'Needs Discovery'
  | 'Quote Needed'
  | 'Proposal Sent'
  | 'Invoice Sent'
  | 'Deposit Paid'
  | 'Booked'
  | 'Pre-Production'
  | 'Event Day'
  | 'Completed'
  | 'Post-Event Follow-Up'
  | 'Closed Won'
  | 'Closed Lost';

export type TaskStatus = 'Open' | 'In Progress' | 'Complete' | 'Blocked';

export type EventTask = {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: TaskStatus;
};

export type QuoteLineItem = {
  id: string;
  category: string;
  name: string;
  quantity: number;
  unitPrice: number;
  internalCost: number;
  optional?: boolean;
};

export type StaffAssignment = {
  id: string;
  name: string;
  role: string;
  confirmed: boolean;
  arrivalTime: string;
  rate: number;
  notes?: string;
};

export type ComplianceItem = {
  id: string;
  name: string;
  status: 'Not Needed' | 'Needed' | 'Pending' | 'Complete';
  dueDate?: string;
};

export type PaymentRecord = {
  quoteTotal: number;
  amountPaid: number;
  depositRequired: number;
  depositPaid: boolean;
  balanceDueDate: string;
  status: 'Not Invoiced' | 'Invoice Sent' | 'Payment Initiated' | 'Deposit Paid' | 'Paid In Full' | 'Overdue';
};

export type LVPTEvent = {
  id: string;
  eventName: string;
  company: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  eventType: string;
  status: EventStatus;
  eventDate: string;
  startTime: string;
  endTime: string;
  city: string;
  state: string;
  venue: string;
  guestCount: number;
  studentCount: number;
  skillLevel: string;
  leadSource: string;
  probabilityToClose: number;
  eventGoal: string;
  eventFormat: string;
  clientExpectations: string;
  knownRisks: string[];
  nextAction: string;
  nextActionDue: string;
  quote: QuoteLineItem[];
  payment: PaymentRecord;
  staff: StaffAssignment[];
  compliance: ComplianceItem[];
  tasks: EventTask[];
  postEvent: {
    clientFeedback: string;
    whatWentWell: string;
    painPoints: string;
    changesForNextTime: string;
    reviewRequested: boolean;
    reviewReceived: boolean;
    rebookingLikelihood: 'Low' | 'Medium' | 'High';
  };
};
