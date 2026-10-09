'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CloudOff, RefreshCw } from 'lucide-react';

type State = {
  configured?: boolean;
  connected?: boolean;
  secure?: boolean;
  host?: string;
  port?: string;
  mock?: boolean;
  error?: string;
};

export default function ComfyEndpointStatus() {
  const [state, setState] = useState<State>({});
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/comfyui/status', { cache: 'no-store' });
      const data = await response.json();
      setState(data);
    } catch {
      setState({ connected: false, error: 'MOTIONA could not reach its ComfyUI status route.' });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  const address = state.host
    ? `${state.secure ? 'https' : 'http'}://${state.host}${state.port && !['80','443'].includes(state.port) ? `:${state.port}` : ''}`
    : 'Not configured';

  return (
    <div className="comfyEndpoint" role="status">
      <div className="comfyEndpointIcon">
        {state.connected ? <CheckCircle2 size={16} /> : <CloudOff size={16} />}
      </div>
      <div className="comfyEndpointCopy">
        <strong>{state.connected ? 'ComfyUI endpoint connected' : 'ComfyUI endpoint not connected'}</strong>
        <span>{checking ? 'Checking the server…' : state.connected ? address : state.configured ? `${address} · ${state.error || 'connection failed'}` : 'Set COMFYUI_URL on the MOTIONA server.'}</span>
        {state.connected && <small>{state.mock ? 'Development test worker detected.' : 'Real ComfyUI server detected.'}</small>}
      </div>
      <button type="button" className="textBtn" onClick={() => void check()} disabled={checking} title="Check ComfyUI endpoint">
        <RefreshCw size={13} className={checking ? 'spin' : ''} /> Refresh
      </button>
    </div>
  );
}
