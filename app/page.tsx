'use client';

import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import { motion } from 'framer-motion';
import { ArrowUpRight, Play, Sparkles, Wand2, Users, Film, MessageCircle, ChevronDown } from 'lucide-react';

const nav=[['Studio','/studio'],['Characters','/studio?view=gallery'],['Generate','/studio?view=generate'],['Outputs','/studio?view=outputs'],['Chat','/studio?view=chat'],['Storyboard','/storyboard'],['Director','/director'],['Animate','/animate'],['Gallery','/gallery']];

export default function Home(){
 return <main className="landing">
  <div className="landingGrid"/>
  <header className="siteNav">
   <Link href="/" className="siteLogo"><BrandMark size={30}/><span>MOTION<b>A</b><i className="studioTag">STUDIO</i></span></Link>
   <nav className="siteLinks">{nav.map(([label,href])=><Link key={label} href={href}>{label}</Link>)}</nav>
   <div className="siteActions"><Link href="/login" className="siteSign">Sign in</Link><Link href="/signup" className="siteCta">Start creating <ArrowUpRight size={14}/></Link></div>
  </header>
  <motion.section className="landingHero" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:.7}}>
   <div className="heroOrb heroOrbA"/><div className="heroOrb heroOrbB"/>
   <div className="heroKicker"><span/> AI CHARACTER · VOICE · ANIMATION STUDIO</div>
   <h1>Make characters.<br/><em>Make them move.</em></h1>
   <p className="landingLead">A creative workspace for building consistent AI characters, generating scenes and turning still concepts into animation-ready workflows.</p>
   <div className="heroActions"><Link href="/signup" className="heroPrimary">Enter the studio <ArrowUpRight size={17}/></Link><Link href="/studio" className="heroSecondary"><Play size={14}/> Explore the workflow</Link></div>
   <div className="heroMeta"><span><i/> Local-first generation</span><span><i/> ComfyUI bridge</span><span><i/> 18+ creative workspace</span></div>
  </motion.section>
  <section className="featureSection">
   <div className="sectionIntro"><p>01 / THE WORKSPACE</p><h2>From an idea<br/>to a living character.</h2><span>Everything is organized around the character — identity, references, scenes, generation and output.</span></div>
   <motion.div className="featureRail" initial="hidden" whileInView="show" viewport={{once:true,amount:.15}} variants={{hidden:{opacity:0,y:28},show:{opacity:1,y:0,transition:{staggerChildren:.1}}}}>
    <article><div className="featureIcon"><Users size={20}/></div><small>01</small><h3>Character Lab</h3><p>Build a reusable character profile from your own reference image and creative direction.</p><Link href="/studio?view=gallery">Explore characters <ArrowUpRight size={14}/></Link></article>
    <article><div className="featureIcon"><Wand2 size={20}/></div><small>02</small><h3>Generation</h3><p>Compose scenes with model, LoRA, reference and sampling controls before sending them to ComfyUI.</p><Link href="/studio?view=generate">Open generator <ArrowUpRight size={14}/></Link></article>
    <article><div className="featureIcon"><Film size={20}/></div><small>03</small><h3>Animation</h3><p>Bring your installation-specific ComfyUI video workflow into the studio and keep its graph intact.</p><Link href="/studio?view=generate">Build a shot <ArrowUpRight size={14}/></Link></article>
    <article><div className="featureIcon"><MessageCircle size={20}/></div><small>04</small><h3>Creative Agent</h3><p>Use the persistent studio chat as the conversational layer for prompts, tools and generation workflows.</p><Link href="/studio?view=chat">Open agent <ArrowUpRight size={14}/></Link></article>
   </motion.div>
  </section>
  <section className="workflowSection">
   <div className="workflowTop"><p>02 / A SIMPLE LOOP</p><span>DESIGN → GENERATE → REFINE → MOVE</span></div>
   <div className="workflowLine"><div><b>01</b><strong>Define</strong><span>Identity & visual language</span></div><ChevronDown/><div><b>02</b><strong>Create</strong><span>Reference-led generation</span></div><ChevronDown/><div><b>03</b><strong>Direct</strong><span>Scenes, poses & camera</span></div><ChevronDown/><div><b>04</b><strong>Animate</strong><span>ComfyUI workflow bridge</span></div></div>
  </section>
  <section className="closingSection"><p className="eyebrow">YOUR NEXT FRAME</p><h2>Give the character<br/><em>a world to enter.</em></h2><Link href="/signup" className="heroPrimary">Start your workspace <ArrowUpRight size={17}/></Link></section>
  <footer className="landingFooter"><span>MOTIONA</span><span>Characters · Generation · Animation · Agent</span><span>18+ · LOCAL-FIRST · v0.8</span></footer>
 </main>
}