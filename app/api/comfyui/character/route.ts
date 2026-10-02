import { NextResponse } from 'next/server';
import { buildWorkflow, type CharacterProfile, type WorkflowMode } from '@/lib/comfy/workflow';

export async function POST(request: Request) {
  const base = (process.env.COMFYUI_URL || 'http://127.0.0.1:8188').replace(/\/$/,'');
  try {
    const body = await request.json();
    const character = body.character as CharacterProfile;
    const scene = String(body.scene || '');
    const mode = (body.mode === 'video' ? 'video' : 'image') as WorkflowMode;
    if (!character?.name) return NextResponse.json({error:'character.name is required'}, {status:400});
    const prompt = buildWorkflow(character, scene, mode, body.referenceFilename);
    const response = await fetch(`${base}/prompt`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt, client_id:'animation-generation-studio'}) });
    const text = await response.text();
    if (!response.ok) return NextResponse.json({error:'ComfyUI rejected the generated workflow',details:text,workflow:prompt},{status:response.status});
    return NextResponse.json({ok:true,mode,workflow:prompt,result:JSON.parse(text)});
  } catch (error) {
    return NextResponse.json({error:'Could not build or submit workflow',details:String(error)},{status:503});
  }
}
