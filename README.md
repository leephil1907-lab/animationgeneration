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

## Deploy to Deno Deploy

MOTIONA uses Next.js App Router and is configured for the **current Deno Deploy platform** through `deno.json`. Deno Deploy supports Next.js server rendering and API routes; it builds Next.js in standalone mode.

1. Open [Deno Deploy](https://console.deno.com/) and create an app from `leephil1907-lab/animationgeneration`.
2. Select the repository root as the app directory and the **Next.js** framework preset. The checked-in `deno.json` supplies the install and build commands.
3. Add the environment variables below to the app's **Production** environment.
4. Deploy the default branch and inspect the build logs. Every push to the connected branch should trigger a new build.

### Required production configuration

- `SUPABASE_URL` — your Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY` — the Supabase publishable key for Auth and the Data API.
- `NEXT_PUBLIC_BASE_URL` — the final HTTPS URL for this MOTIONA deployment.
- `OPENAI_API_KEY` — required for OpenAI-powered character chat and related speech features that use OpenAI.

For persistent user projects, generation task history, and character memory, configure the Supabase `motiona_records` table and its row-level security policies. Production now refuses to silently fall back to local-file storage because deployment filesystems are not a durable shared database.

### Generation workers are separate services

Deno Deploy hosts the MOTIONA web application; it does **not** host your local GPU or ComfyUI process. Set `COMFYUI_URL` to a reachable HTTPS endpoint for a separately hosted ComfyUI worker, with the required workflows, custom nodes, and models installed. Do not use `http://127.0.0.1:8188` in production: that points to the deployment runtime, not your computer.

Cloud image/video generation also requires a valid `SPICYAPI_API_KEY` and a provider configuration supported by the account. Voice features need the relevant OpenAI or ElevenLabs credentials. Keep all secret keys in Deno Deploy environment variables; never prefix secrets with `NEXT_PUBLIC_`.

Local development remains unchanged: use `npm install`, `npm run dev`, `npm run typecheck`, and `npm run build`.

## Architecture

```
MOTIONA → API → ComfyUI → Render → Gallery
```

MOTIONA is the creative interface; **ComfyUI handles inference and rendering**.

See `.env.example` for configuration. Animation requires the required workflows and models on the connected ComfyUI instance.

**Safety:** use real-person references only with consent.