# ComfyUI workflow templates

MOTIONA Studio supports imported ComfyUI API-format workflows rather than assuming a universal Wan or AnimateDiff graph.

## Export

In ComfyUI, export the workflow in **API format**. Keep the resulting JSON as a template.

## Supported substitution tokens

String values in the workflow can contain:

- `__PROMPT__` — scene/positive prompt
- `__NEGATIVE_PROMPT__` — negative prompt
- `__REFERENCE_IMAGE__` — uploaded ComfyUI input filename
- `__SEED__` — generation seed
- `__WIDTH__` — requested width
- `__HEIGHT__` — requested height

Added for the storyboard → worker handoff:

- `__FRAMES__` — frame count derived from the shot's duration and fps
- `__FPS__` — output frame rate
- `__DURATION__` — shot duration in seconds
- `__CAMERA__` — camera move selected for the shot
- `__SCENE__` — scene label
- `__SHOT_INDEX__` — position in the timeline
- `__CHARACTER_NAME__` / `__CHARACTER_TRAITS__` — sequence identity anchor
- `__STEPS__` / `__CFG__` / `__DENOISE__` — sampler parameters

The studio submits the substituted API graph to ComfyUI through
`/api/comfyui/workflow`, or through `/api/video/queue` when the shot comes from a
storyboard. Substitution lives in `lib/comfy/tokens.ts` and is shared by both.

### Numeric coercion

A field holding nothing but a token is coerced back to a number after
substitution, so `"seed": "__SEED__"` arrives at ComfyUI as an integer rather than
a string. Coercion applies to the keys ComfyUI expects as ints (`seed`,
`noise_seed`, `width`, `height`, `batch_size`, `steps`, `length`, `frames`,
`frame_rate`, `fps`, `context_length`) and floats (`cfg`, `denoise`,
`strength_model`, `strength_clip`, `lora_strength`).

### Token reporting

Both submission routes return `usedTokens`, the set of tokens actually found in
the template. The storyboard and Animate screens show this on import, so an
operator can confirm a template is wired to the fields they expect before
rendering a whole sequence.

## Graph validation

Before submission, `validateGraph` checks that every `["<nodeId>", <slot>]` link
resolves to a node the graph defines. A dangling reference is rejected with a 400
naming the node and input, instead of reaching ComfyUI and producing an opaque
server-side error. Exotic graphs can opt out with `skipValidation: true`, in which
case the problems are still returned as `validationWarnings`.

## Why this is template based

Wan, AnimateDiff, Stable Video Diffusion and community video workflows can require different checkpoints, custom nodes, samplers, latent/video nodes and output nodes. A template exported from the user's actual ComfyUI installation preserves those dependencies instead of shipping a graph that may not exist on the target machine.

## Recommended first animation template

Create a working image-to-video workflow in ComfyUI using the video model and custom nodes installed on the machine. Export its API JSON, then use the tokens above for the scene prompt, reference image and seed.

The application can then use the exact installed graph as its animation engine.
