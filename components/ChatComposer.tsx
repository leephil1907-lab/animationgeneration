'use client';

/**
 * React wrapper around the vanilla vs-chat-input composer.
 *
 * The component itself lives in ./vs-chat-input/ (vs-chat-input.js + .css) and
 * owns every interaction: spring growth, file chips with upload rings, the
 * keyboard model picker, and the send→stop morph. This wrapper only renders
 * the documented markup, mounts the controller once, and re-broadcasts its
 * custom events as props so React code (the studio chat panel) can drive it
 * through the ref handle.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { vsChatInput, type VsChatInputApi, type VsSubmitDetail } from './vs-chat-input/vs-chat-input';
import './vs-chat-input/vs-chat-input.css';

export type { VsChatInputApi, VsSubmitDetail };

export interface ChatComposerProps {
  placeholder?: string;
  accept?: string;
  maxFiles?: number;
  disabled?: boolean;
  /** Extra controls rendered in the bar between the paperclip and the model picker (e.g. the mic). */
  extraBar?: React.ReactNode;
  onSubmit?: (detail: VsSubmitDetail, api: VsChatInputApi) => void;
  onStop?: (api: VsChatInputApi) => void;
  onFiles?: (added: { id: string; file: File }[], api: VsChatInputApi) => void;
  onRemove?: (detail: { id: string; file: File }, api: VsChatInputApi) => void;
  onModel?: (model: string, api: VsChatInputApi) => void;
}

const MODELS = [
  { value: 'loom-3', name: 'Loom 3', hint: 'Balanced for everyday work', selected: true },
  { value: 'loom-3-deep', name: 'Loom 3 Deep', hint: 'Thinks longer on hard problems', selected: false },
  { value: 'atlas-mini', name: 'Atlas Mini', hint: 'Fastest, for quick replies', selected: false },
  { value: 'atlas-vision', name: 'Atlas Vision', hint: 'Reads images, charts and scans', selected: false },
];

const ChatComposer = forwardRef<VsChatInputApi | null, ChatComposerProps>(function ChatComposer(
  { placeholder = 'Ask anything, or drop a file…', accept, maxFiles, disabled, extraBar, onSubmit, onStop, onFiles, onRemove, onModel },
  ref,
) {
  const formRef = useRef<HTMLFormElement>(null);
  const apiRef = useRef<VsChatInputApi | null>(null);
  const handlers = useRef({ onSubmit, onStop, onFiles, onRemove, onModel });
  handlers.current = { onSubmit, onStop, onFiles, onRemove, onModel };

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const api = vsChatInput.mount(form);
    if (!api) return;
    apiRef.current = api;

    const el = form;
    const on = <T,>(type: string, fn: (detail: T) => void) => {
      const listener = (event: Event) => fn((event as CustomEvent<T>).detail);
      el.addEventListener(type, listener);
      return () => el.removeEventListener(type, listener);
    };
    const offs = [
      on<VsSubmitDetail>('vs-chat-input:submit', (d) => handlers.current.onSubmit?.(d, api)),
      on('vs-chat-input:stop', () => handlers.current.onStop?.(api)),
      on<{ added: { id: string; file: File }[] }>('vs-chat-input:files', (d) => handlers.current.onFiles?.(d.added, api)),
      on<{ id: string; file: File }>('vs-chat-input:remove', (d) => handlers.current.onRemove?.(d, api)),
      on<{ model: string }>('vs-chat-input:model', (d) => handlers.current.onModel?.(d.model, api)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  useEffect(() => {
    apiRef.current?.setDisabled(Boolean(disabled));
  }, [disabled]);

  /* The controller is created in an effect, so the handle delegates to it
     lazily instead of capturing a null on first commit. */
  const [proxy] = useState<VsChatInputApi>(() => ({
      setBusy: (b) => apiRef.current?.setBusy(b),
      setProgress: (id, p) => apiRef.current?.setProgress(id, p),
      addFiles: (f) => apiRef.current?.addFiles(f) ?? [],
      removeFile: (id) => apiRef.current?.removeFile(id),
      clear: () => apiRef.current?.clear(),
      submit: () => apiRef.current?.submit(),
      stop: () => apiRef.current?.stop(),
      focus: () => apiRef.current?.focus(),
      setDisabled: (d) => apiRef.current?.setDisabled(d),
      get value() { return apiRef.current?.value ?? ''; },
      set value(v) { if (apiRef.current) apiRef.current.value = v; },
      get model() { return apiRef.current?.model ?? ''; },
      set model(m) { if (apiRef.current) apiRef.current.model = m; },
      get files() { return apiRef.current?.files ?? []; },
      get busy() { return apiRef.current?.busy ?? false; },
      get disabled() { return apiRef.current?.disabled ?? false; },
  }) as VsChatInputApi);
  useImperativeHandle(ref, () => proxy, [proxy]);

  return (
    <form
      ref={formRef}
      className="vs-chat-input"
      aria-label="Message composer"
      data-accept={accept}
      data-max-files={maxFiles}
    >
      <textarea className="vs-chat-input-text" rows={1} name="message" placeholder={placeholder} aria-label="Message" />
      <div className="vs-chat-input-bar">
        <button className="vs-chat-input-attach" type="button" aria-label="Attach files"></button>
        {extraBar}
        <div className="vs-chat-input-model">
          <button className="vs-chat-input-model-btn" type="button" aria-haspopup="listbox"></button>
          <ul className="vs-chat-input-menu" role="listbox" aria-label="Model" hidden>
            {MODELS.map((m) => (
              <li key={m.value} role="option" data-value={m.value} aria-selected={m.selected ? 'true' : 'false'}>
                {m.name}
                <small>{m.hint}</small>
              </li>
            ))}
          </ul>
        </div>
        <button className="vs-chat-input-send" type="submit" aria-label="Send message"></button>
      </div>
    </form>
  );
});

export default ChatComposer;
