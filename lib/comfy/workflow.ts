/**
 * ComfyUI workflow adapter.
 *
 * Two things changed from the original:
 *
 * 1. The video scaffold referenced a node ('9') that the graph never defined, so
 *    ComfyUI would reject it outright. `validateGraph` now catches dangling node
 *    references before submission, and the scaffold is internally consistent.
 *
 * 2. Character consistency. Shots previously each rolled their own seed and
 *    re-derived their own prompt, so the same character drifted between shots.
 *    `buildShotPrompt` + a locked seed give cross-shot identity anchoring using
 *    synthetic descriptions only — no real-person likeness is involved.
 */

export type CharacterProfile = { name:string; role?:string; age?:string; style?:string; traits?:string; notes?:string };
export type WorkflowMode = 'image'|'video';
export type GenerationSettings = {
  checkpoint?:string; lora?:string; loraStrength?:number; width?:number; height?:number; steps?:number; cfg?:number; seed?:number;
  sampler?:string; scheduler?:string; denoise?:number; batchSize?:number; negativePrompt?:string;
  /** Video only. */ frames?:number; fps?:number;
};

export type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export function buildCharacterPrompt(character: CharacterProfile, scene: string) {
  return [character.name&&`Character: ${character.name}`,character.role&&`Role: ${character.role}`,character.age&&`Age presentation: ${character.age}`,character.style&&`Visual style: ${character.style}`,character.traits&&`Appearance: ${character.traits}`,character.notes&&`Direction: ${character.notes}`,scene&&`Scene: ${scene}`].filter(Boolean).join('\n');
}

const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));

export function randomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

/**
 * Fill in defaults for a generation request.
 *
 * `mode` matters for the checkpoint: video workers need a video model. The
 * original always read COMFYUI_CHECKPOINT and then tried
 * `settings.checkpoint || COMFYUI_VIDEO_CHECKPOINT` downstream — but by then
 * `settings.checkpoint` was already populated with the *image* model, so the
 * video fallback never fired and video jobs silently loaded an image checkpoint.
 */
export function normalizeSettings(s:GenerationSettings={}, mode:WorkflowMode='image'): Required<GenerationSettings>{
  const envCheckpoint = mode==='video'
    ? (process.env.COMFYUI_VIDEO_CHECKPOINT || process.env.COMFYUI_CHECKPOINT || '')
    : (process.env.COMFYUI_CHECKPOINT || '');
  return {
    checkpoint:s.checkpoint||envCheckpoint, lora:s.lora||'', loraStrength:clamp(Number(s.loraStrength??0.8),0,2),
    width:clamp(Math.round(s.width||768),256,1536), height:clamp(Math.round(s.height||1024),256,1536),
    steps:clamp(Math.round(s.steps||28),1,80), cfg:clamp(Number(s.cfg??7),1,20),
    seed:Number.isFinite(Number(s.seed))?Math.abs(Math.floor(Number(s.seed))):randomSeed(),
    sampler:s.sampler||'euler', scheduler:s.scheduler||'normal', denoise:clamp(Number(s.denoise??0.65),0,1),
    batchSize:clamp(Math.round(s.batchSize||1),1,4),
    negativePrompt:s.negativePrompt||'low quality, distorted anatomy, duplicate subject, inconsistent character identity, unreadable text',
    frames:clamp(Math.round(s.frames||16),2,256), fps:clamp(Math.round(s.fps||16),1,60),
  };
}

export type GraphProblem = { node: string; input: string; references: string };

/**
 * Verify that every `["<id>", <slot>]` link points at a node the graph defines.
 *
 * This is the check whose absence let the broken video scaffold ship. Run it
 * before submitting anything to ComfyUI: a dangling reference produces a
 * confusing server-side error, whereas here it names the exact node and input.
 */
export function validateGraph(graph: Graph): GraphProblem[] {
  const problems: GraphProblem[] = [];
  const ids = new Set(Object.keys(graph));

  for (const [nodeId, node] of Object.entries(graph)) {
    if (!node || typeof node !== 'object' || !node.class_type) {
      problems.push({ node: nodeId, input: 'class_type', references: '(missing class_type)' });
      continue;
    }
    for (const [inputName, value] of Object.entries(node.inputs || {})) {
      if (!Array.isArray(value) || value.length !== 2) continue;
      const [sourceId, slot] = value as [unknown, unknown];
      if (typeof sourceId !== 'string' || typeof slot !== 'number') continue;
      if (!ids.has(sourceId)) {
        problems.push({ node: nodeId, input: inputName, references: sourceId });
      }
    }
  }
  return problems;
}

export function describeGraphProblems(problems: GraphProblem[]): string {
  if (problems.length === 0) return '';
  return problems
    .map((p) => `node "${p.node}" input "${p.input}" references undefined node "${p.references}"`)
    .join('; ');
}

/**
 * Compose a shot prompt that keeps a character stable across a sequence.
 *
 * Consistency comes from three things working together: a fixed descriptive
 * anchor repeated verbatim in every shot, a locked seed, and the camera move
 * appended last so it never displaces the identity description.
 */
