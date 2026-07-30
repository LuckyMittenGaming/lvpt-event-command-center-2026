import { authorizeSyncRequest, gmailConfigured, gmailEnvironment, gmailFetch } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GmailList = { messages?: Array<{ id: string; threadId: string }> };
type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
};

function header(message: GmailMessage, name: string): string {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || '';
}

export async function GET(request: Request) {
  if (!gmailConfigured()) {
    return Response.json({ message: 'Gmail is not configured on the server.' }, { status: 503 });
  }
  if (!authorizeSyncRequest(request)) {
    return Response.json({ message: 'Invalid or missing LVPT Gmail sync key.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || 'newer_than:1y').slice(0, 1000);
  const max = Math.min(Math.max(Number(url.searchParams.get('max')) || 10, 1), 20);

  try {
    const params = new URLSearchParams({ q: query, maxResults: String(max) });
    const list = await gmailFetch<GmailList>(`/messages?${params.toString()}`);
    const messages = await Promise.all(
      (list.messages || []).map(async (item) => {
        const metadata = new URLSearchParams({ format: 'metadata' });
        ['Subject', 'From', 'To', 'Date'].forEach((name) => metadata.append('metadataHeaders', name));
        const message = await gmailFetch<GmailMessage>(`/messages/${item.id}?${metadata.toString()}`);
        return {
          id: message.id,
          threadId: message.threadId,
          subject: header(message, 'Subject'),
          from: header(message, 'From'),
          to: header(message, 'To'),
          date: header(message, 'Date') || (message.internalDate ? new Date(Number(message.internalDate)).toISOString() : ''),
          snippet: message.snippet || '',
          direction: header(message, 'From').includes(gmailEnvironment.accountEmail) ? 'sent' : 'received',
        };
      }),
    );

    return Response.json({ query, messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to search Gmail.';
    return Response.json({ message }, { status: 502 });
  }
}
