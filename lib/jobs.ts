/**
 * Job records shared by the Animate, Storyboard and Gallery surfaces.
 *
 * The original version of this file had no `promptId`, which made the whole
 * pipeline one-way: a job could be created and a ComfyUI prompt_id could be
 * returned by the queue route, but nothing ever connected the two. Gallery
 * outputs therefore stayed empty forever. `promptId` is the reconciliation key
 * and is now recorded at creation time.
 *
 * Two-tier storage: localStorage gives an instant paint on load, and every
 * mutation is mirrored to /api/jobs so work survives a cleared browser profile
 * and is visible from the storyboard.
 */

export type MotionaJobType = 'image' | 'video';
export type MotionaJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type JobOutput = {
  filename: string;
  subfolder: string;
  type: string;
  /** App-relative proxy URL; never a bare COMFYUI_URL, which the browser cannot reach. */
  url: string;
  kind: 'image' | 'video';
};

export type MotionaJob = {
  id: string;
  type: MotionaJobType;
  provider: 'comfyui';
  /** ComfyUI queue id. Absent only if queueing itself failed. */
  promptId?: string;
  /** Worker target label, e.g. 'ComfyUI / Wan2.1'. */
  worker?: string;
  workflow?: string;
  storyboardId?: string;
  shotId?: string;
  shotLabel?: string;
  /** Locked seed, so a character stays visually consistent across shots. */
  seed?: number;
  characterName?: string;
  status: MotionaJobStatus;
  createdAt: string;
  updatedAt: string;
  prompt?: string;
  error?: string;
  outputs: JobOutput[];
  /** How many times we re-polled; used to give up on vanished jobs. */
  pollCount?: number;
  /** Local account email that created the job, when signed in. */
  owner?: string;
};

const KEY = 'motiona-jobs';

/** Stamp records with the signed-in local account, when there is one. */
function localOwner(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const session = JSON.parse(window.localStorage.getItem('motiona-session') || 'null');
    return session?.email ? String(session.email) : undefined;
  } catch {
    return undefined;
  }
}
const MAX_LOCAL_JOBS = 200;

export const TERMINAL_STATUSES: MotionaJobStatus[] = ['completed', 'failed'];

export function isTerminal(status: MotionaJobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isVideoOutput(output: JobOutput): boolean {
  if (output.kind === 'video') return true;
  return /\.(mp4|webm|mov|gif)$/i.test(output.filename);
}

function browserStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Private-mode Safari throws on access; degrade to memory-only.
    return null;
  }
}

export function loadJobs(): MotionaJob[] {
  const store = browserStore();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeJob);
  } catch {
    return [];
  }
}

/**
 * Older records stored `outputs` as string[]. Normalise on read so the gallery
 * never has to special-case legacy rows.
 */
function normalizeJob(raw: any): MotionaJob {
  const outputs: JobOutput[] = Array.isArray(raw?.outputs)
    ? raw.outputs.map((entry: any) =>
        typeof entry === 'string'
          ? { filename: entry.split('/').pop() || entry, subfolder: '', type: 'output', url: entry, kind: /\.(mp4|webm|mov|gif)$/i.test(entry) ? 'video' : 'image' }
          : {
              filename: String(entry.filename || ''),
              subfolder: String(entry.subfolder || ''),
              type: String(entry.type || 'output'),
              url: String(entry.url || ''),
              kind: entry.kind === 'video' ? 'video' : 'image',
            },
      ).filter((entry: JobOutput) => entry.filename && entry.url)
    : [];

  return {
    id: String(raw?.id || crypto.randomUUID()),
    type: raw?.type === 'image' ? 'image' : 'video',
    provider: 'comfyui',
    promptId: raw?.promptId ? String(raw.promptId) : undefined,
    worker: raw?.worker ? String(raw.worker) : undefined,
    workflow: raw?.workflow ? String(raw.workflow) : undefined,
    storyboardId: raw?.storyboardId ? String(raw.storyboardId) : undefined,
    shotId: raw?.shotId ? String(raw.shotId) : undefined,
    shotLabel: raw?.shotLabel ? String(raw.shotLabel) : undefined,
    seed: typeof raw?.seed === 'number' ? raw.seed : undefined,
    characterName: raw?.characterName ? String(raw.characterName) : undefined,
    status: (['queued', 'running', 'completed', 'failed'] as const).includes(raw?.status) ? raw.status : 'queued',
    createdAt: String(raw?.createdAt || new Date().toISOString()),
    updatedAt: String(raw?.updatedAt || new Date().toISOString()),
    prompt: raw?.prompt ? String(raw.prompt) : undefined,
    error: raw?.error ? String(raw.error) : undefined,
    outputs,
    pollCount: typeof raw?.pollCount === 'number' ? raw.pollCount : 0,
    owner: raw?.owner ? String(raw.owner) : undefined,
  };
}

