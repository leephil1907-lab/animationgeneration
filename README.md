# Animation Generation Studio

A local-first character creation and animation-generation workspace designed around ComfyUI workflows.

## Character creation

- Create a character from a blank profile.
- Upload a reference image from the device gallery.
- Drag and drop an image into the reference panel.
- Add name, role, age presentation, visual style, appearance traits, personality and animation direction.
- Save characters into the in-session character gallery.
- Reuse the character profile as the identity layer for future generation workflows.

## Generation architecture

The application is intentionally designed to connect to a locally running ComfyUI instance rather than pretending that generation is happening when no inference backend is available. The next integration layer can send the saved character profile and reference image into ComfyUI API workflows for image-to-image, character consistency, and animation pipelines.

## Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Planned production integrations

- ComfyUI API connection and workflow queue
- Live checkpoint / VAE / LoRA model discovery from ComfyUI
- Optional LoRA character/style conditioning with strength control
- Civitai model metadata/import layer
- Character persistence and gallery storage
- Image-to-character workflows
- Character-to-image workflows
- Image-to-video / animation workflows through imported, installation-specific ComfyUI workflow templates
- Generation history and exports
- GPU/VRAM diagnostics

The current character studio performs real local browser image selection and character-profile creation; it does not fabricate successful AI generation results.
