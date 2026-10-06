import { NextResponse } from 'next/server';
import { requireSameOrigin, validateContentLength } from '@/lib/api-security';
import { requireServerUser } from '@/lib/server-auth';
import { readRecord, writeRecord } from '@/lib/storage';

export const runtime='nodejs';
export const dynamic='force-dynamic';

type Memory={characterId:string;characterName:string;conversationCount:number;facts:string[];recentMessages:Array<{role:'user'|'assistant';content:string}>;updatedAt:string};

function cleanMessage(value:unknown,max=900){return typeof value==='string'?value.trim().slice(0,max):'';}

export async function GET(request:Request){
  const denied=requireSameOrigin(request); if(denied)return denied;
  try{
    await requireServerUser();
    const {searchParams}=new URL(request.url);
    const characterId=cleanMessage(searchParams.get('characterId'),80);
    if(!characterId)return NextResponse.json({error:'characterId is required'},{status:400});
    return NextResponse.json({memory:await readRecord<Memory>('character-memory',characterId)});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not read memory'},{status:500});}
}

export async function POST(request:Request){
  const denied=requireSameOrigin(request)||validateContentLength(request,128*1024); if(denied)return denied;
  try{
    await requireServerUser();
    const body=await request.json();
    const characterId=cleanMessage(body?.characterId,80);
    const characterName=cleanMessage(body?.characterName,120)||characterId;
    const incoming=Array.isArray(body?.messages)
      ?body.messages.map((m:any)=>({role:m?.role==='assistant'?'assistant':'user',content:cleanMessage(m?.content)})).filter((m:any)=>m.content).slice(-12)
      : [];
    if(!characterId)return NextResponse.json({error:'characterId is required'},{status:400});
    const existing=await readRecord<Memory>('character-memory',characterId);
    const facts=Array.from(new Set([...(existing?.facts||[]),...incoming.filter((m:any)=>m.role==='user').map((m:any)=>m.content)])).slice(-12);
    const memory={characterId,characterName,conversationCount:(existing?.conversationCount||0)+1,facts,recentMessages:incoming,updatedAt:new Date().toISOString()};
    await writeRecord('character-memory',characterId,memory);
    return NextResponse.json({ok:true,memory});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not save memory'},{status:500});}
}