/**
 * Shared server-side ComfyUI client.
 *
 * Every route previously hand-rolled its own `fetch` against COMFYUI_URL with no
 * timeout and no retry, so a stalled ComfyUI instance would hang the request
 * until the platform killed it. This module centralises that behaviour.
 *
 * Deliberately server-only: it reads process.env and must never be imported into
 * a 'use client' component.
 */

export type ComfyUiOutputFile = {
  filename: string;
  subfolder: string;
  type: string;
  /** App-relative proxy URL, safe to hand to the browser. */
  url: string;
};

export type ComfyUiJobState = {
  /** Normalised onto the app's own status vocabulary. */
  status: 'queued' | 'running' | 'completed' | 'failed';
  promptId: string;
  outputs: ComfyUiOutputFile[];
  /** Raw ComfyUI status_str, kept for diagnostics. */
  raw?: string;
  error?: string;
  /** True when we simply could not reach ComfyUI at all. */
  unreachable?: boolean;
};

export class ComfyUiError extends Error {
  status: number;
  details?: string;
  constructor(message: string, status = 502, details?: string) {
    super(message);
    this.name = 'ComfyUiError';
    this.status = status;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT_MS = Number(process.env.COMFYUI_TIMEOUT_MS || 20000);
const DEFAULT_RETRIES = Number(process.env.COMFYUI_RETRIES ?? 1);

export function comfyBaseUrl(): string {
  return (process.env.COMFYUI_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
}

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: BodyInit;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Retry only covers transport failures and 5xx; 4xx is never retried. */
  retries?: number;
};

async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES } = options;
  const url = `${comfyBaseUrl()}${path}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
    try {
      const response = await fetch(url, {
        method,
        body,
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();

      if (!response.ok) {
        // 4xx means our request was wrong; retrying cannot help.
        throw new ComfyUiError(
          `ComfyUI returned ${response.status} for ${path}`,
          response.status >= 500 ? 502 : response.status,
          text.slice(0, 2000),
        );
      }
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    } catch (error) {
      lastError = error;
      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      const isComfy5xx = error instanceof ComfyUiError && error.status === 502;
      // Network failures and 5xx are worth another try; everything else is not.
      if (!isTimeout && !isComfy5xx && error instanceof ComfyUiError) throw error;
    }
  }

  if (lastError instanceof ComfyUiError) throw lastError;
  throw new ComfyUiError('ComfyUI is unreachable', 503, lastError instanceof Error ? lastError.message : String(lastError));
}

/** GET /system_stats — used as the connectivity probe. */
export async function getSystemStats(): Promise<Record<string, unknown>> {
  return request('/system_stats');
}

/**
 * POST /prompt — submit an API-format graph.
 * Returns the ComfyUI prompt_id that every later status lookup keys on.
 */
export async function queuePrompt(
  graph: Record<string, unknown>,
  clientId = 'motiona-worker',
): Promise<{ promptId: string; raw: unknown }> {
  const result = await request<Record<string, any>>('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
    // Submission can be slow on a busy queue; give it more headroom.
    timeoutMs: Math.max(DEFAULT_TIMEOUT_MS, 45000),
  });

  const promptId = result?.prompt_id;
  if (!promptId || typeof promptId !== 'string') {
    throw new ComfyUiError('ComfyUI accepted the workflow but returned no prompt_id', 502, JSON.stringify(result).slice(0, 1000));
  }
  return { promptId, raw: result };
}

/** GET /history — full or filtered to one prompt. */
export async function getHistory(promptId?: string): Promise<Record<string, any>> {
  return request(promptId ? `/history/${encodeURIComponent(promptId)}` : '/history');
}

/** GET /queue — what ComfyUI still has pending/running. */
export async function getQueue(): Promise<{ queue_running: any[]; queue_pending: any[] }> {
  return request('/queue');
}

/**
 * GET /object_info — model/LoRA discovery.
 * Optional node filter keeps the payload small on large installs.
 */
export async function getObjectInfo(nodeClass?: string): Promise<Record<string, any>> {
  return request(nodeClass ? `/object_info/${encodeURIComponent(nodeClass)}` : '/object_info', {
    timeoutMs: Math.max(DEFAULT_TIMEOUT_MS, 30000),
  });
}

/** POST /upload/image — hand ComfyUI a reference file, get back its input filename. */
export async function uploadImage(file: File): Promise<{ name: string; subfolder: string; type: string }> {
  const form = new FormData();
  form.append('image', file, file.name);
  form.append('type', 'input');
  form.append('overwrite', 'false');
  return request('/upload/image', { method: 'POST', body: form, timeoutMs: 60000 });
}

const OUTPUT_KINDS = ['images', 'gifs', 'videos'] as const;

/**
 * Flatten a ComfyUI history record's `outputs` into proxy URLs the browser can load.
 *
 * Outputs are routed through /api/comfyui/view rather than pointed straight at
 * COMFYUI_URL: the browser cannot reach a 127.0.0.1 backend, and the proxy keeps
 * ComfyUI off the public surface.
 */
export function extractOutputs(historyItem: any): ComfyUiOutputFile[] {
  const outputs = historyItem?.outputs;
  if (!outputs || typeof outputs !== 'object') return [];

  return Object.values(outputs).flatMap((nodeOutput: any) => {
    if (!nodeOutput || typeof nodeOutput !== 'object') return [];
    return OUTPUT_KINDS.flatMap((kind) => {
      const list = nodeOutput[kind];
      if (!Array.isArray(list)) return [];
      return list.map((file: any) => {
        const filename = String(file?.filename || '');
        const subfolder = String(file?.subfolder || '');
        const type = String(file?.type || 'output');
        const qs = new URLSearchParams({ filename, subfolder, type });
        return { filename, subfolder, type, url: `/api/comfyui/view?${qs.toString()}` };
      }).filter((file) => file.filename);
    });
  });
}

/**
 * Resolve a prompt_id into a normalised job state.
 *
 * ComfyUI's semantics are awkward and worth spelling out:
 *  - a prompt absent from /history is either still queued or still running;
 *    /queue is the only way to tell those apart
 *  - history entries carry `status.status_str` of 'success' or 'error'
 *  - a failed run may still hold partial outputs, so we surface both
 */
export async function resolveJobState(promptId: string): Promise<ComfyUiJobState> {
  let history: Record<string, any>;
  try {
    history = await getHistory(promptId);
  } catch (error) {
    return {
      status: 'running',
      promptId,
      outputs: [],
      unreachable: true,
      error: error instanceof Error ? error.message : 'ComfyUI is unreachable',
    };
  }

  const item = history?.[promptId];

  if (!item) {
    // Not in history yet — distinguish "waiting in line" from "actively rendering".
    try {
      const queue = await getQueue();
      const running = (queue.queue_running || []).some((entry: any) => entry?.[1] === promptId);
      return { status: running ? 'running' : 'queued', promptId, outputs: [] };
    } catch {
      // /queue unavailable; history absence is still most likely "not finished".
      return { status: 'queued', promptId, outputs: [] };
    }
  }

  const outputs = extractOutputs(item);
  const raw = String(item?.status?.status_str || '');
  const statusMessages: any[] = item?.status?.messages || [];
  const sawExecutionError = statusMessages.some((m) => Array.isArray(m) && m[0] === 'execution_error');

  if (raw === 'error' || sawExecutionError) {
    const detail = statusMessages.find((m) => Array.isArray(m) && m[0] === 'execution_error')?.[1];
    return {
      status: 'failed',
      promptId,
      outputs,
      raw,
      error: detail?.exception_message || detail?.current_node?.class_type
        ? `ComfyUI execution error${detail?.current_node?.class_type ? ` in ${detail.current_node.class_type}` : ''}${detail?.exception_message ? `: ${detail.exception_message}` : ''}`
        : 'ComfyUI reported an execution error',
    };
  }

  if (raw === 'success') return { status: 'completed', promptId, outputs, raw };

  // No explicit status_str: treat presence of outputs as completion.
  return { status: outputs.length > 0 ? 'completed' : 'running', promptId, outputs, raw };
}
