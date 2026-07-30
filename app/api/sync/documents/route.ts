import { appsScriptRequest, authorizeAppRequest, serverError, unauthorizedResponse } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 8 * 1024 * 1024;

export async function POST(request: Request) {
  if (!authorizeAppRequest(request)) return unauthorizedResponse();
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return Response.json({ message: 'A file is required.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ message: 'Cloud uploads are limited to 8 MB per file.' }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const data = await appsScriptRequest('uploadDocument', {
      documentId: String(form.get('documentId') || ''),
      eventId: String(form.get('eventId') || ''),
      eventName: String(form.get('eventName') || ''),
      eventDate: String(form.get('eventDate') || ''),
      actor: String(form.get('actor') || 'Unknown'),
      category: String(form.get('category') || 'Miscellaneous'),
      vendor: String(form.get('vendor') || ''),
      amount: Number(form.get('amount') || 0),
      documentDate: String(form.get('documentDate') || ''),
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataBase64: bytes.toString('base64'),
    });
    return Response.json(data);
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: Request) {
  if (!authorizeAppRequest(request)) return unauthorizedResponse();
  try {
    const body = (await request.json()) as { driveFileId?: string };
    if (!body.driveFileId) return Response.json({ message: 'driveFileId is required.' }, { status: 400 });
    const data = await appsScriptRequest('deleteDocument', { driveFileId: body.driveFileId });
    return Response.json(data);
  } catch (error) {
    return serverError(error);
  }
}
