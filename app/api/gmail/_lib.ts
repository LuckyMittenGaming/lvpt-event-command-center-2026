import { timingSafeEqual } from 'node:crypto';

export const gmailEnvironment = {
  clientId: process.env.GMAIL_CLIENT_ID || '',
  clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
  refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
  accountEmail: process.env.GMAIL_ACCOUNT_EMAIL || 'book@pokertraininglasvegas.com',
  syncKey: process.env.GMAIL_SYNC_KEY || '',
};

export function gmailConfigured(): boolean {
  return Boolean(
    gmailEnvironment.clientId &&
      gmailEnvironment.clientSecret &&
      gmailEnvironment.refreshToken &&
      gmailEnvironment.syncKey,
  );
}

export function authorizeSyncRequest(request: Request): boolean {
  const supplied = request.headers.get('x-lvpt-sync-key') || '';
  const expected = gmailEnvironment.syncKey;
  if (!supplied || !expected) return false;

  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}

async function accessToken(): Promise<string> {
  if (!gmailConfigured()) {
    throw new Error('Gmail environment variables are incomplete.');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: gmailEnvironment.clientId,
      client_secret: gmailEnvironment.clientSecret,
      refresh_token: gmailEnvironment.refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });

  const payload = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || 'Google did not return a Gmail access token.');
  }
  return payload.access_token;
}

export async function gmailFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  const payload = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gmail API request failed (${response.status}).`);
  }
  return payload;
}

export function base64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function safeHeader(value: unknown, maxLength = 300): string {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function encodedSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}
