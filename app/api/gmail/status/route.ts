import { gmailConfigured, gmailEnvironment } from '../_lib';
import { denyPrivateRead } from '../sync/_owner-read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = denyPrivateRead(request);
  if (denied) return denied;

  const configured = gmailConfigured();
  return Response.json({
    configured,
    email: gmailEnvironment.accountEmail,
    message: configured
      ? 'Gmail server credentials are configured.'
      : 'Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_SYNC_KEY in Vercel.',
  });
}