export function buildShotPrompt(
  character: Pick<CharacterProfile, 'name' | 'style' | 'traits'> | undefined,
  shot: { prompt?: string; camera?: string; scene?: string; dialogue?: string },
): string {
  const anchor = character
    ? [
        character.name && `${character.name}`,
        character.traits && `${character.traits}`,
        character.style && `${character.style}`,
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return [
    anchor && `[character anchor: ${anchor}]`,
    shot.scene && `[scene: ${shot.scene}]`,
    shot.prompt?.trim(),
    shot.camera && `[camera: ${shot.camera}]`,
    shot.dialogue?.trim() && `[performance: ${shot.dialogue.trim()}]`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The shot's own descriptive text, without the character anchor.
 *
 * Use this when handing a shot to `buildWorkflow`, which already emits the
 * character identity from its profile. Passing the full `buildShotPrompt` output
 * instead duplicates the character lines ("Character: X / Scene: [character
 * anchor: X]"), which wastes prompt weight and can confuse the model.
 */
export function buildShotScene(shot: { prompt?: string; camera?: string; scene?: string; dialogue?: string }): string {
  return [
    shot.scene && `[scene: ${shot.scene}]`,
    shot.prompt?.trim(),
    shot.camera && `[camera: ${shot.camera}]`,
    shot.dialogue?.trim() && `[performance: ${shot.dialogue.trim()}]`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildWorkflow(character:CharacterProfile,scene:string,mode:WorkflowMode,referenceFilename?:string,rawSettings:GenerationSettings={}): Graph {
  const positive=buildCharacterPrompt(character,scene); const settings=normalizeSettings(rawSettings,mode);

  if(mode==='image') {
    const graph:Graph={
      '4':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:settings.checkpoint}},
      '6':{class_type:'CLIPTextEncode',inputs:{text:positive,clip:['4',1]}},
      '7':{class_type:'CLIPTextEncode',inputs:{text:settings.negativePrompt,clip:['4',1]}},
      '5':{class_type:'EmptyLatentImage',inputs:{width:settings.width,height:settings.height,batch_size:settings.batchSize}},
      '8':{class_type:'KSampler',inputs:{seed:settings.seed,steps:settings.steps,cfg:settings.cfg,sampler_name:settings.sampler,scheduler:settings.scheduler,denoise:1,model:['4',0],positive:['6',0],negative:['7',0],latent_image:['5',0]}},
      '9':{class_type:'VAEDecode',inputs:{samples:['8',0],vae:['4',2]}},
      '10':{class_type:'SaveImage',inputs:{filename_prefix:'animationgeneration/character',images:['9',0]}}
    };
    if(settings.lora){
      graph['13']={class_type:'LoraLoader',inputs:{model:['4',0],clip:['4',1],lora_name:settings.lora,strength_model:settings.loraStrength,strength_clip:settings.loraStrength}};
      graph['6'].inputs.clip=['13',1]; graph['7'].inputs.clip=['13',1]; graph['8'].inputs.model=['13',0];
    }
    if(referenceFilename){
      graph['11']={class_type:'LoadImage',inputs:{image:referenceFilename}};
      graph['12']={class_type:'VAEEncode',inputs:{pixels:['11',0],vae:['4',2]}};
      graph['8'].inputs.latent_image=['12',0]; graph['8'].inputs.denoise=settings.denoise;
    }
    return graph;
  }

  /**
   * Video scaffold.
   *
   * This is an AnimateDiff-shaped fallback: a batched latent drives `frames`
   * samples through one KSampler, which decodes to an image sequence that
   * VHS_VideoCombine encodes to video. Every link resolves to a defined node.
   *
   * It still requires the AnimateDiff custom nodes to be installed, which is why
   * the UI treats an operator-imported API-format JSON as the primary path. The
   * difference from before is that this graph is now internally valid, so it
   * fails on a missing custom node (an actionable error) rather than on a
   * dangling reference (an opaque one).
   */
  const video:Graph={
    '4':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:settings.checkpoint}},
    '2':{class_type:'CLIPTextEncode',inputs:{text:positive,clip:['4',1]}},
    '3':{class_type:'CLIPTextEncode',inputs:{text:settings.negativePrompt,clip:['4',1]}},
    '6':{class_type:'ADE_AnimateDiffUniformContextOptions',inputs:{context_length:16,context_stride:1,context_overlap:4,closed_loop:false}},
    '7':{class_type:'ADE_ApplyAnimateDiffModelSimple',inputs:{motion_lora:settings.lora||'',context_options:['6',0]}},
    '5':{class_type:'EmptyLatentImage',inputs:{width:settings.width,height:settings.height,batch_size:settings.frames}},
    '8':{class_type:'KSampler',inputs:{seed:settings.seed,steps:settings.steps,cfg:settings.cfg,sampler_name:settings.sampler,scheduler:settings.scheduler,denoise:1,model:['7',0],positive:['2',0],negative:['3',0],latent_image:['5',0]}},
    '9':{class_type:'VAEDecode',inputs:{samples:['8',0],vae:['4',2]}},
    '10':{class_type:'VHS_VideoCombine',inputs:{images:['9',0],frame_rate:settings.fps,loop_count:0,filename_prefix:'animationgeneration/video',format:'video/h264-mp4',save_output:true}},
  };

  // Image-to-video: seed the latent from a reference frame instead of noise.
  if(referenceFilename){
    video['1']={class_type:'LoadImage',inputs:{image:referenceFilename}};
    video['12']={class_type:'VAEEncode',inputs:{pixels:['1',0],vae:['4',2]}};
    video['13']={class_type:'RepeatLatentBatch',inputs:{samples:['12',0],amount:settings.frames}};
    video['8'].inputs.latent_image=['13',0];
    video['8'].inputs.denoise=settings.denoise;
    delete video['5'];
  }

  return video;
}
