import { appsScriptRequest, authorizeAppRequest, serverError, unauthorizedResponse } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!authorizeAppRequest(request)) return unauthorizedResponse();
  try {
    const data = await appsScriptRequest<{ events: unknown[]; serverTime?: string }>('listEvents');
    return Response.json(data);
  } catch (error) {
    return serverError(error);
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
