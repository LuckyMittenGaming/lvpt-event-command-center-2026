/**
 * Read-only Business Expenses (Spent on Business) normalizer.
 * Graceful when the tab is missing, empty, or not returned by Apps Script.
 * Never merges into Direct Event Costs / Event Gross Profit.
 */

function text(value, max = 240) {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean.slice(0, max);
}

function amountCents(value, { alreadyCents = false } = {}) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (alreadyCents) return Math.round(value);
    // Sheet dollars are preferred for raw tab rows.
    return Math.round(value * 100);
  }
  const raw = String(value).replace(/[$,\s]/g, '');
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number >= 1e9) return null;
  return Math.round(alreadyCents ? number : number * 100);
}

export const BUSINESS_EXPENSE_HEADERS = [
  'expense_id',
  'date',
  'vendor',
  'category',
  'description',
  'amount',
  'payment_method',
  'status',
  'receipt_url',
  'notes'
];

export function normalizeBusinessExpense(row) {
  if (!row || typeof row !== 'object') return null;
  const expenseId = text(row.expense_id || row.expenseId || row.id, 120);
  const hasCentsField = row.amountCents != null || row.amount_cents != null;
  const amount = hasCentsField
    ? amountCents(row.amountCents ?? row.amount_cents, { alreadyCents: true })
    : amountCents(row.amount ?? row.amountDollars);
  return {
    expenseId,
    date: text(row.date || row.expenseDate || row.expense_date, 40),
    vendor: text(row.vendor || row.payee, 120),
    category: text(row.category, 80),
    description: text(row.description || row.memo, 280),
    amountCents: amount,
    paymentMethod: text(row.payment_method || row.paymentMethod, 80),
    status: text(row.status || 'Unknown', 80),
    receiptUrl: text(row.receipt_url || row.receiptUrl, 400),
    notes: text(row.notes, 400)
  };
}

/**
 * @param {unknown} rows
 * @returns {{
 *   available: boolean,
 *   rows: Array<ReturnType<typeof normalizeBusinessExpense>>,
 *   totalCents: number | null,
 *   coverage: 'complete' | 'empty' | 'unavailable',
 *   note: string
 * }}
 */
export function buildBusinessOverhead(rows) {
  if (rows == null) {
    return {
      available: false,
      rows: [],
      totalCents: null,
      coverage: 'unavailable',
      note: 'Business Expenses tab was not returned. Overhead is unavailable, not zero.'
    };
  }
  if (!Array.isArray(rows)) {
    return {
      available: false,
      rows: [],
      totalCents: null,
      coverage: 'unavailable',
      note: 'Business Expenses payload was not a list. Overhead is unavailable, not zero.'
    };
  }
  const normalized = rows
    .map(normalizeBusinessExpense)
    .filter((row) => row && (row.expenseId || row.vendor || row.amountCents != null));
  if (!normalized.length) {
    return {
      available: true,
      rows: [],
      totalCents: 0,
      coverage: 'empty',
      note: 'Business Expenses tab is empty. Direct Event Costs stay separate.'
    };
  }
  let total = 0;
  let gaps = 0;
  normalized.forEach((row) => {
    if (row.amountCents == null) gaps += 1;
    else total += row.amountCents;
  });
  return {
    available: true,
    rows: normalized,
    totalCents: gaps ? null : total,
    coverage: gaps ? 'incomplete' : 'complete',
    note: gaps
      ? 'Some overhead rows are missing amounts. Totals stay incomplete. Direct Event Costs stay separate.'
      : 'Business overhead (spent on business) is separate from Direct Event Costs and Event Gross Profit.'
  };
}
