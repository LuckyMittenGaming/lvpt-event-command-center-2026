import { appsScriptRequest, authorizeAppRequest, serverError, unauthorizedResponse } from '../_lib';
import { denyPrivateRead } from '../_owner-read';
import { jsonNoStore } from '../../sms/staging/_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = denyPrivateRead(request);
  if (denied) return denied;
  try {
    const data = await appsScriptRequest<{ events?: unknown[]; serverTime?: string }>('listEvents');
    if (!data || !Array.isArray(data.events)) {
      return jsonNoStore({
        ok: false,
        readOnly: true,
        writesPerformed: false,
        reason: 'events_unavailable',
        message: 'The sheet response did not include an event list. This is not an empty sheet.'
      }, 502);
    }
    const events = data.events;
    return jsonNoStore({
      ok: true,
      readOnly: true,
      writesPerformed: false,
      events,
      serverTime: data.serverTime || '',
      eventCount: events.length
    }, 200);
  } catch (error) {
    const response = serverError(error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

export async function POST(request: Request) {
  // Authentication primitives unchanged: invalid sync key still 401 before any write path.
  if (!authorizeAppRequest(request)) return unauthorizedResponse();
  // R09 gate: legacy bulk snapshot replacement stays disabled.
  // Authenticated callers still cannot invoke Apps Script / sheet mutation from this route.
  // The isolated granular event-mutation contract is not wired here.
  return Response.json({
    ok: false,
    writesPerformed: false,
    reason: 'bulk_event_mutation_disabled',
    message: 'Bulk event snapshot writes are disabled. Production editing remains off until owner-approved granular activation.'
  }, { status: 403 });
}
