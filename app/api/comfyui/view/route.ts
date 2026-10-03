import { NextRequest, NextResponse } from 'next/server';
import { safeComfyFilename } from '@/lib/api-security';

export async function GET(request:NextRequest) {
  const base=(process.env.COMFYUI_URL||'http://127.0.0.1:8188').replace(/\/$/,'');
  const p=request.nextUrl.searchParams;
  const filename=p.get('filename') || '';
  if(!safeComfyFilename(filename)) return NextResponse.json({error:'Invalid output filename'},{status:400});
  const subfolder=p.get('subfolder') || '';
  if(subfolder.length > 240 || subfolder.includes('..') || subfolder.includes('\\')) return NextResponse.json({error:'Invalid output subfolder'},{status:400});
  const type=p.get('type')||'output';
  if(!['output','input','temp'].includes(type)) return NextResponse.json({error:'Invalid output type'},{status:400});
  const qs=new URLSearchParams({filename,subfolder,type});
  try {
    const r=await fetch(`${base}/view?${qs.toString()}`,{cache:'no-store'});
    if(!r.ok) return NextResponse.json({error:'ComfyUI output unavailable'},{status:r.status});
    return new NextResponse(await r.arrayBuffer(),{status:200,headers:{'Content-Type':r.headers.get('content-type')||'application/octet-stream','Cache-Control':'private, max-age=60'}});
  } catch(error){return NextResponse.json({error:'Could not retrieve ComfyUI output',details:String(error)},{status:503});}
}