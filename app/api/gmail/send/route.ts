import {
  authorizeSyncRequest,
  base64Url,
  encodedSubject,
  gmailConfigured,
  gmailEnvironment,
  gmailFetch,
  safeHeader,
} from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SendPayload = { to?: unknown; subject?: unknown; body?: unknown };
type GmailSendResult = { id: string; threadId: string; labelIds?: string[] };

export async function POST(request: Request) {
  if (!gmailConfigured()) {
    return Response.json({ message: 'Gmail is not configured on the server.' }, { status: 503 });
  }
  if (!authorizeSyncRequest(request)) {
    return Response.json({ message: 'Invalid or missing LVPT Gmail sync key.' }, { status: 401 });
  }

  let payload: SendPayload;
  try {
    payload = (await request.json()) as SendPayload;
  } catch {
    return Response.json({ message: 'The request body must be valid JSON.' }, { status: 400 });
  }

  const to = safeHeader(payload.to, 320);
  const subject = safeHeader(payload.subject, 200);
  const body = String(payload.body || '').trim().slice(0, 25000);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(to) || !subject || !body) {
    return Response.json({ message: 'A valid recipient, subject and message body are required.' }, { status: 400 });
  }

  const rawMessage = [
    `From: Las Vegas Poker Training <${gmailEnvironment.accountEmail}>`,
    `To: ${to}`,
    `Subject: ${encodedSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ].join('\r\n');

  try {
    const result = await gmailFetch<GmailSendResult>('/messages/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw: base64Url(rawMessage) }),
    });
    return Response.json({ sent: true, id: result.id, threadId: result.threadId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send the Gmail message.';
    return Response.json({ message }, { status: 502 });
  }
}
