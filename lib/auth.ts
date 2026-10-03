/**
 * Device-local account + session layer.
 *
 * The repo shipped login/signup as pure UI with a note that "no production auth
 * provider is claimed". This implements a working account flow so that signup
 * leads somewhere real (the dashboard), while staying honest about its scope:
 *
 *   - Accounts and sessions live in THIS BROWSER only (localStorage). They are
 *     not server-side, not synced, and not a security boundary.
 *   - Passwords are stored as salted SHA-256 digests via WebCrypto, which stops
 *     casual plaintext reading. It is NOT a production password hash (no
 *     bcrypt/argon2, no server, no rate limiting).
 *   - Every surface that uses this labels it as a local demo account.
 *
 * If a real provider is added later, swap these four functions (signup, login,
 * logout, currentSession) for the provider's SDK and nothing else changes.
 */

export type Account = {
  email: string;
  name: string;
  salt: string;
  passHash: string;
  createdAt: string;
};

export type Session = {
  token: string;
  email: string;
  name: string;
  createdAt: string;
  expiresAt: string;
};

const ACCOUNTS_KEY = 'motiona-accounts';
const SESSION_KEY = 'motiona-session';
const SESSION_DAYS = 30;

function store(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function listAccounts(): Account[] {
  const s = store();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s.getItem(ACCOUNTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: Account[]): void {
  store()?.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/* ------------------------------------------------------------ password ---- */

function fallbackHash(input: string): string {
  // Non-secure-context fallback (WebCrypto needs HTTPS or localhost).
  // Demo-grade only; deliberately weak and labelled as such.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `fb${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}`;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const material = `${salt}::${password}`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // fall through
  }
  return fallbackHash(material);
}

function randomToken(): string {
  try {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `t${Date.now()}${Math.random().toString(16).slice(2)}`;
  }
}

/* ------------------------------------------------------------- sessions --- */

export function currentSession(): Session | null {
  const s = store();
  if (!s) return null;
  try {
    const session = JSON.parse(s.getItem(SESSION_KEY) || 'null') as Session | null;
    if (!session?.token || !session.email) return null;
    if (Date.parse(session.expiresAt) < Date.now()) {
      s.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function startSession(account: Account): Session {
  const now = Date.now();
  const session: Session = {
    token: randomToken(),
    email: account.email,
    name: account.name,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_DAYS * 86400000).toISOString(),
  };
  store()?.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function logout(): void {
  store()?.removeItem(SESSION_KEY);
}

/* --------------------------------------------------------------- actions -- */

export type AuthResult = { ok: true; session: Session } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function signup(input: { name: string; email: string; password: string }): Promise<AuthResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (name.length < 2) return { ok: false, error: 'Enter a display name.' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (input.password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };

  const accounts = listAccounts();
  if (accounts.some((account) => account.email === email)) {
    return { ok: false, error: 'An account already exists on this device for that email. Sign in instead.' };
  }

  const salt = randomToken();
  const account: Account = {
    email,
    name,
    salt,
    passHash: await hashPassword(input.password, salt),
    createdAt: new Date().toISOString(),
  };
  writeAccounts([...accounts, account]);
  return { ok: true, session: startSession(account) };
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const account = listAccounts().find((entry) => entry.email === email);
  if (!account) return { ok: false, error: 'No account on this device for that email.' };

  const hash = await hashPassword(input.password, account.salt);
  if (hash !== account.passHash) return { ok: false, error: 'Incorrect password for that account.' };

  return { ok: true, session: startSession(account) };
}

/** True when an account exists for the email — used to tailor form feedback. */
export function accountExists(email: string): boolean {
  return listAccounts().some((account) => account.email === email.trim().toLowerCase());
}
