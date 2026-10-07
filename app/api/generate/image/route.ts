import { NextResponse } from 'next/server';
import { generateImage } from '@/lib/generation';
import { moderatePrompt } from '@/lib/prompt-safety';
import { requireSameOrigin, validateContentLength } from '@/lib/api-security';
import { requireServerUser } from '@/lib/server-auth';
import { writeRecord } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = requireSameOrigin(req) || validateContentLength(req);
  if (denied) return denied;
  try {
    const user = await requireServerUser();
    const body = await req.json();
    const prompt = String(body?.prompt || '').trim().slice(0, 20000);
    if (!prompt) return NextResponse.json({ error: 'A generation prompt is required.' }, { status: 400 });
    const moderation = moderatePrompt(prompt);
    if (!moderation.allowed) return NextResponse.json({ error: moderation.reason, blocked: true }, { status: 422 });
    const task = await generateImage({
      prompt,
      model: body?.model,
      style: body?.style,
      width: Number(body?.width || 768),
      height: Number(body?.height || 1024),
      count: Number(body?.count || 1),
      characterId: body?.characterId,
      userId: user.id,
    });
    await writeRecord('generation-tasks', task.id, { ...task, owner: user.id, prompt, createdAt: new Date().toISOString() });
    return NextResponse.json(task);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Image generation failed.' }, { status: 502 });
  }
}
