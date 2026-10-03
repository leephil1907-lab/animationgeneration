# ComfyUI workflow integration

The web application talks to a locally running ComfyUI instance through `COMFYUI_URL` (default `http://127.0.0.1:8188`).

## Endpoints

- `GET /api/comfyui/status` — checks `/system_stats`.
- `GET /api/comfyui/history` — proxies ComfyUI `/history`.
- `POST /api/comfyui/prompt` — sends a ComfyUI API-format prompt graph to `/prompt`.
- `POST /api/comfyui/workflow` — token-substitutes an imported template, validates it, then submits.
- `GET /api/comfyui/models` — discovers installed checkpoints/LoRAs/VAEs from `/object_info`.
- `POST /api/comfyui/upload` — forwards a reference image to `/upload/image`.
- `GET /api/comfyui/view` — proxies output bytes back to the browser.
- `POST /api/video/queue` — the storyboard → worker handoff; screens, validates, submits, persists a job.
- `GET /api/video/job/[promptId]` — resolves a prompt_id against `/history` and `/queue`.
- `GET|POST|DELETE /api/jobs` — the persistent job store.

All server-side calls go through `lib/comfy/client.ts`, which adds a timeout
(`COMFYUI_TIMEOUT_MS`, default 20s) and a retry on transport failure or 5xx
(`COMFYUI_RETRIES`, default 1). 4xx is never retried. Previously each route made
its own unguarded `fetch`, so a stalled ComfyUI would hang the request.

## Workflow contract

Export an API-format workflow from ComfyUI and use that JSON as the `prompt` graph. The character profile should be mapped into the positive prompt/reference-image nodes by the workflow adapter in the next integration step.

Keep ComfyUI on a private/local network unless authentication and an intentional remote deployment architecture are added.
