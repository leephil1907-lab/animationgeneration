import { NextResponse } from 'next/server';
import { requireSameOrigin, validateContentLength } from '@/lib/api-security';

export async function POST(request: Request) {
  const denied = requireSameOrigin(request) || validateContentLength(request, 30 * 1024 * 1024);
  if (denied) return denied;
  const base=(process.env.COMFYUI_URL||'http://127.0.0.1:8188').replace(/\/$/,'');
  try {
    const incoming=await request.formData();
    const image=incoming.get('image');
    if (!(image instanceof File)) return NextResponse.json({error:'image file is required'},{status:400});
    if (image.size > 25 * 1024 * 1024) return NextResponse.json({error:'Image is too large. Maximum size is 25 MB.'},{status:413});
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(image.type)) return NextResponse.json({error:'Only PNG, JPEG, WebP, and GIF images are accepted.'},{status:415});
    const form=new FormData();
    form.append('image',image,image.name);
    form.append('type','input');
    form.append('overwrite','false');
    const r=await fetch(`${base}/upload/image`,{method:'POST',body:form});
    const text=await r.text();
    if(!r.ok) return NextResponse.json({error:'ComfyUI rejected the image upload',details:text},{status:r.status});
    return new NextResponse(text,{status:200,headers:{'Content-Type':'application/json'}});
  } catch(error){ return NextResponse.json({error:'Could not upload image to ComfyUI',details:String(error)},{status:503}); }
}