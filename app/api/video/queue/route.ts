import { NextResponse } from 'next/server';
import { ComfyUiError, queuePrompt } from '@/lib/comfy/client';
import { buildShotPrompt, buildShotScene, buildWorkflow, describeGraphProblems, normalizeSettings, validateGraph, type Graph } from '@/lib/comfy/workflow';
import { detectTokens, substituteTokens, type TokenValues } from '@/lib/comfy/tokens';
import { moderatePrompt } from '@/lib/prompt-safety';
import { writeRecord } from '@/lib/storage';
import { framesFor } from '@/lib/storyboard';
import type { MotionaJob } from '@/lib/jobs';
import { requireSameOrigin, validateContentLength } from '@/lib/api-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type QueueBody = {
  /** Operator-imported ComfyUI API-format graph (the primary path). */
  workflow?: Record<string, unknown>;
  values?: TokenValues;
  /** Or build the scaffold from a storyboard shot. */
  shot?: any;
  board?: any;
  settings?: Record<string, unknown>;
  worker?: string;
  workflowName?: string;
  /** Exotic operator graphs can opt out of dangling-reference rejection. */
  skipValidation?: boolean;
};

/**
 * POST /api/video/queue
 *
 * This is the storyboard → worker handoff. It accepts either an imported
 * API-format workflow (token-substituted) or a storyboard shot (scaffold built),
 * screens the prompt, validates the graph, submits to ComfyUI, and persists a job
 * record carrying the returned prompt_id so the gallery can reconcile it later.
 */
export async function POST(req: Request) {
  const denied = requireSameOrigin(req) || validateContentLength(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as QueueBody;
    const worker = String(body.worker || 'ComfyUI video worker').slice(0, 120);

    /* ---------------------------------------------------------- 1. prompt */
    const shot = body.shot;
    const board = body.board;

    const promptText =
      String(body.values?.prompt || '').trim() ||
      (shot ? buildShotPrompt(
        board ? { name: board.characterName, traits: board.characterTraits, style: board.characterStyle } : undefined,
        shot,
      ) : '');

    if (!promptText) {
      return NextResponse.json(
        { error: 'Nothing to render. Supply a workflow with a __PROMPT__ token and values.prompt, or a storyboard shot with a prompt.' },
        { status: 400 },
      );
    }

    /* ------------------------------------------------------- 2. moderation */
    // Enforced here rather than left to the caller: this route is the only path
    // that reaches the video worker, so screening it closes the gap where
    // /api/moderate existed but the queue never consulted it.
    const moderation = moderatePrompt(promptText);
    if (!moderation.allowed) {
      return NextResponse.json(
        { error: moderation.reason, level: moderation.level, blocked: true },
        { status: 422 },
      );
    }

    /* ---------------------------------------------------------- 3. graph */
    const fps = Number(body.values?.fps || body.settings?.fps || 16);
    const frames = Number(body.values?.frames || (shot ? framesFor(shot, fps) : 16));
    const seed = Number.isFinite(Number(body.values?.seed))
      ? Math.abs(Math.floor(Number(body.values?.seed)))
      : Number.isFinite(Number(board?.masterSeed))
        ? Math.abs(Math.floor(Number(board.masterSeed)))
        : Math.floor(Math.random() * 2147483647);

    let graph: Graph;
    let usedTokens: string[] = [];

    if (body.workflow && typeof body.workflow === 'object') {
      const values: TokenValues = {
        ...body.values,
        prompt: promptText,
        seed,
        frames,
        fps,
        duration: Number(shot?.duration || body.values?.duration || 5),
        camera: String(shot?.camera || body.values?.camera || ''),
        scene: String(shot?.scene || body.values?.scene || ''),
        characterName: String(board?.characterName || body.values?.characterName || ''),
        characterTraits: String(board?.characterTraits || body.values?.characterTraits || ''),
      };
      usedTokens = detectTokens(body.workflow);
      graph = substituteTokens(body.workflow, values) as Graph;
    } else if (shot) {
      const settings = normalizeSettings({ ...(body.settings || {}), seed, frames, fps }, 'video');
      if (!settings.checkpoint) {
        return NextResponse.json(
          {
            error: 'No ComfyUI checkpoint selected for the built-in video scaffold.',
            hint: 'Set COMFYUI_VIDEO_CHECKPOINT, pass settings.checkpoint, or import an API-format workflow that already names its own checkpoint.',
          },
          { status: 400 },
        );
      }
      graph = buildWorkflow(
        {
          name: String(board?.characterName || 'Character'),
          traits: board?.characterTraits,
          style: board?.characterStyle,
        },
        // buildWorkflow adds the character identity itself, so pass only the
        // shot's own description — otherwise the character is stated twice.
        buildShotScene(shot),
        'video',
        String(body.values?.referenceFilename || '') || undefined,
        settings,
      );
    } else {
      return NextResponse.json({ error: 'Provide either an imported workflow or a storyboard shot.' }, { status: 400 });
    }

    /* ------------------------------------------------------ 4. validation */
    const problems = validateGraph(graph);
    if (problems.length && !body.skipValidation) {
      return NextResponse.json(
        {
          error: 'Workflow graph has unresolved node references',
          details: describeGraphProblems(problems),
          problems,
          hint: 'Re-export the workflow from ComfyUI in API format, or pass skipValidation:true for an exotic graph.',
        },
        { status: 400 },
      );
    }

    /* ---------------------------------------------------- 5. submit */
    let promptId: string;
    try {
      const queued = await queuePrompt(graph, 'motiona-video-worker');
      promptId = queued.promptId;
    } catch (error) {
      if (error instanceof ComfyUiError) {
        return NextResponse.json(
          {
            error: error.status === 503 ? 'ComfyUI is unreachable. Start it and confirm COMFYUI_URL.' : 'ComfyUI rejected the video workflow.',
            details: error.details,
            status: error.status,
          },
          { status: error.status },
        );
      }
      throw error;
    }

    /* ------------------------------------------------- 6. persist the job */
    const now = new Date().toISOString();
    const job: MotionaJob = {
      id: crypto.randomUUID(),
      type: 'video',
      provider: 'comfyui',
      promptId,
      worker,
      workflow: String(body.workflowName || worker).slice(0, 120),
      storyboardId: board?.id ? String(board.id) : undefined,
      shotId: shot?.id ? String(shot.id) : undefined,
      shotLabel: shot?.scene ? String(shot.scene).slice(0, 120) : undefined,
      seed,
      characterName: board?.characterName ? String(board.characterName) : undefined,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      prompt: promptText,
      outputs: [],
      pollCount: 0,
    };

    // Server-side write is what makes the gallery durable. If it fails the job
    // still ran, so report it rather than pretending the whole request failed.
    let persisted = true;
    try {
      await writeRecord('jobs', job.id, job);
    } catch {
      persisted = false;
    }

    return NextResponse.json({
      promptId,
      status: 'queued',
      worker,
      job,
      persisted,
      seed,
      frames,
      fps,
      usedTokens,
      validationWarnings: problems,
      moderation: { level: moderation.level },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Video queue failed.' },
      { status: 500 },
    );
  }
}
