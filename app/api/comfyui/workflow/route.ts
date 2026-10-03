import { NextResponse } from 'next/server';
import { ComfyUiError, queuePrompt } from '@/lib/comfy/client';
import { describeGraphProblems, validateGraph, type Graph } from '@/lib/comfy/workflow';
import { detectTokens, substituteTokens, type TokenValues } from '@/lib/comfy/tokens';
import { requireSameOrigin, validateContentLength } from '@/lib/api-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = requireSameOrigin(request) || validateContentLength(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    if (!body?.workflow || typeof body.workflow !== 'object') return NextResponse.json({ error: 'workflow object is required' }, { status: 400 });
    const values: TokenValues = body.values || {};
    const usedTokens = detectTokens(body.workflow);
    const graph = substituteTokens(body.workflow, values) as Graph;
    const problems = validateGraph(graph);
    if (problems.length && !body.skipValidation) {
      return NextResponse.json({ error: 'Workflow graph has unresolved node references', details: describeGraphProblems(problems), problems, usedTokens }, { status: 400 });
    }
    const { promptId, raw } = await queuePrompt(graph, 'motiona-web-template');
    return NextResponse.json({ ok: true, promptId, usedTokens, validationWarnings: problems, result: raw });
  } catch (error) {
    if (error instanceof ComfyUiError) return NextResponse.json({ error: error.status === 503 ? 'ComfyUI is unreachable' : 'ComfyUI rejected the imported workflow', details: error.details }, { status: error.status });
    return NextResponse.json({ error: 'Could not submit workflow template', details: String(error) }, { status: 503 });
  }
}