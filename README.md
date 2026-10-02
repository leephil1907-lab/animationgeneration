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
\n## MOTIONA production workflow\n\nThe workspace now includes the product layers that sit around the ComfyUI image worker:\n\n- **Structured character profiles** — identity, appearance, personality, voice, animation direction, references and safety metadata.\n- **Prompt safety** — server-side prompt screening before image generation; unsafe requests are blocked and higher-risk formulations require safer wording.\n- **Storyboard + timeline** — dedicated /storyboard route for scenes, shot duration, camera, prompts and dialogue/performance notes.\n- **Video workers** — dedicated /animate route with Wan2.1 and AnimateDiff worker targets. The operator imports the API-format ComfyUI workflow installed on their machine; MOTIONA submits it to the real ComfyUI /prompt queue.\n- **Video job status bridge** — /api/video/job/[promptId] reads the corresponding ComfyUI history record.\n- **Private gallery** — dedicated /gallery route backed by browser-session job metadata today. It is deliberately not described as cloud storage yet.\n- **Chat + voice** — character-aware interaction remains the conversational layer, with voice-note transcription and TTS/browser speech fallback.\n\n### Storage boundary\n\nThe current gallery uses local browser session storage so the product remains honest about persistence. A storage adapter is documented in .env.example; object storage/auth can be introduced without changing the storyboard or worker contracts.\n\n### Video workflow boundary\n\nMOTIONA does not claim that Wan2.1 or AnimateDiff is installed automatically. The video worker targets are real queue integration points, while the actual model graph remains installation-specific to the connected ComfyUI instance.\n