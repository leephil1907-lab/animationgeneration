import { NextResponse } from 'next/server';
import { byUpdatedDesc, listRecords, readRecord, storageLabel, writeRecord } from '@/lib/storage';
import type { MotionaJob } from '@/lib/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'jobs';
const MAX_PERSISTED = 500;

function sanitize(input: any): MotionaJob | null {
  if (!input || typeof input !== 'object') return null;
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : null;
  if (!id) return null;

  const status: MotionaJob['status'] = ['queued', 'running', 'completed', 'failed'].includes(input.status)
    ? input.status
    : 'queued';

  const outputs = Array.isArray(input.outputs)
    ? input.outputs
        .filter((entry: any) => entry && typeof entry === 'object' && entry.filename && entry.url)
        .slice(0, 50)
        .map((entry: any) => ({
          filename: String(entry.filename),
          subfolder: String(entry.subfolder || ''),
          type: String(entry.type || 'output'),
          // Only ever store app-relative proxy URLs; a bare ComfyUI host is
          // unreachable from the browser and would leak the local endpoint.
          url: String(entry.url).startsWith('/') ? String(entry.url) : `/api/comfyui/view?filename=${encodeURIComponent(entry.filename)}`,
          kind: entry.kind === 'video' ? 'video' : 'image',
        }))
    : [];

  const now = new Date().toISOString();
  return {
    id,
    type: input.type === 'image' ? 'image' : 'video',
    provider: 'comfyui',
    promptId: typeof input.promptId === 'string' && input.promptId ? input.promptId : undefined,
    worker: typeof input.worker === 'string' ? input.worker.slice(0, 120) : undefined,
    workflow: typeof input.workflow === 'string' ? input.workflow.slice(0, 120) : undefined,
    storyboardId: typeof input.storyboardId === 'string' ? input.storyboardId : undefined,
    shotId: typeof input.shotId === 'string' ? input.shotId : undefined,
    shotLabel: typeof input.shotLabel === 'string' ? input.shotLabel.slice(0, 120) : undefined,
    seed: Number.isFinite(Number(input.seed)) ? Math.abs(Math.floor(Number(input.seed))) : undefined,
    characterName: typeof input.characterName === 'string' ? input.characterName.slice(0, 120) : undefined,
    status,
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : now,
    prompt: typeof input.prompt === 'string' ? input.prompt.slice(0, 4000) : undefined,
    error: typeof input.error === 'string' ? input.error.slice(0, 1000) : undefined,
    outputs,
    pollCount: Number.isFinite(Number(input.pollCount)) ? Math.max(0, Math.floor(Number(input.pollCount))) : 0,
    owner: typeof input.owner === 'string' ? input.owner.slice(0, 200).toLowerCase() : undefined,
  };
}

/** GET /api/jobs — every persisted job, newest first. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storyboardId = searchParams.get('storyboardId');
    const id = searchParams.get('id');

    if (id) {
      const record = await readRecord<MotionaJob>(COLLECTION, id);
      if (!record) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      return NextResponse.json({ job: record, storage: storageLabel() });
    }

    let jobs = byUpdatedDesc(await listRecords<MotionaJob>(COLLECTION, MAX_PERSISTED));
    if (storyboardId) jobs = jobs.filter((job) => job.storyboardId === storyboardId);

    return NextResponse.json({ jobs, storage: storageLabel(), count: jobs.length });
  } catch (error) {
    return NextResponse.json({ error: 'Could not read job store', details: String(error) }, { status: 500 });
  }
}

/** POST /api/jobs — create or update one job record. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const job = sanitize(body?.job ?? body);
    if (!job) return NextResponse.json({ error: 'A job with an id is required' }, { status: 400 });

    // Merge rather than clobber: a poller posting a status update must not erase
    // outputs that an earlier reconciliation already recorded.
    const existing = await readRecord<MotionaJob>(COLLECTION, job.id);
    const merged: MotionaJob = existing
      ? {
          ...existing,
          ...job,
          outputs: job.outputs.length ? job.outputs : existing.outputs,
          createdAt: existing.createdAt,
          error: job.error ?? (job.status === 'failed' ? existing.error : undefined),
        }
      : job;

    await writeRecord(COLLECTION, merged.id, merged);
    return NextResponse.json({ ok: true, job: merged, storage: storageLabel() });
  } catch (error) {
    return NextResponse.json({ error: 'Could not write job', details: String(error) }, { status: 500 });
  }
}

/** DELETE /api/jobs?id=... — remove one job, or the whole store with no id. */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Pass ?id= to delete a specific job' }, { status: 400 });

    const { deleteRecord } = await import('@/lib/storage');
    const removed = await deleteRecord(COLLECTION, id);
    return NextResponse.json({ ok: true, removed });
  } catch (error) {
    return NextResponse.json({ error: 'Could not delete job', details: String(error) }, { status: 500 });
  }
}
