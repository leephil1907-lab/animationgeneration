# ComfyUI workflow templates

Animation Generation Studio supports imported ComfyUI API-format workflows rather than assuming a universal Wan or AnimateDiff graph.

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

The studio submits the substituted API graph to ComfyUI through `/api/comfyui/workflow`.

## Why this is template based

Wan, AnimateDiff, Stable Video Diffusion and community video workflows can require different checkpoints, custom nodes, samplers, latent/video nodes and output nodes. A template exported from the user's actual ComfyUI installation preserves those dependencies instead of shipping a graph that may not exist on the target machine.

## Recommended first animation template

Create a working image-to-video workflow in ComfyUI using the video model and custom nodes installed on the machine. Export its API JSON, then use the tokens above for the scene prompt, reference image and seed.

The application can then use the exact installed graph as its animation engine.
