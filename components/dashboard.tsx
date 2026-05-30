'use client';

import { useMemo, useState } from 'react';
import type { LVPTEvent } from '../types/event';

type DashboardProps = {
  initialEvents: LVPTEvent[];
};

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function quoteTotal(event: LVPTEvent) {
  return event.quote.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function internalCost(event: LVPTEvent) {
  return event.quote.reduce((sum, item) => sum + item.quantity * item.internalCost, 0);
}

function exportJson(events: LVPTEvent[]) {
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'lvpt-2026-events-export.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportCsv(events: LVPTEvent[]) {
  const rows = [
    ['Event', 'Company', 'Date', 'City', 'State', 'Status', 'Lead Source', 'Guests', 'Quote Total', 'Paid', 'Balance Due', 'Next Action'],
    ...events.map((event) => [
      event.eventName,
      event.company,
      event.eventDate,
      event.city,
      event.state,
      event.status,
      event.leadSource,
      String(event.guestCount),
      String(quoteTotal(event)),
      String(event.payment.amountPaid),
      String(Math.max(quoteTotal(event) - event.payment.amountPaid, 0)),
      event.nextAction,
    ]),
  ];

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'lvpt-2026-events-export.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

function generatePartnerReport(event: LVPTEvent, reportType: 'pre' | 'post') {
  const total = quoteTotal(event);
  const cost = internalCost(event);
  const profit = total - cost;
  const balance = Math.max(total - event.payment.amountPaid, 0);

  if (reportType === 'post') {
    return `LVPT POST-EVENT PARTNER REPORT\n\nEvent: ${event.eventName}\nClient/Company: ${event.company}\nDate: ${event.eventDate}\nLocation: ${event.venue}, ${event.city}, ${event.state}\nFinal/Expected Attendance: ${event.guestCount}\nFinal Revenue: ${money(total)}\nEstimated Internal Cost: ${money(cost)}\nEstimated Profit: ${money(profit)}\nPayment Status: ${event.payment.status}\nBalance Due: ${money(balance)}\n\nClient Feedback:\n${event.postEvent.clientFeedback || 'Not entered yet.'}\n\nWhat Went Well:\n${event.postEvent.whatWentWell || 'Not entered yet.'}\n\nPain Points:\n${event.postEvent.painPoints || 'Not entered yet.'}\n\nRecommended Changes Next Time:\n${event.postEvent.changesForNextTime || 'Not entered yet.'}\n\nReview Requested: ${event.postEvent.reviewRequested ? 'Yes' : 'No'}\nReview Received: ${event.postEvent.reviewReceived ? 'Yes' : 'No'}\nRebooking Likelihood: ${event.postEvent.rebookingLikelihood}\n\nNext Recommended Action:\n${event.nextAction}`;
  }

  return `LVPT PRE-EVENT PARTNER REPORT\n\nEvent: ${event.eventName}\nClient/Company: ${event.company}\nPrimary Contact: ${event.contactName} | ${event.contactEmail} | ${event.contactPhone}\nDate/Time: ${event.eventDate}, ${event.startTime} - ${event.endTime}\nLocation: ${event.venue}, ${event.city}, ${event.state}\nEvent Type: ${event.eventType}\nEvent Format: ${event.eventFormat}\nGuest Count: ${event.guestCount}\nStudent Count: ${event.studentCount}\nSkill Level: ${event.skillLevel}\nPipeline Status: ${event.status}\nClose Probability: ${event.probabilityToClose}%\n\nFinancial Summary:\nQuote Total: ${money(total)}\nAmount Paid: ${money(event.payment.amountPaid)}\nBalance Due: ${money(balance)}\nEstimated Internal Cost: ${money(cost)}\nEstimated Profit: ${money(profit)}\nDeposit Required: ${money(event.payment.depositRequired)}\nPayment Status: ${event.payment.status}\n\nClient Expectations:\n${event.clientExpectations}\n\nKnown Risks:\n${event.knownRisks.map((risk) => `- ${risk}`).join('\n')}\n\nStaffing Plan:\n${event.staff.map((staff) => `- ${staff.name} | ${staff.role} | Confirmed: ${staff.confirmed ? 'Yes' : 'No'} | Arrival: ${staff.arrivalTime}`).join('\n')}\n\nCompliance Status:\n${event.compliance.map((item) => `- ${item.name}: ${item.status}${item.dueDate ? ` | Due: ${item.dueDate}` : ''}`).join('\n')}\n\nOpen Tasks:\n${event.tasks.filter((task) => task.status !== 'Complete').map((task) => `- ${task.title} | Owner: ${task.owner} | Due: ${task.dueDate} | Priority: ${task.priority}`).join('\n') || 'No open tasks.'}\n\nNext Action:\n${event.nextAction}\nDue: ${event.nextActionDue}`;
}

export function Dashboard({ initialEvents }: DashboardProps) {
  const [events, setEvents] = useState(initialEvents);
  const [selectedId, setSelectedId] = useState(initialEvents[0]?.id ?? '');
  const [reportType, setReportType] = useState<'pre' | 'post'>('pre');
  const selected = events.find((event) => event.id === selectedId) ?? events[0];

  const stats = useMemo(() => {
    const quoted = events.reduce((sum, event) => sum + quoteTotal(event), 0);
    const collected = events.reduce((sum, event) => sum + event.payment.amountPaid, 0);
    const estimatedCost = events.reduce((sum, event) => sum + internalCost(event), 0);
    const openTasks = events.flatMap((event) => event.tasks).filter((task) => task.status !== 'Complete').length;
    const complianceGaps = events.flatMap((event) => event.compliance).filter((item) => ['Needed', 'Pending'].includes(item.status)).length;
    return {
      quoted,
      collected,
      outstanding: quoted - collected,
      profit: quoted - estimatedCost,
      openTasks,
      complianceGaps,
      averageEventValue: events.length ? quoted / events.length : 0,
    };
  }, [events]);

  function updateSelected(partial: Partial<LVPTEvent>) {
    setEvents((current) => current.map((event) => (event.id === selected.id ? { ...event, ...partial } : event)));
  }

  if (!selected) {
    return <main className="min-h-screen bg-zinc-950 p-8 text-white">No events loaded.</main>;
  }

  const total = quoteTotal(selected);
  const cost = internalCost(selected);
  const profit = total - cost;
  const report = generatePartnerReport(selected, reportType);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#3b0b0b,transparent_35%),linear-gradient(135deg,#09090b,#18181b_45%,#111827)] px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-amber-400/20 bg-black/50 p-6 shadow-2xl shadow-black/40 backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-300">Las Vegas Poker Training</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">2026 Event Command Center</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 sm:text-base">
                CRM, quote builder, staffing tracker, compliance board, payment overview, and partner reporting dashboard for LVPT poker training events.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => exportCsv(events)} className="rounded-full border border-zinc-600 px-4 py-2 text-sm font-bold text-white hover:border-amber-300">Export CSV</button>
              <button onClick={() => exportJson(events)} className="rounded-full bg-amber-300 px-4 py-2 text-sm font-black text-zinc-950 hover:bg-amber-200">Export JSON</button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Metric label="Quoted Revenue" value={money(stats.quoted)} />
          <Metric label="Collected" value={money(stats.collected)} />
          <Metric label="Outstanding" value={money(stats.outstanding)} />
          <Metric label="Est. Profit" value={money(stats.profit)} />
          <Metric label="Open Tasks" value={String(stats.openTasks)} />
          <Metric label="Compliance Gaps" value={String(stats.complianceGaps)} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.05fr_1.4fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">Events</h2>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-300">Avg {money(stats.averageEventValue)}</span>
            </div>
            <div className="space-y-3">
              {events.map((event) => (
                <button
                  key={event.id}
                  onClick={() => setSelectedId(event.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${event.id === selected.id ? 'border-amber-300 bg-amber-300/10' : 'border-white/10 bg-black/25 hover:border-white/30'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-white">{event.eventName}</h3>
                      <p className="mt-1 text-sm text-zinc-400">{event.company} · {event.city}, {event.state}</p>
                    </div>
                    <StatusBadge status={event.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-300">
                    <span>{event.eventDate}</span>
                    <span>{event.guestCount} guests</span>
                    <span>{money(quoteTotal(event))}</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-zinc-400">Next: {event.nextAction}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-xl">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Selected Event</p>
                  <h2 className="mt-2 text-2xl font-black text-white">{selected.eventName}</h2>
                  <p className="mt-2 text-sm text-zinc-400">{selected.eventType} · {selected.venue}</p>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <Info label="Date / Time" value={`${selected.eventDate} · ${selected.startTime} - ${selected.endTime}`} />
                <Info label="Location" value={`${selected.city}, ${selected.state}`} />
                <Info label="Guests / Students" value={`${selected.guestCount} / ${selected.studentCount}`} />
                <Info label="Lead Source" value={selected.leadSource} />
                <Info label="Probability" value={`${selected.probabilityToClose}%`} />
                <Info label="Next Action Due" value={selected.nextActionDue} />
              </div>

              <label className="mt-5 block text-sm font-bold text-zinc-300" htmlFor="status">Pipeline Status</label>
              <select
                id="status"
                value={selected.status}
                onChange={(event) => updateSelected({ status: event.target.value as LVPTEvent['status'] })}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-amber-300"
              >
                {['New Lead','Needs Discovery','Quote Needed','Proposal Sent','Invoice Sent','Deposit Paid','Booked','Pre-Production','Event Day','Completed','Post-Event Follow-Up','Closed Won','Closed Lost'].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>

              <label className="mt-4 block text-sm font-bold text-zinc-300" htmlFor="nextAction">Next Action</label>
              <textarea
                id="nextAction"
                value={selected.nextAction}
                onChange={(event) => updateSelected({ nextAction: event.target.value })}
                className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-amber-300"
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <Panel title="Quote + Payment">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Info label="Quote Total" value={money(total)} />
                  <Info label="Est. Cost" value={money(cost)} />
                  <Info label="Est. Profit" value={money(profit)} />
                </div>
                <div className="mt-4 space-y-2">
                  {selected.quote.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-sm">
                      <span>{item.name}{item.optional ? ' (Optional)' : ''}</span>
                      <strong>{money(item.quantity * item.unitPrice)}</strong>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-zinc-300">Payment Status: <strong className="text-white">{selected.payment.status}</strong></p>
              </Panel>

              <Panel title="Staffing">
                <div className="space-y-2">
                  {selected.staff.map((staff) => (
                    <div key={staff.id} className="rounded-xl bg-black/30 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <strong>{staff.name}</strong>
                        <span className={staff.confirmed ? 'text-emerald-300' : 'text-amber-300'}>{staff.confirmed ? 'Confirmed' : 'Pending'}</span>
                      </div>
                      <p className="mt-1 text-zinc-400">{staff.role} · Arrival {staff.arrivalTime}</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Compliance">
                <div className="space-y-2">
                  {selected.compliance.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-sm">
                      <span>{item.name}</span>
                      <span className="font-bold text-amber-300">{item.status}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Open Tasks">
                <div className="space-y-2">
                  {selected.tasks.map((task) => (
                    <div key={task.id} className="rounded-xl bg-black/30 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <strong>{task.title}</strong>
                        <span>{task.priority}</span>
                      </div>
                      <p className="mt-1 text-zinc-400">Owner: {task.owner} · Due: {task.dueDate} · {task.status}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <section className="rounded-3xl border border-amber-300/20 bg-black/40 p-5 shadow-xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Partner Report Generator</p>
                  <h2 className="mt-1 text-xl font-black text-white">Copy/Paste Report</h2>
                </div>
                <select value={reportType} onChange={(event) => setReportType(event.target.value as 'pre' | 'post')} className="rounded-full border border-white/10 bg-zinc-950 px-4 py-2 text-sm text-white">
                  <option value="pre">Pre-Event Report</option>
                  <option value="post">Post-Event Report</option>
                </select>
              </div>
              <textarea readOnly value={report} className="mt-4 min-h-96 w-full rounded-2xl border border-white/10 bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-200" />
              <button
                onClick={() => navigator.clipboard.writeText(report)}
                className="mt-4 rounded-full bg-amber-300 px-5 py-2 text-sm font-black text-zinc-950 hover:bg-amber-200"
              >
                Copy Partner Report
              </button>
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-4 shadow-xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-xl">
      <h2 className="mb-4 text-xl font-black text-white">{title}</h2>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const hot = ['Quote Needed', 'Proposal Sent', 'Invoice Sent', 'Booked', 'Pre-Production'];
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${hot.includes(status) ? 'bg-amber-300 text-zinc-950' : 'bg-white/10 text-zinc-200'}`}>
      {status}
    </span>
  );
}
