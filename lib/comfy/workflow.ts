export type CharacterProfile = { name:string; role?:string; age?:string; style?:string; traits?:string; notes?:string };
export type WorkflowMode = 'image'|'video';
export type GenerationSettings = {
  checkpoint?:string; width?:number; height?:number; steps?:number; cfg?:number; seed?:number;
  sampler?:string; scheduler?:string; denoise?:number; batchSize?:number; negativePrompt?:string;
};

export function buildCharacterPrompt(character: CharacterProfile, scene: string) {
  return [character.name&&`Character: ${character.name}`,character.role&&`Role: ${character.role}`,character.age&&`Age presentation: ${character.age}`,character.style&&`Visual style: ${character.style}`,character.traits&&`Appearance: ${character.traits}`,character.notes&&`Direction: ${character.notes}`,scene&&`Scene: ${scene}`].filter(Boolean).join('\n');
}

const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
export function normalizeSettings(s:GenerationSettings={}): Required<GenerationSettings>{
  return {
    checkpoint:s.checkpoint||process.env.COMFYUI_CHECKPOINT||'',
    width:clamp(Math.round(s.width||768),256,1536),
    height:clamp(Math.round(s.height||1024),256,1536),
    steps:clamp(Math.round(s.steps||28),1,80),
    cfg:clamp(Number(s.cfg??7),1,20),
    seed:Number.isFinite(Number(s.seed))?Math.abs(Math.floor(Number(s.seed))):Math.floor(Math.random()*2147483647),
    sampler:s.sampler||'euler',
    scheduler:s.scheduler||'normal',
    denoise:clamp(Number(s.denoise??0.65),0,1),
    batchSize:clamp(Math.round(s.batchSize||1),1,4),
    negativePrompt:s.negativePrompt||'low quality, distorted anatomy, duplicate subject, inconsistent character identity, unreadable text'
  };
}

export function buildWorkflow(character:CharacterProfile,scene:string,mode:WorkflowMode,referenceFilename?:string,rawSettings:GenerationSettings={}) {
  const positive=buildCharacterPrompt(character,scene);
  const settings=normalizeSettings(rawSettings);
  if(mode==='image') {
    const graph:any={
      '4':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:settings.checkpoint}},
      '6':{class_type:'CLIPTextEncode',inputs:{text:positive,clip:['4',1]}},
      '7':{class_type:'CLIPTextEncode',inputs:{text:settings.negativePrompt,clip:['4',1]}},
      '5':{class_type:'EmptyLatentImage',inputs:{width:settings.width,height:settings.height,batch_size:settings.batchSize}},
      '8':{class_type:'KSampler',inputs:{seed:settings.seed,steps:settings.steps,cfg:settings.cfg,sampler_name:settings.sampler,scheduler:settings.scheduler,denoise:1,model:['4',0],positive:['6',0],negative:['7',0],latent_image:['5',0]}},
      '9':{class_type:'VAEDecode',inputs:{samples:['8',0],vae:['4',2]}},
      '10':{class_type:'SaveImage',inputs:{filename_prefix:'animationgeneration/character',images:['9',0]}}
    };
    if(referenceFilename){
      graph['11']={class_type:'LoadImage',inputs:{image:referenceFilename}};
      graph['12']={class_type:'VAEEncode',inputs:{pixels:['11',0],vae:['4',2]}};
      graph['8'].inputs.latent_image=['12',0];
      graph['8'].inputs.denoise=settings.denoise;
    }
    return graph;
  }
  return {
    '1':{class_type:'LoadImage',inputs:{image:referenceFilename||'character-reference.png'}},
    '2':{class_type:'CLIPTextEncode',inputs:{text:positive,clip:['4',1]}},
    '3':{class_type:'CLIPTextEncode',inputs:{text:settings.negativePrompt,clip:['4',1]}},
    '4':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:settings.checkpoint||process.env.COMFYUI_VIDEO_CHECKPOINT||''}},
    '5':{class_type:'VHS_VideoCombine',inputs:{images:['9',0],frame_rate:16,filename_prefix:'animationgeneration/video'}}
  };
}
