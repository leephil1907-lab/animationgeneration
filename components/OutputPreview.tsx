'use client';

/**
 * Full-size preview player for a rendered output, with its download action.
 *
 * Rendered outputs are animations, and a 190px gallery thumbnail is not a
 * preview. This gives a real player: native controls, looping, correct aspect,
 * plus the output's provenance (worker, seed, prompt_id) and a Download button
 * that saves under the worker's filename.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, Loader2, X } from 'lucide-react';
import { downloadOutput, filenameFor } from '@/lib/download';
import { isVideoOutput, type JobOutput, type MotionaJob } from '@/lib/jobs';

type Props = {
  output: JobOutput | null;
  job?: MotionaJob | null;
  onClose: () => void;
};

export default function OutputPreview({ output, job, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  /* Escape closes; scroll is locked while open. */
  useEffect(() => {
    if (!output) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [output, onClose]);

  if (!mounted || !output) return null;

  const video = isVideoOutput(output);

  const save = async () => {
    setSaving(true);
    try {
      await downloadOutput(output);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="previewBackdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${filenameFor(output)}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="previewModal">
        <header className="previewHead">
          <div>
            <b>{filenameFor(output)}</b>
            <span>{video ? 'Animation preview' : 'Still preview'} · served through the app from ComfyUI</span>
          </div>
          <button className="iconDelete" onClick={onClose} aria-label="Close preview">
            <X size={16} />
          </button>
        </header>

        <div className="previewStage" ref={stageRef}>
          {failed ? (
            <div className="previewFailed">
              <p>Preview could not load this output.</p>
              <button className="secondary" onClick={save}>
                <Download size={14} /> Download it instead
              </button>
            </div>
          ) : video ? (
            <video
              key={output.url}
              src={output.url}
              controls
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onError={() => setFailed(true)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={output.url} alt={filenameFor(output)} onError={() => setFailed(true)} />
          )}
        </div>

        <dl className="previewMeta">
          {job?.worker && (
            <>
              <dt>Worker</dt>
              <dd>{job.worker}</dd>
            </>
          )}
          {job?.promptId && (
            <>
              <dt>Prompt ID</dt>
              <dd>
                <code title={job.promptId}>{job.promptId}</code>
              </dd>
            </>
          )}
          {typeof job?.seed === 'number' && (
            <>
              <dt>Seed</dt>
              <dd>
                <code>{job.seed}</code>
              </dd>
            </>
          )}
          {job?.characterName && (
            <>
              <dt>Character</dt>
              <dd>{job.characterName}</dd>
            </>
          )}
          {output.subfolder && (
            <>
              <dt>Subfolder</dt>
              <dd>{output.subfolder}</dd>
            </>
          )}
        </dl>

        {job?.prompt && <p className="previewPrompt">{job.prompt}</p>}

        <footer className="previewActions">
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
            Download animation
          </button>
          <a className="secondary" href={output.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> Open in new tab
          </a>
          <button className="textBtn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
