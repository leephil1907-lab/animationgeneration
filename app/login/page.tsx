'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import AuthShell from '@/components/AuthShell';


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
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      setBusy(false);
      if (!response.ok) { setError(result.error || 'Sign in failed.'); return; }
      setStatus('Signed in — opening your dashboard…');
      router.push('/dashboard');
    } catch { setBusy(false); setError('Could not reach the authentication service.'); }
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
        <p className="authDemoNote">Secure server-side authentication. Your session is stored in protected cookies.</p>
      </form>
      <div className="authSwitch">
        New here? <Link href="/signup">Create an account</Link>
      </div>
    </AuthShell>
  );
}
