'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Clapperboard, Film, Image as ImageIcon, MessageCircle, Mic, MoreHorizontal, Plus, Search, Send, Sparkles, Video, Wand2 } from 'lucide-react';

type Character={id:string;name:string;tagline:string;style:string;initials:string;accent:string};

const characters:Character[]=[
  {id:'aiko-ren',name:'Aiko Ren',tagline:'Cyberpunk wanderer',style:'Neon noir',initials:'AR',accent:'#8b5cf6'},
  {id:'mara-vale',name:'Mara Vale',tagline:'Cinematic detective',style:'Neo-noir',initials:'MV',accent:'#e879f9'},
  {id:'nova-9',name:'Nova 9',tagline:'Synthetic performer',style:'Futurist',initials:'N9',accent:'#67e8f9'},
];

const starters=['Help me design her next scene','Create a cinematic portrait concept','Build a 30-second video sequence','Give me three outfit directions'];

export default function ConversationHome(){
  const [selected,setSelected]=useState(characters[0]);
  const [messages,setMessages]=useState<{role:'user'|'assistant';content:string}[]>([]);
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');

  const greeting=useMemo(()=>`I'm ${selected.name}. Tell me what you want to make, and we can shape the character, scene, camera and motion together.`,[selected]);

  async function send(raw=input){
    const text=raw.trim();
    if(!text||busy)return;
    const next=[...messages,{role:'user' as const,content:text}];
    setMessages(next);setInput('');setBusy(true);setNotice('');
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,characterId:selected.id,history:next})});
      const data=await r.json();
      if(!r.ok)throw new Error(data?.error||'Conversation failed.');
      setMessages([...next,{role:'assistant',content:String(data.message?.content||data.reply||'') }]);
    }catch(e){setNotice(e instanceof Error?e.message:'Conversation failed.');}
    finally{setBusy(false);}
  }

  function switchCharacter(c:Character){setSelected(c);setMessages([]);setNotice('');}

  return <main className="conversationApp">
    <aside className="conversationSidebar">
      <div className="conversationBrand"><Link href="/"><span className="conversationMark">M</span><b>MOTION<span>A</span></b></Link><span className="conversationAge">18+</span></div>
      <button className="conversationNew" onClick={()=>{setMessages([]);setInput('')}}><Plus size={15}/> New conversation</button>
      <div className="conversationSideLabel">CHARACTERS</div>
      <div className="characterList">{characters.map(c=><button key={c.id} className={c.id===selected.id?'characterItem active':'characterItem'} onClick={()=>switchCharacter(c)}><span className="characterAvatar" style={{'--accent':c.accent} as React.CSSProperties}>{c.initials}</span><span><b>{c.name}</b><small>{c.tagline}</small></span></button>)}</div>
      <div className="conversationSideLinks"><Link href="/studio"><Wand2 size={14}/> Studio</Link><Link href="/storyboard"><Clapperboard size={14}/> Storyboard</Link><Link href="/gallery"><Film size={14}/> My creations</Link><Link href="/animate"><Video size={14}/> Video engine</Link></div>
    </aside>

    <section className="conversationMain">
      <header className="conversationTop"><div className="conversationCharacter"><span className="characterAvatar large" style={{'--accent':selected.accent} as React.CSSProperties}>{selected.initials}</span><div><b>{selected.name}</b><span>{selected.tagline} · {selected.style}</span></div><i className="onlineDot"/></div><div className="conversationTopActions"><button aria-label="Search"><Search size={17}/></button><Link href="/studio"><Sparkles size={16}/> Create</Link><button aria-label="More"><MoreHorizontal size={18}/></button></div></header>

      <div className="conversationBody">
        <div className="conversationMessages">
          {messages.length===0?<div className="conversationWelcome"><span className="welcomeOrb" style={{'--accent':selected.accent} as React.CSSProperties}>{selected.initials}</span><span className="welcomeEyebrow">MOTIONA CHARACTER</span><h1>Talk to {selected.name}.</h1><p>{greeting}</p><div className="starterGrid">{starters.map(s=><button key={s} onClick={()=>send(s)}>{s}<ArrowUpRight size={13}/></button>)}</div></div>:<>
            <div className="conversationIntro"><span>{selected.name}</span><small>Private conversation</small></div>
            {messages.map((m,i)=><div key={i} className={m.role==='user'?'bubbleRow user':'bubbleRow'}><div className={m.role==='assistant'?'chatAvatar':'userAvatar'}>{m.role==='assistant'?selected.initials:'You'}</div><div className="bubble"><p>{m.content}</p></div></div>)}
            {busy&&<div className="bubbleRow"><div className="chatAvatar">{selected.initials}</div><div className="bubble typing"><i/><i/><i/></div></div>}
          </>}
        </div>

        <div className="conversationComposerWrap">
          <div className="composerTools"><Link href="/studio?view=generate"><ImageIcon size={15}/> Image</Link><Link href="/animate"><Video size={15}/> Video</Link><Link href="/storyboard"><Clapperboard size={15}/> Scene</Link><span>Character-aware creation</span></div>
          {notice&&<div className="conversationNotice">{notice}</div>}
          <div className="conversationComposer"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder={`Message ${selected.name}…`} rows={1}/><button className="mic" aria-label="Voice note"><Mic size={17}/></button><button className="send" onClick={()=>send()} disabled={!input.trim()||busy} aria-label="Send"><Send size={16}/></button></div>
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
  </main>;
}