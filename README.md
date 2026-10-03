# MOTIONA — AI Character & Animation Studio

MOTIONA is a local-first creative workspace for building consistent AI characters, directing scenes, working with voice notes/TTS, and connecting generation workflows to ComfyUI.

## What is in the current build

- Character Lab with reusable character profiles and reference images.
- Consent-aware face-reference flow for uploaded real-person imagery.
- Voice sample controls with optional ElevenLabs server-side TTS and browser speech fallback.
- Voice-note recording and server-side Whisper transcription.
- Character-aware conversational studio chat.
- Image generation controls and ComfyUI model/LoRA discovery.
- Installation-specific ComfyUI animation workflow import.
- Storyboard → timeline → video worker render path with per-shot status tracking.
- Persistent job and storyboard storage on the host machine.
- Gallery, generation, outputs and chat views with live output preview.
- Responsive MOTIONA landing experience with Framer Motion interactions.
- PWA-ready metadata and branded app icon.

## Quick start

```bash
npm install
cp .env.example .env.local     # then set COMFYUI_URL and any checkpoint defaults
npm run dev                    # http://localhost:3000
```

MOTIONA is a control surface, not an inference engine: it needs a real ComfyUI
instance behind `COMFYUI_URL` to actually render. Nothing in the product depends
on or ships a fake backend.

### Offline development harness (not part of the product)

`dev/mock-comfyui/` is a **test double** used only by the automated suites. It is
never started by the app, is not referenced by any product route, and its outputs
are placeholder footage. When the connected backend reports itself as the mock,
the storyboard and gallery show an explicit "offline dev worker" banner so mock
output can never be mistaken for real generation.

```bash
npm run dev:worker             # OPTIONAL, second terminal — listens on 127.0.0.1:8188
npm run test:e2e               # API-level assertions
npm run test:ui                # browser-level assertions
```

See `dev/mock-comfyui/README.md`.

## Local-first architecture

MOTIONA does not pretend that inference happened when no generation backend is
connected. ComfyUI remains the execution bridge for local generation and animation
workflows. When ComfyUI is unreachable, `/api/comfyui/status` says so rather than
reporting a fabricated result.

### Request path

```
browser ──► /storyboard ──► POST /api/video/queue ──► lib/comfy/client ──► ComfyUI /prompt
                                  │                                              │
                                  │ prompt screening (lib/prompt-safety)         │ prompt_id
                                  │ graph validation (validateGraph)             ▼
                                  └──► job record ──► storage adapter      ComfyUI /history
                                          ▲                                        │
            /gallery ──► GET /api/jobs ───┴─── GET /api/video/job/[promptId] ◄─────┘
                                  │
                                  └──► /api/comfyui/view (proxy) ──► output bytes
```

Outputs are always served through `/api/comfyui/view`. The browser never talks to
`COMFYUI_URL` directly — it could not reach a loopback worker, and the proxy keeps
ComfyUI off the public surface.

### Environment

```env
COMFYUI_URL=http://127.0.0.1:8188

# Default checkpoints; must match filenames installed in ComfyUI.
# Video mode reads COMFYUI_VIDEO_CHECKPOINT first, then falls back to
# COMFYUI_CHECKPOINT. Leave blank to choose per sequence in the storyboard UI.
COMFYUI_CHECKPOINT=
COMFYUI_VIDEO_CHECKPOINT=

# ComfyUI client tuning
COMFYUI_TIMEOUT_MS=20000
COMFYUI_RETRIES=1
MOTIONA_MAX_POLLS=240

OPENAI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_WARM_FEMALE_VOICE_ID=
ELEVENLABS_DEEP_MALE_VOICE_ID=
ELEVENLABS_SOFT_BREATHY_VOICE_ID=
ELEVENLABS_ENERGETIC_VOICE_ID=
ELEVENLABS_CALM_NARRATOR_VOICE_ID=
SEARCH_API_KEY=
X_BEARER_TOKEN=
NEXT_PUBLIC_BASE_URL=http://localhost:3000

STORAGE_PROVIDER=local-file
STORAGE_BUCKET=
STORAGE_PUBLIC_BASE_URL=
```

## Product layers

- **Structured character profiles** — identity, appearance, personality, voice, animation direction, references and safety metadata.
- **Prompt safety** — server-side screening before generation. It is enforced on `/api/video/queue` and `/api/moderate`; unsafe requests are blocked and higher-risk formulations require safer wording.
- **Storyboard + timeline** — `/storyboard` for scenes, shot duration, camera, prompts and dialogue/performance notes, with a real handoff into the video worker.
- **Character consistency** — one master seed per sequence plus a repeated synthetic identity anchor, so a character holds its appearance across shots.
- **Video workers** — `/animate` with Wan2.1 and AnimateDiff worker targets. The operator imports the API-format ComfyUI workflow installed on their machine; MOTIONA submits it to the real ComfyUI `/prompt` queue.
- **Video job status bridge** — `/api/video/job/[promptId]` reads the corresponding ComfyUI history record and normalises it onto `queued | running | completed | failed`.
- **Private gallery** — `/gallery`, backed by the storage adapter, with live polling and inline video preview.
- **Preview player** — a modal animation player with provenance metadata, opened from gallery thumbnails, storyboard shots and the Animate screen.
- **Animation downloader** — deterministic per-output and download-all saves from every surface that shows a finished render.
- **Chat + voice** — character-aware interaction with voice-note transcription and TTS/browser speech fallback.
- **Account layer + dashboard** — `/signup` creates a device-local account and lands on `/dashboard`; `/login` restores the session; `/dashboard` is guarded and links every workspace surface. See "Account layer" below.
- **Age gate** — a full-app interstitial before any route renders. Confirming 18+ enters; declining navigates the browser away (`about:blank`) so the homepage never loads.
- **MOTIONA Studio identity** — the studio formerly labelled "Animation Generation Studio" now ships as MOTIONA Studio: an inline SVG brand mark in every header, a wordmark logo on the landing page, a web-app manifest, and installable icons (SVG plus 192/512 PNG and apple-touch).
- **vs-chat-input composer** — the studio chat box is the `vs-chat-input` component: a spring-growing textarea, file chips with upload rings (paperclip, drag-and-drop or paste), a keyboard-complete model picker, and a send button that morphs into stop while a reply generates. Vanilla core in `components/vs-chat-input/`, React wrapper in `components/ChatComposer.tsx`.

