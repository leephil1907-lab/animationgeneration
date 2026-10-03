'use client';

import { useEffect,useRef,useState } from 'react';
import { MessageSquare,Sparkles,Bot,User,ChevronDown,Plus,Wrench,Volume2,Mic,Square } from 'lucide-react';
import ChatComposer, { type VsChatInputApi } from '@/components/ChatComposer';
import type { Conversation,Message,ToolCall } from '@/lib/types';

const STORAGE_KEY='ags-conversations';
function loadConversations():Conversation[]{try{const raw=localStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw):[]}catch{return[]}}
function saveConversations(list:Conversation[]){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(list))}catch{}}

function speak(text:string,voiceHint=''){
  if(typeof window==='undefined'||typeof SpeechSynthesisUtterance==='undefined')return;
  const utter=new SpeechSynthesisUtterance(text);
  utter.rate=.95;
  if(voiceHint.includes('deep'))utter.pitch=.8;
  else if(voiceHint.includes('soft'))utter.pitch=1.15;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function ToolCard({tool}:{tool:ToolCall}){
  const [open,setOpen]=useState(tool.status!=='completed');
  return <div className="toolCard"><button type="button" className="toolHead" onClick={()=>setOpen(v=>!v)}><Wrench size={14}/><span className="toolName">{tool.name}</span><span className={'toolStatus '+tool.status}>{tool.status}</span><ChevronDown size={14} className={open?'rot':''}/></button>{open&&tool.result&&<pre className="toolResult">{tool.result}</pre>}</div>;
}

type ActiveCharacter={name:string;traits?:string;notes?:string;voice?:string}|null;

export default function ChatPanel({activeCharacter}:{activeCharacter?:ActiveCharacter}){
  const [conversations,setConversations]=useState<Conversation[]>([]),[activeId,setActiveId]=useState(''),[sending,setSending]=useState(false),[recording,setRecording]=useState(false),[transcribing,setTranscribing]=useState(false);
  const composerRef=useRef<VsChatInputApi|null>(null);
  const abortRef=useRef<AbortController|null>(null);
  const mediaRecorder=useRef<MediaRecorder|null>(null);
  const chunks=useRef<Blob[]>([]);
  const bottomRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{const list=loadConversations();setConversations(list);if(list.length)setActiveId(list[0].id)},[]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[conversations,activeId,sending,transcribing]);
  const active=conversations.find(c=>c.id===activeId);

  function createConversation(){
    const now=new Date().toISOString();
    const c:Conversation={id:crypto.randomUUID(),title:activeCharacter?.name?'Chat with '+activeCharacter.name:'New conversation',createdAt:now,updatedAt:now,messages:[]};
    const next=[c,...conversations];setConversations(next);saveConversations(next);setActiveId(c.id);
  }

  async function send(content:string,opts:{isVoice?:boolean;files?:{name:string}[];model?:string;signal?:AbortSignal}={}){
    const body=(opts.isVoice?'🎤 ':'')+content.trim();
    const attachments=opts.files&&opts.files.length? '\n📎 '+opts.files.map(f=>f.name).join(', '):'';
    if(!body||sending)return;
    let conv=active;
    if(!conv){
      const now=new Date().toISOString();
      conv={id:crypto.randomUUID(),title:body.slice(0,40),createdAt:now,updatedAt:now,messages:[]};
      setConversations(prev=>{const next=[conv!,...prev];saveConversations(next);return next});setActiveId(conv.id);
    }
    const userMsg:Message={id:crypto.randomUUID(),role:'user',content:body+attachments,createdAt:new Date().toISOString()};
    setSending(true);
    setConversations(prev=>{const next=prev.map(c=>c.id===conv!.id?{...c,title:c.messages.length===0?body.slice(0,40):c.title,updatedAt:new Date().toISOString(),messages:[...c.messages,userMsg]}:c);saveConversations(next);return next});
    try{
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:body,conversationId:conv.id,character:activeCharacter||null,model:opts.model||undefined}),signal:opts.signal});
      const data=await res.json();if(!res.ok)throw new Error(data.error||'Chat failed');
      const assistantMsg=data.message as Message;
      setConversations(prev=>{const next=prev.map(c=>c.id===conv!.id?{...c,updatedAt:new Date().toISOString(),messages:[...c.messages,assistantMsg]}:c);saveConversations(next);return next});
      if(activeCharacter)speak(assistantMsg.content,activeCharacter.voice||'');
    }catch(e){
      if(e instanceof DOMException&&e.name==='AbortError')return; // stopped by the composer
      const errMsg:Message={id:crypto.randomUUID(),role:'assistant',content:'Error: '+(e instanceof Error?e.message:String(e)),createdAt:new Date().toISOString()};
      setConversations(prev=>{const next=prev.map(c=>c.id===conv!.id?{...c,messages:[...c.messages,errMsg]}:c);saveConversations(next);return next});
    }finally{setSending(false);abortRef.current=null;composerRef.current?.setBusy(false)}
  }

  async function toggleRecording(){
    if(recording){mediaRecorder.current?.stop();setRecording(false);return}
    if(typeof navigator==='undefined'||!navigator.mediaDevices?.getUserMedia){alert('Microphone recording is not supported in this browser.');return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'audio/mp4';
      const recorder=new MediaRecorder(stream,{mimeType:mime});
      chunks.current=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data)};
      recorder.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        const blob=new Blob(chunks.current,{type:mime});
        const filename=mime.includes('mp4')?'voice-note.mp4':'voice-note.webm';
        if(blob.size>25*1024*1024){alert('Voice note is too large. Keep recordings under 25 MB.');return}
        setTranscribing(true);
        try{
          const body=new FormData();body.append('file',blob,filename);
          const res=await fetch('/api/transcribe',{method:'POST',body});
          const data=await res.json();
          if(!res.ok)throw new Error(data.error||'Transcription failed');
          const transcript=String(data.text||'').trim();
          if(!transcript)throw new Error('No speech was detected.');
          await send(transcript,{isVoice:true});
        }catch(e){alert(e instanceof Error?e.message:'Unable to transcribe voice note.')}
        finally{setTranscribing(false)}
      };
      recorder.start();
      mediaRecorder.current=recorder;
      setRecording(true);
    }catch{alert('Microphone permission denied or not available.')}
  }

  return <section className="chatWorkspace">
    <aside className="chatSidebar"><button className="primary newChat" onClick={createConversation}><Plus size={16}/> New chat</button>
      <div className="chatList">{conversations.map(c=><button key={c.id} className={c.id===activeId?'chatItem active':'chatItem'} onClick={()=>setActiveId(c.id)}><MessageSquare size={14}/><span>{c.title||'Untitled'}</span></button>)}{!conversations.length&&<p className="emptyHint">No conversations yet. Start one below.</p>}</div>
      {activeCharacter&&<div className="activeChar"><b>Speaking as</b><span>{activeCharacter.name}</span><small>{activeCharacter.voice||'browser voice'}</small></div>}
      <div className="toolLegend"><b>Available tools</b><span>comfyui_generate</span><span>web_search</span><span>open_page</span><span>x_search</span><span>code_exec</span></div>
    </aside>
    <div className="chatMain"><div className="chatMessages">
      {!active||!active.messages.length?<div className="chatEmpty"><Sparkles size={28}/><h2>{activeCharacter?'Chat with '+activeCharacter.name:'Agent conversation'}</h2><p>Send text or a voice note. Replies can be spoken aloud as the character.</p></div>:
      active.messages.map(m=><div key={m.id} className={'msg '+m.role}><div className="msgAvatar">{m.role==='user'?<User size={16}/>:<Bot size={16}/>}</div><div className="msgBody"><div className="msgContent">{m.content}</div>{m.role==='assistant'&&<button type="button" className="speakBtn" onClick={()=>speak(m.content,activeCharacter?.voice||'')} title="Play as character"><Volume2 size={14}/></button>}{m.toolCalls?.map(t=><ToolCard key={t.id} tool={t}/>)}<div className="msgTime">{new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div></div></div>)}
      {transcribing&&<div className="msg assistant"><div className="msgAvatar"><Mic size={16}/></div><div className="msgBody"><div className="typing">Transcribing voice note…</div></div></div>}
      {sending&&<div className="msg assistant"><div className="msgAvatar"><Bot size={16}/></div><div className="msgBody"><div className="typing">Thinking / running tools…</div></div></div>}<div ref={bottomRef}/>
    </div><div className="chatComposerWrap">
      <ChatComposer ref={composerRef}
        placeholder={recording?'Recording…':transcribing?'Transcribing…':'Ask anything, or drop a file…'}
        accept="image/*,.pdf,.txt" maxFiles={8} disabled={recording||transcribing}
        extraBar={<button type="button" className={recording?'micBtn recording':'micBtn micInBar'} onClick={toggleRecording} disabled={transcribing} title={recording?'Stop recording':'Voice note'} aria-label={recording?'Stop recording':'Voice note'}>{recording?<Square size={14}/>:<Mic size={14}/>}</button>}
        onSubmit={(detail)=>{
          const text=detail.text||(detail.files.length?'Sharing '+detail.files.length+' file'+(detail.files.length>1?'s':'')+'.':'');
          if(!text)return;
          abortRef.current=new AbortController();
          void send(text,{files:detail.files,model:detail.model,signal:abortRef.current.signal});
        }}
        onStop={()=>abortRef.current?.abort()}
        onFiles={(added,api)=>{
          for(const {id,file} of added){
            const reader=new FileReader();
            reader.onprogress=e=>{if(e.lengthComputable)api.setProgress(id,e.loaded/Math.max(1,e.total))};
            reader.onload=()=>api.setProgress(id,1);
            reader.onerror=()=>api.setProgress(id,1);
            reader.readAsArrayBuffer(file);
          }
        }}/>
    </div></div>
  </section>;
}
