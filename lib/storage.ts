/**
 * Persistent storage adapter (server-side).
 *
 * `.env.example` has always declared STORAGE_PROVIDER / STORAGE_BUCKET /
 * STORAGE_PUBLIC_BASE_URL but nothing read them, so the gallery fell back to
 * browser storage and lost every job on tab close.
 *
 * This implements the adapter boundary that README promised: a local file store
 * today, object storage later, with the same interface. Job and storyboard
 * contracts do not change when a new provider is added — only `writeFile`,
 * `readFile` and `listDir` do.
 *
 * Honesty note kept from the original README: this is a local disk store on the
 * machine running MOTIONA. It is not cloud storage and is not multi-tenant safe.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type StorageProvider = 'local-session' | 'local-file' | 's3';

const PROVIDER = (process.env.STORAGE_PROVIDER || 'local-file') as StorageProvider;

/** Where the local-file adapter keeps its JSON. Overridable for tests/deploys. */
const DATA_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), '.motiona-data');

/** Public base URL for a future object-storage provider; unused by local-file. */
export const PUBLIC_BASE_URL = process.env.STORAGE_PUBLIC_BASE_URL || '';
export const BUCKET = process.env.STORAGE_BUCKET || '';

export function storageProvider(): StorageProvider {
  if (PROVIDER === 's3') {
    // Refuse to silently pretend object storage works when it is not implemented.
    if (!BUCKET) return 'local-file';
    return 's3';
  }
  return PROVIDER === 'local-session' ? 'local-file' : PROVIDER;
}

/** Human-readable label for the UI, so the app never overstates persistence. */
export function storageLabel(): string {
  switch (storageProvider()) {
    case 's3':
      return `Object storage (${BUCKET})`;
    case 'local-file':
    default:
      return 'Local disk store';
  }
}

function safeKey(key: string): string {
  // Prevent traversal: keys become path segments.
  const cleaned = key.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error('Invalid storage key');
  return cleaned;
}

function resolvePath(collection: string, key: string): string {
  return path.join(DATA_DIR, safeKey(collection), `${safeKey(key)}.json`);
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function readRecord<T>(collection: string, key: string): Promise<T | null> {
  if (storageProvider() === 's3') throw new Error('s3 adapter is not implemented yet');
  try {
    const raw = await readFile(resolvePath(collection, key), 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeRecord<T>(collection: string, key: string, value: T): Promise<T> {
  if (storageProvider() === 's3') throw new Error('s3 adapter is not implemented yet');
  const file = resolvePath(collection, key);
  await ensureDir(path.dirname(file));
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
  return value;
}

export async function deleteRecord(collection: string, key: string): Promise<boolean> {
  if (storageProvider() === 's3') throw new Error('s3 adapter is not implemented yet');
  const { unlink } = await import('node:fs/promises');
  try {
    await unlink(resolvePath(collection, key));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function listRecords<T>(collection: string, limit = 200): Promise<T[]> {
  if (storageProvider() === 's3') throw new Error('s3 adapter is not implemented yet');
  const dir = path.join(DATA_DIR, safeKey(collection));
  await ensureDir(dir);

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const files = entries.filter((name) => name.endsWith('.json')).slice(0, limit * 2);
  const records: T[] = [];

  for (const name of files) {
    try {
      const raw = await readFile(path.join(dir, name), 'utf8');
      records.push(JSON.parse(raw) as T);
    } catch {
      // Skip corrupt records rather than failing the whole listing.
    }
  }

  return records;
}

/**
 * Newest-first ordering helper. Records are expected to carry `updatedAt`.
 */
export function byUpdatedDesc<T extends { updatedAt?: string; createdAt?: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    const at = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    const bt = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    return bt - at;
  });
}
