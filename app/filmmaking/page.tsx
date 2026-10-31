import Link from 'next/link';
import {
  ArrowUpRight, Clapperboard, Film, Images, Play, Sparkles, WandSparkles, Workflow, ScanFace,
} from 'lucide-react';
import styles from './filmmaking.module.css';

const tools = [
  { href: '/animate', icon: WandSparkles, title: 'AI video generation', detail: 'Turn a prompt or reference image into a moving shot.', tag: 'TEXT · IMAGE · VIDEO' },
  { href: '/storyboard', icon: Clapperboard, title: 'Storyboard & scenes', detail: 'Plan sequences, shots, camera direction and continuity.', tag: 'PRE-PRODUCTION' },
  { href: '/animate', icon: Film, title: 'Animation engine', detail: 'Send prepared shots to the connected generation engine.', tag: 'COMFYUI WORKFLOWS' },
  { href: '/face-swap', icon: ScanFace, title: 'Face swap studio', detail: 'Use one portrait reference to transform a face in an image or video.', tag: 'REFERENCE-LED EDITING' },
  { href: '/gallery', icon: Images, title: 'Media library', detail: 'Review generated images, clips and completed jobs.', tag: 'YOUR OUTPUTS' },
];

const pipeline = [
  ['01', 'Develop the idea', 'Shape a brief, script and visual direction.'],
  ['02', 'Design the film', 'Break the story into scenes and camera shots.'],
  ['03', 'Generate the footage', 'Create images, motion, dialogue and sound.'],
  ['04', 'Edit and deliver', 'Assemble, refine and export the finished film.'],
];

export default function FilmmakingStudioPage() {
  return (
    <main className={styles.shell}>
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="MOTIONA home">
          <span className={styles.brandMark}>M</span>
          <span>MOTION<span className={styles.brandAccent}>A</span><small>FILMMAKING STUDIO</small></span>
        </Link>
        <nav className={styles.nav} aria-label="Studio navigation">
          <Link className={styles.navActive} href="/filmmaking">Overview</Link>
          <Link href="/animate">Generate</Link>
          <Link href="/face-swap">Face Swap</Link>
          <Link href="/storyboard">Storyboard</Link>
          <Link href="/gallery">Library</Link>
        </nav>
        <Link href="/studio" className={styles.headerAction}>New film <ArrowUpRight size={15} /></Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}><span /> YOUR CREATIVE PRODUCTION WORKSPACE</div>
          <h1>From first idea<br /><em>to final frame.</em></h1>
          <p>Direct the story, build every shot, generate your footage and bring the whole film together in one connected studio.</p>
          <div className={styles.heroActions}>
            <Link href="/studio" className={styles.primary}><Sparkles size={16} /> Start creating <ArrowUpRight size={15} /></Link>
            <Link href="/storyboard" className={styles.secondary}><Clapperboard size={16} /> Open storyboard</Link>
          </div>
          <div className={styles.capabilities}>
            <span><span className={styles.dot} /> IMAGE TO VIDEO</span>
            <span><span className={styles.dot} /> CHARACTER ANIMATION</span>
            <span><span className={styles.dot} /> VOICE & AUDIO</span>
          </div>
        </div>
        <div className={styles.heroVisual} aria-label="Film production visual">
          <div className={styles.visualGrid} />
          <div className={styles.visualOrbit} />
          <div className={styles.visualCore}><Film size={42} strokeWidth={1.15} /><span>FRAME / 001</span></div>
          <div className={styles.visualTop}><span>SEQUENCE A</span><span>24 FPS</span></div>
          <div className={styles.visualBottom}><span>STORY → MOTION → FILM</span><span className={styles.visualSignal} /></div>
          <div className={styles.frameLabel}>MOTIONA / DIRECTOR'S VIEW</div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><div className={styles.kicker}>THE PRODUCTION DESK</div><h2>Choose your next move.</h2></div>
          <span className={styles.sectionNote}>CONNECTED CREATIVE TOOLS</span>
        </div>
        <div className={styles.toolGrid}>
          {tools.map((tool, index) => {
            const Icon = tool.icon;
            return <Link href={tool.href} className={styles.toolCard} key={`${tool.href}-${tool.title}`}>
              <div className={styles.toolTop}><span className={styles.toolIcon}><Icon size={19} /></span><span className={styles.toolIndex}>0{index + 1}</span></div>
              <div><span className={styles.toolTag}>{tool.tag}</span><h3>{tool.title}</h3><p>{tool.detail}</p></div>
              <span className={styles.toolArrow}><ArrowUpRight size={17} /></span>
            </Link>;
          })}
        </div>
      </section>

      <section className={styles.workflowSection}>
        <div className={styles.sectionHeading}>
          <div><div className={styles.kicker}>A CONNECTED WORKFLOW</div><h2>One film. Every stage.</h2></div>
          <Link href="/storyboard" className={styles.textLink}>Plan a sequence <ArrowUpRight size={14} /></Link>
        </div>
        <div className={styles.pipeline}>
          {pipeline.map(([number, title, description], index) => <div className={styles.pipelineStep} key={number}>
            <span className={styles.pipelineNumber}>{number}</span>
            <div className={styles.pipelineLine}><span style={{ width: index === pipeline.length - 1 ? '0%' : '100%' }} /></div>
            <h3>{title}</h3><p>{description}</p>
          </div>)}
        </div>
      </section>

      <section className={styles.bottomCallout}>
        <div className={styles.calloutIcon}><Workflow size={22} /></div>
        <div><span className={styles.kicker}>YOUR PRODUCTION STARTS HERE</span><h2>Make the next frame count.</h2><p>Start with a visual idea. Build it into a sequence, then direct the result.</p></div>
        <Link href="/studio" className={styles.primary}>Create a film <Play size={14} /></Link>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.footerBrand}>MOTION<span>A</span></Link>
        <span>CREATIVE CONTROL. FRAME BY FRAME.</span>
        <div><Link href="/studio">Studio</Link><Link href="/gallery">Library</Link><Link href="/storyboard">Storyboard</Link></div>
      </footer>
    </main>
  );
}
