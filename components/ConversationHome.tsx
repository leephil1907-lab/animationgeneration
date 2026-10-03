'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Clapperboard, Film, Image as ImageIcon, Mic, MoreHorizontal, Plus, Search, Send, Sparkles, Video, Wand2, Square } from 'lucide-react';

type Character={id:string;name:string;tagline:string;style:string;initials:string;accent:string;visual:string;signal:string;};
function CharacterVisual({character,className=''}:{character:Character;className?:string}){
  return <span className={`characterVisual ${className}`} style={{'--accent':character.accent,'--signal':character.signal} as React.CSSProperties} aria-hidden="true">
    <span className="portraitGlow"/><span className="portraitHalo"/><span className="portraitHead"/><span className="portraitFace"/><span className="portraitShoulder"/><span className="portraitScan"/><span className="portraitLabel">{character.visual}</span>
  </span>;
}
type ChatMessage={role:'user'|'assistant';content:string};
type SavedConversation={id:string;characterId:string;title:string;messages:ChatMessage[];updatedAt:string};

const characters:Character[]=[
  {id:'aiko-ren',name:'Aiko Ren',tagline:'Cyberpunk wanderer',style:'Neon noir',initials:'AR',accent:'#ff4fa3',signal:'#63e6ff',visual:'NEON / NIGHT'},
  {id:'mara-vale',name:'Mara Vale',tagline:'Cinematic detective',style:'Neo-noir',initials:'MV',accent:'#9b7cff',signal:'#ffd1e8',visual:'NOIR / RAIN'},
  {id:'nova-9',name:'Nova 9',tagline:'Synthetic performer',style:'Futurist',initials:'N9',accent:'#63e6ff',signal:'#ff4fa3',visual:'SYNTH / LIGHT'},
];
const starters=['Help me design her next scene','Create a cinematic portrait concept','Build a 30-second video sequence','Give me three outfit directions'];
const STORAGE='motiona-conversations';

