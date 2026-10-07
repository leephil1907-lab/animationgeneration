import { generateImage as spicyImage, generateVideo as spicyVideo, getVideoTask as spicyTask, spicyConfigured } from './spicyapi';
import type { ImageGenerationRequest, VideoGenerationRequest, GenerationTask } from './types';

export function preferredProvider(): 'spicyapi' | 'comfyui' {
  return process.env.MOTIONA_IMAGE_PROVIDER === 'spicyapi' || process.env.MOTIONA_VIDEO_PROVIDER === 'spicyapi'
    ? 'spicyapi'
    : 'comfyui';
}

export async function generateImage(input: ImageGenerationRequest): Promise<GenerationTask> {
  if ((process.env.MOTIONA_IMAGE_PROVIDER || 'auto') === 'spicyapi') {
    return spicyImage(input);
  }
  if (spicyConfigured() && (process.env.MOTIONA_IMAGE_PROVIDER || 'auto') === 'auto') {
    return spicyImage(input);
  }
  throw new Error('No cloud image provider is configured. Set SPICYAPI_API_KEY or use the existing ComfyUI studio.');
}

export async function generateVideo(input: VideoGenerationRequest): Promise<GenerationTask> {
  if ((process.env.MOTIONA_VIDEO_PROVIDER || 'auto') === 'spicyapi') {
    return spicyVideo(input);
  }
  if (spicyConfigured() && (process.env.MOTIONA_VIDEO_PROVIDER || 'auto') === 'auto') {
    return spicyVideo(input);
  }
  throw new Error('No cloud video provider is configured. Set SPICYAPI_API_KEY or use the existing ComfyUI Animate workflow.');
}

export async function getVideoTask(id: string) {
  return spicyTask(id);
}
