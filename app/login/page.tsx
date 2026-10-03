'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import AuthShell from '@/components/AuthShell';
import { login } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setStatus('');
    const result = await login({ email, password });
    setBusy(false);
    if (result.ok) {
      setStatus(`Signed in as ${result.session.email} — opening your dashboard…`);
      router.push('/dashboard');
      return;
    }
    setError(result.error);
  }

  return (
    <AuthShell mode="login">
      <form className="authForm" onSubmit={submit}>
        <label>
          Email address
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <div className="passwordField">
            <input
              type={show ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <div className="authMeta">
          <label className="check">
            <input type="checkbox" defaultChecked readOnly title="Sessions last 30 days on this device" /> Remember me on this device
          </label>
          <span className="authHint">30-day local session</span>
        </div>
        <button className="authSubmit" type="submit" disabled={busy}>
          {busy ? <Loader2 size={17} className="spin" /> : <LogIn size={17} />} Sign in
        </button>
        {error && <p className="authStatus error">{error}</p>}
        {status && <p className="authStatus">{status}</p>}
        <p className="authDemoNote">
          Accounts are stored only in this browser — a local demo account layer, not a production
          authentication provider.
        </p>
      </form>
      <div className="authSwitch">
        New here? <Link href="/signup">Create an account</Link>
      </div>
    </AuthShell>
  );
}
