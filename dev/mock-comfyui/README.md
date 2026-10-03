# Mock ComfyUI worker

A test double for ComfyUI, so the MOTIONA pipeline can be verified end to end on a
machine with no GPU and no ComfyUI install.

This is **not** a generation model. It renders deterministic placeholder footage
with PIL and (optionally) a static ffmpeg binary, so that the parts MOTIONA is
actually responsible for — submission, queueing, status polling, output proxying,
job persistence, gallery preview — can be exercised against realistic HTTP
behaviour.

```bash
npm run worker:mock     # listens on 127.0.0.1:8188
npm run test:e2e        # 40 assertions across the pipeline
```

## Endpoints implemented

Only what MOTIONA calls:

| Endpoint | Behaviour |
| --- | --- |
| `GET /system_stats` | Connectivity probe; returns a fake CPU device |
| `POST /prompt` | Validates the graph, returns a `prompt_id`, schedules the render |
| `GET /queue` | `queue_running` / `queue_pending`, used to tell queued from running |
| `GET /history[/:id]` | Finished jobs only, matching real ComfyUI semantics |
| `GET /view` | Streams the rendered file with a correct content type |
| `POST /upload/image` | Persists the reference under a generated name |
| `GET /object_info[/:class]` | Three fake checkpoints, so model discovery works |

### Behaviours worth knowing

**Graph validation.** Like the real thing, `POST /prompt` rejects a graph whose
links reference undefined nodes, with a 400 naming each bad reference. This is
what makes `validateGraph` in `lib/comfy/workflow.ts` testable against realistic
failure rather than only against a permissive server.

**History vs queue.** A prompt absent from `/history` is either still queued or
still running; `/queue` is the only way to distinguish them. The mock reproduces
this, which is why `resolveJobState` consults both.

**Lifecycle timing.** `pending` → `running` after `MOCK_QUEUE_DELAY_MS`, then
`success` or `error` after `MOCK_RENDER_MS` once the render finishes.

**Determinism.** Output is a pure function of `seed`. Two shots sharing a seed
produce identical motion, which is how the storyboard's seed-locking can be
*observed* rather than merely asserted.

## Failure injection

Put `MOCK_FAIL` anywhere in a prompt and that job completes as an execution error
with a populated `status.messages` entry:

```bash
curl -s -X POST localhost:3000/api/video/queue -H 'Content-Type: application/json' -d '{
  "shot": {"id":"s1","scene":"Scene 1","prompt":"MOCK_FAIL a storm breaks overhead","duration":2},
  "board": {"id":"b1","masterSeed":7,"characterName":"Test"},
  "settings": {"checkpoint":"mock_wan21.safetensors"}
}'
```

Useful for checking that `failed` surfaces a real reason instead of spinning.

## Test hooks

```bash
curl -s localhost:8188/__mock/state    # every job and its state
curl -s -X POST localhost:8188/__mock/reset   # clear jobs, output/ and input/
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MOCK_COMFYUI_HOST` | `127.0.0.1` | Bind address — keep it loopback |
| `MOCK_COMFYUI_PORT` | `8188` | Matches the default `COMFYUI_URL` |
| `MOCK_QUEUE_DELAY_MS` | `400` | Time spent in `pending` |
| `MOCK_RENDER_MS` | `2500` | Time spent in `running` |
| `MOCK_PYTHON` | `python3` | Interpreter for `render.py` |

## Output encoding

`render.py` prefers, in order:

1. `ffmpeg` on `PATH`
2. the static binary from `imageio-ffmpeg` (`pip install imageio-ffmpeg`) → real `.mp4`
3. PIL's animated GIF writer → `.gif`

Renders are capped at 640×360 and 48 frames to keep the loop fast; the requested
dimensions still flow through the graph, so dimension plumbing is genuinely
exercised even though the pixels are downscaled.

## Scope

`output/` and `input/` are gitignored. Nothing here models real diffusion, LoRAs,
VAEs or samplers — the node names in a submitted graph are read only to derive
dimensions, frame count, fps and seed.
