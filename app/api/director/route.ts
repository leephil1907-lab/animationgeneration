import { NextResponse } from 'next/server';
import { moderatePrompt } from '@/lib/prompt-safety';
import { requireSameOrigin, validateContentLength } from '@/lib/api-security';
import { requireServerUser } from '@/lib/server-auth';

export const runtime = 'nodejs';

type DirectorShot = {
  id: string;
  duration: number;
  scene: string;
  camera: string;
  action: string;
  dialogue: string;
  transition: string;
};

type DirectorPlan = {
  title: string;
  logline: string;
  visualDirection: string;
  shots: DirectorShot[];
  notes: string[];
  provider: 'openai' | 'local-planner';
};

function fallbackPlan(prompt: string, character?: string): DirectorPlan {
  const subject = character?.trim() || 'the main character';
  const clean = prompt.trim().replace(/\s+/g, ' ');
  const beats = [
    ['01', 3, 'Establish the environment and silhouette.', 'Wide establishing shot, slow push-in.', 'The character enters frame and pauses.', ''],
    ['02', 4, 'Move into the character and reveal intent.', 'Medium tracking shot, shallow depth of field.', 'The character turns toward the source of tension.', ''],
    ['03', 4, 'Deliver the central action.', 'Dynamic over-the-shoulder with a controlled arc.', 'The character acts decisively as the scene peaks.', ''],
    ['04', 3, 'Resolve on a memorable final image.', 'Close-up, gentle pull-back into negative space.', 'The character settles and holds the final pose.', ''],
  ] as const;
  return {
    title: clean.slice(0, 60) || 'Untitled sequence',
    logline: clean || `A focused sequence built around ${subject}.`,
    visualDirection: 'Cinematic contrast, coherent character continuity, motivated camera movement, and a clean visual endpoint.',
    shots: beats.map(([id,duration,scene,camera,action,dialogue]) => ({id,duration,scene:scene.replace('the character',subject),camera,action:action.replace('The character',subject),dialogue,transition:id==='04'?'end':'cut'})),
    notes: ['Local planner used because OPENAI_API_KEY is not configured.', 'Import the resulting shot descriptions into Storyboard, then choose an installed ComfyUI workflow for rendering.'],
    provider: 'local-planner',
  };
}

async function openAiPlan(prompt: string, character?: string): Promise<DirectorPlan | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_DIRECTOR_MODEL || 'gpt-5';
  const instruction = `You are MOTIONA Director. Turn a user's animation idea into a practical 4-8 shot storyboard. Return ONLY valid JSON with keys title, logline, visualDirection, shots, notes. Each shot must have id, duration (number seconds), scene, camera, action, dialogue, transition. Keep character continuity and make every shot renderable in an image/video generation workflow. No markdown.`;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      input: [{ role: 'system', content: instruction }, { role: 'user', content: JSON.stringify({ prompt, character }) }],
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const text = String(data?.output_text || '').trim().replace(/^\`\`\`json\s*/i, '').replace(/\`\`\`$/,'');
  try {
    const parsed = JSON.parse(text) as Omit<DirectorPlan,'provider'>;
    if (!parsed.title || !Array.isArray(parsed.shots)) return null;
    return { ...parsed, provider: 'openai' };
  } catch { return null; }
}

export async function POST(request: Request) {
  const denied = requireSameOrigin(request) || validateContentLength(request, 128 * 1024);
  if (denied) return denied;
  try {
    await requireServerUser();
    const body = await request.json();
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 8000) : '';
    const character = typeof body?.character === 'string' ? body.character.trim().slice(0, 2000) : '';
    if (!prompt) return NextResponse.json({ error: 'Describe the sequence you want to direct.' }, { status: 400 });
    const moderation = moderatePrompt(prompt);
    if (!moderation.allowed) return NextResponse.json({ error: moderation.reason, level: moderation.level, blocked: true }, { status: 422 });
    const plan = await openAiPlan(prompt, character) || fallbackPlan(prompt, character);
    return NextResponse.json(plan);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Director planning failed.' }, { status: 500 });
  }
}
