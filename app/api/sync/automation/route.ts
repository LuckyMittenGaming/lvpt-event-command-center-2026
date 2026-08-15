import {
  appsScriptRequest,
  authorizeAppRequest,
  serverError,
  unauthorizedResponse,
} from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!authorizeAppRequest(request)) return unauthorizedResponse();
  try {
    return Response.json(await appsScriptRequest('automationStatus'));
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  if (!authorizeAppRequest(request)) return unauthorizedResponse();
  try {
    const body = await request.json().catch(() => ({}));
    const command = String(body.command || 'scan');
    const action = command === 'install' ? 'installClientLifecycleTriggers'
      : command === 'review' ? 'reviewAutomationItem'
        : 'scanClientLifecycle';
    return Response.json(await appsScriptRequest(action, body));
  } catch (error) {
    return serverError(error);
  }
}
