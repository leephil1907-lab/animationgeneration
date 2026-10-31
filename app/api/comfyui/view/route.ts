import { NextRequest, NextResponse } from 'next/server';
import { safeComfyFilename } from '@/lib/api-security';
import { requireServerUser } from '@/lib/server-auth';
import { ownsComfyOutput } from '@/lib/comfy/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireServerUser();
  } catch {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const filename = params.get('filename') || '';
  if (!safeComfyFilename(filename)) {
    return NextResponse.json({ error: 'Invalid output filename.' }, { status: 400 });
  }

  const subfolder = params.get('subfolder') || '';
  if (subfolder.length > 240 || subfolder.includes('..') || subfolder.includes('\\')) {
    return NextResponse.json({ error: 'Invalid output subfolder.' }, { status: 400 });
  }

  const type = params.get('type') || 'output';
  if (!['output', 'input', 'temp'].includes(type)) {
    return NextResponse.json({ error: 'Invalid output type.' }, { status: 400 });
  }

  try {
    const allowed = await ownsComfyOutput(user.id, { filename, subfolder, type });
    if (!allowed) return NextResponse.json({ error: 'Output not found.' }, { status: 404 });

    const base = (process.env.COMFYUI_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const query = new URLSearchParams({ filename, subfolder, type });
    const response = await fetch(`${base}/view?${query.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'ComfyUI output unavailable.' }, { status: response.status });
    }

    return new NextResponse(await response.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Could not retrieve ComfyUI output.',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 503 });
  }
}