export default function ConversationHome(){
  const [selected,setSelected]=useState(characters[0]);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [history,setHistory]=useState<SavedConversation[]>([]);
  const [conversationId,setConversationId]=useState('');
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [recording,setRecording]=useState(false);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const chunksRef=useRef<Blob[]>([]);

  const greeting=useMemo(()=>`I'm ${selected.name}. Tell me what you want to make, and we can shape the character, scene, camera and motion together.`,[selected]);

  useEffect(()=>{
    try{const raw=localStorage.getItem(STORAGE);if(raw)setHistory(JSON.parse(raw));}catch{}
  },[]);
  useEffect(()=>{
    if(!conversationId||messages.length===0)return;
    const title=messages.find(m=>m.role==='user')?.content.slice(0,52)||'New conversation';
    const entry:SavedConversation={id:conversationId,characterId:selected.id,title,messages,updatedAt:new Date().toISOString()};
    setHistory(prev=>{
      const next=[entry,...prev.filter(x=>x.id!==conversationId)].slice(0,30);
      try{localStorage.setItem(STORAGE,JSON.stringify(next));}catch{}
      return next;
    });
  },[messages,conversationId,selected.id]);

  function newConversation(){setMessages([]);setInput('');setNotice('');setConversationId(crypto.randomUUID());}
  function switchCharacter(c:Character){setSelected(c);setMessages([]);setInput('');setNotice('');setConversationId(crypto.randomUUID());}
  function loadConversation(c:SavedConversation){
    const character=characters.find(x=>x.id===c.characterId)||characters[0];
    setSelected(character);setMessages(c.messages);setConversationId(c.id);setInput('');setNotice('');
  }

  async function send(raw=input){
    const text=raw.trim();
    if(!text||busy)return;
    const id=conversationId||crypto.randomUUID();
    setConversationId(id);
    const next=[...messages,{role:'user' as const,content:text}];
    setMessages(next);setInput('');setBusy(true);setNotice('');
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId:id,message:text,characterId:selected.id,history:next})});
      const data=await r.json();
      if(!r.ok)throw new Error(data?.error||'Conversation failed.');
      const content=String(data.message?.content||data.reply||'').trim();
      setMessages([...next,{role:'assistant',content}]);
    }catch(e){setNotice(e instanceof Error?e.message:'Conversation failed.');}
    finally{setBusy(false);}
  }

  async function toggleRecording(){
    if(recording){recorderRef.current?.stop();return;}
    if(typeof window==='undefined'||!navigator.mediaDevices?.getUserMedia){setNotice('Voice recording is not supported by this browser.');return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const recorder=new MediaRecorder(stream);
      chunksRef.current=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data)};
      recorder.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());setRecording(false);
        const blob=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'});
        const form=new FormData();form.append('file',blob,'motiona-voice-note.webm');
        try{
          const r=await fetch('/api/transcribe',{method:'POST',body:form});const d=await r.json();
          if(!r.ok)throw new Error(d?.error||'Transcription failed.');
          if(d.text)setInput(prev=>prev?prev+' '+d.text:d.text);
        }catch(e){setNotice(e instanceof Error?e.message:'Voice transcription failed.');}
      };
      recorder.start();recorderRef.current=recorder;setRecording(true);setNotice('');
    }catch{setNotice('Microphone permission was not granted.');}
  }

  return <main className="conversationApp">
    <div className="motionaAtmosphere" aria-hidden="true"><span/><span/><span/></div>
    <aside className="conversationSidebar">
      <nav className="mobilePrimaryNav" aria-label="Primary"><Link href="/">Discover</Link><Link href="/studio">Create</Link><Link href="/animate">Animate</Link><Link href="/gallery">Library</Link></nav>
      <div className="conversationBrand"><Link href="/"><span className="conversationMark">M</span><b>MOTION<span>A</span></b></Link><span className="conversationAge">18+</span></div>
      <button className="conversationNew" onClick={newConversation}><Plus size={15}/> New conversation</button>
      <div className="conversationSideLabel">CHARACTERS</div>
      <div className="characterList">{characters.map(c=><button key={c.id} className={c.id===selected.id?'characterItem active':'characterItem'} onClick={()=>switchCharacter(c)}><CharacterVisual character={c} className="sidebarPortrait"/><span><b>{c.name}</b><small>{c.tagline}</small></span></button>)}</div>
      <div className="conversationSideLabel recentLabel">RECENT</div>
      <div className="conversationHistory">{history.slice(0,7).map(c=><button key={c.id} onClick={()=>loadConversation(c)}><b>{c.title}</b><small>{characters.find(x=>x.id===c.characterId)?.name||'Character'}</small></button>)}</div>
      <div className="conversationSideLinks"><Link href="/"><Sparkles size={14}/> Discover</Link><Link href="/studio"><Wand2 size={14}/> Studio</Link><Link href="/storyboard"><Clapperboard size={14}/> Storyboard</Link><Link href="/gallery"><Film size={14}/> My creations</Link><Link href="/animate"><Video size={14}/> Video engine</Link></div>
    </aside>

    <section className="conversationMain">
      <header className="conversationTop"><div className="conversationCharacter"><CharacterVisual character={selected} className="topPortrait"/><div><b>{selected.name}</b><span>{selected.tagline} · {selected.style}</span></div><i className="onlineDot"/></div><div className="conversationTopActions"><button aria-label="Search"><Search size={17}/></button><Link href="/studio?view=generate"><Sparkles size={16}/> Create</Link><button aria-label="More"><MoreHorizontal size={18}/></button></div></header>

      <div className="conversationBody">
        <div className="conversationMessages">
          {messages.length===0?<div className="conversationWelcome"><CharacterVisual character={selected} className="welcomePortrait"/><span className="welcomeEyebrow">MOTIONA CHARACTER</span><h1>Talk to {selected.name}.</h1><p>{greeting}</p><div className="starterGrid">{starters.map(s=><button key={s} onClick={()=>send(s)}>{s}<ArrowUpRight size={13}/></button>)}</div></div>:<>
            <div className="conversationIntro"><span>{selected.name}</span><small>Private conversation · saved locally</small></div>
            {messages.map((m,i)=><div key={i} className={m.role==='user'?'bubbleRow user':'bubbleRow'}><div className={m.role==='assistant'?'chatAvatar':'userAvatar'}>{m.role==='assistant'?selected.initials:'You'}</div><div className="bubble"><p>{m.content}</p></div></div>)}
            {busy&&<div className="bubbleRow"><div className="chatAvatar">{selected.initials}</div><div className="bubble typing"><i/><i/><i/></div></div>}
          </>}
        </div>

        <div className="conversationComposerWrap">
          <div className="composerTools"><Link href="/studio?view=generate"><ImageIcon size={15}/> Image</Link><Link href="/animate"><Video size={15}/> Video</Link><Link href="/storyboard"><Clapperboard size={15}/> Scene</Link><span>Character-aware creation</span></div>
          {notice&&<div className="conversationNotice">{notice}</div>}
          <div className="conversationComposer"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder={`Message ${selected.name}…`} rows={1}/><button className={recording?'mic recording':'mic'} onClick={toggleRecording} aria-label={recording?'Stop recording':'Voice note'}>{recording?<Square size={15}/>:<Mic size={17}/>}</button><button className="send" onClick={()=>send()} disabled={!input.trim()||busy} aria-label="Send"><Send size={16}/></button></div>
          <div className="composerFoot"><span>18+ fictional characters · consent-aware generation</span><Link href="/studio?view=generate">Open full creator <ArrowUpRight size={12}/></Link></div>
        </div>
      </div>
    </section>

    <aside className="conversationInspector">
      <div className="inspectorTitle"><span>CREATE WITH {selected.name.toUpperCase()}</span><MoreHorizontal size={16}/></div>
      <div className="characterCard"><div className="characterPortrait" style={{'--accent':selected.accent} as React.CSSProperties}><span>{selected.initials}</span></div><b>{selected.name}</b><small>{selected.tagline}</small><p>{selected.style} · identity-aware</p></div>
      <div className="quickCreate"><span>QUICK CREATE</span><Link href="/studio?view=generate"><ImageIcon size={15}/><b>Image</b><small>Portrait or scene</small><ArrowUpRight size={14}/></Link><Link href="/animate"><Video size={15}/><b>Video</b><small>Flexible duration</small><ArrowUpRight size={14}/></Link><Link href="/storyboard"><Clapperboard size={15}/><b>Storyboard</b><small>Build the sequence</small><ArrowUpRight size={14}/></Link></div>
      <div className="creationNote"><Sparkles size={15}/><div><b>One character, many worlds.</b><p>Your character identity can travel from conversation to image, storyboard and animation without exposing the render engine.</p></div></div>
    </aside>
    <section className="characterDiscovery" aria-label="Character discovery">
      <div className="discoveryHeader"><div><span className="discoveryEyebrow">CHARACTER DISCOVERY</span><h2>Meet the characters behind the worlds.</h2><p>Browse MOTIONA originals by visual identity, then start a conversation without leaving the creative environment.</p></div><Link href="/studio">Open Character Lab <ArrowUpRight size={14}/></Link></div>
      <div className="discoveryRail">{characters.map((c,i)=><button key={c.id} className={c.id===selected.id?'discoveryCard active':'discoveryCard'} onClick={()=>switchCharacter(c)}>
        <CharacterVisual character={c} className="discoveryPortrait"/><span className="discoveryIndex">0{i+1}</span>
        <span className="discoveryMeta"><b>{c.name}</b><small>{c.tagline}</small><em>{c.style}</em></span>
        <span className="discoveryAction">{c.id===selected.id?'IN CONVERSATION':'TALK TO '+c.name.toUpperCase()} <ArrowUpRight size={13}/></span>
      </button>)}</div>
    </section>
    <section className="motionaFlow" aria-label="MOTIONA creative workflow">
      <div><span>01</span><b>CONVERSE</b><small>Shape the idea with your character.</small></div>
      <i/>
      <div><span>02</span><b>CREATE</b><small>Turn the conversation into a visual.</small></div>
      <i/>
      <div><span>03</span><b>DIRECT</b><small>Build shots, motion and continuity.</small></div>
      <i/>
      <div><span>04</span><b>RENDER</b><small>Send the finished direction to your engine.</small></div>
    </section>
  </main>;
}