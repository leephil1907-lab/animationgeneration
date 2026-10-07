import { NextResponse } from 'next/server';
import { getVideoTask } from '@/lib/generation';
import { readRecord, writeRecord } from '@/lib/storage';
import { requireSameOrigin } from '@/lib/api-security';
import { requireServerUser } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireSameOrigin(req);
  if (denied) return denied;
  try {
    const user = await requireServerUser();
    const { id } = await params;
    const stored: any = await readRecord('generation-tasks', id);
    if (stored && stored.owner !== user.id) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    const task = await getVideoTask(id);
    await writeRecord('generation-tasks', id, { ...(stored || {}), ...task, owner: user.id, updatedAt: new Date().toISOString() });
    return NextResponse.json(task);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not read generation task.' }, { status: 502 });
  }
}
