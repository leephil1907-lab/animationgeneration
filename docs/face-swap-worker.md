# MOTIONA Face Swap worker contract

The authenticated web route POST /api/face-swap accepts multipart fields:
- source: JPEG, PNG, WebP, MP4, WebM or QuickTime media.
- reference: JPEG, PNG or WebP portrait.
- strength: natural, balanced or strong.
- restore: true or false.

Set FACE_SWAP_API_URL to a private render-worker endpoint and optionally FACE_SWAP_API_KEY. The worker receives the same multipart fields and returns either finished media as a binary response with an accurate Content-Type, or JSON with outputUrl and optional mediaType.

The web application never fabricates a preview: it returns a clear 503 until the worker is configured. The worker must validate media again, use a properly licensed face-processing stack and enforce its own resource limits. The synchronous adapter is suitable for still images and short test clips; production long-video processing should move to a durable asynchronous queue with job IDs, authenticated status polling and object-storage outputs.