export function saveJob(job: MotionaJob): MotionaJob {
  const store = browserStore();
  if (!store) return job;
  const next = normalizeJob({ ...job, updatedAt: new Date().toISOString() });
  const jobs = [next, ...loadJobs().filter((entry) => entry.id !== next.id)].slice(0, MAX_LOCAL_JOBS);
  try {
    store.setItem(KEY, JSON.stringify(jobs));
  } catch {
    // Quota exceeded — keep the in-memory copy usable rather than throwing.
  }
  void mirrorToServer(next);
  return next;
}

export type CreateJobInput = {
  type: MotionaJobType;
  worker: string;
  prompt: string;
  promptId?: string;
  workflow?: string;
  storyboardId?: string;
  shotId?: string;
  shotLabel?: string;
  seed?: number;
  characterName?: string;
  status?: MotionaJobStatus;
  owner?: string;
};

export function createJob(input: CreateJobInput): MotionaJob {
  const now = new Date().toISOString();
  return saveJob({
    id: crypto.randomUUID(),
    type: input.type,
    provider: 'comfyui',
    promptId: input.promptId,
    worker: input.worker,
    workflow: input.workflow,
    storyboardId: input.storyboardId,
    shotId: input.shotId,
    shotLabel: input.shotLabel,
    seed: input.seed,
    characterName: input.characterName,
    owner: input.owner ?? localOwner(),
    status: input.status || (input.promptId ? 'queued' : 'failed'),
    createdAt: now,
    updatedAt: now,
    prompt: input.prompt,
    error: input.promptId ? undefined : 'Job was never accepted by ComfyUI.',
    outputs: [],
    pollCount: 0,
  });
}

/** Merge a server-resolved ComfyUI state back onto the local record. */
export function reconcileJob(
  job: MotionaJob,
  state: { status: MotionaJobStatus; outputs?: JobOutput[]; error?: string },
): MotionaJob {
  return saveJob({
    ...job,
    status: state.status,
    outputs: state.outputs?.length ? state.outputs : job.outputs,
    error: state.error ?? (state.status === 'failed' ? job.error : undefined),
    pollCount: (job.pollCount || 0) + 1,
  });
}

/** Union two job lists by id, keeping whichever copy was updated most recently. */
export function mergeJobs(a: MotionaJob[], b: MotionaJob[]): MotionaJob[] {
  const byId = new Map<string, MotionaJob>();
  for (const job of [...a, ...b].map(normalizeJob)) {
    const existing = byId.get(job.id);
    if (!existing) {
      byId.set(job.id, job);
      continue;
    }
    // A record with outputs wins; otherwise newest updatedAt wins.
    const existingScore = Date.parse(existing.updatedAt) + (existing.outputs.length ? 1e12 : 0);
    const incomingScore = Date.parse(job.updatedAt) + (job.outputs.length ? 1e12 : 0);
    if (incomingScore > existingScore) byId.set(job.id, job);
  }
  return [...byId.values()].sort((x, y) => Date.parse(y.updatedAt) - Date.parse(x.updatedAt));
}

export async function fetchServerJobs(): Promise<MotionaJob[]> {
  try {
    const response = await fetch('/api/jobs', { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.jobs) ? data.jobs.map(normalizeJob) : [];
  } catch {
    return [];
  }
}

/** Fire-and-forget mirror; the UI must never block on server persistence. */
async function mirrorToServer(job: MotionaJob): Promise<void> {
  try {
    await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job }),
    });
  } catch {
    // Offline or server unavailable — localStorage copy is still authoritative locally.
  }
}

export function clearJobs(): void {
  browserStore()?.removeItem(KEY);
}
