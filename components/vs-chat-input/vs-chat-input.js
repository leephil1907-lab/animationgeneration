/* ============================================================================
   vs-chat-input — vanilla controller.

   Mount:  const api = vsChatInput.mount(formEl)   (also exposed as el.vsChatInput)
   API:    setBusy(bool) · setProgress(id, 0..1) · addFiles(FileList|File[]) → ids
           removeFile(id) · clear() · submit() · stop() · focus() · setDisabled(bool)
           value (get/set) · model (get/set) · files · busy · disabled
   Events (bubble from the form):
           vs-chat-input:submit {text, files:[{id,file,name,size,type}], model} (cancelable;
                                  if not prevented the box clears and turns busy)
           vs-chat-input:stop · vs-chat-input:files {added:[{id,file}]}
           vs-chat-input:remove {id,file} · vs-chat-input:model {model}
   Keys:   Enter sends · Shift+Enter newline · coarse pointers: Enter newline
           Backspace in an empty box removes the last file · Esc stops while busy
           (unless data-esc-stops="false")
   Menu:   arrows · Home/End · type-ahead · Enter/Space · Esc
   ========================================================================== */

const ICONS = {
  clip: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
  send: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  stop: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5"/></svg>',
  chevron: '<svg class="vs-model-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  x: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

const RING_C = 2 * Math.PI * 7; // r=7 inside an 18px viewBox

function fire(form, type, detail) {
  const event = new CustomEvent(type, { bubbles: true, cancelable: type === 'vs-chat-input:submit', detail });
  form.dispatchEvent(event);
  return event;
}

function accepts(form, file) {
  const spec = (form.dataset.accept || '').trim();
  if (!spec) return true;
  return spec.split(',').some((raw) => {
    const pattern = raw.trim().toLowerCase();
    if (!pattern) return false;
    if (pattern.endsWith('/*')) return (file.type || '').toLowerCase().startsWith(pattern.slice(0, -1));
    if (pattern.startsWith('.')) return (file.name || '').toLowerCase().endsWith(pattern);
    return (file.type || '').toLowerCase() === pattern;
  });
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mount(form) {
  if (!form || form.vsChatInput) return form?.vsChatInput;

  const text = form.querySelector('.vs-chat-input-text');
  const attach = form.querySelector('.vs-chat-input-attach');
  const send = form.querySelector('.vs-chat-input-send');
  const modelWrap = form.querySelector('.vs-chat-input-model');
  const modelBtn = form.querySelector('.vs-chat-input-model-btn');
  const menu = form.querySelector('.vs-chat-input-menu');
  if (!text || !send) return null;

  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const options = () => Array.from(menu ? menu.querySelectorAll('[role="option"]') : []);

  /* ---------------------------------------------------------- scaffolding */
  const filesRow = document.createElement('div');
  filesRow.className = 'vs-chat-input-files';
  form.insertBefore(filesRow, text);

  const picker = document.createElement('input');
  picker.type = 'file';
  picker.multiple = true;
  if (form.dataset.accept) picker.accept = form.dataset.accept;
  form.appendChild(picker);

  if (attach && !attach.innerHTML.trim()) attach.innerHTML = ICONS.clip;
  send.innerHTML =
    `<span class="vs-icon vs-icon-send">${ICONS.send}</span>` +
    `<span class="vs-icon vs-icon-stop">${ICONS.stop}</span>`;

  let modelLabel = null;
  if (modelBtn) {
    modelLabel = document.createElement('span');
    modelLabel.className = 'vs-chat-input-model-name';
    modelBtn.append(modelLabel);
    modelBtn.insertAdjacentHTML('beforeend', ICONS.chevron);
  }

  /* -------------------------------------------------------------- state */
  const files = new Map();
  let busy = false;
  let disabled = false;
  let modelValue = '';

  const uploading = () => Array.from(files.values()).some((f) => f.progress < 1);

  function updateSend() {
    send.disabled = disabled || uploading() || (!text.value.trim() && files.size === 0);
  }

  /* --------------------------------------------------------- spring grow */
  function autosize() {
    const styles = getComputedStyle(text);
    const lineHeight = parseFloat(styles.lineHeight) || 20;
    const pad = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
    const maxLines = parseInt(getComputedStyle(form).getPropertyValue('--vs-chat-input-lines'), 10) || 8;
    const ceiling = maxLines * lineHeight + pad;
    const previous = text.offsetHeight;
    text.style.height = 'auto';
    const target = Math.max(lineHeight + pad, Math.min(text.scrollHeight, ceiling));
    text.style.overflowY = text.scrollHeight > ceiling ? 'auto' : 'hidden';
    text.style.height = `${target}px`;
    if (!reduced && typeof text.animate === 'function' && previous !== target) {
      text.animate(
        [{ height: `${previous}px` }, { height: `${target + 3}px` }, { height: `${target}px` }],
        { duration: 240, easing: 'cubic-bezier(.25,.8,.35,1)' },
      );
    }
  }

  /* -------------------------------------------------------------- chips */
  function chipFor(rec) {
    const chip = document.createElement('span');
    chip.className = 'vs-chat-input-chip';
    chip.dataset.progress = '0';
    chip.innerHTML =
      `<svg class="vs-chip-ring" viewBox="0 0 18 18" aria-hidden="true">` +
      `<circle class="track" cx="9" cy="9" r="7"></circle>` +
      `<circle class="bar" cx="9" cy="9" r="7" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"></circle>` +
      `</svg>` +
      `<span class="vs-chip-name"></span><span class="vs-chip-size"></span>` +
      `<button type="button" class="vs-chip-x" aria-label="Remove ${rec.name}">${ICONS.x}</button>`;
    chip.querySelector('.vs-chip-name').textContent = rec.name;
    chip.querySelector('.vs-chip-size').textContent = formatSize(rec.size);
    chip.querySelector('.vs-chip-x').addEventListener('click', () => api.removeFile(rec.id));
    rec.el = chip;
    rec.bar = chip.querySelector('.vs-chip-ring .bar');
    return chip;
  }

  function addFiles(list) {
    const incoming = Array.from(list || []);
    const max = parseInt(form.dataset.maxFiles, 10) || 10;
    const room = Math.max(0, max - files.size);
    const added = [];
    for (const file of incoming) {
      if (added.length >= room) break;
      if (!accepts(form, file)) continue;
      const rec = { id: crypto.randomUUID(), file, name: file.name, size: file.size, type: file.type, progress: 0 };
      files.set(rec.id, rec);
      filesRow.appendChild(chipFor(rec));
      added.push({ id: rec.id, file });
    }
    if (added.length) fire(form, 'vs-chat-input:files', { added });
    updateSend();
    return added.map((a) => a.id);
  }

  function setProgress(id, progress) {
    const rec = files.get(id);
    if (!rec) return;
    rec.progress = Math.min(1, Math.max(0, Number(progress) || 0));
    rec.bar.style.strokeDashoffset = String(RING_C * (1 - rec.progress));
    rec.el.dataset.progress = rec.progress >= 1 ? '1' : rec.progress.toFixed(2);
    updateSend();
  }

  function removeFile(id, opts) {
    const rec = files.get(id);
    if (!rec) return;
    files.delete(id);
    rec.el.remove();
    if (!opts?.silent) fire(form, 'vs-chat-input:remove', { id, file: rec.file });
    updateSend();
  }

  /* ---------------------------------------------------------- busy/stop */
  function setBusy(value) {
    busy = Boolean(value);
    form.dataset.busy = busy ? 'true' : 'false';
    send.setAttribute('aria-label', busy ? 'Stop generating' : 'Send message');
    updateSend();
  }

  function stop() {
    if (!busy) return;
    setBusy(false);
    fire(form, 'vs-chat-input:stop', {});
  }

  function clearBox() {
    text.value = '';
    for (const id of Array.from(files.keys())) removeFile(id, { silent: true });
    autosize();
    updateSend();
  }

  /* --------------------------------------------------------- model menu */
  function selectOption(opt, opts) {
    if (!opt) return;
    for (const o of options()) o.setAttribute('aria-selected', o === opt ? 'true' : 'false');
    modelValue = opt.dataset.value || '';
    if (modelLabel) modelLabel.textContent = (opt.childNodes[0]?.textContent || '').trim();
    closeMenu();
    if (!opts?.silent) fire(form, 'vs-chat-input:model', { model: modelValue });
  }

  function activeOption() {
    return menu?.querySelector('li.vs-active') || null;
  }
  function activate(opt) {
    for (const o of options()) o.classList.toggle('vs-active', o === opt);
    if (opt) opt.focus();
  }
  function openMenu() {
    if (!menu || !menu.hidden) return;
    menu.hidden = false;
    modelBtn?.setAttribute('aria-expanded', 'true');
    activate(options().find((o) => o.getAttribute('aria-selected') === 'true') || options()[0] || null);
  }
  function closeMenu() {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    modelBtn?.setAttribute('aria-expanded', 'false');
  }
  const menuOpen = () => Boolean(menu && !menu.hidden);

  let typeAhead = '';
  let typeAheadTimer = 0;

  modelBtn?.addEventListener('click', () => (menuOpen() ? closeMenu() : openMenu()));
  menu?.addEventListener('keydown', (event) => {
    const list = options();
    const index = list.indexOf(activeOption());
    if (event.key === 'ArrowDown') { event.preventDefault(); activate(list[(index + 1) % list.length]); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); activate(list[(index - 1 + list.length) % list.length]); }
    else if (event.key === 'Home') { event.preventDefault(); activate(list[0]); }
    else if (event.key === 'End') { event.preventDefault(); activate(list[list.length - 1]); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectOption(activeOption()); modelBtn?.focus(); }
    else if (event.key === 'Escape') { event.preventDefault(); closeMenu(); modelBtn?.focus(); }
    else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      typeAhead += event.key.toLowerCase();
      clearTimeout(typeAheadTimer);
      typeAheadTimer = setTimeout(() => { typeAhead = ''; }, 550);
      const hit = list.find((o) => (o.textContent || '').trim().toLowerCase().startsWith(typeAhead));
      if (hit) { event.preventDefault(); activate(hit); }
    }
  });
  menu?.addEventListener('click', (event) => {
    const opt = event.target.closest('[role="option"]');
    if (opt) { selectOption(opt); modelBtn?.focus(); }
  });
  document.addEventListener('click', (event) => {
    if (menuOpen() && modelWrap && !modelWrap.contains(event.target)) closeMenu();
  });

  /* ------------------------------------------------------------- inputs */
  text.addEventListener('input', () => { autosize(); updateSend(); });
  text.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !coarse) { event.preventDefault(); form.requestSubmit(); }
    else if (event.key === 'Backspace' && text.value === '' && files.size) {
      event.preventDefault();
      removeFile(Array.from(files.keys()).pop());
    } else if (event.key === 'Escape' && busy && form.dataset.escStops !== 'false') {
      event.preventDefault();
      stop();
    }
  });
  text.addEventListener('paste', (event) => {
    const pasted = event.clipboardData?.files;
    if (pasted && pasted.length) { event.preventDefault(); addFiles(pasted); }
  });

  attach?.addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => { addFiles(picker.files); picker.value = ''; });

  form.addEventListener('dragover', (event) => { event.preventDefault(); form.dataset.dragging = 'true'; });
  form.addEventListener('dragleave', () => { form.dataset.dragging = 'false'; });
  form.addEventListener('drop', (event) => {
    event.preventDefault();
    form.dataset.dragging = 'false';
    if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) { stop(); return; }
    if (disabled || uploading()) return;
    const detail = {
      text: text.value.trim(),
      files: Array.from(files.values()).map((f) => ({ id: f.id, file: f.file, name: f.name, size: f.size, type: f.type })),
      model: modelValue,
    };
    if (!detail.text && !detail.files.length) return;
    // the custom event is the cancelable contract: a listener that prevents it
    // takes over the whole send (and the box keeps its text); otherwise the
    // composer clears itself and turns busy until setBusy(false).
    const submitted = fire(form, 'vs-chat-input:submit', detail);
    if (!submitted.defaultPrevented) { clearBox(); setBusy(true); }
  });

  /* ---------------------------------------------------------------- api */
  const api = {
    setBusy,
    setProgress,
    addFiles,
    removeFile: (id) => removeFile(id),
    clear: clearBox,
    submit: () => form.requestSubmit(),
    stop,
    focus: () => text.focus(),
    setDisabled(value) {
      disabled = Boolean(value);
      form.dataset.disabled = disabled ? 'true' : 'false';
      text.disabled = disabled;
      if (attach) attach.disabled = disabled;
      if (modelBtn) modelBtn.disabled = disabled;
      updateSend();
    },
    get value() { return text.value; },
    set value(next) { text.value = next; autosize(); updateSend(); },
    get model() { return modelValue; },
    set model(next) { selectOption(options().find((o) => o.dataset.value === next), { silent: true }); },
    get files() {
      return Array.from(files.values()).map((f) => ({ id: f.id, file: f.file, name: f.name, size: f.size, type: f.type, progress: f.progress }));
    },
    get busy() { return busy; },
    get disabled() { return disabled; },
  };

  form.vsChatInput = api;
  for (const opt of options()) if (!opt.hasAttribute('tabindex')) opt.tabIndex = -1;
  selectOption(options().find((o) => o.getAttribute('aria-selected') === 'true') || options()[0], { silent: true });
  setBusy(false);
  autosize();
  updateSend();
  return api;
}

export const vsChatInput = { mount };

if (typeof window !== 'undefined') window.vsChatInput = vsChatInput;
