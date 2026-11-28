import { denyPrivateRead } from '../_owner-read';
import { appsScriptRequest, serverError } from '../_lib';
import { jsonNoStore } from '../../sms/staging/_lib';
import {
  validateEventOverridePayload,
  formatOverrideDiff,
  rejectBulkPayload,
  CHANGE_LOG_SOURCE
} from '../../../../lib/granular-sheet-writes.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/sync/event-override
 * Owner-session granular single-field Events override + Change Log append.
 * Bulk overwrite keys are rejected. Never rewrites an entire tab.
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

  const validated = validateEventOverridePayload(body);
  if (!validated.ok) {
    const status = validated.code === 'unauthorized' ? 401
      : validated.code === 'event_not_found' ? 404
        : validated.code === 'bulk_snapshot_rejected' ? 403
          : 400;
    return jsonNoStore({
      ok: false,
      writesPerformed: false,
      reason: validated.code,
      message: validated.message,
      unknown: validated.unknown || undefined
    }, status);
  }

  const actor = String(body.actor || 'Owner').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Owner';
  const idempotencyKey = validated.idempotencyKey || `event-override-${validated.eventId}-${validated.field}-${Date.now()}`;

  try {
    const data = await appsScriptRequest<{
      ok?: boolean;
      writesPerformed?: boolean;
      eventId?: string;
      field?: string;
      oldValue?: string;
      newValue?: string;
      note?: string;
      changeLog?: Record<string, unknown>;
      message?: string;
    }>('updateEventOverride', {
      eventId: validated.eventId,
      field: validated.field,
      value: validated.value,
      note: validated.note,
      actor,
      idempotencyKey,
      source: CHANGE_LOG_SOURCE
    });

    const oldValue = String(data.oldValue ?? '');
    const newValue = String(data.newValue ?? validated.value);
    return jsonNoStore({
      ok: true,
      writesPerformed: data.writesPerformed !== false,
      bulkOverwrite: false,
      eventId: validated.eventId,
      field: validated.field,
      oldValue,
      newValue,
      note: validated.note,
      diff: formatOverrideDiff(validated.field, oldValue, newValue),
      changeLog: data.changeLog || null,
      source: CHANGE_LOG_SOURCE
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
    message: 'Use POST for a single-field event override.'
  }, 405);
}
