import { NextRequest, NextResponse } from 'next/server';
import { detectTools, executeTool } from '@/lib/tools';
import type { Message, ToolCall } from '@/lib/types';
import { moderatePrompt } from '@/lib/prompt-safety';
import { requireSameOrigin, validateContentLength } from '@/lib/api-security';
import { requireServerUser } from '@/lib/server-auth';
import { readRecord } from '@/lib/storage';

export const runtime='nodejs';

const characters:Record<string,{name:string;persona:string;style:string}>={
  'aiko-ren':{name:'Aiko Ren',persona:'A mysterious cyberpunk wanderer: observant, dryly witty, curious about strange cities and calm under pressure.',style:'neon noir'},
  'mara-vale':{name:'Mara Vale',persona:'A cinematic detective: warm but guarded, perceptive, and fascinated by the small details that make a scene feel real.',style:'neo-noir'},
  'nova-9':{name:'Nova 9',persona:'An original synthetic performer: playful, precise, curious about sound, motion and visual rhythm.',style:'futurist'},
};

async function characterReply(character:{name:string;persona:string;style:string},history:Array<{role:'user'|'assistant';content:string}>){
  const key=process.env.OPENAI_API_KEY;
  if(!key)return null;
  const model=process.env.OPENAI_CHAT_MODEL||'gpt-5';
  const system=[
    'You are MOTIONA\'s character conversation layer.',
    'Speak as the selected fictional adult character while staying clear that this is an AI character when relevant.',
    'Help the creator brainstorm scenes, dialogue, character development, visual direction, camera, lighting, wardrobe and animation.',
    'Do not claim an image or video was generated unless a real generation job was executed.',
    'Never sexualize minors, assist non-consensual sexual scenarios, or sexualize real people or celebrities.',
    'Keep replies conversational and practical. Ask a short follow-up only when it genuinely helps.',
    'Character name: '+character.name,
    'Persona: '+character.persona,
    'Visual language: '+character.style,
  ].join('\n');
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
    body:JSON.stringify({model,input:[{role:'system',content:system},...history.slice(-16)]}),
  });
  if(!response.ok)return null;
  const data=await response.json();
  return String(data?.output_text||'').trim()||null;
}

export async function POST(req:NextRequest){
  const denied=requireSameOrigin(req)||validateContentLength(req,128*1024);
  if(denied)return denied;
  try{
    await requireServerUser();
    const body=await req.json();
    const message=typeof body?.message==='string'?body.message.trim().slice(0,8000):'';
    if(!message)return NextResponse.json({error:'message is required'},{status:400});
    const moderation=moderatePrompt(message);
    if(!moderation.allowed)return NextResponse.json({error:moderation.reason,blocked:true,level:moderation.level},{status:422});
    const character=characters[String(body?.characterId)]||characters['aiko-ren'];
    const history=Array.isArray(body?.history)
      ?body.history.filter((m:any)=>m&&(['user','assistant'] as string[]).includes(m.role)&&typeof m.content==='string').slice(-16).map((m:any)=>({role:m.role,content:m.content.slice(0,6000)}))
      :[{role:'user' as const,content:message}];

    const toolCalls:ToolCall[]=[];
    for(const d of detectTools(message)){
      const id=crypto.randomUUID();
      toolCalls.push({id,name:d.name,args:d.args,status:'running'});
      const result=await executeTool(d.name,d.args,process.env.NEXT_PUBLIC_BASE_URL||req.nextUrl.origin);
      const last=toolCalls[toolCalls.length-1];last.result=result.result;last.status=result.status;
    }

    const memory=await readRecord<any>('character-memory',character.id).catch(()=>null);
    const memoryHistory=Array.isArray(memory?.recentMessages)?memory.recentMessages.slice(-6):[];
    const reply=await characterReply(character,[...memoryHistory,...history].slice(-16));
    const content=reply||(toolCalls.length
      ?'I ran '+(toolCalls.length>1?'the requested tools':'the requested tool')+': **'+toolCalls.map(t=>t.name).join(', ')+'**. See the tool result below.'
      :'Conversation AI is not configured on this deployment yet. Add OPENAI_API_KEY on the server to enable character conversations.');
    const assistantMessage:Message={id:crypto.randomUUID(),role:'assistant',content,createdAt:new Date().toISOString(),toolCalls:toolCalls.length?toolCalls:undefined};
    return NextResponse.json({conversationId:body?.conversationId||crypto.randomUUID(),message:assistantMessage});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Internal error'},{status:500});}
}