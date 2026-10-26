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
    const mock = system?.mock === true;
    const productionMock = process.env.NODE_ENV === 'production' && mock;
    return NextResponse.json({
      configured: Boolean(process.env.COMFYUI_URL),
      connected: !productionMock,
      secure,
      host,
      port,
      mock,
      ...(productionMock ? { error: 'Mock worker detected in production; generation is disabled.' } : {}),
      system,
    }, productionMock ? { status: 503 } : undefined);
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
