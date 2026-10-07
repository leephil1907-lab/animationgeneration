'use client';

/**
 * Video worker screen.
 *
 * The original called createJob() and threw the result away, and never stored the
 * prompt_id ComfyUI returned — so a queued job could never be looked up again.
 * It also never polled, leaving "Queued …" on screen forever. This version
 * records the prompt_id, polls to a terminal state, and previews the result.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Loader2, Play, Upload, Video } from 'lucide-react';
import OutputPreview from '@/components/OutputPreview';
import DevWorkerNotice from '@/components/DevWorkerNotice';
import ComfyEndpointStatus from '@/components/ComfyEndpointStatus';
import AccountChip from '@/components/AccountChip';
import CloudGenerationPanel from '@/components/CloudGenerationPanel';
import { downloadOutput } from '@/lib/download';
import { createJob, isTerminal, reconcileJob, type JobOutput, type MotionaJob } from '@/lib/jobs';

const WORKERS = ['ComfyUI / Wan2.1', 'ComfyUI / AnimateDiff'];
const POLL_MS = 3000;

type Phase = 'idle' | 'reading' | 'queueing' | 'queued' | 'running' | 'completed' | 'failed';

export default function AnimatePage() {
  const [worker, setWorker] = useState(WORKERS[0]);
  const [workflow, setWorkflow] = useState<File | null>(null);
  const [tokens, setTokens] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(15);
  const [aspect, setAspect] = useState('9:16');
  const [fps, setFps] = useState(30);
  const [camera, setCamera] = useState('Extreme close-up');
  const [motion, setMotion] = useState('Subtle');
  const [texture, setTexture] = useState('Natural detail');
  const [lighting, setLighting] = useState('Natural event');
  const [identity, setIdentity] = useState('Strong');
  const [wardrobe, setWardrobe] = useState('Keep character wardrobe');
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('Ready');
  const [job, setJob] = useState<MotionaJob | null>(null);
  const [preview, setPreview] = useState<JobOutput | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const jobRef = useRef<MotionaJob | null>(null);
  jobRef.current = job;

  /* -------------------------------------------------------- poll to finish */

  useEffect(() => {
    const current = jobRef.current;
    if (!current?.promptId || isTerminal(current.status)) return;

    const timer = setInterval(async () => {
      const active = jobRef.current;
      if (!active?.promptId) return;
      try {
        const response = await fetch(`/api/video/job/${encodeURIComponent(active.promptId)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();

        const outputs: JobOutput[] = (data.outputs || []).map((entry: any) => ({
          filename: String(entry.filename),
          subfolder: String(entry.subfolder || ''),
          type: String(entry.type || 'output'),
          url: String(entry.url),
          kind: /\.(mp4|webm|mov|gif)$/i.test(String(entry.filename)) ? 'video' : 'image',
        }));

        const updated = reconcileJob(active, { status: data.status, outputs, error: data.error });
        setJob(updated);
        setPhase(data.status === 'completed' ? 'completed' : data.status === 'failed' ? 'failed' : 'running');
        setStatus(
          data.status === 'completed'
            ? `Render complete — ${outputs.length} output${outputs.length === 1 ? '' : 's'}.`
            : data.status === 'failed'
              ? data.error || 'ComfyUI reported an execution error.'
              : data.status === 'running'
                ? 'ComfyUI is rendering this job…'
                : 'Waiting in the ComfyUI queue…',
        );

        if (isTerminal(data.status)) clearInterval(timer);
      } catch {
        // Transient poll failure; next tick retries.
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [job?.promptId, job?.status]);

  const onWorkflowFile = async (file: File | null) => {
    setWorkflow(file);
    setTokens([]);
    if (!file) return;
    try {
      const text = await file.text();
      const graph = JSON.parse(text);
      const found = new Set<string>();
      const walk = (value: any) => {
        if (typeof value === 'string') {
          for (const match of value.matchAll(/__[A-Z_]+__/g)) found.add(match[0]);
          return;
        }
        if (Array.isArray(value)) return value.forEach(walk);
        if (value && typeof value === 'object') Object.values(value).forEach(walk);
      };
      walk(graph);
      setTokens([...found].sort());
    } catch {
      setStatus('That file is not valid JSON.');
      setPhase('failed');
      setWorkflow(null);
    }
  };

  const queue = async () => {
    if (!workflow) return;
    setPhase('reading');
    setStatus('Reading workflow…');

    let graph: Record<string, unknown>;
    try {
      graph = JSON.parse(await workflow.text());
    } catch {
      setPhase('failed');
      setStatus('Workflow file is not valid JSON.');
      return;
    }

    setPhase('queueing');
    setStatus('Submitting to ComfyUI…');

    try {
      const response = await fetch('/api/video/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: graph,
          worker,
          workflowName: workflow.name,
          values: {
            prompt: prompt.trim() || `Video workflow: ${worker}`,
            duration, fps,
            frames: Math.max(1, Math.round(duration * fps)),
            aspectRatio: aspect,
            camera, motion, texture, lighting, identity, wardrobe,
          },
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        const message = data?.error || `Queue failed (${response.status})`;
        // Record the failure too, so the gallery shows what was attempted.
        const failed = createJob({ type: 'video', worker, prompt: prompt.trim() || `Video workflow: ${worker}`, workflow: workflow.name, status: 'failed' });
        setJob({ ...failed, error: message });
        setPhase('failed');
        setStatus(data?.details ? `${message} — ${data.details}` : message);
        return;
      }

      // The prompt_id is what makes this job trackable; it is now stored on it.
      const created = createJob({
        type: 'video',
        worker,
        prompt: prompt.trim() || `Video workflow: ${worker}`,
        workflow: workflow.name,
        promptId: data.promptId,
        seed: data.seed,
      });
      setJob(created);
      setPhase('queued');
      setStatus(`Queued ${String(data.promptId).slice(0, 8)} · seed ${data.seed}${data.frames ? ` · ${data.frames} frames` : ''}`);
    } catch (error) {
      setPhase('failed');
      setStatus(error instanceof Error ? error.message : 'Could not queue workflow.');
    }
  };

  const working = phase === 'reading' || phase === 'queueing' || phase === 'queued' || phase === 'running';
  const outputs = job?.outputs || [];

  return (
    <main className="productPage">
      <header className="productHeader">
        <Link href="/studio"><ArrowLeft size={15} /> Studio</Link>
        <strong>MOTIONA / ANIMATE</strong>
        <Link className="secondary" href="/storyboard">Open storyboard</Link>
        <Link className="secondary" href="/gallery">Gallery</Link>
              <AccountChip />
      </header>

      <section className="productWrap">
        <div className="productIntro">
          <p className="eyebrow"><Video size={14} /> VIDEO WORKER</p>
          <h1>Turn shots into motion.</h1>
          <p>
            Use an installation-specific ComfyUI video workflow. Wan2.1 and AnimateDiff are exposed
            as worker targets; the actual graph comes from your local ComfyUI installation. Jobs are
            tracked by prompt_id and appear in the gallery as they finish.
          </p>
        </div>

        <CloudGenerationPanel />
        <ComfyEndpointStatus />
        <DevWorkerNotice />

        <div className="workerGrid">
          {WORKERS.map((entry) => (
            <button key={entry} className={worker === entry ? 'worker active' : 'worker'} onClick={() => setWorker(entry)}>
              <Video size={20} />
              <b>{entry}</b>
              <span>Workflow import required</span>
            </button>
          ))}
        </div>

        <div className="workflowUpload">
          <div>
            <b>API workflow</b>
            <p>
              {workflow
                ? `${workflow.name}${tokens.length ? ` · tokens: ${tokens.join(', ')}` : ' · no substitution tokens'}`
                : 'Import a ComfyUI API-format JSON workflow for this worker.'}
            </p>
          </div>
          <label className="templateImport">
            <Upload size={14} /> Choose workflow
            <input type="file" accept="application/json,.json" onChange={(e) => onWorkflowFile(e.target.files?.[0] || null)} />
          </label>
        </div>

        <div className="workflowUpload">
          <div style={{ flex: 1 }}>
            <b>Scene prompt</b>
            <p>Fills the <code>__PROMPT__</code> token in your workflow. Screened server-side before it reaches ComfyUI.</p>
            <textarea
              className="animatePrompt"
              value={prompt}
              placeholder="Describe the motion and subject of this shot"
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
        </div>

        <div className="workflowUpload videoComposerPanel">
          <div>
            <b>Video composer</b>
            <p>Creator controls are translated into workflow values; your ComfyUI graph remains behind the server boundary.</p>
          </div>
          <div className="controlsGrid">
            <label>Duration
              <select value={duration} onChange={e=>setDuration(Number(e.target.value))}>
                {[5,10,15,30,60].map(v=><option key={v} value={v}>{v}s</option>)}
              </select>
            </label>
            <label>Format
              <select value={aspect} onChange={e=>setAspect(e.target.value)}><option>9:16</option><option>16:9</option><option>1:1</option></select>
            </label>
            <label>Frame rate
              <select value={fps} onChange={e=>setFps(Number(e.target.value))}><option value={24}>24 FPS</option><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select>
            </label>
            <label>Camera
              <select value={camera} onChange={e=>setCamera(e.target.value)}><option>Extreme close-up</option><option>Close-up</option><option>Medium tracking</option><option>Wide cinematic</option><option>POV</option></select>
            </label>
            <label>Motion
              <select value={motion} onChange={e=>setMotion(e.target.value)}><option>Subtle</option><option>Natural</option><option>Dynamic</option><option>High energy</option></select>
            </label>
            <label>Identity lock
              <select value={identity} onChange={e=>setIdentity(e.target.value)}><option>Strong</option><option>Balanced</option><option>Creative</option></select>
            </label>
            <label>Skin / texture
              <select value={texture} onChange={e=>setTexture(e.target.value)}><option>Natural detail</option><option>Soft cinematic</option><option>Documentary</option></select>
            </label>
            <label>Lighting
              <select value={lighting} onChange={e=>setLighting(e.target.value)}><option>Natural event</option><option>Soft studio</option><option>Neon night</option><option>Golden hour</option></select>
            </label>
            <label>Wardrobe
              <select value={wardrobe} onChange={e=>setWardrobe(e.target.value)}><option>Keep character wardrobe</option><option>Formal</option><option>Casual</option><option>Futurist</option><option>Custom via prompt</option></select>
            </label>
          </div>
        </div>

        <div className="jobLaunch">
          <span className={`animateStatus ${phase}`}>
            {phase === 'completed' ? <CheckCircle2 size={14} /> : phase === 'failed' ? <AlertTriangle size={14} /> : working ? <Loader2 size={14} className="spin" /> : <Video size={14} />}
            {status}
          </span>
          <button className="primary" disabled={!workflow || working} onClick={queue}>
            {working ? <Loader2 size={15} className="spin" /> : <Video size={15} />} Queue video job
          </button>
        </div>

        <OutputPreview output={preview} job={job} onClose={() => setPreview(null)} />

        {outputs.length > 0 && (
          <div className="outputWrap">
            <div className="outputGrid">
              {outputs.map((output) => (
                <div className="outputCard" key={output.url}>
                  <button className="outputMedia" onClick={() => setPreview(output)} title="Open preview player">
                    {/\.(mp4|webm|mov|gif)$/i.test(output.filename) ? (
                      <video src={output.url} controls preload="metadata" playsInline loop muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={output.url} alt={output.filename} />
                    )}
                  </button>
                  <div className="outputFoot">
                    <span title={output.filename}>{output.filename}</span>
                    <div className="outputBtns">
                      <button className="textBtn" onClick={() => setPreview(output)}>
                        <Play size={12} /> Preview
                      </button>
                      <button
                        className="textBtn"
                        disabled={saving === output.url}
                        onClick={async () => {
                          setSaving(output.url);
                          try { await downloadOutput(output); } finally { setSaving(null); }
                        }}
                      >
                        {saving === output.url ? <Loader2 size={12} className="spin" /> : <Download size={12} />} Download
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
