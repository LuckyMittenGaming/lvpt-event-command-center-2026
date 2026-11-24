import { jsonNoStore } from '../sms/staging/_lib';
import { privateReadDecision } from '../../../lib/owner-read-guard.mjs';

export function denyPrivateRead(request: Request): Response | null {
  const decision = privateReadDecision(request);
  if (decision.allow) return null;
  return jsonNoStore({
    ok: false,
    reason: decision.reason,
    readOnly: true,
    sendEnabled: false
  }, decision.status);
}
