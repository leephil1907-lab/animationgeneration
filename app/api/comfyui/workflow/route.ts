import { NextResponse } from 'next/server';

type Values = { prompt?:string; negativePrompt?:string; seed?:number; width?:number; height?:number; referenceFilename?:string };

function replaceTokens(value:any, values:Values):any {
  if(typeof value==='string'){
    return value
      .replaceAll('__PROMPT__',values.prompt||'')
      .replaceAll('__NEGATIVE_PROMPT__',values.negativePrompt||'')
      .replaceAll('__REFERENCE_IMAGE__',values.referenceFilename||'')
      .replaceAll('__SEED__',String(values.seed??Math.floor(Math.random()*2147483647)))
      .replaceAll('__WIDTH__',String(values.width||768))
      .replaceAll('__HEIGHT__',String(values.height||1024));
  }
  if(Array.isArray(value)) return value.map(v=>replaceTokens(v,values));
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replaceTokens(v,values)]));
  return value;
}

export async function POST(request:Request){
  const base=(process.env.COMFYUI_URL||'http://127.0.0.1:8188').replace(/\/$/,'');
  try{
    const body=await request.json();
    if(!body?.workflow || typeof body.workflow!=='object') return NextResponse.json({error:'workflow object is required'},{status:400});
    const workflow=replaceTokens(body.workflow,body.values||{});
    const response=await fetch(`${base}/prompt`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:workflow,client_id:'animation-generation-studio-template'})});
    const text=await response.text();
    if(!response.ok) return NextResponse.json({error:'ComfyUI rejected the imported workflow',details:text},{status:response.status});
    const result=JSON.parse(text);
    return NextResponse.json({ok:true,promptId:result.prompt_id,result});
  }catch(error){return NextResponse.json({error:'Could not submit workflow template',details:String(error)},{status:503});}
}
