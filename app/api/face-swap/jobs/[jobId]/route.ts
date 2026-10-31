import {NextResponse} from 'next/server';
import {requireSameOrigin} from '@/lib/api-security';
import {requireServerUser} from '@/lib/server-auth';
import {readRecord,writeRecord} from '@/lib/storage';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type FaceSwapRecord={id:string;owner:string;workerJobId:string;status:'queued'|'running'|'completed'|'failed';mediaType:'image'|'video';outputUrl?:string;error?:string;createdAt:string;updatedAt:string};

export async function GET(request:Request,{params}:{params:Promise<{jobId:string}>}){
 const denied=requireSameOrigin(request);if(denied)return denied;
 try{
  const user=await requireServerUser(),{jobId}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(jobId))return NextResponse.json({error:'Invalid render job id.'},{status:400});
  const record=await readRecord<FaceSwapRecord>('face-swap-jobs',jobId);
  if(!record||record.owner!==user.id)return NextResponse.json({error:'Render job not found.'},{status:404});
  if(record.status==='completed'||record.status==='failed')return NextResponse.json({jobId:record.id,status:record.status,outputUrl:record.outputUrl,mediaType:record.mediaType,error:record.error});
  const base=process.env.FACE_SWAP_API_URL;
  if(!base)return NextResponse.json({error:'Face-swap worker is no longer configured.'},{status:503});
  const workerUrl=new URL('/jobs/'+encodeURIComponent(record.workerJobId),base);
  const headers:Record<string,string>={};if(process.env.FACE_SWAP_API_KEY)headers.Authorization='Bearer '+process.env.FACE_SWAP_API_KEY;
  const response=await fetch(workerUrl,{headers,cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)return NextResponse.json({jobId:record.id,status:record.status,message:'Render is still being processed.'});
  const payload=await response.json().catch(()=>null);
  if(!payload||typeof payload!=='object')return NextResponse.json({jobId:record.id,status:record.status,message:'Render is still being processed.'});
  const status=payload.status==='completed'?'completed':payload.status==='failed'?'failed':payload.status==='running'?'running':'queued';
  const next:FaceSwapRecord={...record,status,outputUrl:status==='completed'&&typeof payload.outputUrl==='string'?payload.outputUrl:undefined,error:status==='failed'?String(payload.error||'Render worker reported a failure.').slice(0,1000):undefined,updatedAt:new Date().toISOString()};
  if(status==='completed'&&!next.outputUrl)return NextResponse.json({error:'Worker marked the render complete but did not provide an output URL.'},{status:502});
  await writeRecord('face-swap-jobs',record.id,next);
  return NextResponse.json({jobId:next.id,status:next.status,outputUrl:next.outputUrl,mediaType:payload.mediaType==='video'?'video':next.mediaType,error:next.error});
 }catch(error){
  const timeout=error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError');
  return NextResponse.json({error:timeout?'Render status check timed out. Try again.':error instanceof Error?error.message:'Could not retrieve render status.'},{status:timeout?504:502});
 }
}
