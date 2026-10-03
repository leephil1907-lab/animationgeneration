'use client';

/**
 * Signed-in indicator for product headers.
 *
 * Shows the local account email with a link to the dashboard and a sign-out
 * action, or a "Sign in" link when there is no session. Keeps every workspace
 * screen reachable from an account context without each page re-implementing it.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut, User } from 'lucide-react';


export default function AccountChip() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' }).then((r) => r.json()).then((data) => setEmail(data?.user?.email ?? null)).catch(() => setEmail(null));
  }, []);

  if (!email) {
    return (
      <Link className="accountChip ghost" href="/login">
        <User size={12} /> Sign in
      </Link>
    );
  }

  return (
    <span className="accountChip">
      <Link href="/dashboard" title="Open your dashboard">
        <User size={12} /> {email}
      </Link>
      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        onClick={() => {
          fetch('/api/auth/logout', { method: 'POST' }).finally(() => setEmail(null));
          window.location.href = '/';
        }}
      >
        <LogOut size={12} />
      </button>
    </span>
  );
}
