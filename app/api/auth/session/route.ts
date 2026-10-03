import { NextResponse } from 'next/server';
import { authConfigured, getServerUser } from '@/lib/server-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const user = await getServerUser();
  return NextResponse.json({ configured: authConfigured(), authenticated: Boolean(user), user: user || null });
}
