import { NextResponse } from 'next/server';

export async function GET() {
  const base = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/history`, { cache:'no-store' });
    const text = await response.text();
    if (!response.ok) return NextResponse.json({ error:`ComfyUI returned ${response.status}`, details:text }, { status:response.status });
    return new NextResponse(text, { status:200, headers:{'Content-Type':'application/json'} });
  } catch {
    return NextResponse.json({ error:'Could not reach ComfyUI' }, { status:503 });
  }
}
