import { NextResponse } from 'next/server';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

export function requireSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  try {
    const requestOrigin = new URL(request.url).origin;
    if (origin === requestOrigin) return null;
  } catch {}
  return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
}

export function validateContentLength(request: Request, maxBytes = MAX_BODY_BYTES): NextResponse | null {
  const raw = request.headers.get('content-length');
  if (!raw) return null;
  const length = Number(raw);
  if (Number.isFinite(length) && length > maxBytes) {
    return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
  }
  return null;
}

export function safeComfyFilename(value: string): boolean {
  if (!value || value.length > 240) return false;
  if (value.includes('\\') || value.includes('..')) return false;
  return /^[a-zA-Z0-9._ -]+$/.test(value);
}
