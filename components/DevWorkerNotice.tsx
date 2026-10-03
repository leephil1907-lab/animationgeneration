'use client';

/**
 * Banner shown only when the connected ComfyUI backend identifies itself as the
 * offline development worker (dev/mock-comfyui).
 *
 * The mock is a test double, not a generation model. Its footage is placeholder.
 * This notice guarantees the product can never present that placeholder output as
 * real generation: any screen that can display outputs carries the banner while
 * the mock is the active backend.
 */

import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';

export default function DevWorkerNotice() {
  const [isMock, setIsMock] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/comfyui/status', { cache: 'no-store' });
        const data = await response.json();
        if (cancelled) return;
        setIsMock(Boolean(data?.connected) && Boolean(data?.mock));
      } catch {
        if (!cancelled) setIsMock(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isMock) return null;

  return (
    <div className="devWorkerNotice" role="status">
      <FlaskConical size={14} />
      <span>
        <b>Offline dev worker connected.</b> The backend on this port is the
        development test double in <code>dev/mock-comfyui</code>, so every output
        below is deterministic placeholder footage — not model generation. Stop it
        with <code>npm run dev:worker</code> in that terminal, or point{' '}
        <code>COMFYUI_URL</code> at a real ComfyUI install.
      </span>
    </div>
  );
}
