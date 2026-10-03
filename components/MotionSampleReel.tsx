import { motion } from 'framer-motion';
import { ArrowUpRight, Camera, Clapperboard, Play, Sparkles } from 'lucide-react';
import Link from 'next/link';

const samples = [
  { id:'01', type:'CINEMATIC', title:'Character / Night Transit', meta:'CAMERA DOLLY · 24 FPS · 16:9', tone:'violet', scene:'city' },
  { id:'02', type:'FANTASY', title:'Environment / Floating Ruins', meta:'ORBIT · ATMOSPHERIC · 16:9', tone:'blue', scene:'ruins' },
  { id:'03', type:'SCI-FI', title:'Action / Signal Runner', meta:'TRACKING · MOTION BLUR · 21:9', tone:'rose', scene:'runner' },
  { id:'04', type:'ANIME', title:'Dialogue / After Rain', meta:'PUSH-IN · VOICE SYNC · 16:9', tone:'amber', scene:'rain' },
];

export default function MotionSampleReel() {
  return (
    <section className="motionaShowcase" aria-labelledby="motiona-showcase-title">
      <div className="showcaseIntro">
        <div>
          <span className="showcaseKicker"><Sparkles size={12}/> SAMPLE MOTION / GENERATED POSSIBILITIES</span>
          <h2 id="motiona-showcase-title">See the world<br/><em>before you build it.</em></h2>
        </div>
        <div className="showcaseCopy">
          <p>These are cinematic interface samples, designed to preview the kinds of scenes, characters and motion directions a MOTIONA workflow can target.</p>
          <Link href="/gallery">Open gallery <ArrowUpRight size={14}/></Link>
        </div>
      </div>

      <div className="motionaReel">
        {samples.map((sample, index) => (
          <motion.article
            key={sample.id}
            className="motionSample"
            initial={{ opacity:0, y:30 }}
            whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true, amount:.2 }}
            transition={{ duration:.55, delay:index*.07 }}
          >
            <div className="sampleStage" data-tone={sample.tone}>
              <div className="sampleSky"/>
              <div className="sampleMoon"/>
              <div className="sampleHorizon"/>
              <div className={`sampleSubject subject-${sample.scene}`}>
                <span/><i/><b/>
              </div>
              <div className="sampleParticles"/>
              <div className="sampleScan"/>
              <div className="sampleFrameLabel">{sample.id} / MOTIONA</div>
              <div className="samplePlay"><Play size={13} fill="currentColor"/></div>
              <div className="sampleCamera"><Camera size={11}/> {sample.meta}</div>
            </div>
            <div className="sampleInfo">
              <div><span>{sample.type}</span><b>{sample.title}</b></div>
              <Clapperboard size={15}/>
            </div>
          </motion.article>
        ))}
      </div>

      <div className="showcaseRail" aria-hidden="true">
        <span>CHARACTER</span><i/><span>ENVIRONMENT</span><i/><span>ACTION</span><i/><span>DIALOGUE</span><i/><span>CAMERA</span><i/><span>MOTION</span>
      </div>
    </section>
  );
}
