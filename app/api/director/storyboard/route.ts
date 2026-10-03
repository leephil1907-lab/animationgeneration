import { NextResponse } from 'next/server';
import { requireSameOrigin } from '@/lib/api-security';
import { requireServerUser } from '@/lib/server-auth';
import { writeRecord } from '@/lib/storage';
import type { Storyboard } from '@/lib/storyboard';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  try {
    const user = await requireServerUser();
    const body = await request.json();
    const plan = body?.plan;
    if (!plan || !Array.isArray(plan.shots) || plan.shots.length === 0) {
      return NextResponse.json({ error: 'A Director plan with shots is required.' }, { status: 400 });
    }
    const now = new Date().toISOString();
    const board: Storyboard = {
      id: crypto.randomUUID(),
      title: String(plan.title || 'MOTIONA sequence').slice(0, 200),
      aspectRatio: '16:9',
      masterSeed: Math.floor(Math.random() * 2147483647),
      worker: 'ComfyUI / Wan2.1',
      owner: user.id,
      createdAt: now,
      updatedAt: now,
      characterName: typeof body.characterName === 'string' ? body.characterName.slice(0,120) : undefined,
      characterTraits: typeof body.characterTraits === 'string' ? body.characterTraits.slice(0,1000) : undefined,
      characterStyle: typeof plan.visualDirection === 'string' ? plan.visualDirection.slice(0,1000) : undefined,
      shots: plan.shots.slice(0, 50).map((shot: any, index: number) => ({
        id: crypto.randomUUID(),
        scene: String(shot.scene || `Shot ${index + 1}`).slice(0,200),
        duration: Math.min(60, Math.max(1, Math.round(Number(shot.duration) || 5))),
        prompt: String([shot.scene, shot.action, shot.camera, body.characterName ? `Character: ${body.characterName}` : ''].filter(Boolean).join('. ')).slice(0,4000),
        camera: mapCamera(String(shot.camera || 'Medium shot')),
        dialogue: String(shot.dialogue || '').slice(0,2000),
        status: 'draft',
      })),
    };
    await writeRecord('storyboards', board.id, board);
    return NextResponse.json({ ok: true, storyboard: board });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create storyboard.' }, { status: 500 });
  }
}

function mapCamera(camera: string) {
  const value = camera.toLowerCase();
  if (value.includes('close')) return 'Close-up';
  if (value.includes('wide') || value.includes('establish')) return 'Wide shot';
  if (value.includes('tracking') || value.includes('track')) return 'Tracking shot';
  if (value.includes('pov') || value.includes('point of view')) return 'POV';
  return 'Medium shot';
}
