# ComfyUI workflow integration

The web application talks to a locally running ComfyUI instance through `COMFYUI_URL` (default `http://127.0.0.1:8188`).

## Endpoints

- `GET /api/comfyui/status` — checks `/system_stats`.
- `GET /api/comfyui/history` — proxies ComfyUI `/history`.
- `POST /api/comfyui/prompt` — sends a ComfyUI API-format prompt graph to `/prompt`.

## Workflow contract

Export an API-format workflow from ComfyUI and use that JSON as the `prompt` graph. The character profile should be mapped into the positive prompt/reference-image nodes by the workflow adapter in the next integration step.

Keep ComfyUI on a private/local network unless authentication and an intentional remote deployment architecture are added.
