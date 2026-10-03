'use client';

/**
 * Private gallery.
 *
 * The previous version read localStorage once on mount and never looked again,
 * so `outputs` was permanently empty: jobs were created without a prompt_id and
 * nothing ever reconciled them. This version merges the browser mirror with the
 * server store, polls unfinished jobs against ComfyUI history, and renders the
 * resulting video through the app's own /api/comfyui/view proxy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, Clock3, Download, FolderOpen, HardDrive, Loader2, Lock,
  Play, RefreshCw, Trash2, Video,
} from 'lucide-react';
import {
  fetchServerJobs, isTerminal, isVideoOutput, loadJobs, mergeJobs,
  type JobOutput, type MotionaJob,
} from '@/lib/jobs';
import { downloadAll, downloadOutput } from '@/lib/download';
import OutputPreview from '@/components/OutputPreview';
import DevWorkerNotice from '@/components/DevWorkerNotice';
import AccountChip from '@/components/AccountChip';

const POLL_MS = 3000;
type Filter = 'all' | 'video' | 'image' | 'active' | 'failed';

export default function GalleryPage() {
  const [jobs, setJobs] = useState<MotionaJob[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [storage, setStorage] = useState('Local disk store');
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<{ output: JobOutput; job: MotionaJob } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const jobsRef = useRef<MotionaJob[]>([]);
  jobsRef.current = jobs;

  /* ------------------------------------------------------------- hydrate */

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const [serverJobs, response] = await Promise.all([fetchServerJobs(), fetch('/api/jobs', { cache: 'no-store' }).catch(() => null)]);
      if (response?.ok) {
        const data = await response.json().catch(() => null);
        if (data?.storage) setStorage(data.storage);
      }
      setJobs(mergeJobs(loadJobs(), serverJobs));
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Paint the browser mirror immediately, then reconcile with the server.
    setJobs(loadJobs());
    setLoaded(true);
    void refresh();
  }, [refresh]);

  /* -------------------------------------------------------------- polling */

  useEffect(() => {
    const tick = async () => {
      const active = jobsRef.current.filter((job) => job.promptId && !isTerminal(job.status));
      if (active.length === 0) return;

      const results = await Promise.all(
        active.map(async (job) => {
          try {
            const response = await fetch(`/api/video/job/${encodeURIComponent(job.promptId!)}`, { cache: 'no-store' });
            if (!response.ok) return null;
            const data = await response.json();
            return { job, data };
          } catch {
            return null;
          }
        }),
      );

      const updates = results.filter(Boolean) as { job: MotionaJob; data: any }[];
      if (updates.length === 0) return;

      setJobs((prev) => {
        const next = prev.map((job) => {
          const found = updates.find((entry) => entry.job.id === job.id);
          if (!found) return job;
          return {
            ...job,
            status: found.data.status,
            outputs: found.data.outputs?.length ? found.data.outputs.map(withKind) : job.outputs,
            error: found.data.error ?? (found.data.status === 'failed' ? job.error : undefined),
            pollCount: (job.pollCount || 0) + 1,
            updatedAt: new Date().toISOString(),
          };
        });
        // Mirror resolved jobs back to the browser store so a reload keeps them.
        for (const entry of updates) {
          const updated = next.find((job) => job.id === entry.job.id);
          if (updated && isTerminal(updated.status)) persistLocal(updated);
        }
        return next;
      });
    };

    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  /* ------------------------------------------------------------- derived */

  const visible = useMemo(() => {
    switch (filter) {
      case 'video': return jobs.filter((job) => job.type === 'video');
      case 'image': return jobs.filter((job) => job.type === 'image');
      case 'active': return jobs.filter((job) => !isTerminal(job.status));
      case 'failed': return jobs.filter((job) => job.status === 'failed');
      default: return jobs;
    }
  }, [jobs, filter]);

  const counts = useMemo(
    () => ({
      all: jobs.length,
      video: jobs.filter((j) => j.type === 'video').length,
      image: jobs.filter((j) => j.type === 'image').length,
      active: jobs.filter((j) => !isTerminal(j.status)).length,
      failed: jobs.filter((j) => j.status === 'failed').length,
    }),
    [jobs],
  );

  const removeJob = async (id: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== id));
    try {
      const store = window.localStorage;
      const remaining = loadJobs().filter((job) => job.id !== id);
      store.setItem('motiona-jobs', JSON.stringify(remaining));
    } catch { /* ignore */ }
    await fetch(`/api/jobs?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
  };

  return (
    <main className="productPage">
      <header className="productHeader">
        <Link href="/studio"><ArrowLeft size={15} /> Studio</Link>
        <strong>MOTIONA / PRIVATE GALLERY</strong>
        <Link className="secondary" href="/storyboard">Storyboard</Link>
        <span className="privacyBadge"><HardDrive size={12} /> {storage}</span>
              <AccountChip />
      </header>

      <section className="productWrap">
        <div className="productIntro">
          <p className="eyebrow"><FolderOpen size={14} /> PRIVATE GALLERY</p>
          <h1>Your work.</h1>
          <p>
            Jobs are written to a local disk store on the machine running MOTIONA and mirrored in
            this browser, so they survive a reload. Rendered video is streamed through the app from
            ComfyUI rather than fetched directly — your browser never talks to the worker.
            {storage === 'Local disk store' && ' This is not cloud storage and is not shared between devices.'}
          </p>
        </div>

        <DevWorkerNotice />

        <div className="galleryToolbar">
          <div className="galleryFilters">
            {([
              ['all', 'All'],
              ['video', 'Video'],
              ['image', 'Stills'],
              ['active', 'In flight'],
              ['failed', 'Failed'],
            ] as [Filter, string][]).map(([key, label]) => (
              <button key={key} className={filter === key ? 'nav active' : 'nav'} onClick={() => setFilter(key)}>
                {label} <span>{counts[key]}</span>
              </button>
            ))}
          </div>
          <button className="secondary" onClick={() => void refresh(true)} disabled={refreshing}>
            {refreshing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
          </button>
        </div>

        {!loaded ? (
          <div className="empty"><Loader2 className="spin" size={20} /><p>Loading gallery…</p></div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <h2>{jobs.length === 0 ? 'No jobs yet' : 'Nothing matches this filter'}</h2>
            <p>
              {jobs.length === 0
                ? 'Render a shot from the storyboard or queue a workflow on the Animate screen; jobs appear here as soon as ComfyUI accepts them.'
                : 'Try a different filter.'}
            </p>
            <Link className="primary" href="/storyboard">Open storyboard</Link>
          </div>
        ) : (
          <div className="jobGallery">
            {visible.map((job) => (
              <article key={job.id} className={`jobCard ${job.status}`}>
                <div className="jobCardHead">
                  <b>{job.type === 'video' ? <Video size={13} /> : <FolderOpen size={13} />} {job.type.toUpperCase()}</b>
                  <JobStatus status={job.status} />
                </div>

                <div className="jobPreview">
                  {job.outputs.length > 0 ? (
                    job.outputs.slice(0, 4).map((output) => (
                      <button
                        key={output.url + output.filename}
                        className="thumbBtn"
                        onClick={() => setPreview({ output, job })}
                        title="Open preview player"
                      >
                        <OutputView output={output} />
                        <span className="thumbPlay" aria-hidden="true">Preview</span>
                      </button>
                    ))
                  ) : job.status === 'failed' ? (
                    <div className="jobPreviewEmpty"><AlertTriangle size={18} /> Failed</div>
                  ) : (
                    <div className="jobPreviewEmpty"><Loader2 size={18} className="spin" /> Waiting on worker</div>
                  )}
                </div>

                <h3>{job.shotLabel || job.prompt || 'Untitled job'}</h3>
                {job.prompt && job.shotLabel && <p className="jobPrompt">{job.prompt}</p>}

                <dl className="jobMeta">
                  {job.worker && <><dt>Worker</dt><dd>{job.worker}</dd></>}
                  {job.promptId && <><dt>Prompt</dt><dd><code title={job.promptId}>{job.promptId.slice(0, 8)}</code></dd></>}
                  {typeof job.seed === 'number' && <><dt>Seed</dt><dd><code>{job.seed}</code></dd></>}
                  {job.characterName && <><dt>Character</dt><dd>{job.characterName}</dd></>}
                  <><dt>Updated</dt><dd><Clock3 size={11} /> {new Date(job.updatedAt).toLocaleTimeString()}</dd></>
                </dl>

                {job.error && <p className="shotError">{job.error}</p>}

                <div className="jobCardActions">
                  {job.outputs.length > 0 && (
                    <button className="secondary smallBtn" onClick={() => setPreview({ output: job.outputs[0], job })}>
                      <Play size={13} /> Preview
                    </button>
                  )}
                  {job.outputs.map((output) => (
                    <button
                      key={output.url}
                      className="textBtn downloadBtn"
                      disabled={saving === output.url}
                      onClick={async () => {
                        setSaving(output.url);
                        try { await downloadOutput(output); } finally { setSaving(null); }
                      }}
                    >
                      {saving === output.url ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
                      {output.filename.length > 18 ? `${output.filename.slice(0, 15)}…` : output.filename}
                    </button>
                  ))}
                  {job.outputs.length > 1 && (
                    <button
                      className="textBtn downloadBtn"
                      disabled={saving === `all:${job.id}`}
                      onClick={async () => {
                        setSaving(`all:${job.id}`);
                        try { await downloadAll(job.outputs); } finally { setSaving(null); }
                      }}
                    >
                      {saving === `all:${job.id}` ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
                      Download all ({job.outputs.length})
                    </button>
                  )}
                  {job.storyboardId && <Link className="textBtn" href="/storyboard">Storyboard</Link>}
                  <button className="textBtn danger" onClick={() => void removeJob(job.id)}><Trash2 size={12} /> Remove</button>
                </div>
              </article>
            ))}
          </div>
        )}

        <OutputPreview output={preview?.output || null} job={preview?.job || null} onClose={() => setPreview(null)} />

        <p className="storageNote">
          <Lock size={12} />
          Storage adapter: <b>{storage}</b>. Set <code>STORAGE_PROVIDER</code> and{' '}
          <code>STORAGE_BUCKET</code> to move to object storage without changing the job or
          storyboard contracts.
        </p>
      </section>
    </main>
  );
}

function JobStatus({ status }: { status: MotionaJob['status'] }) {
  return <span className={`shotStatus ${status === 'completed' ? 'complete' : status}`}>{status}</span>;
}

function OutputView({ output }: { output: JobOutput }) {
  if (isVideoOutput(output)) {
    return (
      // controls + preload metadata: enough to scrub without pulling the whole file.
      <video className="jobVideo" src={output.url} controls preload="metadata" playsInline loop muted />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="jobImage" src={output.url} alt={output.filename} loading="lazy" />;
}

function withKind(entry: any): JobOutput {
  const filename = String(entry?.filename || '');
  return {
    filename,
    subfolder: String(entry?.subfolder || ''),
    type: String(entry?.type || 'output'),
    url: String(entry?.url || ''),
    kind: entry?.kind === 'video' || /\.(mp4|webm|mov|gif)$/i.test(filename) ? 'video' : 'image',
  };
}

/** Write a finished job back into the browser mirror. */
function persistLocal(job: MotionaJob) {
  try {
    const existing = loadJobs();
    const next = [job, ...existing.filter((entry) => entry.id !== job.id)].slice(0, 200);
    window.localStorage.setItem('motiona-jobs', JSON.stringify(next));
  } catch { /* quota or private mode */ }
}
