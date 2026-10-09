'use client';

import { useEffect, useState } from 'react';
import { Film, ImagePlus, Loader2, Sparkles, Wand2 } from 'lucide-react';

export default function CloudGenerationPanel({ initialPrompt = '' }: { initialPrompt?: string }) {
  const [mode, setMode] = useState<'image'|'video'>('video');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(10);
  const [aspect, setAspect] = useState('9:16');
  const [resolution, setResolution] = useState('720P');
  const [model, setModel] = useState('spicy-motion-3');
  const [status, setStatus] = useState('Ready');
  const [output, setOutput] = useState<string|null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => { if (initialPrompt.trim()) setPrompt(initialPrompt); }, [initialPrompt]);

  async function generate() {
    if (!prompt.trim()) { setStatus('Describe what you want to create first.'); return; }
    setWorking(true); setOutput(null); setStatus('Sending to MOTIONA cloud engine…');
    try {
      const endpoint = mode === 'image' ? '/api/generate/image' : '/api/generate/video';
      const body = mode === 'image'
        ? { prompt, model: 'spicy-image-1', style: 'studio', width: 1024, height: 1536, count: 1 }
        : { prompt, model, duration, aspectRatio: aspect, resolution, fps: 30 };
      const r = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Generation request failed.');
      if (mode === 'image') {
        const url = data.output?.[0]?.url;
        if (!url) throw new Error('The image engine returned no output.');
        setOutput(url); setStatus('Image ready.');
        return;
      }
      const id = data.id;
      if (!id) throw new Error('The video engine returned no task id.');
      for (let i=0; i<180; i++) {
        await new Promise(r=>setTimeout(r,2000));
        const poll = await fetch('/api/generate/video/'+encodeURIComponent(id), { cache:'no-store' });
        const task = await poll.json();
        if (task.status === 'succeeded') {
          const url = task.output?.[0]?.url;
          if (!url) throw new Error('Video completed without an output URL.');
          setOutput(url); setStatus('Video ready.'); return;
        }
        if (task.status === 'failed') throw new Error(task.error || 'Video generation failed.');
        setStatus(task.status === 'processing' ? 'Rendering your video…' : 'Video queued…');
      }
      throw new Error('Video generation timed out.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Generation failed.');
    } finally { setWorking(false); }
  }

  return <section className="cloudEngineCard">
    <div className="cloudEngineHead">
      <div><p className="eyebrow"><Sparkles size={14}/> MOTIONA GENERATION ENGINE</p><h2>Create without importing a workflow.</h2><p>Cloud rendering sits beside your existing ComfyUI worker. Your prompt stays behind the server boundary.</p></div>
      <span className="enginePill"><i/> CLOUD READY WHEN CONFIGURED</span>
    </div>
    <div className="engineModes">
      <button className={mode==='video'?'active':''} onClick={()=>setMode('video')}><Film size={15}/> Video</button>
      <button className={mode==='image'?'active':''} onClick={()=>setMode('image')}><ImagePlus size={15}/> Image</button>
    </div>
    <textarea className="enginePrompt" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={mode==='video'?'Describe the scene, movement, camera and atmosphere…':'Describe the image, subject, composition and visual style…'} />
    {mode==='video' && <div className="engineControls">
      <label>Model<select value={model} onChange={e=>{const next=e.target.value;setModel(next);if(next.startsWith("spicy-cinema-1") && duration>15)setDuration(15)}}><option value="spicy-motion-3">Motion 3</option><option value="spicy-motion-3-fast">Motion 3 Fast</option></select></label>
      <label>Duration<select value={duration} onChange={e=>setDuration(Number(e.target.value))}>{(model==="spicy-cinema-1"?[5,10,15]:[5,10,15,20,30]).map(v=><option key={v} value={v}>{v}s</option>)}</select></label>
      <label>Format<select value={aspect} onChange={e=>setAspect(e.target.value)}><option>9:16</option><option>16:9</option><option>1:1</option><option>21:9</option></select></label>
      <label>Quality<select value={resolution} onChange={e=>setResolution(e.target.value)}><option>720P</option><option>1080P</option></select></label>
    </div>}
    <div className="engineAction"><span>{status}</span><button className="primary" onClick={generate} disabled={working}>{working?<Loader2 className="spin" size={15}/>:<Wand2 size={15}/>} {working?'Generating…':'Generate'}</button></div>
    {output && <div className="engineOutput">{mode==='image'?<img src={output} alt="Generated MOTIONA output"/>:<video src={output} controls autoPlay loop playsInline/>}</div>}
  </section>