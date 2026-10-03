# Workflow adapters

The adapter builds a character-aware API-format graph and submits it to ComfyUI.

## Image mode

The image graph establishes a checkpoint, positive/negative conditioning, latent canvas, sampler, VAE decode and output node. Replace `checkpoint.safetensors` with the actual checkpoint installed in ComfyUI.

## Video mode

The video adapter is a scaffold for Wan/AnimateDiff-compatible pipelines. The exact graph is model/version/custom-node dependent, so the checkpoint and video nodes must be replaced with the API-format workflow exported from the user's installed Wan or AnimateDiff setup.

This avoids pretending that a particular custom-node graph exists on every ComfyUI installation.

The built-in scaffold is an AnimateDiff-shaped graph: a checkpoint, positive and
negative conditioning, an `EmptyLatentImage` batched to `frames`, a single
`KSampler`, `VAEDecode`, and `VHS_VideoCombine` for output. With a reference image
it switches to image-to-video by encoding the reference and repeating it into a
latent batch via `RepeatLatentBatch`.

It is internally valid — every link resolves — but it still needs the AnimateDiff
custom nodes installed. That is the point: it fails on a missing custom node,
which is actionable, rather than on a malformed graph, which is not.

### Checkpoint selection by mode

`normalizeSettings(settings, mode)` picks the default checkpoint per mode:
`COMFYUI_VIDEO_CHECKPOINT` for video, `COMFYUI_CHECKPOINT` for image, with the
image value as a last-resort fallback for video. An explicitly supplied
`settings.checkpoint` always wins. In video mode the queue route refuses to submit
a scaffold with no checkpoint resolvable from either source, and says which
environment variable to set.

## Sequence consistency

Shots rendered from one storyboard share the board's `masterSeed`, and each shot's
prompt carries the same synthetic character anchor. `buildShotPrompt` composes the
full anchored prompt (used for screening, display and the `__PROMPT__` token),
while `buildShotScene` returns only the shot's own description for the scaffold
path — because `buildWorkflow` already emits the character identity from its
profile, and passing both states the character twice.

## Reference images

A reference filename can be passed to the adapter. The production upload bridge should first upload the browser-selected file to ComfyUI's `/upload/image` endpoint and then pass the returned filename into the workflow. This is deliberately separate from the browser UI so the reference never silently leaves the user's device.
