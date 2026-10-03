'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, UserPlus } from 'lucide-react';
import AuthShell from '@/components/AuthShell';
import { signup } from '@/lib/auth';

export default function SignupPage() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setStatus('');
    const result = await signup({ name, email, password });
    setBusy(false);
    if (result.ok) {
      setStatus(`Account created for ${result.session.email} — opening your dashboard…`);
      router.push('/dashboard');
      return;
    }
    setError(result.error);
  }

  return (
    <AuthShell mode="signup">
      <form className="authForm" onSubmit={submit}>
        <label>
          Display name
          <input
            required
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
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
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <label className="check terms">
          <input type="checkbox" required />{' '}
          <span>I confirm I am 18 or older and agree to the studio terms.</span>
        </label>
        <button className="authSubmit" type="submit" disabled={busy}>
          {busy ? <Loader2 size={17} className="spin" /> : <UserPlus size={17} />} Create account
        </button>
        {error && <p className="authStatus error">{error}</p>}
        {status && <p className="authStatus">{status}</p>}
        <p className="authDemoNote">
          Your account lives only in this browser — a local demo account layer, not a production
          authentication provider. Nothing is uploaded.
        </p>
      </form>
      <div className="authSwitch">
        Already have an account? <Link href="/login">Sign in</Link>
      </div>
    </AuthShell>
  );
}
