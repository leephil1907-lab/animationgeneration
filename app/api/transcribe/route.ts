import { NextRequest, NextResponse } from 'next/server';

export const runtime='nodejs';

export async function POST(req:NextRequest){
  try{
    const key=process.env.OPENAI_API_KEY;
    if(!key)return NextResponse.json({error:'Speech transcription is not configured. Add OPENAI_API_KEY on the server.'},{status:501});
    const form=await req.formData();
    const file=form.get('file');
    if(!(file instanceof File))return NextResponse.json({error:'Audio file is required.'},{status:400});
    if(file.size===0)return NextResponse.json({error:'Audio file is empty.'},{status:400});
    if(file.size>25*1024*1024)return NextResponse.json({error:'Audio file must be 25 MB or smaller.'},{status:413});
    const upstream=new FormData();
    upstream.append('file',file,file.name||'voice-note.webm');
    upstream.append('model','whisper-1');
    upstream.append('response_format','json');
    const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{
      method:'POST',
      headers:{Authorization:'Bearer '+key},
      body:upstream,
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok)return NextResponse.json({error:data?.error?.message||'Transcription service failed.'},{status:502});
    return NextResponse.json({text:String(data?.text||'').trim()});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Transcription failed.'},{status:500})}
}
