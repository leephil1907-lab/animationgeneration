'use client';

import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import MotionSampleReel from '@/components/MotionSampleReel';
import { motion } from 'framer-motion';
import {
  ArrowUpRight, Play, Sparkles, Wand2, Users, Film, MessageCircle,
  Clapperboard, Mic2, Layers3, ShieldCheck, MoveRight
} from 'lucide-react';

const nav = [
  ['Studio','/studio'], ['Characters','/studio?view=gallery'], ['Storyboard','/storyboard'],
  ['Director','/director'], ['Animate','/animate'], ['Gallery','/gallery'],
];

const pillars = [
  { n:'01', icon:Users, title:'Character Lab', copy:'Build a reusable identity with references, personality, voice and visual rules.', href:'/studio?view=gallery' },
  { n:'02', icon:Wand2, title:'Generate', copy:'Compose images with your model, LoRA, seed and reference controls before rendering.', href:'/studio?view=generate' },
  { n:'03', icon:Clapperboard, title:'Storyboard', copy:'Turn an idea into shots with continuity, camera direction and locked seeds.', href:'/storyboard' },
  { n:'04', icon:Film, title:'Animate', copy:'Send installation-specific ComfyUI workflows into a production-ready queue.', href:'/animate' },
];

export default function Home() {
  return (
    <main className="motionaHome">
      <div className="motionaNoise" aria-hidden="true" />
      <header className="motionaNav">
        <Link href="/" className="motionaLogo"><BrandMark size={30}/><span>MOTION<b>A</b><i>STUDIO</i></span></Link>
        <nav>{nav.map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}</nav>
        <div className="motionaNavActions"><Link href="/login" className="motionaSign">Sign in</Link><Link href="/signup" className="motionaNavCta">Open studio <ArrowUpRight size={14}/></Link></div>
      </header>

      <section className="motionaHero">
        <div className="heroGlow heroGlowOne" /><div className="heroGlow heroGlowTwo" />
        <div className="motionaHeroCopy">
          <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{duration:.55}} className="motionaKicker"><span /> AI CHARACTER · VOICE · ANIMATION</motion.div>
          <motion.h1 initial={{opacity:0,y:22}} animate={{opacity:1,y:0}} transition={{duration:.7,delay:.08}}>Give your characters<br /><em>a world to move through.</em></motion.h1>
          <motion.p initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{duration:.65,delay:.16}}>MOTIONA is a focused creative studio for building consistent AI characters, directing scenes and turning still concepts into animation-ready workflows.</motion.p>
          <motion.div initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{duration:.65,delay:.24}} className="motionaHeroActions"><Link href="/signup" className="motionaPrimary">Start creating <ArrowUpRight size={16}/></Link><Link href="/studio" className="motionaGhost"><Play size={14}/> Explore studio</Link></motion.div>
          <div className="motionaTrust"><span><i/> Local-first</span><span><i/> ComfyUI bridge</span><span><i/> Private workspace</span></div>
        </div>

        <motion.div className="heroCanvas" initial={{opacity:0,scale:.97}} animate={{opacity:1,scale:1}} transition={{duration:.8,delay:.15}}>
          <div className="canvasTop"><span>LIVE CANVAS</span><span>FRAME 001 · 16:9</span></div>
          <div className="canvasScene"><div className="sceneOrb" /><div className="sceneRing ringOne" /><div className="sceneRing ringTwo" /><div className="sceneCharacter"><span>M</span></div><div className="sceneGrid" /><div className="sceneCaption">CHARACTER / 01</div><div className="scenePrompt">REFERENCE-LED · SEED LOCKED · READY</div></div>
          <div className="canvasBottom"><span><Sparkles size={13}/> CONSISTENCY LOCK</span><span>VIOLET / OBSIDIAN</span></div>
        </motion.div>
      </section>

      <MotionSampleReel />

      <section className="motionaManifesto"><div><span>01 / THE IDEA</span><h2>One character.<br/><em>Many frames.</em></h2></div><p>Keep the creative identity in one place. References, prompts, voice, scenes and outputs become one continuous workflow instead of a pile of disconnected tools.</p></section>

      <section className="motionaPillars">
        {pillars.map(({n,icon:Icon,title,copy,href}, i) => (
          <motion.article key={n} initial={{opacity:0,y:24}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.2}} transition={{delay:i*.06}}>
            <div className="pillarTop"><span>{n}</span><Icon size={19}/></div><h3>{title}</h3><p>{copy}</p><Link href={href}>Open module <MoveRight size={14}/></Link>
          </motion.article>
        ))}
      </section>

      <section className="motionaWorkflow">
        <div className="workflowIntro"><span>02 / THE LOOP</span><h2>From concept<br/><em>to motion.</em></h2><p>A production path designed around continuity rather than isolated generations.</p></div>
        <div className="workflowSteps">
          {[['01','DEFINE','Identity, references, voice'],['02','CREATE','Image, prompt, seed'],['03','DIRECT','Shots, camera, continuity'],['04','MOVE','ComfyUI animation workflow']].map(([n,t,d],i)=><div key={n} className="workflowStep"><b>{n}</b><strong>{t}</strong><span>{d}</span>{i<3 && <MoveRight size={16}/>}</div>)}
        </div>
      </section>

      <section className="motionaFeature">
        <div className="featureVisual"><div className="featureWindow"><div className="windowBar"><span>DIRECTOR / SEQUENCE</span><span>08 SHOTS</span></div><div className="shotRows">{['01 · ARRIVAL','02 · THE LOOK','03 · CROSSING','04 · REVEAL'].map((s,i)=><div key={s}><span>{s}</span><i className={'shotBar shotBar'+i}/></div>)}</div><div className="windowFooter"><span>SEED 918273</span><span>CONTINUITY LOCKED</span></div></div></div>
        <div className="featureCopy"><span>03 / DIRECTOR</span><h2>Think in shots,<br/><em>not prompts.</em></h2><p>Build sequences with a title, logline, visual direction and shot plan. Send the result directly into the storyboard and keep your character identity intact.</p><Link href="/director" className="motionaOutline">Open Director <ArrowUpRight size={15}/></Link></div>
      </section>

      <section className="motionaPrinciples">
        <div className="principle"><ShieldCheck size={18}/><div><b>Private by design</b><span>Production persistence is user-scoped and protected by authentication.</span></div></div>
        <div className="principle"><Layers3 size={18}/><div><b>Real workflows</b><span>ComfyUI remains the rendering engine instead of a fake demo pipeline.</span></div></div>
        <div className="principle"><Mic2 size={18}/><div><b>Character first</b><span>Voice, references and personality belong to the character—not the prompt box.</span></div></div>
      </section>

      <section className="motionaFinal"><span>04 / ENTER THE STUDIO</span><h2>Make the first frame<br/><em>worth continuing.</em></h2><Link href="/signup" className="motionaPrimary">Create your workspace <ArrowUpRight size={16}/></Link></section>
      <footer className="motionaFooter"><div className="motionaFooterBrand"><BrandMark size={26}/><span>MOTION<b>A</b> STUDIO</span></div><div>CHARACTER · VOICE · STORYBOARD · ANIMATION</div><div>18+ · LOCAL-FIRST · v0.8</div></footer>
    </main>
  );
}
