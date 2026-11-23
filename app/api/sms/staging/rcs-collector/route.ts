import { jsonNoStore } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const LIBGM_COMMIT = 'ed5dc19eb2b4149ee242cf000c86a7150dca9947';

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === new URL(request.url).host.toLowerCase();
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === 'production') {
    return jsonNoStore({ ok: false, reason: 'preview_only', pairing: 'unpaired', sendEnabled: false }, 403);
  }
  if (!sameOrigin(request)) {
    return jsonNoStore({ ok: false, reason: 'same_origin_required', sendEnabled: false }, 403);
  }
  return jsonNoStore({
    ok: true,
    pairing: 'unpaired',
    connected: false,
    sendEnabled: false,
    markReadEnabled: false,
    lastSuccess: '',
    lastFailure: '',
    reconnects: 0,
    records: [],
    transports: ['SMS', 'RCS'],
    existingSmsRewritten: false,
    libgmCommit: LIBGM_COMMIT,
    protocolAck: 'A connected libgm session acks Google RPC responses. That is not a read receipt. This deployment is not connected and does not call MarkRead.',
    previewLimitation: 'Google includes a latest-message preview for every conversation before an allowlist can skip the full fetch. Non-approved previews must be discarded and never logged.',
    writesPerformed: false
  }, 200);
}
