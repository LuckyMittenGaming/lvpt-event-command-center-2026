import { timingSafeEqual } from 'node:crypto';

export const syncEnvironment = {
  appsScriptUrl: process.env.APPS_SCRIPT_WEB_APP_URL || '',
  appsScriptSecret: process.env.APPS_SCRIPT_SHARED_SECRET || '',
  appSyncKey: process.env.LVPT_APP_SYNC_KEY || process.env.GMAIL_SYNC_KEY || '',
};

export function syncConfigured(): boolean {
  return Boolean(syncEnvironment.appsScriptUrl && syncEnvironment.appsScriptSecret);
}

function safeCompare(supplied: string, expected: string): boolean {
  if (!supplied || !expected) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function authorizeAppRequest(request: Request): boolean {
  return safeCompare(request.headers.get('x-lvpt-sync-key') || '', syncEnvironment.appSyncKey);
}

export async function appsScriptRequest<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!syncConfigured()) {
    throw new Error('Apps Script environment variables are incomplete.');
  }

  const response = await fetch(syncEnvironment.appsScriptUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      action,
      secret: syncEnvironment.appsScriptSecret,
    }),
    cache: 'no-store',
    redirect: 'follow',
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Apps Script returned an invalid response (${response.status}).`);
  }

  const result = data as { ok?: boolean; message?: string };
  if (!response.ok || result.ok === false) {
    throw new Error(result.message || `Apps Script request failed (${response.status}).`);
  }
  return data as T;
}

export function unauthorizedResponse(): Response {
  return Response.json({ message: 'Invalid LVPT app sync key.' }, { status: 401 });
}

export function serverError(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  return Response.json({ message }, { status: 500 });
}
