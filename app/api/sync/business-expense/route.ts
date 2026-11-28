import { denyPrivateRead } from '../_owner-read';
import { appsScriptRequest, serverError } from '../_lib';
import { jsonNoStore } from '../../sms/staging/_lib';
import {
  validateBusinessExpensePayload,
  rejectBulkPayload,
  CHANGE_LOG_SOURCE
} from '../../../../lib/granular-sheet-writes.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/sync/business-expense
 * Owner-session append of one Business Expenses row + Change Log entry.
 * Bulk overwrite remains disabled.
 */
export async function POST(request: Request) {
  const denied = denyPrivateRead(request);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonNoStore({
      ok: false,
      writesPerformed: false,
      reason: 'invalid_json',
      message: 'Request body must be valid JSON.'
    }, 400);
  }

  const bulk = rejectBulkPayload(body);
  if (!bulk.ok) {
    return jsonNoStore({
      ok: false,
      writesPerformed: false,
      reason: bulk.code,
      message: bulk.message,
      bulkOverwrite: false
    }, 403);
  }

  const validated = validateBusinessExpensePayload(body);
  if (!validated.ok) {
    const status = validated.code === 'bulk_snapshot_rejected' ? 403 : 400;
    return jsonNoStore({
      ok: false,
      writesPerformed: false,
      reason: validated.code,
      message: validated.message,
      unknown: validated.unknown || undefined
    }, status);
  }

  const actor = String(body.actor || 'Owner').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Owner';
  const idempotencyKey = validated.idempotencyKey || `business-expense-${validated.expense.expense_id}`;

  try {
    const data = await appsScriptRequest<{
      ok?: boolean;
      writesPerformed?: boolean;
      expense?: Record<string, unknown>;
      changeLog?: Record<string, unknown>;
      message?: string;
    }>('appendBusinessExpense', {
      expense: validated.expense,
      actor,
      idempotencyKey,
      source: CHANGE_LOG_SOURCE
    });

    return jsonNoStore({
      ok: true,
      writesPerformed: data.writesPerformed !== false,
      bulkOverwrite: false,
      expense: data.expense || validated.expense,
      changeLog: data.changeLog || null,
      source: CHANGE_LOG_SOURCE,
      bankVerified: false,
      drawableCashCents: null
    }, 200);
  } catch (error) {
    const response = serverError(error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

export async function GET() {
  return jsonNoStore({
    ok: false,
    writesPerformed: false,
    reason: 'method_not_allowed',
    message: 'Use POST to append one business expense row.'
  }, 405);
}
