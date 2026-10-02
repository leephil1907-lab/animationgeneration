import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const base = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
  try {
    const body = await request.json();
    if (!body?.prompt || typeof body.prompt !== 'object') return NextResponse.json({ error:'prompt must be an object' }, { status:400 });
    const response = await fetch(`${base.replace(/\/$/, '')}/prompt`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ prompt:body.prompt, client_id:body.clientId || 'animation-generation-studio' })
    });
    const text = await response.text();
    if (!response.ok) return NextResponse.json({ error:'ComfyUI rejected the workflow', details:text }, { status:response.status });
    return new NextResponse(text, { status:200, headers:{'Content-Type':'application/json'} });
  } catch {
    return NextResponse.json({ error:'Could not reach ComfyUI' }, { status:503 });
  }
}
