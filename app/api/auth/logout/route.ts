import { NextResponse } from 'next/server';
import { signOutServer } from '@/lib/server-auth';
export const runtime = 'nodejs';
export async function POST() { await signOutServer(); return NextResponse.json({ ok: true }); }
