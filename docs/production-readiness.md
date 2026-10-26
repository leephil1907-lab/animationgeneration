# MOTIONA production-readiness plan

This checklist separates a successful web-app build from proof that a real media-generation workflow works. A passing build does not mean a cloud rendering provider or ComfyUI model is configured. The local mock worker renders deterministic synthetic placeholder animation only; it tests transport and gallery plumbing, not AI generation quality.

## Current architecture

- Next.js App Router is the creative interface and API.
- `lib/comfy/client.ts` submits workflows and resolves ComfyUI queue/history state.
- `app/api/video/queue/route.ts` screens prompts, validates workflow graphs, submits jobs, and persists job records.
- `app/api/comfyui/view/route.ts` proxies generated files.
- `scripts/e2e-test.sh` and `scripts/ui-test.mjs` currently exercise the storyboard-to-gallery flow against a mock worker.

## Release gates

- [ ] Regenerate and commit `package-lock.json` locally so it pins the same Next.js version as `package.json` (the current lockfile pins Next.js 15.5.4 while `package.json` declares 15.5.27). CI currently regenerates a temporary lockfile before `npm ci`; this validates the declared dependency set but does not itself repair the committed lockfile.\n- [ ] Dependency installation, TypeScript check, and production build pass in CI.
- [ ] Fix the browser UI test dependency: `scripts/ui-test.mjs` imports Puppeteer, but Puppeteer is not currently declared in `package.json` or `package-lock.json`. Do not run `npm run test:ui` until that is resolved.
- [x] Production queue rejects a worker that identifies itself as mock; status endpoint marks mock as disconnected in production.\n- [ ] Verify the worker status endpoint reports a real worker, not a mock, in the actual deployment.
- [ ] Confirm a real image job completes and its output can be opened in the authenticated gallery.
- [ ] Confirm a real video job completes and produces a playable file with expected dimensions and duration.
- [ ] Confirm failure paths are understandable: missing model/workflow, provider outage, timeout, and exhausted polling.
- [ ] Confirm production storage is durable and user-scoped; do not use local-file storage for deployed projects/jobs.
- [ ] Review authentication/authorization on media proxy and job-status routes before exposing private outputs.
- [ ] Confirm secrets are server-side only and deployment variables point to the intended cloud provider.
- [ ] Only after the above pass, connect a repeatable short-form pipeline: script → narration → visual shots → captions → music mix → MP4 export.

## Low-cost implementation order

1. Add CI checks without changing the production deployment.
2. Fix any CI or dependency gaps exposed by those checks.
3. Prove one real cloud-rendered clip end-to-end.
4. Add FFmpeg-based assembly/caption burn-in as a separate worker concern; keep rendering out of the Next.js request lifecycle.
5. Add Remotion only if timeline-driven React compositions provide clear value beyond FFmpeg assembly.

## Acceptance criteria for the first real clip

- 9:16 output at a defined resolution and frame rate.
- Script/narration and captions remain synchronized.
- Exported MP4 plays in a standard browser/player.
- Job record moves through queued, running, completed or failed, with a useful error on failure.
- Gallery shows only media the signed-in user is authorized to access.
- The test run records whether the backend was mock or real.