### Account layer

`lib/auth.ts` implements signup, login, logout and 30-day sessions against
**this browser only** (localStorage, salted SHA-256 via WebCrypto). It exists so
that creating an account leads somewhere real — the dashboard — and so work can be
attributed to an account (`owner` on storyboards and jobs).

It is explicitly **not** a production authentication provider: there is no server
side, no password-strength hashing (bcrypt/argon2), no rate limiting, and no
cross-device sync. Every surface that uses it says so. Swap the four functions in
`lib/auth.ts` for a real provider's SDK when one is adopted; nothing else changes.

`/dashboard` is client-guarded (no session → `/login`) and shows the account's
sequences, jobs and stats plus navigation tiles to Studio, Storyboard, Animate and
Gallery. An account chip in each workspace header links to the dashboard and signs
out. The dashboard reconciles the browser cache against the server store on every
visit, so the work listed there survives a cleared browser: wipe localStorage,
sign back in with the same email, and every sequence and job the storage adapter
holds is listed again.

### Age gate

`components/AgeGate.tsx` wraps the whole app from `app/layout.tsx`, so no route
renders before the choice is made. "I am 18 or older — Enter" sets a local flag;
"I am under 18 — Leave" navigates the browser off-site (`about:blank`) without
ever loading the homepage. Like the account layer this is a client-side
interstitial, not age verification.

### Storage boundary

Jobs and storyboards are written to a local disk store (`.motiona-data/`) on the
machine running MOTIONA, and mirrored in the browser for instant paint. The server
store is the durable record and the browser is a cache: `fetchServerBoards` /
`mergeBoards` and `fetchServerJobs` / `mergeJobs` reconcile the two on load, which
is what lets a cleared browser recover its work. This is **not** cloud storage —
the store survives a wiped browser on one machine, not a different device.

`lib/storage.ts` is the adapter boundary: `STORAGE_PROVIDER` selects the
implementation, and the `s3` provider is declared but deliberately throws rather
than silently pretending to work. Adding object storage means implementing
`readRecord` / `writeRecord` / `listRecords` for that provider — the job and
storyboard contracts do not change.

### vs-chat-input composer

`components/vs-chat-input/vs-chat-input.js` is a framework-free controller mounted
on a `form.vs-chat-input` (`vsChatInput.mount(el)` → also exposed as
`el.vsChatInput`). It owns the spring box growth (capped by
`--vs-chat-input-lines`, then scroll), the file chips and their progress rings
(`setProgress(id, 0..1)`; send stays disabled until every file reaches 1), the
listbox model menu (arrows, Home/End, type-ahead, Enter/Space, Esc), the send→stop
morph (`setBusy`), and the key contract: Enter sends, Shift+Enter newlines,
coarse pointers get Enter-as-newline, Backspace in an empty box removes the last
file, Esc stops while busy. Everything is announced through bubbling
`vs-chat-input:*` events; `vs-chat-input:submit` is cancelable — preventing it
means the host takes over the send and the box keeps its text, otherwise the box
clears and turns busy until `setBusy(false)`. Theming is entirely CSS variables
(`--vs-chat-input-accent|-bg|-ink|-dim|-radius|-width|-chip|-lines|-font`), and
reduced-motion preferences snap the springs and slow the busy ring.

`components/ChatComposer.tsx` renders the documented markup, mounts the
controller once, re-broadcasts the events as props, and exposes the API through a
ref. `ChatPanel` drives uploads with real `FileReader` progress and aborts the
chat fetch when the composer fires `vs-chat-input:stop`.

### Video workflow boundary

MOTIONA does not claim that Wan2.1 or AnimateDiff is installed automatically. The
built-in scaffold is an AnimateDiff-shaped graph that is internally valid and
validated before submission, but it still requires the corresponding custom nodes
on the connected ComfyUI instance. The operator-imported API-format workflow
remains the primary path, because it preserves whatever checkpoints and custom
nodes that specific installation actually has.

## Important limitations

- Accounts are device-local demo accounts, not a production auth provider. There is no access control on the API routes — do not expose this app to a network you do not control.
- Web/X search tools require credentials and are not presented as live when unconfigured.
- Animation support depends on the ComfyUI workflows installed by the operator.
- The face-reference checkbox is a consent attestation, not identity or age verification.
- The age gate is a client-side interstitial, not age verification.
- 18+ creative workspace; do not upload real people's faces without their consent.

## Development

```bash
npm run dev          # start the app
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run test:e2e     # end-to-end pipeline assertions (needs the mock worker)
```
