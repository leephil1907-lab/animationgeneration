import { NextResponse } from 'next/server';
import { signUpServer } from '@/lib/server-auth';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body?.name || '').trim().slice(0, 100);
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      return NextResponse.json({ error: 'Enter a valid name, email and password of at least 8 characters.' }, { status: 400 });
    }
    const result = await signUpServer(email, password, name);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, user: result.user, confirmed: result.session, message: result.session ? 'Account created.' : 'Check your email to confirm your account.' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Authentication is not configured.' }, { status: 503 });
  }
}
