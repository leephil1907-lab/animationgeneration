import { NextResponse } from 'next/server';
import { buildWorkflow, type CharacterProfile, type WorkflowMode } from '@/lib/comfy/workflow';

export async function POST(request:Request){
  const base=(process.env.COMFYUI_URL||'http://127.0.0.1:8188').replace(/\/$/,'');
  try{
    const form=await request.formData();
    const raw=form.get('character');
    const scene=String(form.get('scene')||'');
    const mode=(form.get('mode')==='video'?'video':'image') as WorkflowMode;
    const image=form.get('image');
    if(typeof raw!=='string') return NextResponse.json({error:'character JSON is required'},{status:400});
    const character=JSON.parse(raw) as CharacterProfile;
    if(!character?.name) return NextResponse.json({error:'character.name is required'},{status:400});
    let referenceFilename='';
    if(image instanceof File){
      const upload=new FormData(); upload.append('image',image,image.name); upload.append('type','input'); upload.append('overwrite','false');
      const ur=await fetch(`${base}/upload/image`,{method:'POST',body:upload});
      const ut=await ur.text();
      if(!ur.ok) return NextResponse.json({error:'ComfyUI rejected the reference image',details:ut},{status:ur.status});
      const uploaded=JSON.parse(ut); referenceFilename=uploaded.name;
    }
    const prompt=buildWorkflow(character,scene,mode,referenceFilename);
    const response=await fetch(`${base}/prompt`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,client_id:'animation-generation-studio'})});
    const text=await response.text();
    if(!response.ok) return NextResponse.json({error:'ComfyUI rejected the workflow',details:text,workflow:prompt},{status:response.status});
    const result=JSON.parse(text);
    return NextResponse.json({ok:true,mode,promptId:result.prompt_id,referenceFilename,workflow:prompt,result});
  }catch(error){return NextResponse.json({error:'Could not upload, build, or submit workflow',details:String(error)},{status:503});}
}
