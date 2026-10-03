/**
 * Workflow template token substitution.
 *
 * This lived inline in /api/comfyui/workflow and was therefore unavailable to the
 * storyboard render path, which needs the same tokens plus shot-level ones.
 * Extracted so both callers share one implementation and one documented set.
 *
 * Tokens documented in comfyui/WORKFLOW-TEMPLATES.md:
 *   __PROMPT__ __NEGATIVE_PROMPT__ __REFERENCE_IMAGE__ __SEED__ __WIDTH__ __HEIGHT__
 *
 * Added for the storyboard → worker handoff:
 *   __FRAMES__ __FPS__ __DURATION__ __CAMERA__ __SCENE__ __SHOT_INDEX__
 *   __CHARACTER_NAME__ __CHARACTER_TRAITS__ __STEPS__ __CFG__ __DENOISE__
 *
 * Substitution is string-level and recursive over arrays/objects, so a token can
 * appear inside any string field of an API-format graph. Numeric fields that hold
 * a bare token (e.g. `"seed": "__SEED__"`) are coerced back to numbers so
 * ComfyUI does not reject a string where it wants an int.
 */

export type TokenValues = {
  prompt?: string;
  negativePrompt?: string;
  seed?: number;
  width?: number;
  height?: number;
  referenceFilename?: string;
  frames?: number;
  fps?: number;
  duration?: number;
  camera?: string;
  scene?: string;
  shotIndex?: number;
  characterName?: string;
  characterTraits?: string;
  steps?: number;
  cfg?: number;
  denoise?: number;
};

/** Fields ComfyUI expects as integers, used for post-substitution coercion. */
const INTEGER_KEYS = new Set(['seed', 'noise_seed', 'width', 'height', 'batch_size', 'steps', 'length', 'frames', 'frame_rate', 'fps', 'context_length']);
const FLOAT_KEYS = new Set(['cfg', 'denoise', 'strength_model', 'strength_clip', 'lora_strength']);

function fallbackSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

export function substituteTokens(value: any, values: TokenValues): any {
  if (typeof value === 'string') {
    const replaced = value
      .replaceAll('__PROMPT__', values.prompt || '')
      .replaceAll('__NEGATIVE_PROMPT__', values.negativePrompt || '')
      .replaceAll('__REFERENCE_IMAGE__', values.referenceFilename || '')
      .replaceAll('__SEED__', String(values.seed ?? fallbackSeed()))
      .replaceAll('__WIDTH__', String(values.width || 768))
      .replaceAll('__HEIGHT__', String(values.height || 1024))
      .replaceAll('__FRAMES__', String(values.frames || 16))
      .replaceAll('__FPS__', String(values.fps || 16))
      .replaceAll('__DURATION__', String(values.duration || 5))
      .replaceAll('__CAMERA__', values.camera || '')
      .replaceAll('__SCENE__', values.scene || '')
      .replaceAll('__SHOT_INDEX__', String(values.shotIndex ?? 0))
      .replaceAll('__CHARACTER_NAME__', values.characterName || '')
      .replaceAll('__CHARACTER_TRAITS__', values.characterTraits || '')
      .replaceAll('__STEPS__', String(values.steps || 28))
      .replaceAll('__CFG__', String(values.cfg ?? 7))
      .replaceAll('__DENOISE__', String(values.denoise ?? 0.65));
    return replaced;
  }
  if (Array.isArray(value)) return value.map((entry) => substituteTokens(entry, values));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, coerce(key, substituteTokens(entry, values))]),
    );
  }
  return value;
}

/** A field that is nothing but a token should come back out as a number. */
function coerce(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  if (INTEGER_KEYS.has(key) && /^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (FLOAT_KEYS.has(key) && /^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return value;
}

/** Report which documented tokens a template actually uses — helps operators. */
export function detectTokens(graph: unknown): string[] {
  const found = new Set<string>();
  const walk = (value: any) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/__[A-Z_]+__/g)) found.add(match[0]);
      return;
    }
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(graph);
  return [...found].sort();
}
