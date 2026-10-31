# MOTIONA Face Swap worker contract

## Render request

The authenticated web route `POST /api/face-swap` accepts multipart fields:

- `source`: JPEG, PNG, WebP, MP4, WebM or QuickTime media.
- `reference`: JPEG, PNG or WebP portrait.
- `strength`: `natural`, `balanced` or `strong`.
- `restore`: `true` or `false`.

Set `FACE_SWAP_API_URL` to the private worker's render endpoint and optionally `FACE_SWAP_API_KEY`. The web application forwards the multipart fields and sends the key as a Bearer token. The worker must validate all files independently and must never trust client-supplied MIME types or filenames.

The worker returns either:
1. Finished media as a binary response with an accurate `Content-Type`; or
2. JSON with an `outputUrl` accessible to the signed-in browser and optional `mediaType`.

The web application never fabricates a preview. If the worker is not configured, the render endpoint returns HTTP 503.

## Health check

The authenticated web route `GET /api/face-swap/status` checks `/health` relative to `FACE_SWAP_API_URL`, with a five-second timeout and the same optional Bearer key.

A healthy worker should return HTTP 200 and JSON similar to:

```json
{
  "status": "ok",
  "provider": "FaceFusion GPU worker",
  "message": "Worker ready",
  "capabilities": ["image", "video"]
}
```

The studio only reports the worker as online when the response confirms readiness with `status: "ok"` or `ok: true`. A configured URL alone is not treated as a healthy worker.

## Production requirements

Use a properly licensed face-processing stack and verify model-weight licensing separately from source-code licensing. Run inference on a GPU worker, not in the Next.js web process. The worker must enforce file size, duration, resolution, codec, concurrency and time limits; authenticate requests; clean up temporary files; and return private, expiring output URLs.

The current web adapter is synchronous and intended for still images and short validation clips. Production-length video should use a durable asynchronous queue: submit a job, return a job ID, poll authenticated status, and store output in object storage. Do not report a completed render until the actual output has been persisted and verified.
