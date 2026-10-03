'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clapperboard, Loader2, Sparkles, Wand2 } from 'lucide-react';

type Shot={id:string;duration:number;scene:string;camera:string;action:string;dialogue:string;transition:string};
type Plan={title:string;logline:string;visualDirection:string;shots:Shot[];notes:string[];provider:'openai'|'local-planner'};

export default function DirectorPage(){
  const [prompt,setPrompt]=useState('');
  const [character,setCharacter]=useState('');
  const [plan,setPlan]=useState<Plan|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const router=useRouter();

  async function direct(){
    if(!prompt.trim()||busy)return;
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/director',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,character})});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||'Director failed');
      setPlan(data);
    }catch(e){setError(e instanceof Error?e.message:'Director failed');}
    finally{setBusy(false);}
  }

  async function sendToStoryboard(){
    if(!plan)return;
    setBusy(true); setError('');
    try{
      const r=await fetch('/api/director/storyboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,characterName:character})});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||'Could not create storyboard');
      localStorage.setItem('motiona-storyboards', JSON.stringify([data.storyboard]));
      router.push(`/storyboard?id=${encodeURIComponent(data.storyboard.id)}`);
    }catch(e){setError(e instanceof Error?e.message:'Could not create storyboard');}
    finally{setBusy(false);}
  }

  return <main className="productPage">
    <header className="productHeader">
      <Link href="/studio"><ArrowLeft size={15}/> Studio</Link>
      <strong>MOTIONA / DIRECTOR</strong>
      <Link className="secondary" href="/storyboard">Storyboard</Link>
      <Link className="secondary" href="/animate">Animate</Link>
    </header>
    <section className="productWrap">
      <div className="productIntro">
        <p className="eyebrow"><Clapperboard size={14}/> AI DIRECTOR</p>
        <h1>Turn an idea into a shootable sequence.</h1>
        <p>Describe the scene in plain language. MOTIONA breaks it into shots, camera direction, action, dialogue and transitions that can move into your storyboard and generation workflow.</p>
      </div>
      <div className="workflowUpload">
        <div style={{flex:1}}>
          <b>Sequence brief</b>
          <p>What should happen? Include mood, setting, action and desired ending.</p>
          <textarea className="animatePrompt" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="A lone courier crosses a rain-soaked neon district, discovers a hidden signal, then looks up as the city lights shut down..." rows={6}/>
        </div>
      </div>
      <div className="workflowUpload">
        <div style={{flex:1}}>
          <b>Character continuity</b>
          <p>Optional. Give the Director a character name and a compact identity description.</p>
          <input className="animatePrompt" value={character} onChange={e=>setCharacter(e.target.value)} placeholder="Mara — silver bob, black utility coat, restrained and observant"/>
        </div>
      </div>
      <div className="jobLaunch">
        <span className="animateStatus">{plan?<><Sparkles size={14}/> {plan.provider==='openai'?'AI Director':'Local Director planner'}</>:<><Wand2 size={14}/> Ready</>}</span>
        <button className="primary" disabled={!prompt.trim()||busy} onClick={direct}>{busy?<><Loader2 size={15} className="spin"/> Directing…</>:<><Wand2 size={15}/> Build sequence</>}</button>
      </div>
      {error&&<div className="workflowUpload"><b>Director error</b><p>{error}</p></div>}
      {plan&&<div className="outputWrap">
        <div className="productIntro">
          <p className="eyebrow">SEQUENCE</p><h2>{plan.title}</h2><p>{plan.logline}</p>
          <p><b>Visual direction:</b> {plan.visualDirection}</p>
        </div>
        <div className="outputGrid">
          {plan.shots.map((shot,i)=><article className="outputCard" key={shot.id}>
            <div className="outputFoot"><strong>SHOT {String(i+1).padStart(2,'0')}</strong><span>{shot.duration}s · {shot.transition}</span></div>
            <div style={{padding:'14px'}}>
              <p><b>Scene</b><br/>{shot.scene}</p>
              <p><b>Camera</b><br/>{shot.camera}</p>
              <p><b>Action</b><br/>{shot.action}</p>
              {shot.dialogue&&<p><b>Dialogue</b><br/>{shot.dialogue}</p>}
            </div>
          </article>)}
        </div>
        <div className="workflowUpload"><div><b>Director notes</b>{plan.notes.map((n,i)=><p key={i}>{n}</p>)}</div><button className="primary" disabled={busy} onClick={sendToStoryboard}><Clapperboard size={15}/> Send to Storyboard</button></div>
      </div>}
    </section>
  </main>;
}
