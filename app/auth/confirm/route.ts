import { NextResponse } from 'next/server';
import { signInServer } from '@/lib/server-auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') || 'email';
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/,'');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  if (!tokenHash || !supabaseUrl || !key) return NextResponse.redirect(new URL('/login?error=auth_not_configured', url));

  const response = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token_hash: tokenHash, type }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) return NextResponse.redirect(new URL('/login?error=confirmation_failed', url));

  const { cookies } = await import('next/headers');
  const jar = await cookies();
  jar.set('motiona-access', data.access_token, { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:3600 });
  if (data.refresh_token) jar.set('motiona-refresh', data.refresh_token, { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:60*60*24*30 });
  return NextResponse.redirect(new URL('/dashboard', url));
}
