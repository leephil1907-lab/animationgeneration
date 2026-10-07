export type GenerationProvider = 'auto' | 'comfyui' | 'spicyapi';

export type ImageGenerationRequest = {
  prompt: string;
  model?: string;
  style?: 'photorealistic' | 'studio' | 'anime' | '3d' | 'cartoon';
  width?: number;
  height?: number;
  count?: number;
  characterId?: string;
  userId: string;
};

export type VideoGenerationRequest = {
  prompt: string;
  model?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  fps?: 30 | 60;
  imageUrl?: string;
  referenceImageUrls?: string[];
  character?: string;
  userId: string;
};

export type GenerationTask = {
  id: string;
  provider: GenerationProvider;
  type: 'image' | 'video';
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  model: string;
  output?: { url: string; kind: 'image' | 'video' }[];
  error?: string;
  costUsd?: number;
};
