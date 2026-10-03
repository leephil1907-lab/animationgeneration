import { cookies } from 'next/headers';

const ACCESS = 'motiona-access';

// MOTIONA's Supabase URL and publishable key are intentionally public credentials.
// They are safe to ship to the browser; database access is protected by RLS.
const BUILTIN_SUPABASE_URL = 'https://zufobgccfjeguwrjjmcf.supabase.co';
const BUILTIN_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Yaa0PCMcFVagqqQtw15M0w_CblbFS_S';
const REFRESH = 'motiona-refresh';

type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };

function config() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || BUILTIN_SUPABASE_URL).replace(/\/$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || BUILTIN_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

async function authFetch(path: string, init: RequestInit = {}) {
  const c = config();
  if (!c) throw new Error('Supabase Auth is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  return fetch(`${c.url}/auth/v1${path}`, {
    ...init,
    headers: { apikey: c.key, 'Content-Type': 'application/json', ...(init.headers || {}) },
    cache: 'no-store',
  });
}

export function authConfigured(): boolean { return Boolean(config()); }

export async function signUpServer(email: string, password: string, name: string) {
  const origin = process.env.NEXT_PUBLIC_BASE_URL || '';
  const response = await authFetch('/signup', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      data: { display_name: name },
      ...(origin ? { options: { email_redirect_to: `${origin.replace(/\/$/,'')}/auth/confirm` } } : {}),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false as const, error: data?.msg || data?.message || data?.error_description || 'Could not create the account.' };
  if (data?.access_token) await setTokens(data.access_token, data.refresh_token);
  return { ok: true as const, user: data.user || null, session: Boolean(data.access_token) };
}

export async function signInServer(email: string, password: string) {
  const response = await authFetch('/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false as const, error: data?.msg || data?.message || data?.error_description || 'Invalid email or password.' };
  await setTokens(data.access_token, data.refresh_token);
  return { ok: true as const, user: data.user || null };
}

async function setTokens(access: string, refresh?: string) {
  const jar = await cookies();
  jar.set(ACCESS, access, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 });
  if (refresh) jar.set(REFRESH, refresh, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
}

export async function signOutServer() {
  const jar = await cookies();
  const access = jar.get(ACCESS)?.value;
  if (access && config()) {
    await authFetch('/logout', { method: 'POST', headers: { Authorization: `Bearer ${access}` } }).catch(() => undefined);
  }
  jar.delete(ACCESS); jar.delete(REFRESH);
}

async function refreshIfNeeded(): Promise<string | null> {
  const jar = await cookies();
  const refresh = jar.get(REFRESH)?.value;
  if (!refresh) return null;
  const response = await authFetch('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refresh }) }).catch(() => null);
  if (!response?.ok) return null;
  const data = await response.json();
  if (!data?.access_token) return null;
  await setTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

/** Returns the current authenticated access token for server-side Supabase Data API calls. */
export async function getServerAccessToken(): Promise<string | null> {
  const c = config();
  if (!c) return null;
  const jar = await cookies();
  let access = jar.get(ACCESS)?.value;
  if (!access) return null;
  let response = await authFetch('/user', { headers: { Authorization: `Bearer ${access}` } });
  if (response.status === 401) {
    access = await refreshIfNeeded();
    if (!access) return null;
    response = await authFetch('/user', { headers: { Authorization: `Bearer ${access}` } });
  }
  return response.ok ? access : null;
}

export async function getServerUser(): Promise<AuthUser | null> {
  const c = config();
  if (!c) return null;
  const jar = await cookies();
  let access: string | undefined = jar.get(ACCESS)?.value;
  if (!access) return null;
  let response = await authFetch('/user', { headers: { Authorization: `Bearer ${access}` } });
  if (response.status === 401) {
    const refreshed = await refreshIfNeeded();
    if (!refreshed) return null;
    access = refreshed;
    response = await authFetch('/user', { headers: { Authorization: `Bearer ${access}` } });
  }
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user as AuthUser : null;
}

export async function requireServerUser(): Promise<AuthUser> {
  const user = await getServerUser();
  if (user) return user;
  if (process.env.NODE_ENV !== 'production' && process.env.MOTIONA_AUTH_REQUIRED !== 'true') {
    return { id: 'dev-local', email: 'dev@localhost' };
  }
  throw new Error('UNAUTHENTICATED');
}
