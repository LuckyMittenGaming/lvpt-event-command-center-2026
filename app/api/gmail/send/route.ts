export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The older reminder button posted here after a browser confirm(). That is not
// owner approval. This route stays closed until a separate test proves the
// exact recipient, the exact message, and exactly one send.
export async function POST() {
  return Response.json({
    sent: false,
    message: 'Sending is disabled. A customer email needs owner approval for the exact recipient and message.'
  }, { status: 403 });
}
