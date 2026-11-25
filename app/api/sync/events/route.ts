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
  if (!authorizeAppRequest(request)) return unauthorizedResponse();
  try {
    const body = (await request.json()) as { events?: unknown[]; actor?: string; reason?: string };
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return Response.json({ message: 'At least one event record is required.' }, { status: 400 });
    }
    const data = await appsScriptRequest('saveAllEvents', {
      events: body.events,
      actor: String(body.actor || 'Unknown').slice(0, 60),
      reason: String(body.reason || 'Command Center save').slice(0, 180),
    });
    return Response.json(data);
  } catch (error) {
    return serverError(error);
  }
}
