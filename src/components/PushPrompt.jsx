import { useEffect, useState } from 'react';
import { pushStatus, enablePush, disablePush } from '../services/pushApi';
import Icon from './Icon';

// Lets a person turn phone/desktop alerts on or off for the device they're using.
export default function PushPrompt() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy]     = useState(false);
  const [msg, setMsg]       = useState('');

  useEffect(() => { pushStatus().then(setStatus); }, []);

  async function run(fn, ok = '') {
    setBusy(true);
    setMsg('');
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setMsg(e.message); }
    setStatus(await pushStatus());
    setBusy(false);
  }

  if (!status || status === 'unsupported') return null;

  return (
    <div className="push-prompt">
      {status === 'off' && (
        <button className="push-prompt-btn" onClick={() => run(enablePush, 'Alerts are on for this device.')} disabled={busy}>
          <Icon name="bell" size={14} /> {busy ? 'Turning on…' : 'Get alerts on this device'}
        </button>
      )}
      {status === 'on' && (
        <div className="push-prompt-row">
          <span className="push-on"><Icon name="check" size={13} /> Alerts on for this device</span>
          <button className="link-btn" onClick={() => run(disablePush, 'Alerts turned off.')} disabled={busy}>Turn off</button>
        </div>
      )}
      {status === 'needs-install' && (
        <p className="muted-small">
          To get alerts on iPhone: tap <b>Share</b> → <b>Add to Home Screen</b>, then open Task OS from your Home Screen and turn alerts on here.
        </p>
      )}
      {status === 'blocked' && <p className="muted-small">Alerts are blocked for this site. Allow notifications in your browser's site settings, then reload.</p>}
      {msg && <p className="muted-small push-msg">{msg}</p>}
    </div>
  );
}
