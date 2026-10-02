import { NextResponse } from 'next/server';

function choices(info:any, node:string, input:string): string[] {
  const values = info?.[node]?.input?.required?.[input]?.[0];
  return Array.isArray(values) ? values.filter((v:any)=>typeof v==='string') : [];
}

export async function GET(){
  const base=(process.env.COMFYUI_URL||'http://127.0.0.1:8188').replace(/\/$/,'');
  try{
    const response=await fetch(`${base}/object_info`,{cache:'no-store'});
    if(!response.ok) return NextResponse.json({error:'ComfyUI object info unavailable',details:await response.text()},{status:response.status});
    const info=await response.json();
    return NextResponse.json({
      ok:true,
      checkpoints:choices(info,'CheckpointLoaderSimple','ckpt_name'),
      loras:choices(info,'LoraLoader','lora_name'),
      vaes:choices(info,'VAELoader','vae_name')
    });
  }catch(error){
    return NextResponse.json({ok:false,error:'ComfyUI model discovery failed',details:String(error)},{status:503});
  }
}
