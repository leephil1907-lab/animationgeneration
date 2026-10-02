export type CharacterProfile = { name:string; role?:string; age?:string; style?:string; traits?:string; notes?:string };
export type WorkflowMode = 'image'|'video';

export function buildCharacterPrompt(character: CharacterProfile, scene: string) {
  return [character.name && `Character: ${character.name}`, character.role && `Role: ${character.role}`, character.age && `Age presentation: ${character.age}`, character.style && `Visual style: ${character.style}`, character.traits && `Appearance: ${character.traits}`, character.notes && `Direction: ${character.notes}`, scene && `Scene: ${scene}`].filter(Boolean).join('\n');
}

export function buildWorkflow(character: CharacterProfile, scene: string, mode: WorkflowMode, referenceFilename?: string) {
  const positive = buildCharacterPrompt(character, scene);
  const negative = 'low quality, distorted anatomy, duplicate subject, inconsistent character identity, unreadable text';
  if (mode === 'image') return {
    '6': { class_type:'CLIPTextEncode', inputs:{ text:positive, clip:['4',1] } },
    '7': { class_type:'CLIPTextEncode', inputs:{ text:negative, clip:['4',1] } },
    '4': { class_type:'CheckpointLoaderSimple', inputs:{ ckpt_name:'checkpoint.safetensors' } },
    '5': { class_type:'EmptyLatentImage', inputs:{ width:768, height:1024, batch_size:1 } },
    '8': { class_type:'KSampler', inputs:{ seed:Math.floor(Math.random()*2147483647), steps:28, cfg:7, sampler_name:'euler', scheduler:'normal', denoise:1, model:['4',0], positive:['6',0], negative:['7',0], latent_image:['5',0] } },
    '9': { class_type:'VAEDecode', inputs:{ samples:['8',0], vae:['4',2] } },
    '10': { class_type:'SaveImage', inputs:{ filename_prefix:'animationgeneration/character', images:['9',0] } }
  };
  return {
    '1': { class_type:'LoadImage', inputs:{ image:referenceFilename || 'character-reference.png', upload:'image' } },
    '2': { class_type:'CLIPTextEncode', inputs:{ text:positive, clip:['4',1] } },
    '3': { class_type:'CLIPTextEncode', inputs:{ text:negative, clip:['4',1] } },
    '4': { class_type:'CheckpointLoaderSimple', inputs:{ ckpt_name:'wan_or_animatediff_checkpoint.safetensors' } },
    '5': { class_type:'VHS_VideoCombine', inputs:{ images:['9',0], frame_rate:16, filename_prefix:'animationgeneration/video' } }
  };
}
