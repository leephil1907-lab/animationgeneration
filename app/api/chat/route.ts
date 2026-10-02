import { NextRequest, NextResponse } from 'next/server';
import { detectTools, executeTool } from '@/lib/tools';
import type { Message, ToolCall } from '@/lib/types';

export const runtime='nodejs';

export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const {message,conversationId}=body as {message:string;conversationId?:string};
    if(!message||typeof message!=='string')return NextResponse.json({error:'message is required'},{status:400});
    const baseUrl=process.env.NEXT_PUBLIC_BASE_URL||req.nextUrl.origin;
    const detected=detectTools(message); const toolCalls:ToolCall[]=[];
    for(const d of detected){
      const id=crypto.randomUUID(); toolCalls.push({id,name:d.name,args:d.args,status:'running'});
      const {result,status}=await executeTool(d.name,d.args,baseUrl);
      const last=toolCalls[toolCalls.length-1]; last.result=result; last.status=status;
    }
    const content=toolCalls.length
      ? 'I ran the following tool'+(toolCalls.length>1?'s':'')+': **'+toolCalls.map(t=>t.name).join(', ')+'**. See the tool cards below for results.'
      : 'I can help you generate images with ComfyUI, search the web, open pages, or search X once the corresponding API keys are configured. Try: “Generate a cinematic portrait of a cyberpunk detective” or “Search the web for the latest ComfyUI workflows”.';
    const assistantMessage:Message={id:crypto.randomUUID(),role:'assistant',content,createdAt:new Date().toISOString(),toolCalls:toolCalls.length?toolCalls:undefined};
    return NextResponse.json({conversationId:conversationId||crypto.randomUUID(),message:assistantMessage});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Internal error'},{status:500});}
}
