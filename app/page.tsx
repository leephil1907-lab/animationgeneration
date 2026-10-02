'use client';

import { useMemo, useState } from 'react';
import { ImagePlus, Sparkles, Wand2, Upload, UserRound, Film, SlidersHorizontal } from 'lucide-react';

type Character = { id:string; name:string; role:string; style:string; age:string; traits:string; image:string|null; created:string };

const seedCharacters: Character[] = [];

export default function Home() {
  const [characters, setCharacters] = useState<Character[]>(seedCharacters);
  const [active, setActive] = useState<'create'|'gallery'>('create');
  const [image, setImage] = useState<string|null>(null);
  const [form, setForm] = useState({name:'', role:'', age:'Adult', style:'Cinematic', traits:'', notes:''});
  const [status, setStatus] = useState('Ready');

  const canSave = Boolean(form.name.trim());
  const countLabel = useMemo(() => `${characters.length} character${characters.length === 1 ? '' : 's'}`, [characters.length]);

  function onUpload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setStatus('Please choose an image file.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setImage(String(reader.result)); setStatus('Reference image loaded.'); };
    reader.readAsDataURL(file);
  }

  function saveCharacter() {
    if (!canSave) { setStatus('Give the character a name first.'); return; }
    const character: Character = { id: crypto.randomUUID(), ...form, image, created: new Date().toISOString() };
    setCharacters(prev => [character, ...prev]);
    setStatus('Character saved to this session.');
  }

  function clearStudio() {
    setImage(null); setForm({name:'',role:'',age:'Adult',style:'Cinematic',traits:'',notes:''}); setStatus('Studio cleared.');
  }

  return <main>
    <header className="topbar">
      <div className="brand"><span className="brandMark">AG</span><div><strong>ANIMATION</strong><small>GENERATION STUDIO</small></div></div>
      <nav><button className={active==='create'?'nav active':'nav'} onClick={()=>setActive('create')}>Create</button><button className={active==='gallery'?'nav active':'nav'} onClick={()=>setActive('gallery')}>Characters <span>{countLabel}</span></button></nav>
      <div className="status"><i/> {status}</div>
    </header>

    {active === 'create' ? <section className="workspace">
      <div className="hero"><div><p className="eyebrow"><Sparkles size={14}/> CHARACTER LAB</p><h1>Build a character<br/><em>you can animate.</em></h1><p className="sub">Start from a blank character or upload a reference image. Define the identity, visual language and performance details before sending the character into your generation workflow.</p></div><div className="heroBadge"><Wand2 size={18}/><span>ComfyUI-ready workflow</span></div></div>
      <div className="grid">
        <section className="panel reference">
          <div className="panelHead"><div><b>01 / REFERENCE</b><h2>Character image</h2></div><ImagePlus size={20}/></div>
          <label className="drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();onUpload(e.dataTransfer.files?.[0])}}>
            {image ? <img src={image} alt="Character reference"/> : <><div className="uploadIcon"><Upload size={22}/></div><strong>Drop an image here</strong><span>or browse your device gallery</span><small>PNG, JPG, WEBP · local preview</small></>}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>onUpload(e.target.files?.[0])}/>
          </label>
          {image && <button className="textBtn" onClick={()=>setImage(null)}>Remove reference</button>}
          <div className="privacy"><span>LOCAL-FIRST</span><p>The selected image is previewed in your browser. Connect a storage service later when persistent cloud galleries are enabled.</p></div>
        </section>

        <section className="panel details">
          <div className="panelHead"><div><b>02 / IDENTITY</b><h2>Character details</h2></div><UserRound size={20}/></div>
          <div className="fields">
            <label>Name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Nova Vale"/></label>
            <label>Role / archetype<input value={form.role} onChange={e=>setForm({...form,role:e.target.value})} placeholder="e.g. explorer, detective, pilot"/></label>
            <label>Age presentation<select value={form.age} onChange={e=>setForm({...form,age:e.target.value})}><option>Adult</option><option>Young adult</option><option>Middle-aged</option><option>Older adult</option><option>Custom</option></select></label>
            <label>Visual style<select value={form.style} onChange={e=>setForm({...form,style:e.target.value})}><option>Cinematic</option><option>Anime</option><option>Illustrated</option><option>Stylized 3D</option><option>Photoreal</option></select></label>
            <label className="wide">Traits & appearance<textarea value={form.traits} onChange={e=>setForm({...form,traits:e.target.value})} placeholder="Hair, face, clothing, colors, body language, distinctive features…"/></label>
            <label className="wide">Character direction<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Personality, voice, movement, story role, animation notes…"/></label>
          </div>
        </section>
      </div>
      <div className="actionbar"><div><SlidersHorizontal size={17}/><span>Character consistency profile will be attached to future generations.</span></div><button className="secondary" onClick={clearStudio}>Clear</button><button className="primary" onClick={saveCharacter} disabled={!canSave}><Sparkles size={17}/> Create character</button></div>
    </section> : <section className="gallery"><div className="galleryHead"><div><p className="eyebrow"><UserRound size={14}/> CHARACTER GALLERY</p><h1>Your characters</h1></div><button className="primary" onClick={()=>setActive('create')}><ImagePlus size={17}/> New character</button></div>{characters.length===0 ? <div className="empty"><UserRound size={32}/><h2>No characters yet</h2><p>Create your first character from a prompt or reference image.</p><button className="primary" onClick={()=>setActive('create')}>Open character lab</button></div> : <div className="cards">{characters.map(c=><article className="card" key={c.id}>{c.image ? <img src={c.image} alt={c.name}/> : <div className="cardPlaceholder"><UserRound/></div>}<div><h3>{c.name}</h3><p>{c.role || 'Character'} · {c.style}</p><span>{c.traits || 'No appearance notes yet.'}</span></div></article>)}</div>}</section>}

    <footer><span>Animation Generation Studio</span><span>Character creation · Image references · ComfyUI workflows</span><span>v0.1</span></footer>
  </main>;
}
