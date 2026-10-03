import { NextResponse } from 'next/server';
import { resolveJobState } from '@/lib/comfy/client';
import { listRecords, readRecord, writeRecord } from '@/lib/storage';
import { isTerminal, type MotionaJob } from '@/lib/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Jobs whose ComfyUI prompt_id has vanished from history and never produced
 * output. After this many polls we stop reporting "queued" forever and mark the
 * job failed, so the gallery does not show a spinner indefinitely.
 */
const MAX_POLLS_BEFORE_GIVEUP = Number(process.env.MOTIONA_MAX_POLLS || 240);

/**
 * GET /api/video/job/[promptId]
 *
 * Reads the ComfyUI history record for a prompt_id and normalises it onto the
 * app's own status vocabulary, then mirrors the result onto the persisted job.
 *
 * The previous version returned ComfyUI's raw `status_str`, which yields 'error'
 * — a value outside MotionaJobStatus — so the client could not match on it. It
 * also never distinguished "still queued" from "still running", and never
 * updated the stored job, which is why gallery outputs stayed empty.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;

  if (!promptId || !promptId.trim()) {
    return NextResponse.json({ status: 'failed', error: 'A promptId is required' }, { status: 400 });
  }

  const state = await resolveJobState(promptId);

  // Locate the persisted job so its status and outputs advance too.
  let job = await findJobByPromptId(promptId);

  if (job) {
    const next: MotionaJob = {
      ...job,
      status: state.status,
      outputs: state.outputs.length ? mapOutputs(state.outputs) : job.outputs,
      error: state.error ?? (state.status === 'failed' ? job.error : undefined),
      pollCount: (job.pollCount || 0) + 1,
      updatedAt: new Date().toISOString(),
    };

    // Give up on jobs that will never resolve, rather than polling forever.
    if (!isTerminal(next.status) && (next.pollCount || 0) > MAX_POLLS_BEFORE_GIVEUP) {
      next.status = 'failed';
      next.error = `No ComfyUI result after ${next.pollCount} polls. The prompt_id may have been cleared from history.`;
    }

    // Only write on change; polling every second should not thrash the disk.
    if (changed(job, next)) {
      try {
        await writeRecord('jobs', next.id, next);
      } catch {
        // Persistence failure must not hide the status we just learned.
      }
      job = next;
    }
  }

  return NextResponse.json({
    status: state.status,
    promptId,
    outputs: state.outputs,
    error: state.error,
    unreachable: state.unreachable || false,
    raw: state.raw,
    job: job || null,
  });
}

function mapOutputs(outputs: { filename: string; subfolder: string; type: string; url: string }[]) {
  return outputs.map((output) => ({
    ...output,
    kind: (/\.(mp4|webm|mov|gif)$/i.test(output.filename) ? 'video' : 'image') as 'video' | 'image',
  }));
}

function changed(before: MotionaJob, after: MotionaJob): boolean {
  if (before.status !== after.status) return true;
  if (before.error !== after.error) return true;
  if (before.outputs.length !== after.outputs.length) return true;
  // Reached the give-up threshold check even when nothing else moved.
  return !isTerminal(before.status) && (after.pollCount || 0) > MAX_POLLS_BEFORE_GIVEUP;
}

/**
 * prompt_id is the lookup key clients hold, but jobs are stored under their own
 * id. Search the store; the collection is small and this runs at most once per
 * poll. An index can be added if job counts grow.
 */
async function findJobByPromptId(promptId: string): Promise<MotionaJob | null> {
  const direct = await readRecord<MotionaJob>('jobs', promptId);
  if (direct && direct.promptId === promptId) return direct;

  const jobs = await listRecords<MotionaJob>('jobs', 500);
  return jobs.find((job) => job.promptId === promptId) || null;
}
