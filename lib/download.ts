/**
 * Browser-side download helpers for rendered outputs.
 *
 * A bare `<a download>` on a same-origin URL usually works, but the browser can
 * ignore `download` and navigate instead when the response carries a
 * `Content-Disposition` it prefers, or when the element is removed mid-click.
 * Fetching to a Blob and saving from an object URL makes the save deterministic
 * and lets us control the filename, at the cost of buffering the file in memory
 * (fine at animation sizes; a direct anchor is the documented fallback).
 */

import type { JobOutput } from '@/lib/jobs';

export function filenameFor(output: JobOutput): string {
  const name = String(output.filename || '').trim();
  if (name) return name;
  const ext = output.kind === 'video' ? 'mp4' : 'png';
  return `motiona-${output.type || 'output'}.${ext}`;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a beat to start the read before reclaiming the URL.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function saveViaAnchor(output: JobOutput): void {
  const anchor = document.createElement('a');
  anchor.href = output.url;
  anchor.download = filenameFor(output);
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Download one output. Resolves once the save has been triggered. */
export async function downloadOutput(output: JobOutput): Promise<void> {
  try {
    const response = await fetch(output.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('Empty response body');
    saveBlob(blob, filenameFor(output));
  } catch {
    // Proxy hiccup or opaque response — the anchor path still triggers a save.
    saveViaAnchor(output);
  }
}

/**
 * Download every output of a job. Sequential on purpose: browsers throttle or
 * block multiple programmatic downloads fired in the same task.
 */
export async function downloadAll(outputs: JobOutput[]): Promise<void> {
  for (const output of outputs) {
    // Small gap so each save registers as a distinct user-initiated download.
    await downloadOutput(output);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
}
