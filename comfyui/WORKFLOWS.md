# Workflow adapters

The adapter builds a character-aware API-format graph and submits it to ComfyUI.

## Image mode

The image graph establishes a checkpoint, positive/negative conditioning, latent canvas, sampler, VAE decode and output node. Replace `checkpoint.safetensors` with the actual checkpoint installed in ComfyUI.

## Video mode

The video adapter is a scaffold for Wan/AnimateDiff-compatible pipelines. The exact graph is model/version/custom-node dependent, so the checkpoint and video nodes must be replaced with the API-format workflow exported from the user's installed Wan or AnimateDiff setup.

This avoids pretending that a particular custom-node graph exists on every ComfyUI installation.

## Reference images

A reference filename can be passed to the adapter. The production upload bridge should first upload the browser-selected file to ComfyUI's `/upload/image` endpoint and then pass the returned filename into the workflow. This is deliberately separate from the browser UI so the reference never silently leaves the user's device.
