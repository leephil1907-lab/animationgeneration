# MOTIONA — Build Notes

Source repo: `https://github.com/leephil1907-lab/animationgeneration`
Completed: 2026-10-02 · Node v20.20.2 · Next.js 15.5.4 · React 19.1.1 · TypeScript 5.7

> The originally supplied URL (`leephill907-lab/...`) 404s. The real repo is
> `leephil1907-lab/animationgeneration` — one "l" in "phil", "1907" not "907".

This file records two phases: making the repo compile at all, then completing the
product layers that were scaffolded but non-functional.

---

## Phase 1 — making the published repo compile

The repo as committed does not build. Three defects, fixed minimally:

| # | File | Defect | Fix |
|---|---|---|---|
| 1 | `tsconfig.json` | Missing `baseUrl`/`paths` while 12 files import via `@/…` | Added `"baseUrl":".","paths":{"@/*":["./*"]}` |
| 2 | `lib/jobs.ts` | Extra closing brace (7 open vs 8 close) | Removed it |
| 3 | `app/api/comfyui/view/route.ts` | Stray `\` inside a template literal | Removed it |

Verified #2 and #3 were the only such defects repo-wide (brace-balance scan +
`grep` over every source file) rather than patching errors one build at a time.

---

## Phase 2 — completing the product

The repo shipped a control surface whose render path never worked. Concretely:

- `MotionaJob` had **no `promptId`**, so a created job could never be matched to
  its ComfyUI queue id. Gallery outputs were empty *forever*.
- `/animate` called `createJob()` and **threw the result away**.
- `/gallery` read localStorage **once** and never polled.
- `/storyboard` held its board in `useState` — a refresh discarded the sequence,
  and a shot's `status` could never leave `draft` because nothing submitted it.
- The video scaffold graph referenced node `'9'`, **which the graph never defined** — ComfyUI would reject it outright.
- No server→ComfyUI `fetch` had a timeout or retry; a stalled worker hung requests.
- `/api/video/queue` **never consulted `lib/prompt-safety`**, so screening was opt-in.
- The storage adapter in `.env.example` was declared and never read.

### What was built

**`lib/comfy/client.ts`** — one server-side ComfyUI client. Timeouts
(`COMFYUI_TIMEOUT_MS`), retry on transport failure/5xx only (`COMFYUI_RETRIES`),
typed methods, and `resolveJobState()` which normalises ComfyUI's awkward
semantics (history absence vs `/queue`, `status_str`, `status.messages`) onto
`queued | running | completed | failed`.

**`lib/storage.ts`** — the adapter `.env.example` always promised. Local disk store
today (`.motiona-data/`), `s3` declared but throwing rather than pretending.
Key sanitisation prevents path traversal.

**`lib/jobs.ts`** — gained `promptId`, structured `outputs`, `seed`,
`storyboardId`/`shotId`, plus merge/reconcile helpers and legacy-row normalisation
(old rows stored outputs as `string[]`).

**`lib/storyboard.ts`** — persistence, per-shot job linkage, aspect→dimensions,
frame-count math, runtime and progress helpers.

**`lib/comfy/tokens.ts`** — substitution extracted from the workflow route and
extended (`__FRAMES__`, `__FPS__`, `__CAMERA__`, `__CHARACTER_NAME__`, …) with
numeric coercion so `"seed": "__SEED__"` arrives as an int. Shared by both routes.

**`validateGraph()`** in `lib/comfy/workflow.ts` — catches dangling node
references *before* submission and names the exact node and input. This is the
check whose absence let the broken scaffold ship.

**Video scaffold rebuilt** — internally consistent AnimateDiff-shaped graph
(`EmptyLatentImage` batched to `frames` → `KSampler` → `VAEDecode` →
`VHS_VideoCombine`), with an image-to-video branch via `RepeatLatentBatch`. It
still needs the AnimateDiff custom nodes, so it now fails on a *missing node*
(actionable) instead of a *malformed graph* (opaque).

**Character consistency** — one `masterSeed` per sequence plus a repeated
synthetic identity anchor. `buildShotPrompt` (full anchored prompt, used for
screening/`__PROMPT__`) vs `buildShotScene` (shot-only description, for the
scaffold) prevents the character being stated twice.

**Checkpoint mode fix** — `normalizeSettings(s, mode)`: video reads
`COMFYUI_VIDEO_CHECKPOINT` first. Previously it always read `COMFYUI_CHECKPOINT`
and the video fallback was dead code, so video jobs silently loaded an *image*
model. Caught by the test suite, not by inspection.

**New routes** — `/api/jobs` (GET/POST/DELETE) and `/api/storyboards`
(GET/POST/DELETE) backed by the storage adapter.

**Rewritten routes** — `/api/video/queue` now screens (`422` on refusal),
validates, substitutes, submits and persists; `/api/video/job/[promptId]`
normalises status, surfaces execution-error reasons, and stops polling a vanished
job after `MOTIONA_MAX_POLLS`.

**Rewritten pages** — `/storyboard` (persistence, identity anchor, seed lock,
checkpoint picker from `/api/comfyui/models`, per-shot and sequence rendering,
status polling, export), `/gallery` (merge local+server, poll, inline video,
filters, delete, honest storage labelling), `/animate` (records `promptId`,
polls, previews, token reporting).

### Verification

**`dev/mock-comfyui/`** — a ComfyUI test double that renders real, deterministic H.264
MP4s from the seed (PIL + a static ffmpeg), reproducing ComfyUI's actual
behaviours: graph rejection on dangling refs, history-absent-means-in-flight,
`/queue` for queued-vs-running, `status.messages` on error. Not a model; see
`dev/mock-comfyui/README.md`.

```bash
npm run dev:worker      # OPTIONAL dev harness — 127.0.0.1:8188
npm run test:e2e      # 40 API-level assertions
npm run test:ui       # 33 browser assertions (needs puppeteer + Chromium deps)
```

Latest results: **e2e 40/40**, **ui 33/33**, `npm run typecheck` clean,
`npm run build` clean (25 routes). Screenshots in `docs/screenshots/`.

The e2e suite proves: prompt screening enforced (real-person sexual, non-consent
and minor prompts all refused with `422`); dangling refs named before submission;
shot → queue → poll → completed; output served only through the app proxy (never
the ComfyUI host); job and storyboard round-tripping; execution errors mapping to
`failed` with a real reason; env checkpoint fallback reaching the graph.

The browser suite proves the UI drives all of it: checkpoint discovery populating
the picker, submission notice, `prompt_id` on the shot, in-page polling to
`Complete`, board surviving a full reload, server-side persistence, and the
gallery's `<video>` element decoding a 3.00s 640×360 clip. Zero console errors,
zero uncaught exceptions, zero failed subresource requests.

## Phase 3 — preview, download, and removing the mock from the product

**Preview player.** `components/OutputPreview.tsx` is a modal player mounted on
the storyboard, gallery and animate screens: native controls, muted looping
autoplay, correct aspect on a dark stage, the output's provenance (worker,
prompt_id, seed, character), the shot prompt, plus Download / Open-in-new-tab /
Close. Escape and backdrop-click close it; body scroll locks while open. Gallery
thumbnails and storyboard shot thumbnails are now buttons that open it, with a
hover "Preview" affordance.

**Downloader.** `lib/download.ts` fetches the output to a Blob and saves from an
object URL so the filename is deterministic (a bare `<a download>` can be
overridden by `Content-Disposition`), with an anchor fallback. Per-output
Download buttons everywhere, plus Download-all on multi-output jobs (sequential,
because browsers throttle simultaneous programmatic downloads).

**Mock removed from the product.**
- Harness moved out of the product tree to `dev/mock-comfyui/`; the npm script is
  now `dev:worker` and the README's quick start no longer presents it as part of
  running the app.
- No product route imports or starts it; `COMFYUI_URL` still defaults to the real
  ComfyUI port.
- `/api/comfyui/status` returns `mock:true` when the backend self-identifies as
  the harness, and `components/DevWorkerNotice.tsx` shows an unmissable
  "Offline dev worker connected" banner on every output-bearing screen while it
  is the active backend — placeholder footage can never be mistaken for real
  generation.
- All previously rendered mock content was purged from the storage adapter and
  the harness's output directory; the live site now starts empty and reports
  ComfyUI unreachable until a real worker is configured.
- `dev/mock-comfyui/render.py` also degrades to an animated GIF instead of
  crashing when no ffmpeg encoder is present.

Verification after these changes: e2e **40/40**, browser **44/44** (including
modal autoplay, Escape-close, and a downloaded file landing on disk under the
worker's filename at real video size), `tsc --noEmit` clean, production build
clean.

## Phase 4 — accounts, dashboard, age-gate confirmation

- **`lib/auth.ts`** — device-local accounts and 30-day sessions (salted SHA-256 via
  WebCrypto, non-secure-context fallback clearly labelled). Signup/login were pure
  UI stubs; they now create/restore a session and redirect to `/dashboard`.
- **`/dashboard`** — new guarded route: no session bounces to `/login`. Shows the
  account's sequences, jobs and stats, navigation tiles to every workspace
  surface, and sign-out. Work is attributed via a new optional `owner` field on
  storyboards and jobs, stamped from the session at creation and sanitised
  server-side.
- **`components/AccountChip.tsx`** — signed-in indicator mounted in every product
  header (and replacing the hardcoded Sign in / Create account links on Studio).
- **Age gate** — behaviour confirmed against the requirement: it wraps all routes
  from the layout, and declining ("I am under 18 — Leave", relabelled for clarity)
  navigates the browser to `about:blank` so the homepage never loads. Verified in
  a fresh browser profile: gate blocks first paint, decline leaves the site, and
  the flag means the gate does not reappear after entering.
- Browser suite grew from 44 to **58 assertions**, covering the decline path,
  signup → dashboard, greeting, nav tiles, account chip, owner attribution,
  sign-out, guarded redirect, login, and wrong-password refusal.

### Deliberately unchanged

- **Prompt safety.** `lib/prompt-safety.ts` was not weakened; it is now enforced
  on the one route that previously bypassed it. Its blocks on real-person sexual
  content, non-consent and minors are exactly what a generator like this needs,
  and the face-reference checkbox remains a consent attestation only.
- **Auth.** Login/signup remain UI-only, per the repo's own statement. Note there
  is **no access control on any API route** — this app must stay on a trusted
  network.
- **No object storage.** `s3` throws instead of faking success.
- **`next@15.5.4` pin kept** as the repo specifies, despite the CVE-2025-66478
  advisory. Patch with `npm install next@15.5.7` if you deploy anywhere public.

### Known limitations carried forward

- Age gate is a client-side interstitial, not age verification.
- Voice/TTS/transcription still need real OpenAI/ElevenLabs keys.
- The scaffold still needs AnimateDiff custom nodes installed; the imported
  workflow remains the primary path by design.
- `findJobByPromptId` scans the job store per poll; fine at this scale, index it
  if job counts grow.
- The storage adapter is single-machine and single-user — no multi-tenant safety.

### Files touched in Phase 2

New: `lib/comfy/client.ts`, `lib/comfy/tokens.ts`, `lib/storage.ts`,
`app/api/jobs/route.ts`, `app/api/storyboards/route.ts`,
`mock-comfyui/server.mjs`, `mock-comfyui/render.py`, `dev/mock-comfyui/README.md`,
`scripts/e2e-test.sh`, `scripts/ui-test.mjs`, `.gitignore`,
`docs/screenshots/*`.

Rewritten: `lib/jobs.ts`, `lib/storyboard.ts`, `app/storyboard/page.tsx`,
`app/gallery/page.tsx`, `app/animate/page.tsx`, `app/api/video/queue/route.ts`,
`app/api/video/job/[promptId]/route.ts`, `app/api/comfyui/workflow/route.ts`,
`README.md`.

Modified: `lib/comfy/workflow.ts`, `app/api/comfyui/character/route.ts`,
`app/globals.css`, `.env.example`, `package.json`,
`comfyui/WORKFLOWS.md`, `comfyui/WORKFLOW-TEMPLATES.md`, `comfyui/README.md`.

Also fixed a pre-existing `autoprefixer` warning (`align-items:end` → `flex-end`
in `.galleryHead`) that fired on every compile.

---

## Phase 5 — server-backed dashboard and the MOTIONA Studio brand

The sixth request asked for four things: wire the dashboard to the server side so
work survives a cleared browser, rename the app to MOTIONA Studio, give it an icon
and matching description, and give the website a logo.

### Server-backed dashboard

- `lib/storyboard.ts` gained `fetchServerBoards()` and `mergeBoards()` — the
  storyboard equivalents of the job store's `fetchServerJobs()` / `mergeJobs()`.
  Merges are keyed by id and resolve conflicts by `updatedAt`.
- `/dashboard` now paints the browser cache first and then reconciles against
  `GET /api/storyboards` + `GET /api/jobs`, filtered to the signed-in account
  (`owner === email`, plus unattributed legacy records). A "(synced)" marker in
  the demo-auth note confirms the server pass completed.
- `/storyboard` hydrates from the server store when the browser holds no boards,
  adopting the most recently updated one — so an empty browser opens onto real
  work instead of a blank sequence.
- Consequence verified by test: wipe `localStorage`, sign up again with the same
  email, and the dashboard still lists the sequence and its renders. The account
  itself remains device-local; the *work* is what survives.

### Brand

- Every "Animation Generation Studio" string is now **MOTIONA Studio**
  (studio footer, auth shell, workflow docs, metadata, manifest).
- `public/icon.svg`: 512 tile, `#241b36 → #0b0a10` gradient, white M monogram with
  a ringed purple play triangle. `scripts/make-icons.py` renders the same geometry
  to `public/icons/icon-512.png`, `icon-192.png` and `apple-touch-icon.png` so the
  raster and vector marks match exactly.
- `public/logo.svg`: horizontal lockup (mark + MOTIONA wordmark + STUDIO tag) on a
  transparent background, used by the landing page; `components/BrandMark.tsx`
  renders the mark inline (useId-scoped gradient ids) in the nav, auth shell and
  dashboard.
- `public/manifest.webmanifest` and `app/layout.tsx` metadata carry the new name,
  description ("Local-first AI character and animation workspace: consistent
  characters, storyboarded shots and ComfyUI-powered rendering — private by
  design"), theme colour `#8b5cf6` and icon set.

### Test hygiene learned the hard way

Server-side persistence made the suites order-dependent: a fresh browser now
*adopts* server boards, so boards left in `.motiona-data/` by a previous run broke
"shot starts as Draft". Both suites now purge `.motiona-data/` at startup, and the
UI suite settles for hydration before filling auth forms (first-visit dev compiles
of `/login` and `/signup` raced the clicks).

- `scripts/e2e-test.sh`: 40/40.
- `scripts/ui-test.mjs`: 65/65, including new section 11 — rename a sequence,
  confirm it reached the server store, wipe the browser, re-signup, and watch the
  dashboard and storyboard restore it (`docs/screenshots/07-persistence.png`).
- `npm run typecheck` and `npm run build` clean.

### Files touched in Phase 5

New: `components/BrandMark.tsx`, `scripts/make-icons.py`, `public/icons/*`.

Rewritten: `public/icon.svg`, `public/logo.svg`, `public/manifest.webmanifest`.

Modified: `app/layout.tsx`, `app/dashboard/page.tsx`, `app/storyboard/page.tsx`,
`lib/storyboard.ts`, `components/AuthShell.tsx`, `app/studio/page.tsx`,
`comfyui/WORKFLOW-TEMPLATES.md`, `app/globals.css`, `scripts/ui-test.mjs`,
`scripts/e2e-test.sh`, `README.md`.
