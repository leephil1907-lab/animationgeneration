/**
 * Storyboard + timeline model.
 *
 * The original file defined the types and nothing else: boards lived only in a
 * component's useState, so a refresh discarded the whole sequence, and a shot's
 * `status` could never leave 'draft' because no code path ever handed a shot to
 * a worker. This adds the persistence and the handoff metadata.
 */

export type ShotStatus = 'draft' | 'queued' | 'running' | 'complete' | 'failed';

import type { JobOutput } from '@/lib/jobs';

export type Shot = {
  id: string;
  scene: string;
  /** Seconds of finished footage this shot should run for. */
  duration: number;
  prompt: string;
  camera: string;
  dialogue: string;
  characterId?: string;
  status: ShotStatus;
  /** Links the shot to its job record and its ComfyUI prompt_id. */
  jobId?: string;
  promptId?: string;
  /** Locked per-sequence so the character does not drift between shots. */
  seed?: number;
  error?: string;
  /** Rendered outputs, mirrored from the job once it completes. */
  outputs?: JobOutput[];
};

export type Storyboard = {
  id: string;
  title: string;
  aspectRatio: string;
  shots: Shot[];
  createdAt: string;
  updatedAt: string;
  /** Sequence-level identity anchor: one seed shared by every shot. */
  masterSeed?: number;
  characterName?: string;
  characterTraits?: string;
  characterStyle?: string;
  worker?: string;
  /** Checkpoint for the built-in scaffold path; ignored when a workflow is imported. */
  checkpoint?: string;
  /** Local account email that created the board, when signed in. */
  owner?: string;
};

export const CAMERA_MOVES = ['Wide shot', 'Medium shot', 'Close-up', 'Tracking shot', 'POV'] as const;

const KEY = 'motiona-storyboards';
const MAX_LOCAL_BOARDS = 25;

export function randomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

export function newStoryboard(title = 'Untitled sequence'): Storyboard {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    aspectRatio: '16:9',
    shots: [],
    createdAt: now,
    updatedAt: now,
    masterSeed: randomSeed(),
    worker: 'ComfyUI / Wan2.1',
  };
}

export function newShot(index: number): Shot {
  return {
    id: crypto.randomUUID(),
    scene: `Scene ${index}`,
    duration: 5,
    prompt: '',
    camera: 'Medium shot',
    dialogue: '',
    status: 'draft',
  };
}

/**
 * Aspect ratio → pixel dimensions, kept inside the adapter's 256–1536 clamp so
 * the value survives normalizeSettings unchanged.
 */
export function dimensionsFor(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 576, height: 1024 };
    case '1:1':
      return { width: 768, height: 768 };
    case '4:3':
      return { width: 896, height: 672 };
    case '21:9':
      return { width: 1344, height: 576 };
    case '16:9':
    default:
      return { width: 1024, height: 576 };
  }
}

/** Total intended runtime in seconds. */
export function totalRuntime(board: Storyboard): number {
  return board.shots.reduce((sum, shot) => sum + (Number(shot.duration) || 0), 0);
}

/** Frames needed at a given fps — what the video worker actually has to render. */
export function framesFor(shot: Shot, fps = 16): number {
  const seconds = Math.max(1, Number(shot.duration) || 1);
  // AnimateDiff-style models want a multiple of their context length.
  return Math.max(8, Math.round((seconds * fps) / 8) * 8);
}

export function formatRuntime(seconds: number): string {
  if (!seconds) return '0s';
  const mins = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${rest}s` : `${rest}s`;
}

export type ShotProgress = { draft: number; queued: number; running: number; complete: number; failed: number };

export function shotProgress(board: Storyboard): ShotProgress {
  return board.shots.reduce<ShotProgress>(
    (acc, shot) => {
      acc[shot.status] = (acc[shot.status] || 0) + 1;
      return acc;
    },
    { draft: 0, queued: 0, running: 0, complete: 0, failed: 0 },
  );
}

export function isShotRenderable(shot: Shot): boolean {
  return Boolean(shot.prompt.trim());
}

export function boardIsComplete(board: Storyboard): boolean {
  return board.shots.length > 0 && board.shots.every((shot) => shot.status === 'complete');
}

/* ------------------------------------------------------------------ *
 * Browser persistence (instant paint) — mirrored to /api/storyboards  *
 * ------------------------------------------------------------------ */

function browserStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadBoards(): Storyboard[] {
  const store = browserStore();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBoard(board: Storyboard): Storyboard {
  const store = browserStore();
  const next: Storyboard = { ...board, updatedAt: new Date().toISOString() };
  if (!store) return next;

  const boards = [next, ...loadBoards().filter((entry) => entry.id !== next.id)].slice(0, MAX_LOCAL_BOARDS);
  try {
    store.setItem(KEY, JSON.stringify(boards));
  } catch {
    // Quota exceeded — the server copy is still written by the caller.
  }
  return next;
}

/**
 * Fetch persisted boards from the storage adapter.
 *
 * The dashboard and storyboard hydrate from here so work survives a cleared
 * browser: localStorage is a cache, the server store is the record.
 */
export async function fetchServerBoards(): Promise<Storyboard[]> {
  try {
    const response = await fetch('/api/storyboards', { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.storyboards) ? data.storyboards : [];
  } catch {
    return [];
  }
}

/** Union two board lists by id, preferring whichever copy changed most recently. */
export function mergeBoards(a: Storyboard[], b: Storyboard[]): Storyboard[] {
  const byId = new Map<string, Storyboard>();
  for (const board of [...a, ...b]) {
    if (!board?.id) continue;
    const existing = byId.get(board.id);
    if (!existing) {
      byId.set(board.id, board);
      continue;
    }
    const existingScore = Date.parse(existing.updatedAt || existing.createdAt || '') || 0;
    const incomingScore = Date.parse(board.updatedAt || board.createdAt || '') || 0;
    if (incomingScore > existingScore) byId.set(board.id, board);
  }
  return [...byId.values()].sort(
    (x, y) => (Date.parse(y.updatedAt || y.createdAt || '') || 0) - (Date.parse(x.updatedAt || x.createdAt || '') || 0),
  );
}

export function deleteBoardLocal(id: string): Storyboard[] {
  const store = browserStore();
  if (!store) return [];
  const boards = loadBoards().filter((entry) => entry.id !== id);
  try {
    store.setItem(KEY, JSON.stringify(boards));
  } catch {
    // ignore
  }
  return boards;
}
