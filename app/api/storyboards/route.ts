import { NextResponse } from 'next/server';
import { requireSameOrigin } from '@/lib/api-security';
import { requireServerUser } from '@/lib/server-auth';
import { byUpdatedDesc, deleteRecord, listRecords, readRecord, storageLabel, writeRecord } from '@/lib/storage';
import { CAMERA_MOVES, type Shot, type Storyboard } from '@/lib/storyboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'storyboards';
const MAX_SHOTS = 200;

const SHOT_STATUSES: Shot['status'][] = ['draft', 'queued', 'running', 'complete', 'failed'];

function sanitizeShot(input: any, index: number): Shot {
  const duration = Number(input?.duration);
  return {
    id: typeof input?.id === 'string' && input.id ? input.id : crypto.randomUUID(),
    scene: String(input?.scene || `Scene ${index + 1}`).slice(0, 200),
    duration: Number.isFinite(duration) ? Math.min(60, Math.max(1, Math.round(duration))) : 5,
    prompt: String(input?.prompt || '').slice(0, 4000),
    camera: CAMERA_MOVES.includes(input?.camera) ? input.camera : 'Medium shot',
    dialogue: String(input?.dialogue || '').slice(0, 2000),
    characterId: typeof input?.characterId === 'string' ? input.characterId : undefined,
    status: SHOT_STATUSES.includes(input?.status) ? input.status : 'draft',
    jobId: typeof input?.jobId === 'string' ? input.jobId : undefined,
    promptId: typeof input?.promptId === 'string' ? input.promptId : undefined,
    seed: Number.isFinite(Number(input?.seed)) ? Math.abs(Math.floor(Number(input.seed))) : undefined,
    error: typeof input?.error === 'string' ? input.error.slice(0, 1000) : undefined,
    outputs: Array.isArray(input?.outputs)
      ? input.outputs
          .filter((entry: any) => entry && typeof entry === 'object' && entry.filename && entry.url)
          .slice(0, 20)
          .map((entry: any) => ({
            filename: String(entry.filename),
            subfolder: String(entry.subfolder || ''),
            type: String(entry.type || 'output'),
            url: String(entry.url).startsWith('/') ? String(entry.url) : `/api/comfyui/view?filename=${encodeURIComponent(entry.filename)}`,
            kind: entry.kind === 'video' ? 'video' : 'image',
          }))
      : undefined,
  };
}

function sanitize(input: any): Storyboard | null {
  if (!input || typeof input !== 'object') return null;
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : null;
  if (!id) return null;

  const now = new Date().toISOString();
  const shots = Array.isArray(input.shots) ? input.shots.slice(0, MAX_SHOTS).map(sanitizeShot) : [];

  return {
    id,
    title: String(input.title || 'Untitled sequence').slice(0, 200),
    aspectRatio: ['16:9', '9:16', '1:1', '4:3', '21:9'].includes(input.aspectRatio) ? input.aspectRatio : '16:9',
    shots,
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : now,
    masterSeed: Number.isFinite(Number(input.masterSeed)) ? Math.abs(Math.floor(Number(input.masterSeed))) : undefined,
    characterName: typeof input.characterName === 'string' ? input.characterName.slice(0, 120) : undefined,
    characterTraits: typeof input.characterTraits === 'string' ? input.characterTraits.slice(0, 1000) : undefined,
    characterStyle: typeof input.characterStyle === 'string' ? input.characterStyle.slice(0, 1000) : undefined,
    worker: typeof input.worker === 'string' ? input.worker.slice(0, 120) : undefined,
    checkpoint: typeof input.checkpoint === 'string' ? input.checkpoint.slice(0, 200) : undefined,
    owner: typeof input.owner === 'string' ? input.owner.slice(0, 200).toLowerCase() : undefined,
  };
}

/** GET /api/storyboards — list all, or ?id= for one. */
export async function GET(request: Request) {
  const denied = requireSameOrigin(request); if (denied) return denied;
  try { const user = await requireServerUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const board = await readRecord<Storyboard>(COLLECTION, id);
      if (board && board.owner !== user.id) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
      if (!board) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
      return NextResponse.json({ storyboard: board, storage: storageLabel() });
    }

    const boards = byUpdatedDesc(await listRecords<Storyboard>(COLLECTION, 100)).filter((board) => board.owner === user.id);
    return NextResponse.json({ storyboards: boards, storage: storageLabel(), count: boards.length });
  } catch (error) {
    return NextResponse.json({ error: 'Could not read storyboards', details: String(error) }, { status: 500 });
  }
}

/** POST /api/storyboards — create or update one board. */
export async function POST(request: Request) {
  const denied = requireSameOrigin(request); if (denied) return denied;
  try { const user = await requireServerUser();
    const body = await request.json();
    const board = sanitize(body?.storyboard ?? body);
    if (!board) return NextResponse.json({ error: 'A storyboard with an id is required' }, { status: 400 });

    board.owner = user.id;
    const existing = await readRecord<Storyboard>(COLLECTION, board.id);
    if (existing && existing.owner !== user.id) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
    const merged: Storyboard = existing ? { ...existing, ...board, createdAt: existing.createdAt } : board;

    await writeRecord(COLLECTION, merged.id, merged);
    return NextResponse.json({ ok: true, storyboard: merged, storage: storageLabel() });
  } catch (error) {
    return NextResponse.json({ error: 'Could not write storyboard', details: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = requireSameOrigin(request); if (denied) return denied;
  try { const user = await requireServerUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Pass ?id= to delete a storyboard' }, { status: 400 });
    const existing = await readRecord<Storyboard>(COLLECTION, id);
    if (!existing || existing.owner !== user.id) return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
    const removed = await deleteRecord(COLLECTION, id);
    return NextResponse.json({ ok: true, removed });
  } catch (error) {
    return NextResponse.json({ error: 'Could not delete storyboard', details: String(error) }, { status: 500 });
  }
}
