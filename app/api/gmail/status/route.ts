import { gmailConfigured, gmailEnvironment } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = gmailConfigured();
  return Response.json({
    configured,
    email: gmailEnvironment.accountEmail,
    message: configured
      ? 'Gmail server credentials are configured.'
      : 'Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_SYNC_KEY in Vercel.',
  });
}
