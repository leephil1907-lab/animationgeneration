'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ImagePlus, Sparkles, Wand2, Upload, UserRound, Film, SlidersHorizontal, Cpu, RefreshCw, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import ChatPanel from '@/components/ChatPanel';

type Character = { id:string; name:string; role:string; style:string; age:string; traits:string; notes:string; image:string|null; voice?:string; faceConsent?:boolean; created:string };
type Output = { filename:string; subfolder:string; type:string; url:string };
type Job = { id:string; status:string; outputs:Output[]; error?:string };

const emptyForm={name:'',role:'',age:'Adult',style:'Cinematic',traits:'',notes:'',voice:'warm-female'};
const voicePresets=[['warm-female','Warm female'],['deep-male','Deep male'],['soft-breathy','Soft / breathy'],['energetic','Energetic'],['calm-narrator','Calm narrator']] as const;
export default function Home() {
  const searchParams=useSearchParams();
  const initialView=(searchParams.get('view') as 'create'|'gallery'|'generate'|'outputs'|'chat')||'create';
  const [characters,setCharacters]=useState<Character[]>([]);
  const [active,setActive]=useState<'create'|'gallery'|'generate'|'outputs'|'chat'>(initialView);
  const [image,setImage]=useState<string|null>(null);
  const [referenceFile,setReferenceFile]=useState<File|null>(null);
  const [faceConsent,setFaceConsent]=useState(false);
  const [voiceSample,setVoiceSample]=useState<string|null>(null);
  const [isPlaying,setIsPlaying]=useState(false);
  const [form,setForm]=useState(emptyForm);
  const [status,setStatus]=useState('Ready');
  const [comfy,setComfy]=useState<'checking'|'connected'|'offline'>('checking');
  const [prompt,setPrompt]=useState('');
  const [job,setJob]=useState<Job|null>(null);
  const [polling,setPolling]=useState(false);
  const [selectedId,setSelectedId]=useState('');
  const [checkpoints,setCheckpoints]=useState<string[]>([]);
  const [loras,setLoras]=useState<string[]>([]);
  const [modelLoading,setModelLoading]=useState(false);
  const [mode,setMode]=useState<'image'|'animation'>('image');
  const [template,setTemplate]=useState<any|null>(null);
  const [settings,setSettings]=useState({checkpoint:'',lora:'',loraStrength:0.8,width:768,height:1024,steps:28,cfg:7,seed:'',denoise:0.65,batchSize:1,negativePrompt:'low quality, distorted anatomy, duplicate subject, inconsistent character identity, unreadable text'});

  const countLabel=useMemo(()=>`${characters.length} character${characters.length===1?'':'s'}`,[characters.length]);

  useEffect(()=>{ setActive(initialView); },[initialView]);
  useEffect(()=>{ try { const saved=localStorage.getItem('ags-characters'); if(saved) setCharacters(JSON.parse(saved)); } catch {} checkComfy(); loadModels(); },[]);
  useEffect(()=>{ try { localStorage.setItem('ags-characters',JSON.stringify(characters)); } catch {} },[characters]);

  async function loadModels(){
    setModelLoading(true);
    try { const r=await fetch('/api/comfyui/models',{cache:'no-store'}); const d=await r.json(); if(r.ok){ setCheckpoints(d.checkpoints||[]); setLoras(d.loras||[]); if(d.checkpoints?.length) setSettings(s=>({...s,checkpoint:s.checkpoint||d.checkpoints[0]})); } }
    catch {} finally { setModelLoading(false); }
  }

  async function checkComfy(){
    setComfy('checking');
    try { const r=await fetch('/api/comfyui/status',{cache:'no-store'}); setComfy(r.ok?'connected':'offline'); }
    catch { setComfy('offline'); }
  }

  function onUpload(file?:File){
    if(!file)return;
    if(!file.type.startsWith('image/')){setStatus('Please choose an image file.');return}
    setReferenceFile(file);
    setFaceConsent(false);
    const reader=new FileReader();
    reader.onload=()=>{setImage(String(reader.result));setStatus('Reference image loaded.');};
    reader.readAsDataURL(file);
  }

  function saveCharacter(){
    if(!form.name.trim()){setStatus('Give the character a name first.');return}
    if(image&&!faceConsent){setStatus('Please confirm the face-reference safety checkbox.');return}
    const c:Character={id:crypto.randomUUID(),...form,image,faceConsent,created:new Date().toISOString()};
    setCharacters(p=>[c,...p]); setSelectedId(c.id); setStatus('Character saved locally.'); setActive('gallery');
  }

  function useCharacter(c:Character){
    setForm({name:c.name,role:c.role,age:c.age,style:c.style,traits:c.traits,notes:c.notes,voice:c.voice||'warm-female'});
    setImage(c.image);
    setFaceConsent(Boolean(c.faceConsent));
    setVoiceSample(null);
    setReferenceFile(null);
    setSelectedId(c.id);
    setActive('generate');
    setStatus('Character loaded. Re-select its reference image before generation if needed.');
  }

  function clearStudio(){setImage(null);setReferenceFile(null);setFaceConsent(false);setVoiceSample(null);setForm(emptyForm);setStatus('Studio cleared.');}

  async function playSample(){
    const text='Hello, I am '+(form.name||'your character')+'. '+(form.traits||form.notes||'Ready when you are.');
    setIsPlaying(true);
    try{
      const res=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voice:form.voice})});
      if(res.ok){
        const url=URL.createObjectURL(await res.blob());
        const audio=new Audio(url);
        audio.onended=()=>{setIsPlaying(false);URL.revokeObjectURL(url)};
        audio.onerror=()=>{URL.revokeObjectURL(url);setIsPlaying(false)};
        await audio.play();
        return;
      }
    }catch{}
    if(typeof window!=='undefined'&&'speechSynthesis' in window){
      window.speechSynthesis.cancel();
      const utter=new SpeechSynthesisUtterance(text);
      utter.rate=.95;
      utter.pitch=form.voice?.includes('deep')?.8:form.voice?.includes('soft')?1.15:1.05;
      utter.onend=()=>setIsPlaying(false);
      utter.onerror=()=>setIsPlaying(false);
      window.speechSynthesis.speak(utter);
    }else setIsPlaying(false);
  }

  async function dataUrlToFile(dataUrl:string,name:string){ const r=await fetch(dataUrl); const blob=await r.blob(); return new File([blob],name,{type:blob.type||'image/png'}); }

  async function generate(){
    if(image&&!faceConsent){setStatus('Please confirm the face-reference safety checkbox.');return}
    if(!prompt.trim()){setStatus('Add a generation prompt first.');return}
    if(mode==='animation' && !template){setStatus('Import a ComfyUI API workflow template for animation first.');return}
    const character=characters.find(c=>c.id===selectedId) || (form.name.trim()?{id:'draft',...form,image,created:new Date().toISOString()}:null);
    if(!character){setStatus('Create or select a character first.');return}
    setPolling(true); setJob({id:'',status:'submitting',outputs:[]}); setActive('outputs'); setStatus('Preparing ComfyUI workflow…');
    try{
      const uploadFile=referenceFile || (character.image?.startsWith('data:') ? await dataUrlToFile(character.image,`${character.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase() || 'character'}-reference.png`) : null);
      let promptId='';
      if(mode==='animation'){
        let referenceFilename='';
        if(uploadFile){
          const uploadBody=new FormData(); uploadBody.append('image',uploadFile,uploadFile.name);
          const ur=await fetch('/api/comfyui/upload',{method:'POST',body:uploadBody}); const ud=await ur.json();
          if(!ur.ok) throw new Error(ud.details||ud.error||'Reference upload failed');
          referenceFilename=ud.name;
        }
        const wr=await fetch('/api/comfyui/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          workflow:template.workflow,
          values:{prompt:`${character.name}: ${character.traits||''}\n${character.notes||''}\nScene: ${prompt}`,negativePrompt:settings.negativePrompt,referenceFilename,seed:settings.seed===''?undefined:Number(settings.seed),width:settings.width,height:settings.height}
        })});
        const wd=await wr.json(); if(!wr.ok) throw new Error(wd.details||wd.error||'Animation workflow rejected');
        promptId=wd.promptId;
      }else{
        const body=new FormData();
        body.append('character',JSON.stringify({name:character.name,role:character.role,age:character.age,style:character.style,traits:character.traits,notes:character.notes}));
        body.append('scene',prompt); body.append('mode','image');
        body.append('settings',JSON.stringify({...settings,seed:settings.seed===''?undefined:Number(settings.seed)}));
        if(uploadFile) body.append('image',uploadFile,uploadFile.name);
        const r=await fetch('/api/comfyui/character',{method:'POST',body}); const data=await r.json();
        if(!r.ok) throw new Error(data.details||data.error||'ComfyUI rejected the workflow');
        promptId=data.promptId as string;
      }
      setJob({id:promptId,status:'queued',outputs:[]}); setStatus(mode==='animation'?'Animation queued. Waiting for ComfyUI output…':'Generation queued. Waiting for ComfyUI output…');
      for(let i=0;i<180;i++){
        await new Promise(resolve=>setTimeout(resolve,1500));
        const jr=await fetch(`/api/comfyui/job/${encodeURIComponent(promptId)}`,{cache:'no-store'}); const jd=await jr.json();
        if(jd.status==='completed'){setJob({id:promptId,status:'completed',outputs:jd.outputs||[]});setStatus('Generation complete.');setPolling(false);return}
        if(jd.status==='error') throw new Error(Array.isArray(jd.error)?JSON.stringify(jd.error):String(jd.error||jd.details||'ComfyUI execution failed'));
        setJob({id:promptId,status:jd.status||'running',outputs:[]});
      }
      throw new Error('Generation timed out while waiting for ComfyUI history.');
    }catch(e){setJob(j=>({id:j?.id||'',status:'error',outputs:[],error:String(e instanceof Error?e.message:e)}));setStatus('Generation failed.');setPolling(false);}
  }

  return <main>
    <header className="topbar">
      <div className="brand"><span className="brandMark">AG</span><div><strong>ANIMATION</strong><small>GENERATION STUDIO</small></div></div>
      <nav>
        <button className={active==='create'?'nav active':'nav'} onClick={()=>setActive('create')}>Create</button>
        <button className={active==='gallery'?'nav active':'nav'} onClick={()=>setActive('gallery')}>Characters <span>{countLabel}</span></button>
        <button className={active==='generate'?'nav active':'nav'} onClick={()=>setActive('generate')}>Generate</button>
        <button className={active==='outputs'?'nav active':'nav'} onClick={()=>setActive('outputs')}>Outputs</button>
        <button className={active==='chat'?'nav active':'nav'} onClick={()=>setActive('chat')}>Chat</button>
      </nav>
      <div className="accountLinks"><a href="/login">Sign in</a><a className="accountCta" href="/signup">Create account</a></div>
      <div className="status"><i className={comfy==='connected'?'online':''}/>{comfy==='connected'?'ComfyUI connected':comfy==='offline'?'ComfyUI offline':'Checking ComfyUI…'}</div>
    </header>

    {active==='create'&&<section className="workspace">
      <div className="hero"><div><p className="eyebrow"><Sparkles size={14}/> CHARACTER LAB</p><h1>Build a character<br/><em>you can animate.</em></h1><p className="sub">Start from a blank character or upload a reference image. Define identity, visual language and performance details before sending the character into ComfyUI.</p></div><div className="heroBadge"><Wand2 size={18}/><span>Real ComfyUI workflow bridge</span></div></div>
      <div className="grid">
        <section className="panel reference"><div className="panelHead"><div><b>01 / REFERENCE</b><h2>Character image</h2></div><ImagePlus size={20}/></div>
          <label className="drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();onUpload(e.dataTransfer.files?.[0])}}>
            {image?<img src={image} alt="Character reference"/>:<><div className="uploadIcon"><Upload size={22}/></div><strong>Drop an image here</strong><span>or browse your device gallery</span><small>PNG, JPG, WEBP · local preview</small></>}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>onUpload(e.target.files?.[0])}/>
          </label>
          {image&&<label className="faceSafety"><input type="checkbox" checked={faceConsent} onChange={e=>setFaceConsent(e.target.checked)}/><span>I confirm this is <strong>my own face</strong> or a fully <strong>synthetic / AI-generated face</strong>. I do not upload real people’s faces without consent.</span></label>}
          {image&&<button className="textBtn" onClick={()=>{setImage(null);setReferenceFile(null)}}>Remove reference</button>}
          <div className="privacy"><span>LOCAL-FIRST UNTIL SUBMIT</span><p>The image stays in the browser until you press Generate. At that point it is uploaded to the configured ComfyUI instance.</p></div>
        </section>
        <section className="panel details"><div className="panelHead"><div><b>02 / IDENTITY</b><h2>Character details</h2></div><UserRound size={20}/></div>
          <div className="fields">
            <label>Name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Nova Vale"/></label>
            <label>Role / archetype<input value={form.role} onChange={e=>setForm({...form,role:e.target.value})} placeholder="e.g. explorer, detective, pilot"/></label>
            <label>Age presentation<select value={form.age} onChange={e=>setForm({...form,age:e.target.value})}><option>Adult</option><option>Young adult</option><option>Middle-aged</option><option>Older adult</option><option>Custom</option></select></label>
            <label>Visual style<select value={form.style} onChange={e=>setForm({...form,style:e.target.value})}><option>Cinematic</option><option>Anime</option><option>Illustrated</option><option>Stylized 3D</option><option>Photoreal</option></select></label>
            <label className="wide">Traits & appearance<textarea value={form.traits} onChange={e=>setForm({...form,traits:e.target.value})} placeholder="Hair, clothing, colors, body language, distinctive features…"/></label>
            <label className="wide">Character direction<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Personality, voice, movement, story role, animation notes…"/></label>
            <label className="wide">Voice preset<select value={form.voice} onChange={e=>setForm({...form,voice:e.target.value})}>{voicePresets.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label className="wide">Voice sample <span className="fieldHint">optional · under 5 MB</span><div className="voiceSampleRow"><input type="file" accept="audio/mpeg,audio/wav,audio/webm,audio/ogg" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){setStatus('Voice sample must be under 5 MB.');return}const reader=new FileReader();reader.onload=()=>setVoiceSample(String(reader.result));reader.readAsDataURL(file)}}/>{voiceSample&&<><audio src={voiceSample} controls style={{height:32}}/><button type="button" className="textBtn" onClick={()=>setVoiceSample(null)}>Remove</button></>}</div></label>
            <label className="wide">Preview voice<button type="button" className="secondary" style={{marginTop:8}} disabled={!form.name||isPlaying} onClick={playSample}>{isPlaying?'Playing…':'Play sample'}</button></label>
          </div>
        </section>
      </div>
      <div className="actionbar"><div><SlidersHorizontal size={17}/><span>{status}</span></div><button className="secondary" onClick={clearStudio}>Clear</button><button className="primary" onClick={saveCharacter} disabled={!form.name.trim()}><Sparkles size={17}/> Save character</button></div>
    </section>}

    {active==='gallery'&&<section className="gallery"><div className="galleryHead"><div><p className="eyebrow"><UserRound size={14}/> CHARACTER GALLERY</p><h1>Your characters</h1></div><button className="primary" onClick={()=>{clearStudio();setActive('create')}}><ImagePlus size={17}/> New character</button></div>
      {characters.length===0?<div className="empty"><UserRound size={32}/><h2>No characters yet</h2><p>Create your first character from a prompt or reference image.</p><button className="primary" onClick={()=>setActive('create')}>Open character lab</button></div>:
      <div className="cards">{characters.map(c=><article className="card" key={c.id}>{c.image?<img src={c.image} alt={c.name}/>:<div className="cardPlaceholder"><UserRound/></div>}<div><h3>{c.name}</h3><p>{c.role||'Character'} · {c.style}</p><span>{c.traits||'No appearance notes yet.'}</span><button className="secondary cardAction" onClick={()=>useCharacter(c)}>Use for generation</button></div></article>)}</div>}
    </section>}

    {active==='generate'&&<section className="gallery"><div className="galleryHead"><div><p className="eyebrow"><Cpu size={14}/> GENERATION PIPELINE</p><h1>Generate.</h1><p className="sub">Select a saved character, add a scene, and the studio will upload the optional reference image, queue a character-aware ComfyUI image workflow, then poll for the finished output.</p></div><button className="secondary" onClick={checkComfy}><RefreshCw size={15}/> Refresh</button></div>
      <div className="generatePanel panel">
        <div className="pipelineRow"><span>REFERENCE</span><span>CHARACTER PROFILE</span><span>COMFYUI</span><span>OUTPUT</span></div>
        <label>Character<select value={selectedId} onChange={e=>{setSelectedId(e.target.value);const c=characters.find(x=>x.id===e.target.value);if(c){setForm({name:c.name,role:c.role,age:c.age,style:c.style,traits:c.traits,notes:c.notes,voice:c.voice||'warm-female'});setImage(c.image);setFaceConsent(Boolean(c.faceConsent));setVoiceSample(null)}}}><option value="">Choose a saved character…</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name} — {c.role||'Character'}</option>)}</select></label>
        <div className="modeSwitch"><button className={mode==='image'?'active':''} onClick={()=>setMode('image')}>Image</button><button className={mode==='animation'?'active':''} onClick={()=>setMode('animation')}>Animation</button></div>
        <label>Generation prompt<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe the scene, pose, camera, lighting and animation intent…"/></label>
        {mode==='animation'&&<div className="templateBox"><div><b>Animation workflow template</b><p>{template?.name||'No template imported'}</p></div><label className="templateImport">Import API JSON<input type="file" accept="application/json,.json" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const parsed=JSON.parse(await file.text());setTemplate({name:file.name,workflow:parsed});setStatus('Animation workflow template loaded.');}catch{setStatus('Invalid workflow JSON. Export ComfyUI in API format.');}}}/></label></div>}
        <div className="controlsGrid">
          <label>Checkpoint<select value={settings.checkpoint} onChange={e=>setSettings({...settings,checkpoint:e.target.value})} disabled={modelLoading||checkpoints.length===0}><option value="">{modelLoading?'Discovering models…':'No checkpoint detected'}</option>{checkpoints.map(m=><option key={m}>{m}</option>)}</select></label>
          <label>LoRA<select value={settings.lora} onChange={e=>setSettings({...settings,lora:e.target.value})} disabled={loras.length===0}><option value="">None</option>{loras.map(m=><option key={m}>{m}</option>)}</select></label>
          <label>LoRA strength<input type="number" min="0" max="2" step="0.05" value={settings.loraStrength} disabled={!settings.lora} onChange={e=>setSettings({...settings,loraStrength:Number(e.target.value)})}/></label>
          <label>Aspect / size<select value={`${settings.width}x${settings.height}`} onChange={e=>{const [w,h]=e.target.value.split('x').map(Number);setSettings({...settings,width:w,height:h})}}><option value="768x1024">Portrait 3:4</option><option value="1024x1024">Square 1:1</option><option value="1024x768">Landscape 4:3</option><option value="1280x720">Widescreen 16:9</option><option value="720x1280">Vertical 9:16</option></select></label>
          <label>Steps<input type="number" min="1" max="80" value={settings.steps} onChange={e=>setSettings({...settings,steps:Number(e.target.value)})}/></label>
          <label>CFG<input type="number" min="1" max="20" step="0.5" value={settings.cfg} onChange={e=>setSettings({...settings,cfg:Number(e.target.value)})}/></label>
          <label>Seed<input type="number" placeholder="Random" value={settings.seed} onChange={e=>setSettings({...settings,seed:e.target.value})}/></label>
          <label>Reference strength<input type="number" min="0" max="1" step="0.05" value={settings.denoise} onChange={e=>setSettings({...settings,denoise:Number(e.target.value)})}/></label>
          <label>Outputs<input type="number" min="1" max="4" value={settings.batchSize} onChange={e=>setSettings({...settings,batchSize:Number(e.target.value)})}/></label>
          <label className="wide">Negative prompt<textarea value={settings.negativePrompt} onChange={e=>setSettings({...settings,negativePrompt:e.target.value})}/></label>
        </div>
        <div className="generationActions"><button className="primary" disabled={polling||!selectedId||comfy!=='connected'||(mode==='animation'&&!template)} onClick={generate}><Sparkles size={16}/> {polling?'Generating…':mode==='animation'?'Generate animation':'Generate image'}</button><span>{status}</span></div>
        <div className="future"><Film size={20}/><div><b>Installation-specific animation engine</b><p>Import the API-format workflow exported from your own ComfyUI installation. The studio keeps the graph intact and can substitute prompt, reference image, seed and size tokens.</p></div></div>
      </div>
    </section>}

    {active==='chat'&&<ChatPanel activeCharacter={characters.find(c=>c.id===selectedId)||null}/>}

    {active==='outputs'&&<section className="gallery"><div className="galleryHead"><div><p className="eyebrow"><Sparkles size={14}/> OUTPUT GALLERY</p><h1>Generated work.</h1></div><button className="secondary" onClick={()=>setActive('generate')}>Back to generation</button></div>
      {!job?<div className="empty"><Sparkles size={32}/><h2>No generation in this session</h2><p>Run a ComfyUI generation to see the result here.</p><button className="primary" onClick={()=>setActive('generate')}>Open generator</button></div>:
      <div className="outputWrap"><div className="jobState">{job.status==='completed'?<CheckCircle2/>:job.status==='error'?<AlertTriangle/>:<Loader2 className="spin"/>}<div><b>{job.status==='completed'?'Generation complete':job.status==='error'?'Generation failed':'Generation in progress'}</b><span>{job.id||'Submitting workflow…'}</span></div></div>
      {job.error&&<div className="errorBox">{job.error}</div>}
      {job.outputs.length>0?<div className="outputGrid">{job.outputs.map((o,i)=><article className="outputCard" key={`${o.filename}-${i}`}>{/\.(mp4|webm|mov|gif)$/i.test(o.filename)?<video src={o.url} controls playsInline/>:<img src={o.url} alt={o.filename}/>}<div><span>{o.filename}</span><a href={o.url} target="_blank" rel="noreferrer">Open output</a></div></article>)}</div>:job.status!=='error'&&<div className="empty small"><Loader2 className="spin"/><p>Waiting for ComfyUI to finish and expose the output file…</p></div>}</div>}
    </section>}
    <footer><span>Animation Generation Studio</span><span>Characters · References · ComfyUI · Outputs · Agent Chat</span><span>v0.7</span></footer>
  </main>
}
