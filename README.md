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
- Gallery, generation, outputs and chat views.
- Responsive MOTIONA landing experience with Framer Motion interactions.
- PWA-ready metadata and branded app icon.

## Local-first architecture

MOTIONA does not pretend that inference happened when no generation backend is connected. ComfyUI remains the execution bridge for local generation and animation workflows.

### Environment

```env
COMFYUI_URL=http://127.0.0.1:8188
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
```

## Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Important limitations

- Authentication screens are currently UI-only; no production auth provider is claimed.
- Web/X search tools require credentials and are not presented as live when unconfigured.
- Animation support depends on the ComfyUI workflows installed by the operator.
- The face-reference checkbox is a consent attestation, not identity or age verification.
- 18+ creative workspace; do not upload real people's faces without their consent.
