'use client';

/**
 * Storyboard + timeline, and the handoff into the video worker.
 *
 * Previously this page held a board in useState and nothing else: a refresh lost
 * the sequence, and a shot's status could never leave 'draft' because no code
 * path submitted it anywhere. This version persists the board, anchors character
 * identity across shots, and actually renders.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, ArrowDown, ArrowUp, Clapperboard, Clock3, Dice5, Download,
  Film, Loader2, Lock, Play, Plus, Trash2, Upload, Wand2,
} from 'lucide-react';
import OutputPreview from '@/components/OutputPreview';
import DevWorkerNotice from '@/components/DevWorkerNotice';
import AccountChip from '@/components/AccountChip';
import { downloadAll, downloadOutput } from '@/lib/download';
import type { JobOutput } from '@/lib/jobs';
import {
  CAMERA_MOVES, boardIsComplete, dimensionsFor, fetchServerBoards, formatRuntime, framesFor, loadBoards,
  mergeBoards,
  newShot, newStoryboard, randomSeed, saveBoard, shotProgress, totalRuntime,
  type Shot, type Storyboard,
} from '@/lib/storyboard';

const WORKERS = ['ComfyUI / Wan2.1', 'ComfyUI / AnimateDiff'];
const ASPECTS = ['16:9', '9:16', '1:1', '4:3', '21:9'];
const POLL_MS = 2500;
const SAVE_DEBOUNCE_MS = 700;

const FPS = 16;

type Notice = { tone: 'ok' | 'warn' | 'error'; text: string } | null;

export default function StoryboardPage() {
  const [board, setBoard] = useState<Storyboard | null>(null);
  const [workflow, setWorkflow] = useState<{ name: string; graph: Record<string, unknown>; tokens: string[] } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [renderingSequence, setRenderingSequence] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ output: JobOutput; shot: Shot } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardRef = useRef<Storyboard | null>(null);
  boardRef.current = board;

  /* -------------------------------------------- ComfyUI checkpoint discovery */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/comfyui/models', { cache: 'no-store' });
        const data = await response.json();
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.checkpoints)) {
          setCheckpoints(data.checkpoints);
          setModelsError(null);
          // Adopt the first installed checkpoint when the board has none, so the
          // scaffold path works without the operator hunting for a model name.
          setBoard((prev) => (prev && !prev.checkpoint && data.checkpoints[0] ? { ...prev, checkpoint: data.checkpoints[0] } : prev));
        } else {
          setModelsError(data?.error || 'Model discovery unavailable');
        }
      } catch {
        if (!cancelled) setModelsError('Could not reach ComfyUI for model discovery');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------- hydrate on load */

  useEffect(() => {
    const local = loadBoards();
    const restored = local[0] || newStoryboard('MOTIONA sequence');
    // If this browser holds nothing, adopt the newest board the storage adapter
    // has for this device so a cleared browser still opens onto real work.
    if (local.length === 0) {
      void fetchServerBoards().then((serverBoards) => {
        if (serverBoards.length === 0) return;
        setBoard(mergeBoards([], serverBoards)[0]);
      });
    }
    // Attribute new boards to the signed-in local account, when there is one.
    if (!restored.owner) {
      try {
        const session = JSON.parse(window.localStorage.getItem('motiona-session') || 'null');
        if (session?.email) restored.owner = String(session.email);
      } catch { /* no session */ }
    }
    setBoard(restored);
    setHydrated(true);
  }, []);

  /* ------------------------------------------------- debounced persistence */

  useEffect(() => {
    if (!hydrated || !board) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const stamped = saveBoard(board);
      void fetch('/api/storyboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboard: stamped }),
      }).catch(() => undefined);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [board, hydrated]);

  const patch = useCallback((changes: Partial<Storyboard>) => {
    setBoard((prev) => (prev ? { ...prev, ...changes, updatedAt: new Date().toISOString() } : prev));
  }, []);

  const patchShot = useCallback((id: string, changes: Partial<Shot>) => {
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            shots: prev.shots.map((shot) => (shot.id === id ? { ...shot, ...changes } : shot)),
            updatedAt: new Date().toISOString(),
          }
        : prev,
    );
  }, []);

  /* -------------------------------------------------------------- shot ops */

  const addShot = () =>
    setBoard((prev) => (prev ? { ...prev, shots: [...prev.shots, newShot(prev.shots.length + 1)] } : prev));

  const removeShot = (id: string) =>
    setBoard((prev) => (prev ? { ...prev, shots: prev.shots.filter((shot) => shot.id !== id) } : prev));

  const moveShot = (index: number, direction: -1 | 1) =>
    setBoard((prev) => {
      if (!prev) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.shots.length) return prev;
      const shots = [...prev.shots];
      [shots[index], shots[target]] = [shots[target], shots[index]];
      return { ...prev, shots };
    });

  /* ---------------------------------------------------------- render a shot */

  /**
   * Submit one shot to the video worker. Every shot in a sequence shares the
   * board's masterSeed, which is what keeps the character visually stable from
   * shot to shot; the per-shot prompt varies the action and camera only.
   */
  const renderShot = useCallback(
    async (shot: Shot): Promise<boolean> => {
      const current = boardRef.current;
      if (!current) return false;

      if (!shot.prompt.trim()) {
        setNotice({ tone: 'warn', text: `"${shot.scene}" has no prompt — nothing to render.` });
        return false;
      }

      setBusy((prev) => ({ ...prev, [shot.id]: true }));
      patchShot(shot.id, { status: 'queued', error: undefined });

      try {
        const { width, height } = dimensionsFor(current.aspectRatio);
        const response = await fetch('/api/video/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worker: current.worker || WORKERS[0],
            workflowName: workflow?.name,
            board: {
              id: current.id,
              masterSeed: current.masterSeed,
              characterName: current.characterName,
              characterTraits: current.characterTraits,
              characterStyle: current.characterStyle,
            },
            shot: { id: shot.id, scene: shot.scene, prompt: shot.prompt, camera: shot.camera, duration: shot.duration, dialogue: shot.dialogue },
            // An imported workflow wins; otherwise the server builds the scaffold.
            ...(workflow ? { workflow: workflow.graph } : {}),
            values: {
              prompt: shot.prompt,
              scene: shot.scene,
              camera: shot.camera,
              duration: shot.duration,
              seed: current.masterSeed,
              width,
              height,
              frames: framesFor(shot, FPS),
              fps: FPS,
              characterName: current.characterName,
              characterTraits: current.characterTraits,
            },
            settings: {
              width,
              height,
              frames: framesFor(shot, FPS),
              fps: FPS,
              seed: current.masterSeed,
              // Only used by the built-in scaffold; an imported workflow names its own.
              checkpoint: current.checkpoint,
            },
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          const message = data?.error || `Queue failed (${response.status})`;
          patchShot(shot.id, { status: 'failed', error: message });
          setNotice({ tone: 'error', text: data?.details ? `${message} — ${data.details}` : message });
          return false;
        }

        patchShot(shot.id, { status: 'queued', promptId: data.promptId, jobId: data.job?.id, seed: data.seed });
        setNotice({
          tone: 'ok',
          text: `"${shot.scene}" queued as ${String(data.promptId).slice(0, 8)} · seed ${data.seed} · ${data.frames} frames @ ${data.fps}fps`,
        });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not reach the video worker';
        patchShot(shot.id, { status: 'failed', error: message });
        setNotice({ tone: 'error', text: message });
        return false;
      } finally {
        setBusy((prev) => ({ ...prev, [shot.id]: false }));
      }
    },
    [patchShot, workflow],
  );

  /** Render every shot that is not already finished, in timeline order. */
  const renderSequence = async () => {
    const current = boardRef.current;
    if (!current) return;
    const pending = current.shots.filter((shot) => shot.status === 'draft' || shot.status === 'failed');
    if (pending.length === 0) {
      setNotice({ tone: 'warn', text: 'Nothing to render — every shot is queued or complete.' });
      return;
    }
    setRenderingSequence(true);
    setNotice({ tone: 'ok', text: `Rendering ${pending.length} shot${pending.length === 1 ? '' : 's'}…` });
    let ok = 0;
    for (const shot of pending) {
      // Sequential submission: a local ComfyUI box has one GPU and a real queue.
      if (await renderShot(shot)) ok += 1;
    }
    setRenderingSequence(false);
    setNotice({ tone: ok === pending.length ? 'ok' : 'warn', text: `Queued ${ok} of ${pending.length} shots.` });
  };

  /* ---------------------------------------------------------------- polling */

  useEffect(() => {
    if (!board) return;
    const active = board.shots.filter((shot) => shot.promptId && (shot.status === 'queued' || shot.status === 'running'));
    if (active.length === 0) return;

    const timer = setInterval(async () => {
      const current = boardRef.current;
      if (!current) return;
      const watching = current.shots.filter((shot) => shot.promptId && (shot.status === 'queued' || shot.status === 'running'));
      if (watching.length === 0) return;

      await Promise.all(
        watching.map(async (shot) => {
          try {
            const response = await fetch(`/api/video/job/${encodeURIComponent(shot.promptId!)}`, { cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            const nextStatus = data.status === 'completed' ? 'complete' : data.status;
            const outputs = Array.isArray(data.outputs) && data.outputs.length
              ? data.outputs.map((entry: any) => ({
                  filename: String(entry.filename),
                  subfolder: String(entry.subfolder || ''),
                  type: String(entry.type || 'output'),
                  url: String(entry.url),
                  kind: /\.(mp4|webm|mov|gif)$/i.test(String(entry.filename)) ? ('video' as const) : ('image' as const),
                }))
              : undefined;

            const statusChanged = nextStatus !== shot.status;
            const outputsArrived = Boolean(outputs) && (shot.outputs?.length || 0) === 0;
            if (!statusChanged && !outputsArrived) return;

            patchShot(shot.id, {
              status: nextStatus,
              error: data.error,
              outputs: outputs ?? shot.outputs,
              promptId: shot.promptId || data.promptId,
            });
            if (statusChanged && nextStatus === 'complete') {
              setNotice({ tone: 'ok', text: `"${shot.scene}" finished rendering — ready to preview and download.` });
            }
          } catch {
            // A missed poll is not worth surfacing; the next tick retries.
          }
        }),
      );
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [board, patchShot]);

  /* ------------------------------------------------------------ workflow io */

  const onWorkflowFile = async (file: File | null) => {
    if (!file) return;
    try {
      const graph = JSON.parse(await file.text());
      const tokens = detectTokensClient(graph);
      setWorkflow({ name: file.name, graph, tokens });
      setNotice({
        tone: 'ok',
        text: tokens.length
          ? `Imported ${file.name} · tokens: ${tokens.join(', ')}`
          : `Imported ${file.name} · no substitution tokens found, the graph runs as-is`,
      });
    } catch {
      setNotice({ tone: 'error', text: `${file.name} is not valid JSON.` });
      setWorkflow(null);
    }
  };

  const exportBoard = () => {
    if (!board) return;
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${board.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'storyboard'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /* ------------------------------------------------------------- derived ui */

  const progress = useMemo(() => (board ? shotProgress(board) : null), [board]);
  const runtime = useMemo(() => (board ? totalRuntime(board) : 0), [board]);
  const complete = useMemo(() => (board ? boardIsComplete(board) : false), [board]);
  const activeCount = board ? board.shots.filter((s) => s.status === 'queued' || s.status === 'running').length : 0;

  if (!board) {
    return (
      <main className="productPage">
        <section className="productWrap">
          <div className="empty">
            <Loader2 className="spin" size={20} />
            <p>Loading storyboard…</p>
          </div>
        </section>
      </main>
    );
  }

  const done = (progress?.complete || 0) + (progress?.failed || 0);
  const pct = board.shots.length ? Math.round((done / board.shots.length) * 100) : 0;

  return (
    <main className="productPage">
      <header className="productHeader">
        <Link href="/studio"><ArrowLeft size={15} /> Studio</Link>
        <strong>MOTIONA / STORYBOARD</strong>
        <Link className="secondary" href="/animate">Video worker</Link>
        <Link className="secondary" href="/gallery">Gallery</Link>
              <AccountChip />
      </header>

      <section className="productWrap">
        <div className="productIntro">
          <p className="eyebrow"><Film size={14} /> STORYBOARD + TIMELINE</p>
          <h1>Direct the sequence.</h1>
          <p>
            Break a concept into shots, then hand them to the video worker. Boards persist between
            visits, and every shot in a sequence shares one locked seed so the character holds
            its identity from shot to shot.
          </p>
        </div>

        <DevWorkerNotice />

        {notice && (
          <div className={`sequenceNotice ${notice.tone}`} role="status">
            {notice.tone === 'error' ? <Trash2 size={13} /> : notice.tone === 'warn' ? <Clock3 size={13} /> : <Clapperboard size={13} />}
            <span>{notice.text}</span>
            <button className="textBtn" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}

        {/* ------------------------------------------- sequence identity --- */}
        <div className="sequencePanel">
          <div className="sequenceHead">
            <b>Sequence</b>
            <span className="privacyBadge"><Lock size={12} /> Saved on this device + local disk store</span>
          </div>

          <div className="sequenceFields">
            <label className="wide">
              Title
              <input value={board.title} onChange={(e) => patch({ title: e.target.value })} />
            </label>
            <label>
              Aspect
              <select value={board.aspectRatio} onChange={(e) => patch({ aspectRatio: e.target.value })}>
                {ASPECTS.map((ratio) => <option key={ratio}>{ratio}</option>)}
              </select>
            </label>
            <label>
              Worker
              <select value={board.worker || WORKERS[0]} onChange={(e) => patch({ worker: e.target.value })}>
                {WORKERS.map((worker) => <option key={worker}>{worker}</option>)}
              </select>
            </label>
            <label className="wide">
              Checkpoint {workflow ? '(unused — imported workflow names its own)' : '(built-in scaffold)'}
              <select
                value={board.checkpoint || ''}
                onChange={(e) => patch({ checkpoint: e.target.value })}
                disabled={Boolean(workflow)}
              >
                <option value="">{checkpoints.length ? 'Select a checkpoint…' : 'None discovered'}</option>
                {checkpoints.map((name) => <option key={name} value={name}>{name}</option>)}
                {/* Keep a configured value selectable even if discovery is down. */}
                {board.checkpoint && !checkpoints.includes(board.checkpoint) && (
                  <option value={board.checkpoint}>{board.checkpoint}</option>
                )}
              </select>
            </label>
          </div>

          {!workflow && !board.checkpoint && (
            <p className="sequenceWarning">
              <AlertTriangle size={13} />
              {modelsError
                ? `${modelsError}. Import an API-format workflow below, or set COMFYUI_VIDEO_CHECKPOINT — the built-in scaffold needs a checkpoint name.`
                : 'No checkpoint selected. Pick one above or import an API-format workflow; the built-in scaffold cannot render without a checkpoint.'}
            </p>
          )}

          <div className="sequenceHead" style={{ marginTop: 18 }}>
            <b>Character anchor</b>
            <span className="privacyBadge">Synthetic description only — no real-person likeness</span>
          </div>

          <div className="sequenceFields">
            <label>
              Name
              <input
                value={board.characterName || ''}
                placeholder="e.g. Navigator Sable"
                onChange={(e) => patch({ characterName: e.target.value })}
              />
            </label>
            <label className="wide">
              Appearance
              <textarea
                value={board.characterTraits || ''}
                placeholder="Describe features, wardrobe and palette that must stay constant across shots"
                onChange={(e) => patch({ characterTraits: e.target.value })}
              />
            </label>
            <label className="wide">
              Visual style
              <textarea
                value={board.characterStyle || ''}
                placeholder="e.g. painterly cel shading, muted teal and amber grade"
                onChange={(e) => patch({ characterStyle: e.target.value })}
              />
            </label>
          </div>

          <div className="seedRow">
            <div>
              <b>Master seed</b>
              <code>{board.masterSeed ?? '—'}</code>
              <p className="fieldHint">
                Shared by every shot. Re-roll only when you want a different character; keep it
                locked to preserve identity across the sequence.
              </p>
            </div>
            <div className="seedActions">
              <button className="secondary" onClick={() => patch({ masterSeed: randomSeed() })}>
                <Dice5 size={14} /> Re-roll
              </button>
              <span className="seedLock"><Lock size={13} /> Locked to sequence</span>
            </div>
          </div>
        </div>

        {/* --------------------------------------------------- workflow io --- */}
        <div className="workflowUpload">
          <div>
            <b>API workflow</b>
            <p>
              {workflow
                ? `${workflow.name}${workflow.tokens.length ? ` · ${workflow.tokens.join(' ')}` : ' · no tokens'}`
                : 'Optional. Import a ComfyUI API-format JSON to use your installed graph; otherwise the built-in scaffold is submitted.'}
            </p>
          </div>
          <div className="workflowActions">
            {workflow && <button className="textBtn" onClick={() => setWorkflow(null)}>Clear</button>}
            <label className="templateImport">
              <Upload size={14} /> Choose workflow
              <input type="file" accept="application/json,.json" onChange={(e) => onWorkflowFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>

        {/* ------------------------------------------------------ timeline --- */}
        <div className="sequenceBar">
          <div className="sequenceStats">
            <span><Clock3 size={13} /> {formatRuntime(runtime)} intended</span>
            <span>{board.shots.length} shots</span>
            {progress && (
              <span>
                {progress.complete} complete · {progress.queued + progress.running} in flight · {progress.failed} failed · {progress.draft} draft
              </span>
            )}
            {activeCount > 0 && <span className="liveDot"><Loader2 size={12} className="spin" /> polling ComfyUI</span>}
          </div>
          <div className="sequenceProgress"><i style={{ width: `${pct}%` }} /></div>
          <div className="sequenceActions">
            <button className="secondary" onClick={exportBoard} disabled={!board.shots.length}>Export JSON</button>
            <button className="primary" onClick={addShot}><Plus size={15} /> Add shot</button>
            <button
              className="primary"
              onClick={renderSequence}
              disabled={renderingSequence || !board.shots.some((s) => s.status === 'draft' || s.status === 'failed')}
            >
              {renderingSequence ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}
              Render sequence
            </button>
          </div>
        </div>

        {complete && (
          <div className="sequenceNotice ok">
            <Clapperboard size={13} />
            <span>Every shot finished. Outputs are proxied through the app and listed in the gallery.</span>
            <Link className="secondary" href="/gallery">Open gallery</Link>
          </div>
        )}

        <OutputPreview
          output={preview?.output || null}
          job={
            preview
              ? {
                  id: preview.shot.jobId || preview.shot.id,
                  type: 'video',
                  provider: 'comfyui',
                  promptId: preview.shot.promptId,
                  seed: preview.shot.seed ?? board.masterSeed,
                  characterName: board.characterName,
                  worker: board.worker,
                  status: preview.shot.status === 'complete' ? 'completed' : 'running',
                  createdAt: board.createdAt,
                  updatedAt: board.updatedAt,
                  prompt: preview.shot.prompt,
                  outputs: preview.shot.outputs || [],
                }
              : null
          }
          onClose={() => setPreview(null)}
        />

        <div className="timeline">
          {board.shots.length === 0 ? (
            <div className="empty">
              <h2>No shots yet</h2>
              <p>Add your first shot to begin the timeline.</p>
              <button className="primary" onClick={addShot}>Create first shot</button>
            </div>
          ) : (
            board.shots.map((shot, index) => (
              <article className="shot" key={shot.id}>
                <div className="shotNumber">
                  {String(index + 1).padStart(2, '0')}
                  <div className="shotReorder">
                    <button onClick={() => moveShot(index, -1)} disabled={index === 0} title="Move earlier"><ArrowUp size={11} /></button>
                    <button onClick={() => moveShot(index, 1)} disabled={index === board.shots.length - 1} title="Move later"><ArrowDown size={11} /></button>
                  </div>
                </div>

                <div className="shotBody">
                  <div className="shotTop">
                    <input value={shot.scene} onChange={(e) => patchShot(shot.id, { scene: e.target.value })} />
                    <span><Clock3 size={12} />{shot.duration}s</span>
                    <span className="frameCount">{framesFor(shot, FPS)} frames</span>
                    <StatusBadge status={shot.status} />
                    {shot.promptId && <code className="promptIdTag" title={shot.promptId}>{shot.promptId.slice(0, 8)}</code>}
                    <button className="iconDelete" onClick={() => removeShot(shot.id)}><Trash2 size={14} /></button>
                  </div>

                  <div className="shotFields">
                    <label>
                      Prompt
                      <textarea value={shot.prompt} onChange={(e) => patchShot(shot.id, { prompt: e.target.value })} />
                    </label>
                    <label>
                      Camera
                      <select value={shot.camera} onChange={(e) => patchShot(shot.id, { camera: e.target.value })}>
                        {CAMERA_MOVES.map((move) => <option key={move}>{move}</option>)}
                      </select>
                    </label>
                    <label>
                      Duration
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={shot.duration}
                        onChange={(e) => patchShot(shot.id, { duration: Number(e.target.value) })}
                      />
                    </label>
                    <label className="wide">
                      Dialogue / performance
                      <textarea value={shot.dialogue} onChange={(e) => patchShot(shot.id, { dialogue: e.target.value })} />
                    </label>
                  </div>

                  {shot.error && <p className="shotError">{shot.error}</p>}

                  {shot.outputs && shot.outputs.length > 0 && (
                    <div className="shotOutputs">
                      {shot.outputs.slice(0, 4).map((output) => (
                        <button
                          key={output.url + output.filename}
                          className="thumbBtn"
                          onClick={() => setPreview({ output, shot })}
                          title={`Preview ${output.filename}`}
                        >
                          {output.kind === 'video' ? (
                            <video src={output.url} muted loop playsInline preload="metadata" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={output.url} alt={output.filename} loading="lazy" />
                          )}
                          <span className="thumbPlay" aria-hidden="true">Preview</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="shotActions">
                    <button
                      className="primary"
                      disabled={busy[shot.id] || !shot.prompt.trim() || shot.status === 'queued' || shot.status === 'running'}
                      onClick={() => renderShot(shot)}
                    >
                      {busy[shot.id] || shot.status === 'queued' || shot.status === 'running'
                        ? <Loader2 size={14} className="spin" />
                        : <Wand2 size={14} />}
                      {shot.status === 'complete' ? 'Re-render shot' : 'Render shot'}
                    </button>
                    {shot.outputs && shot.outputs.length > 0 && (
                      <>
                        <button className="secondary" onClick={() => setPreview({ output: shot.outputs![0], shot })}>
                          <Play size={14} /> Preview
                        </button>
                        <button
                          className="secondary"
                          disabled={saving === shot.id}
                          onClick={async () => {
                            setSaving(shot.id);
                            try {
                              if (shot.outputs!.length > 1) await downloadAll(shot.outputs!);
                              else await downloadOutput(shot.outputs![0]);
                            } finally {
                              setSaving(null);
                            }
                          }}
                        >
                          {saving === shot.id ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                          {shot.outputs.length > 1 ? `Download all (${shot.outputs.length})` : 'Download'}
                        </button>
                      </>
                    )}
                    {shot.status === 'complete' && shot.promptId && (
                      <Link className="textBtn" href="/gallery">Open in gallery</Link>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: Shot['status'] }) {
  const label: Record<Shot['status'], string> = {
    draft: 'Draft',
    queued: 'Queued',
    running: 'Rendering',
    complete: 'Complete',
    failed: 'Failed',
  };
  return <span className={`shotStatus ${status}`}>{label[status]}</span>;
}

/** Client-side mirror of lib/comfy/tokens detectTokens (keeps this file browser-safe). */
function detectTokensClient(graph: unknown): string[] {
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
  return [...found].sort();
}
