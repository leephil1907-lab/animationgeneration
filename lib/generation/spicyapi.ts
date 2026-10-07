import type { ImageGenerationRequest, VideoGenerationRequest, GenerationTask } from './types';

const BASE = (process.env.SPICYAPI_BASE_URL || 'https://api.spicyapi.com/v1').replace(/\/$/, '');

function key() {
  const value = process.env.SPICYAPI_API_KEY;
  if (!value) throw new Error('SPICYAPI_API_KEY is not configured.');
  return value;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || data?.detail || `SpicyAPI returned ${response.status}`);
  }
  return data as T;
}

export function spicyConfigured() {
  return Boolean(process.env.SPICYAPI_API_KEY);
}

export async function generateImage(input: ImageGenerationRequest): Promise<GenerationTask> {
  const data: any = await call('/images/generations', {
    method: 'POST',
    body: JSON.stringify({
      model: input.model || 'spicy-image-1',
      prompt: input.prompt,
      style: input.style,
      size: `${input.width || 768}*${input.height || 1024}`,
      n: Math.min(Math.max(input.count || 1, 1), 4),
      enhance_prompt: true,
      user: input.userId,
    }),
  });
  return {
    id: String(data.id),
    provider: 'spicyapi',
    type: 'image',
    status: 'succeeded',
    model: String(data.model || input.model || 'spicy-image-1'),
    output: (data.data || []).map((item: any) => ({ url: String(item.url), kind: 'image' })),
    costUsd: Number(data.cost_usd || 0),
  };
}

export async function generateVideo(input: VideoGenerationRequest): Promise<GenerationTask> {
  const body: Record<string, unknown> = {
    model: input.model || 'spicy-motion-3',
    prompt: input.prompt,
    duration: Math.min(Math.max(input.duration || 5, 2), 30),
    resolution: input.resolution || '720P',
    fps: input.fps || 30,
    user: input.userId,
  };
  if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
  if (input.imageUrl) body.image_url = input.imageUrl;
  if (input.referenceImageUrls?.length) body.reference_image_urls = input.referenceImageUrls.slice(0, 10);
  if (input.character) body.character = input.character;

  const data: any = await call('/videos/generations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return {
    id: String(data.id),
    provider: 'spicyapi',
    type: 'video',
    status: data.status === 'succeeded' ? 'succeeded' : 'queued',
    model: String(data.model || body.model),
    output: data.output?.url ? [{ url: String(data.output.url), kind: 'video' }] : undefined,
    costUsd: Number(data.cost_usd || 0),
  };
}

export async function getVideoTask(id: string): Promise<GenerationTask> {
  const data: any = await call(`/videos/tasks/${encodeURIComponent(id)}`);
  return {
    id,
    provider: 'spicyapi',
    type: 'video',
    status: data.status === 'succeeded' ? 'succeeded' : data.status === 'failed' ? 'failed' : 'processing',
    model: String(data.model || 'spicy-motion-3'),
    output: data.output?.url ? [{ url: String(data.output.url), kind: 'video' }] : undefined,
    error: data.error || undefined,
    costUsd: Number(data.cost_usd || 0),
  };
}
