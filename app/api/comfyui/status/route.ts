import { NextResponse } from 'next/server';
import { comfyBaseUrl, getSystemStats } from '@/lib/comfy/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const base = comfyBaseUrl();
  let host = '';
  let port = '';
  let secure = false;
  try {
    const parsed = new URL(base);
    host = parsed.hostname;
    port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    secure = parsed.protocol === 'https:';
  } catch {}

  try {
    const system = await getSystemStats();
    return NextResponse.json({
      configured: Boolean(process.env.COMFYUI_URL),
      connected: true,
      secure,
      host,
      port,
      mock: Boolean(system?.mock),
      system,
    });
  } catch (error) {
    return NextResponse.json({
      configured: Boolean(process.env.COMFYUI_URL),
      connected: false,
      secure,
      host,
      port,
      error: error instanceof Error ? error.message : 'ComfyUI is unreachable',
    }, { status: 503 });
  }
}
