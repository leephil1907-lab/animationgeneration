# MOTIONA Face Swap worker contract

MOTIONA runs inference on a separate GPU worker. The Next.js web process validates requests, authenticates the user, persists job ownership and proxies worker status. It does not run face-swap inference itself.

## Endpoints

Configure `FACE_SWAP_API_URL` as the worker base URL and optionally `FACE_SWAP_API_KEY`. All worker requests carry `Authorization: Bearer <key>` when a key is configured. Production URLs must use HTTPS.

### POST / (render submission)

Multipart form fields:
- `source`: JPEG, PNG, WebP, MP4, WebM or QuickTime media.
- `reference`: JPEG, PNG or WebP portrait.
- `strength`: `natural`, `balanced` or `strong`.
- `restore`: `true` or `false`.

The worker must independently validate media contents, not just filenames or MIME types. It should return HTTP 202 and JSON:

```json
{ "jobId": "worker-job-identifier", "status": "queued" }
```

For very short image jobs, it may return a completed result immediately:

```json
{ "outputUrl": "https://private-expiring-output-url", "mediaType": "image" }
```

MOTIONA persists its own opaque job ID and owner before returning HTTP 202 to the browser. The browser polls the authenticated MOTIONA job endpoint; it never calls the GPU worker directly.

### GET /jobs/{jobId} (job status)

Return JSON with one of `queued`, `running`, `completed` or `failed`:

```json
{ "status": "running" }
```

On completion, return a private, expiring `outputUrl` and media type:

```json
{ "status": "completed", "outputUrl": "https://private-expiring-output-url", "mediaType": "video" }
```

On failure, return a short safe error:

```json
{ "status": "failed", "error": "The source video could not be decoded." }
```

### GET /health (worker readiness)

Return HTTP 200 and JSON only when the worker can accept work:

```json
{
  "status": "ok",
  "provider": "FaceFusion GPU worker",
  "message": "Worker ready",
  "capabilities": ["image", "video"]
}
```

The studio marks the worker online only when it confirms readiness. A configured URL alone is never treated as a healthy worker.

## Production requirements

Use a properly licensed face-processing stack and verify model-weight licensing separately from source-code licensing. Run inference on a GPU worker, not in the Next.js process. Enforce media size, duration, resolution, codec, concurrency and time limits; authenticate requests; clean temporary files; and return private, expiring output URLs.

MOTIONA currently stores render job ownership and status in the existing persistent record store. In production this requires the configured Supabase-backed storage and existing row-level security policies. The browser polls for up to 20 minutes per active session; job records remain persisted if the browser closes.

The worker must keep its own durable queue and job state so a worker restart does not lose accepted jobs. Do not report a completed render until the output has been persisted and verified.
