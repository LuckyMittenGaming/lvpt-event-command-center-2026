import { appsScriptRequest, authorizeAppRequest, unauthorizedResponse } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RawRecord = Record<string, unknown>;

function text(value: unknown, max: number): string {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!clean || clean.includes('@')) return '';
  return clean.slice(0, max);
}

function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number < 1e9 ? number : null;
}

function payment(record: RawRecord) {
  return {
    paymentId: text(record.paymentId, 120),
    eventId: text(record.eventId, 120),
    invoiceNumber: text(record.invoiceNumber, 100),
    lineLabel: text(record.lineLabel, 80),
    counterparty: text(record.counterparty, 80),
    ledgerRole: text(record.ledgerRole, 40),
    invoiceTotal: amount(record.invoiceTotal),
    amountPaid: amount(record.amountPaid),
    balanceDue: amount(record.balanceDue),
    paymentStatus: text(record.paymentStatus || 'Unknown', 80),
    dueDate: text(record.dueDate, 25),
    paymentDate: text(record.paymentDate, 25)
  };
}

function payout(record: RawRecord) {
  return {
    payoutId: text(record.payoutId, 120),
    eventId: text(record.eventId, 120),
    payee: text(record.payee, 120),
    payoutType: text(record.payoutType, 80),
    amount: amount(record.amount),
    status: text(record.status || 'Unknown', 50),
    paidDate: text(record.paidDate, 25)
  };
}

export async function GET(request: Request) {
  if (!authorizeAppRequest(request)) return unauthorizedResponse();
  try {
    const data = await appsScriptRequest<RawRecord>('listReconciliationEvidence');
    const paymentRecords = Array.isArray(data.paymentRecords)
      ? data.paymentRecords.slice(0, 500).map((row) => payment(row as RawRecord)).filter((row) => row.paymentId && row.eventId)
      : [];
    const payouts = Array.isArray(data.payouts)
      ? data.payouts.slice(0, 500).map((row) => payout(row as RawRecord)).filter((row) => row.payoutId && row.eventId)
      : [];
    return Response.json({
      ok: true,
      readOnly: true,
      writesPerformed: false,
      bankVerified: false,
      paymentSourceStatus: Array.isArray(data.paymentRecords) ? 'command_center_all_payments' : 'not_connected',
      payoutSourceStatus: Array.isArray(data.payouts) ? 'command_center_ledger' : 'not_connected',
      paymentCount: paymentRecords.length,
      payoutCount: payouts.length,
      paymentRecords,
      payouts,
      serverTime: typeof data.serverTime === 'string' ? data.serverTime : '',
      sourceVerifiedAs: 'Command Center ledger only — not bank settlement evidence'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ledger read failed.';
    return Response.json({
      ok: false,
      readOnly: true,
      writesPerformed: false,
      paymentSourceStatus: 'not_connected',
      payoutSourceStatus: 'not_connected',
      paymentRecords: [],
      payouts: [],
      message
    }, { status: 502 });
  }
}
