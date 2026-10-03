'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';

const STORAGE_KEY = 'ags-age-verified';

export default function AgeGate({ children }: { children: ReactNode }) {
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setVerified(localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {
      setVerified(false);
    }
  }, []);

  function confirm() {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
    setVerified(true);
  }

  function leave() {
    window.location.replace('about:blank');
  }

  if (verified === null) return <div className="ageGate"><div className="ageCard"><div className="ageSpinner" /></div></div>;
  if (verified) return <>{children}</>;

  return (
    <div className="ageGate" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <div className="ageCard">
        <div className="ageIcon"><ShieldAlert size={32} aria-hidden="true" /></div>
        <h1 id="age-title">18+ Only</h1>
        <p>
          This studio contains adult (18+) character and image generation tools.
          <br />You must be at least 18 years old to continue.
        </p>
        <div className="ageActions">
          <button className="primary ageEnter" onClick={confirm}>
            <Check size={16} aria-hidden="true" /> I am 18 or older — Enter
          </button>
          <button className="secondary ageLeave" onClick={leave}>
            <X size={16} aria-hidden="true" /> I am under 18 — Leave
          </button>
        </div>
        <p className="ageLegal">
          By entering you confirm that you are of legal age in your jurisdiction
          and that you consent to viewing adult content.
        </p>
      </div>
    </div>
  );
}
