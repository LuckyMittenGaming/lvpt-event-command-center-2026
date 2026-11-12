// AI Gateway credentials are server-only. Vercel injects its OIDC token
// into the *function request header* at runtime (not always process.env).
// The authenticated review endpoints calling this helper are restricted to
// HTTPS same-origin browser sessions. Never return the token to clients.
export type AiGatewayAuthMethod='api_key'|'vercel_oidc';
export type AiGatewayCredential={token:string;method:AiGatewayAuthMethod};

const jwtShape=/^[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}$/;
function validOidcToken(token:string):boolean {
  return token.length>=100 && token.length<=16000 && jwtShape.test(token);
}

export function getAiGatewayCredential(request:Request):AiGatewayCredential|null {
  const key=(process.env.AI_GATEWAY_API_KEY||'').trim();
  if(key.length>=20 && key.length<=16000)
    return {token:key,method:'api_key'};

  // Vercel Functions receive a runtime-injected header. Do not rely solely
  // on process.env.VERCEL_OIDC_TOKEN, which can exist at build time only.
  // Never take this from a browser input or client JSON field.
  const runtimeToken=(request.headers.get('x-vercel-oidc-token')||'').trim();
  if(validOidcToken(runtimeToken))
    return {token:runtimeToken,method:'vercel_oidc'};

  const environmentToken=(process.env.VERCEL_OIDC_TOKEN||'').trim();
  if(validOidcToken(environmentToken))
    return {token:environmentToken,method:'vercel_oidc'};
  return null;
}
