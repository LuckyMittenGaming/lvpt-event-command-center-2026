import { appsScriptRequest, syncConfigured, syncEnvironment } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!syncConfigured()) {
    return Response.json({
      configured: false,
      appKeyConfigured: Boolean(syncEnvironment.appSyncKey),
      message: 'Add APPS_SCRIPT_WEB_APP_URL and APPS_SCRIPT_SHARED_SECRET in Vercel.',
    });
  }

  try {
    const data = await appsScriptRequest<Record<string, unknown>>('status');
    return Response.json({
      ...data,
      configured: true,
      appKeyConfigured: Boolean(syncEnvironment.appSyncKey),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Apps Script status check failed.';
    return Response.json({ configured: false, appKeyConfigured: Boolean(syncEnvironment.appSyncKey), message }, { status: 502 });
  }
}
