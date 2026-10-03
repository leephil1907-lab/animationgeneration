/**
 * Persistent server-side record storage.
 *
 * Production uses the Supabase Data API with the authenticated user's bearer
 * token, so RLS enforces ownership in the database. Local development can keep
 * using the filesystem when Supabase is not configured.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getServerAccessToken, getServerUser } from '@/lib/server-auth';

export type StorageProvider = 'supabase' | 'local-file';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const DATA_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), '.motiona-data');

function hasSupabaseConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export function storageProvider(): StorageProvider {
  if (process.env.STORAGE_PROVIDER === 'local-file') return 'local-file';
  if (process.env.NODE_ENV === 'production' && hasSupabaseConfig()) return 'supabase';
  return 'local-file';
}

export function storageLabel(): string {
  return storageProvider() === 'supabase' ? 'Supabase' : 'Local disk store';
}

function safeKey(key: string): string {
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

function restUrl(collection: string, key?: string): string {
  const params = [
    `collection=eq.${encodeURIComponent(safeKey(collection))}`,
    ...(key ? [`record_key=eq.${encodeURIComponent(safeKey(key))}`] : []),
  ];
  return `${SUPABASE_URL}/rest/v1/motiona_records?${params.join('&')}`;
}

async function supabaseFetch(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
  const token = await getServerAccessToken();
  if (!token) throw new Error('UNAUTHENTICATED');

  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${SUPABASE_URL}${pathOrUrl}`;
  return fetch(url, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
}

async function supabaseRead<T>(collection: string, key: string): Promise<T | null> {
  const response = await supabaseFetch(
    `${restUrl(collection, key)}&select=payload&limit=1`,
    { method: 'GET' },
  );
  if (!response.ok) throw new Error(`Supabase read failed: ${response.status}`);
  const rows = await response.json() as Array<{ payload: T }>;
  return rows[0]?.payload ?? null;
}

async function supabaseWrite<T>(collection: string, key: string, value: T): Promise<T> {
  const user = await getServerUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  const response = await supabaseFetch('/rest/v1/motiona_records', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      collection: safeKey(collection),
      record_key: safeKey(key),
      owner_id: user.id,
      payload: value,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Supabase write failed: ${response.status} ${details.slice(0, 300)}`);
  }

  const rows = await response.json() as Array<{ payload: T }>;
  return rows[0]?.payload ?? value;
}

async function supabaseDelete(collection: string, key: string): Promise<boolean> {
  const response = await supabaseFetch(restUrl(collection, key), {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  if (!response.ok) throw new Error(`Supabase delete failed: ${response.status}`);
  return response.status !== 404;
}

async function supabaseList<T>(collection: string, limit: number): Promise<T[]> {
  const response = await supabaseFetch(
    `${restUrl(collection)}&select=payload&order=updated_at.desc&limit=${Math.max(1, Math.min(limit, 500))}`,
    { method: 'GET' },
  );
  if (!response.ok) throw new Error(`Supabase list failed: ${response.status}`);
  const rows = await response.json() as Array<{ payload: T }>;
  return rows.map((row) => row.payload);
}

export async function readRecord<T>(collection: string, key: string): Promise<T | null> {
  if (storageProvider() === 'supabase') return supabaseRead<T>(collection, key);

  try {
    const raw = await readFile(resolvePath(collection, key), 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeRecord<T>(collection: string, key: string, value: T): Promise<T> {
  if (storageProvider() === 'supabase') return supabaseWrite(collection, key, value);

  const file = resolvePath(collection, key);
  await ensureDir(path.dirname(file));
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
  return value;
}

export async function deleteRecord(collection: string, key: string): Promise<boolean> {
  if (storageProvider() === 'supabase') return supabaseDelete(collection, key);

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
  if (storageProvider() === 'supabase') return supabaseList<T>(collection, limit);

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

export function byUpdatedDesc<T extends { updatedAt?: string; createdAt?: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    const at = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    const bt = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    return bt - at;
  });
}
