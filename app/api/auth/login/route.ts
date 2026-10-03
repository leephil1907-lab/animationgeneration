import { NextResponse } from 'next/server';
import { signInServer } from '@/lib/server-auth';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const result = await signInServer(email, password);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 401 });
    return NextResponse.json({ ok: true, user: result.user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Authentication is not configured.' }, { status: 503 });
  }
}
