import { NextResponse } from 'next/server';

export async function GET() {
  const base = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/system_stats`, { cache: 'no-store' });
    if (!response.ok) return NextResponse.json({ connected:false, url:base, error:`ComfyUI returned ${response.status}` }, { status:502 });
    const data = await response.json();
    return NextResponse.json({ connected:true, url:base, mock:Boolean(data?.mock), system:data });
  } catch {
    return NextResponse.json({ connected:false, url:base, error:'ComfyUI is unreachable' }, { status:503 });
  }
}
