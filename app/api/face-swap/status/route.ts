import {NextResponse} from 'next/server';
import {requireServerUser} from '@/lib/server-auth';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
 try{
  await requireServerUser();
  const endpoint=process.env.FACE_SWAP_API_URL;
  if(!endpoint)return NextResponse.json({configured:false,available:false,provider:'Face Swap worker',message:'No render worker is configured.'});
  let healthUrl:URL;
  try{healthUrl=new URL('/health',endpoint)}catch{return NextResponse.json({configured:true,available:false,provider:'Face Swap worker',message:'FACE_SWAP_API_URL is not a valid URL.'},{status:503})}
  if(healthUrl.protocol!=='https:'&&process.env.NODE_ENV==='production')return NextResponse.json({configured:true,available:false,provider:'Face Swap worker',message:'Production worker endpoints must use HTTPS.'},{status:503});
  const headers:Record<string,string>={};if(process.env.FACE_SWAP_API_KEY)headers.Authorization='Bearer '+process.env.FACE_SWAP_API_KEY;
  const response=await fetch(healthUrl,{headers,cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(!response.ok)return NextResponse.json({configured:true,available:false,provider:'Face Swap worker',message:'Worker health check returned HTTP '+response.status},{status:503});
  const payload=await response.json().catch(()=>({}));
  return NextResponse.json({configured:true,available:payload?.status==='ok'||payload?.ok===true,provider:payload?.provider||'Face Swap worker',message:payload?.message||'Worker responded to its health check.',capabilities:Array.isArray(payload?.capabilities)?payload.capabilities:[]},{status:payload?.status==='ok'||payload?.ok===true?200:503});
 }catch(error){
  const timeout=error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError');
  return NextResponse.json({configured:Boolean(process.env.FACE_SWAP_API_URL),available:false,provider:'Face Swap worker',message:timeout?'Worker health check timed out.':error instanceof Error?error.message:'Worker health check failed.'},{status:503});
 }
}