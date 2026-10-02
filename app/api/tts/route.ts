import { NextRequest, NextResponse } from 'next/server';

export const runtime='nodejs';

const voiceMap:Record<string,string>={
  'warm-female':process.env.ELEVENLABS_WARM_FEMALE_VOICE_ID||'',
  'deep-male':process.env.ELEVENLABS_DEEP_MALE_VOICE_ID||'',
  'soft-breathy':process.env.ELEVENLABS_SOFT_BREATHY_VOICE_ID||'',
  'energetic':process.env.ELEVENLABS_ENERGETIC_VOICE_ID||'',
  'calm-narrator':process.env.ELEVENLABS_CALM_NARRATOR_VOICE_ID||'',
};

export async function POST(req:NextRequest){
  try{
    const {text,voice}=await req.json();
    if(typeof text!=='string'||!text.trim())return NextResponse.json({error:'text is required'},{status:400});
    const key=process.env.ELEVENLABS_API_KEY;
    if(!key)return NextResponse.json({error:'ElevenLabs is not configured.'},{status:501});
    const voiceId=voiceMap[String(voice||'warm-female')]||voiceMap['warm-female'];
    if(!voiceId)return NextResponse.json({error:'No ElevenLabs voice ID is configured for this preset.'},{status:501});
    const response=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+voiceId,{
      method:'POST',
      headers:{'xi-api-key':key,'Content-Type':'application/json','Accept':'audio/mpeg'},
      body:JSON.stringify({text:text.slice(0,500),model_id:'eleven_multilingual_v2',voice_settings:{stability:.4,similarity_boost:.75}}),
    });
    if(!response.ok)return NextResponse.json({error:'TTS provider failed.'},{status:502});
    return new NextResponse(await response.arrayBuffer(),{headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'TTS failed.'},{status:500})}
}
