# MOTIONA

AI character conversation and animation studio powered by ComfyUI.

## What it does

- Character discovery and character-aware chat
- Image, storyboard and video creation
- Voice notes and TTS
- ComfyUI rendering and job tracking
- Private gallery and PWA-ready interface

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `COMFYUI_URL` to your reachable ComfyUI instance.

## Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run test:e2e
```

## Architecture

```
MOTIONA → API → ComfyUI → Render → Gallery
```

MOTIONA is the creative interface; **ComfyUI handles inference and rendering**.

See `.env.example` for configuration. Animation requires the required workflows and models on the connected ComfyUI instance.

**Safety:** use real-person references only with consent.