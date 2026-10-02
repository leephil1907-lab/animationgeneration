import { NextResponse } from 'next/server';

export async function GET(_:Request,{params}:{params:Promise<{promptId:string}>}) {
  const {promptId}=await params;
  const base=(process.env.COMFYUI_URL||'http://127.0.0.1:8188').replace(/\/$/,'');
  try {
    const r=await fetch(`${base}/history/${encodeURIComponent(promptId)}`,{cache:'no-store'});
    const text=await r.text();
    if(!r.ok) return NextResponse.json({error:'ComfyUI history request failed',details:text},{status:r.status});
    const history=JSON.parse(text);
    const item=history[promptId];
    if(!item) return NextResponse.json({status:'queued',promptId});
    const outputs=[] as Array<{filename:string;subfolder:string;type:string;url:string}>;
    for(const node of Object.values(item.outputs||{}) as any[]) {
      for(const key of ['images','gifs','videos','files']) {
        for(const file of (node?.[key]||[])) if(file?.filename) outputs.push({...file,url:`/api/comfyui/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder||'')}&type=${encodeURIComponent(file.type||'output')}`});
      }
    }
    return NextResponse.json({status:'completed',promptId,outputs,history:item});
  } catch(error){ return NextResponse.json({error:'Could not read ComfyUI job',details:String(error)},{status:503}); }
}