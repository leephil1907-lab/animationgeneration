# MOTIONA

AI character conversation, image, storyboard, and animation workspace powered by ComfyUI.

## Features

- Character discovery and character-aware chat
- Character profiles, references, voice notes and TTS
- Image, storyboard and video workflows
- ComfyUI integration with real job status and outputs
- Private gallery and local-first storage
- PWA-ready MOTIONA interface
- Server-side prompt safety and consent-aware workflows

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `COMFYUI_URL` in `.env.local` to a reachable ComfyUI instance.

## Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run test:e2e
```

## Architecture

```
MOTIONA → API → ComfyUI → render jobs → Gallery
```

MOTIONA is the creative control surface; **ComfyUI performs the actual inference**. No fake generation backend is shipped with the product.

## Environment

Key variables:

```env
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_CHECKPOINT=
COMFYUI_VIDEO_CHECKPOINT=
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

See `.env.example` for the full configuration.

## Notes

- Animation requires the workflows and models installed on the connected ComfyUI instance.
- Local development can use the test worker in `dev/mock-comfyui/`.
- The current account/storage layer is local-first and is not a production authentication or cloud-storage system.
- Do not upload real people's faces without consent.
