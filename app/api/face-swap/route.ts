import {NextResponse} from 'next/server';
import {requireSameOrigin,validateContentLength} from '@/lib/api-security';
import {requireServerUser} from '@/lib/server-auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const IMAGES=new Set(['image/jpeg','image/png','image/webp']);
const VIDEOS=new Set(['video/mp4','video/webm','video/quicktime']);
export async function POST(request:Request){
 const denied=requireSameOrigin(request)||validateContentLength(request,275*1024*1024);if(denied)return denied;
 try{
  await requireServerUser();
  const endpoint=process.env.FACE_SWAP_API_URL;
  if(!endpoint)return NextResponse.json({error:'Face-swap rendering is not connected yet. Configure FACE_SWAP_API_URL and FACE_SWAP_API_KEY for the MOTIONA render worker.'},{status:503});
  const incoming=await request.formData(),source=incoming.get('source'),reference=incoming.get('reference');
  if(!(source instanceof File)||!(reference instanceof File))return NextResponse.json({error:'Both a source file and a reference portrait are required.'},{status:400});
  const isVideo=VIDEOS.has(source.type);
  if(!IMAGES.has(source.type)&&!isVideo)return NextResponse.json({error:'Unsupported source media type.'},{status:415});
  if(!IMAGES.has(reference.type))return NextResponse.json({error:'Reference must be a JPEG, PNG or WebP portrait.'},{status:415});
  if(source.size>(isVideo?250:12)*1024*1024||reference.size>12*1024*1024)return NextResponse.json({error:'An uploaded file exceeds its size limit.'},{status:413});
  const form=new FormData();form.append('source',source,source.name);form.append('reference',reference,reference.name);form.append('strength',String(incoming.get('strength')||'balanced'));form.append('restore',String(incoming.get('restore')||'true'));
  const headers:Record<string,string>={};if(process.env.FACE_SWAP_API_KEY)headers.Authorization='Bearer '+process.env.FACE_SWAP_API_KEY;
  const upstream=await fetch(endpoint,{method:'POST',headers,body:form,cache:'no-store',signal:AbortSignal.timeout(600000)});
  if(!upstream.ok){const detail=(await upstream.text()).slice(0,1200);return NextResponse.json({error:detail||'Render worker returned '+upstream.status},{status:upstream.status>=500?502:upstream.status})}
  const type=upstream.headers.get('content-type')||'application/octet-stream';
  if(type.includes('application/json')){const result=await upstream.json();if(!result?.outputUrl)return NextResponse.json({error:'Render worker returned no outputUrl.'},{status:502});return NextResponse.json({outputUrl:result.outputUrl,mediaType:isVideo?'video':'image'})}
  return new NextResponse(await upstream.arrayBuffer(),{status:200,headers:{'Content-Type':type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){const timeout=error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError');return NextResponse.json({error:timeout?'The face-swap render timed out. Try a shorter clip.':error instanceof Error?error.message:'Face-swap request failed.'},{status:timeout?504:502})}
}