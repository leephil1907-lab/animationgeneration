import { NextResponse } from 'next/server';
import { buildWorkflow, normalizeSettings, type CharacterProfile, type GenerationSettings, type WorkflowMode } from '@/lib/comfy/workflow';
import { moderatePrompt } from '@/lib/prompt-safety';
import { requireSameOrigin, validateContentLength } from '@/lib/api-security';

export async function POST(request:Request){
  const denied = requireSameOrigin(request) || validateContentLength(request, 30 * 1024 * 1024);
  if (denied) return denied;
  const base=(process.env.COMFYUI_URL||'http://127.0.0.1:8188').replace(/\/$/,'');
  try{
    const form=await request.formData();
    const raw=form.get('character'); const scene=String(form.get('scene')||'');
    const mode=(form.get('mode')==='video'?'video':'image') as WorkflowMode;
    const image=form.get('image'); const rawSettings=String(form.get('settings')||'{}');
    if(typeof raw!=='string') return NextResponse.json({error:'character JSON is required'},{status:400});
    if(raw.length > 20000 || scene.length > 8000) return NextResponse.json({error:'Character or scene input is too large.'},{status:413});
    const character=JSON.parse(raw) as CharacterProfile;
    if(!character?.name) return NextResponse.json({error:'character.name is required'},{status:400});
    const moderation=moderatePrompt(scene);
    if(!moderation.allowed) return NextResponse.json({error:moderation.reason,level:moderation.level,blocked:true},{status:422});
    let settings:GenerationSettings={}; try{ settings=JSON.parse(rawSettings); }catch{ return NextResponse.json({error:'settings must be valid JSON'},{status:400}); }
    const normalized=normalizeSettings(settings,mode);
    if(!normalized.checkpoint) return NextResponse.json({error:'No ComfyUI checkpoint selected. Install a checkpoint and refresh the model list.'},{status:400});
    let referenceFilename='';
    if(image instanceof File){
      if(image.size > 25 * 1024 * 1024) return NextResponse.json({error:'Reference image is too large. Maximum size is 25 MB.'},{status:413});
      if(!/^image\/(png|jpeg|webp|gif)$/i.test(image.type)) return NextResponse.json({error:'Only PNG, JPEG, WebP, and GIF reference images are accepted.'},{status:415});
      const upload=new FormData(); upload.append('image',image,image.name); upload.append('type','input'); upload.append('overwrite','false');
      const ur=await fetch(`${base}/upload/image`,{method:'POST',body:upload}); const ut=await ur.text();
      if(!ur.ok) return NextResponse.json({error:'ComfyUI rejected the reference image',details:ut},{status:ur.status});
      referenceFilename=JSON.parse(ut).name;
    }
    const prompt=buildWorkflow(character,scene,mode,referenceFilename,normalized);
    const response=await fetch(`${base}/prompt`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,client_id:'motiona-character'})});
    const responseText=await response.text();
    if(!response.ok) return NextResponse.json({error:'ComfyUI rejected the workflow',details:responseText},{status:response.status});
    const result=JSON.parse(responseText);
    return NextResponse.json({ok:true,mode,promptId:result.prompt_id,referenceFilename,settings:normalized,result});
  }catch(error){return NextResponse.json({error:'Could not upload, build, or submit workflow',details:String(error)},{status:503});}
}