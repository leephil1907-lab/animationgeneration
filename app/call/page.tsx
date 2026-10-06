'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, CameraOff, Mic, MicOff, PhoneOff, Send, Sparkles, Volume2, VolumeX } from 'lucide-react';

const character={name:'Aiko Ren',tagline:'Cyberpunk wanderer',accent:'#ff4fa3',signal:'#63e6ff'};

export default function CallPage(){
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const [connected,setConnected]=useState(false);
  const [camera,setCamera]=useState(true);
  const [mic,setMic]=useState(true);
  const [sound,setSound]=useState(true);
  const [message,setMessage]=useState('');
  const [messages,setMessages]=useState<{role:'you'|'aiko';text:string}[]>([]);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');

  useEffect(()=>()=>{streamRef.current?.getTracks().forEach(t=>t.stop())},[]);

  async function startCamera(){
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
      streamRef.current=stream;
      if(videoRef.current){videoRef.current.srcObject=stream; await videoRef.current.play().catch(()=>{});}
      setConnected(true);setNotice('');
    }catch{setNotice('Camera or microphone permission was not granted. You can still use the conversation panel.');}
  }
  function toggleCamera(){
    const track=streamRef.current?.getVideoTracks()[0]; if(!track)return;
    track.enabled=!track.enabled; setCamera(track.enabled);
  }
  function toggleMic(){
    const track=streamRef.current?.getAudioTracks()[0]; if(!track)return;
    track.enabled=!track.enabled; setMic(track.enabled);
  }
  function endCall(){
    streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;
    if(videoRef.current)videoRef.current.srcObject=null;
    setConnected(false);
  }
  async function send(){
    const text=message.trim(); if(!text||busy)return;
    setMessage('');setMessages(m=>[...m,{role:'you',text}]);setBusy(true);
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId:crypto.randomUUID(),message:text,characterId:'aiko-ren',history:[...messages,{role:'user',content:text}].map(x=>({role:x.role==='you'?'user':'assistant',content:x.text}))})});
      const d=await r.json(); if(!r.ok)throw new Error(d?.error||'Conversation failed.');
      setMessages(m=>[...m,{role:'aiko',text:String(d.message?.content||d.reply||'I’m here. Tell me what you want to create.') }]);
    }catch(e){setNotice(e instanceof Error?e.message:'Conversation failed.');}
    finally{setBusy(false);}
  }

  return <main className="motionaCall">
    <header className="callHeader">
      <Link href="/" className="callBack"><ArrowLeft size={16}/> MOTIONA</Link>
      <div><b>LIVE CHARACTER SESSION</b><small>{connected?'Camera connected':'Preview mode'} · {character.name}</small></div>
      <span className={connected?'callStatus live':'callStatus'}><i/>{connected?'LIVE':'READY'}</span>
    </header>

    <section className="callStage">
      <div className="callVisualPane">
        <div className="referenceLabel">CHARACTER REFERENCE · LIVE</div>
        <div className="characterReference">
          <div className="callPortrait"><div className="callHalo"/><div className="callHead"/><div className="callShoulder"/><div className="callScan"/></div>
          <div className="characterIdentity"><span>AIKO REN</span><b>Cyberpunk wanderer</b><small>Neon noir · identity-aware character</small></div>
        </div>
      </div>

      <div className="userCallPane">
        <div className="referenceLabel">YOUR CAMERA</div>
        <div className="cameraFrame">
          <video ref={videoRef} muted playsInline className={camera?'':'cameraOff'}/>
          {!connected&&<div className="cameraEmpty"><Camera size={28}/><b>Start the live session</b><span>Your camera stays in your browser.</span><button onClick={startCamera}>Start camera</button></div>}
          {connected&&!camera&&<div className="cameraEmpty"><CameraOff size={26}/><span>Camera paused</span></div>}
          <div className="cameraName">YOU</div>
        </div>
      </div>
    </section>

    <section className="callConsole">
      <div className="callTranscript">
        <div className="transcriptTop"><span><Sparkles size={14}/> Conversation</span><small>{messages.length} messages</small></div>
        <div className="transcriptBody">
          {messages.length===0?<div className="callEmpty"><b>Talk naturally.</b><span>Aiko can help shape a scene, character, camera direction or animation while you speak.</span></div>:messages.map((m,i)=><div key={i} className={m.role==='you'?'callMsg you':'callMsg'}><b>{m.role==='you'?'You':character.name}</b><p>{m.text}</p></div>)}
          {busy&&<div className="callTyping">Aiko is thinking…</div>}
        </div>
        <div className="callComposer"><input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send()}} placeholder="Say something to Aiko…"/><button onClick={send} disabled={!message.trim()||busy}><Send size={16}/></button></div>
      </div>

      <div className="callControls">
        <div className="controlHint"><span>SESSION</span><b>{connected?'Live camera session':'Character conversation'}</b><small>Reference and camera remain side by side.</small></div>
        <div className="controlRow">
          <button onClick={toggleMic} aria-label="Toggle microphone">{mic?<Mic/>:<MicOff/>}</button>
          <button onClick={toggleCamera} aria-label="Toggle camera">{camera?<Camera/>:<CameraOff/>}</button>
          <button onClick={()=>setSound(!sound)} aria-label="Toggle sound">{sound?<Volume2/>:<VolumeX/>}</button>
          <button className="endCall" onClick={endCall} aria-label="End session"><PhoneOff/></button>
        </div>
        {notice&&<p className="callNotice">{notice}</p>}
        <Link href="/studio?view=generate" className="callCreate"><Sparkles size={14}/> Turn this conversation into a creation</Link>
      </div>
    </section>
  </main>;
}
