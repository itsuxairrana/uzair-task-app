import { useState } from 'react';
import { isModelAvailable, getStoredKey, setStoredKey } from '../services/aiRouter';
import { changePassword } from '../services/authApi';
import { sendTestEmail } from '../services/collabApi';
import { resetEmployeePassword } from '../services/taskSyncApi';
import { useUiStore } from '../store/uiStore';
import { useTeamStore } from '../store/teamStore';
import Icon from './Icon';

// Models that have API keys (excludes 'free').
// 'haiku' shares the same key as 'claude' — saving under 'claude' covers both.
const KEY_MODELS = [
  { id: 'gemini', label: 'Gemini',  hint: 'Free — aistudio.google.com', link: 'https://aistudio.google.com/app/apikey', placeholder: 'AIza...' },
  { id: 'claude', label: 'Claude',  hint: 'console.anthropic.com (covers Haiku + Sonnet)', link: 'https://console.anthropic.com/', placeholder: 'sk-ant-api03-...' },
  { id: 'gpt4',   label: 'OpenAI',  hint: 'platform.openai.com', link: 'https://platform.openai.com/', placeholder: 'sk-...' },
  { id: 'grok',   label: 'Grok',    hint: 'console.x.ai', link: 'https://console.x.ai/', placeholder: 'xai-...' },
];

const TABS = [
  { id: 'keys',    label: 'AI keys', icon: 'key' },
  { id: 'google',  label: 'Google',  icon: 'globe' },
  { id: 'team',    label: 'Team',    icon: 'users' },
  { id: 'account', label: 'Account', icon: 'user' },
];

export default function SettingsModal({ google, onLogout }) {
  const tab = useUiStore(s => s.settingsTab);
  const openSettings = useUiStore(s => s.openSettings);
  const close = useUiStore(s => s.closeSettings);
  const employees = useTeamStore(s => s.employees);

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div className="modal modal-lg settings-modal" role="dialog" aria-label="Settings">
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="btn btn-ghost btn-icon" onClick={close} aria-label="Close"><Icon name="x" /></button>
        </div>

        <div className="tabs">
          {TABS.map(t => (
            <button key={t.id} className={'tab' + (tab === t.id ? ' tab-active' : '')} onClick={() => openSettings(t.id)}>
              <Icon name={t.icon} size={14} />
              {t.label}
              {t.id === 'google' && google.connected && <span className="dot dot-green" />}
              {t.id === 'team' && employees.length > 0 && <span className="tab-count">{employees.length}</span>}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'keys' && <KeysTab />}
          {tab === 'google' && <GoogleTab google={google} />}
          {tab === 'team' && <TeamTab />}
          {tab === 'account' && <AccountTab onLogout={onLogout} />}
        </div>
      </div>
    </div>
  );
}

function KeysTab() {
  const [inputs, setInputs]   = useState(() => Object.fromEntries(KEY_MODELS.map(m => [m.id, getStoredKey(m.id)])));
  const [saved, setSaved]     = useState({});
  const [visible, setVisible] = useState({});

  function handleSave(id) {
    setStoredKey(id, inputs[id]);
    setSaved(p => ({ ...p, [id]: true }));
    setTimeout(() => setSaved(p => ({ ...p, [id]: false })), 2000);
  }
  function handleClear(id) {
    setStoredKey(id, '');
    setInputs(p => ({ ...p, [id]: '' }));
  }

  return (
    <>
      <p className="muted-text">
        Keys stay in this browser and are sent only to the provider you pick. The <strong>Free local parser</strong> works without any key.
      </p>
      <div className="stack">
        {KEY_MODELS.map(m => {
          const hasKey = isModelAvailable(m.id);
          return (
            <div key={m.id} className="setting-row">
              <div className="setting-row-head">
                <div>
                  <div className="setting-row-title">{m.label}</div>
                  <a className="setting-row-hint" href={m.link} target="_blank" rel="noopener noreferrer">{m.hint} ↗</a>
                </div>
                <span className={'badge ' + (hasKey ? 'badge-green' : 'badge-grey')}>{hasKey ? 'Active' : 'Not set'}</span>
              </div>
              <div className="input-row">
                <div className="input-with-btn">
                  <input
                    className="input mono"
                    type={visible[m.id] ? 'text' : 'password'}
                    value={inputs[m.id]}
                    onChange={e => setInputs(p => ({ ...p, [m.id]: e.target.value }))}
                    placeholder={m.placeholder}
                    autoComplete="off" spellCheck={false}
                  />
                  <button className="input-inline-btn" type="button" onClick={() => setVisible(p => ({ ...p, [m.id]: !p[m.id] }))} aria-label={visible[m.id] ? 'Hide key' : 'Show key'}>
                    <Icon name={visible[m.id] ? 'eyeOff' : 'eye'} size={15} />
                  </button>
                </div>
                <button className="btn btn-primary" type="button" onClick={() => handleSave(m.id)} disabled={!inputs[m.id]?.trim()}>
                  {saved[m.id] ? <><Icon name="check" size={14} /> Saved</> : 'Save'}
                </button>
                {hasKey && <button className="btn btn-secondary" type="button" onClick={() => handleClear(m.id)}>Clear</button>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function TestEmail() {
  const [state, setState] = useState({ busy: false, msg: '', ok: true });
  async function send() {
    setState({ busy: true, msg: '', ok: true });
    try {
      const r = await sendTestEmail();
      setState({ busy: false, msg: `Sent to ${r.sent_to} — check your inbox.`, ok: true });
    } catch (e) {
      setState({ busy: false, msg: e.message, ok: false });
    }
  }
  return (
    <div>
      <button className="btn btn-secondary btn-sm" onClick={send} disabled={state.busy}><Icon name="mail" size={14} /> {state.busy ? 'Sending…' : 'Send a test email to myself'}</button>
      {state.msg && <div className={'form-msg ' + (state.ok ? 'form-msg-ok' : 'form-msg-err')}>{state.msg}</div>}
    </div>
  );
}

function GoogleTab({ google }) {
  const { connected, configured, user, loading, onConnect, onDisconnect } = google;
  return (
    <>
      <p className="muted-text">
        Sync tasks to Google Calendar and Google Tasks, and email task briefs to your team through Gmail.
        Connect once — it stays connected on every device until you click Disconnect.
      </p>
      {connected ? (
        <div className="setting-row">
          <div className="google-user">
            {user?.picture
              ? <img src={user.picture} alt="" className="avatar avatar-lg" referrerPolicy="no-referrer" />
              : <span className="avatar avatar-lg"><Icon name="user" /></span>}
            <div className="google-user-info">
              <div className="setting-row-title">{user?.name || 'Google account'}</div>
              <div className="muted-small">{user?.email}</div>
            </div>
            <span className="badge badge-green"><Icon name="check" size={12} /> Connected</span>
          </div>
          <div className="chip-row">
            <span className="chip">Calendar</span>
            <span className="chip">Tasks</span>
            <span className="chip">Gmail (send)</span>
          </div>
          <p className="muted-small">When you assign a task to a team member, they're emailed automatically from this Gmail account.</p>
          <TestEmail />
          <div><button className="btn btn-secondary btn-sm" onClick={onDisconnect}>Disconnect</button></div>
        </div>
      ) : (
        <div className="stack">
          <button className="btn btn-primary btn-lg btn-block" onClick={onConnect} disabled={loading || !configured}>
            <Icon name="link" size={15} /> {loading ? 'Connecting…' : 'Connect Google account'}
          </button>
          {!configured && <p className="muted-small center">Google isn't set up on the server yet (Client ID / secret missing).</p>}
        </div>
      )}
    </>
  );
}

function TeamTab() {
  const employees = useTeamStore(s => s.employees);
  const addEmployee = useTeamStore(s => s.addEmployee);
  const removeEmployee = useTeamStore(s => s.removeEmployee);
  const [form, setForm]         = useState({ name: '', email: '', password: '' });
  const [adding, setAdding]     = useState(false);
  const [addMsg, setAddMsg]     = useState(null); // { type, text }
  const [resetPw, setResetPw]   = useState({});
  const [resetMsg, setResetMsg] = useState({});

  async function handleAdd(e) {
    e.preventDefault();
    setAdding(true); setAddMsg(null);
    try {
      const name = form.name.trim();
      await addEmployee(name, form.email.trim(), form.password);
      setAddMsg({ type: 'ok', text: `${name} can now sign in with ${form.email.trim()} and the password you set.` });
      setForm({ name: '', email: '', password: '' });
    } catch (err) {
      setAddMsg({ type: 'err', text: err.message });
    } finally {
      setAdding(false);
    }
  }

  async function handleReset(member) {
    try {
      await resetEmployeePassword(member.id, resetPw[member.id]);
      setResetMsg(m => ({ ...m, [member.id]: 'ok' }));
      setResetPw(p => ({ ...p, [member.id]: '' }));
      setTimeout(() => setResetMsg(m => ({ ...m, [member.id]: '' })), 2500);
    } catch (err) {
      setResetMsg(m => ({ ...m, [member.id]: err.message || 'Failed to update password' }));
    }
  }

  async function handleRemove(member) {
    if (!confirm(`Remove ${member.name}? They lose access immediately. Tasks assigned to them stay in your list.`)) return;
    setAddMsg(null);
    try { await removeEmployee(member.id); } catch (err) { alert(err.message); }
  }

  return (
    <>
      <p className="muted-text">Each employee gets their own login at <strong>task.uzairvisuals.com</strong> and only sees tasks assigned to them.</p>

      {employees.length === 0 ? (
        <div className="empty-inline">No employees yet — add one below.</div>
      ) : (
        <div className="stack">
          {employees.map(m => (
            <div key={m.id} className="setting-row">
              <div className="member-row">
                <span className="avatar">{m.name.charAt(0).toUpperCase()}</span>
                <div className="member-row-info">
                  <div className="setting-row-title">{m.name}</div>
                  <div className="muted-small">{m.email}</div>
                </div>
                <button className="btn btn-ghost btn-sm btn-danger-text" onClick={() => handleRemove(m)}>Remove</button>
              </div>
              <div className="input-row">
                <input
                  className="input" type="password" placeholder="New password (min 6 characters)"
                  value={resetPw[m.id] || ''} onChange={e => setResetPw(p => ({ ...p, [m.id]: e.target.value }))}
                  autoComplete="new-password"
                />
                <button className="btn btn-secondary" disabled={(resetPw[m.id] || '').length < 6} onClick={() => handleReset(m)}>
                  {resetMsg[m.id] === 'ok' ? <><Icon name="check" size={14} /> Updated</> : 'Set password'}
                </button>
              </div>
              {resetMsg[m.id] && resetMsg[m.id] !== 'ok' && <div className="form-msg form-msg-err">{resetMsg[m.id]}</div>}
            </div>
          ))}
        </div>
      )}

      <form className="setting-row" onSubmit={handleAdd}>
        <div className="setting-row-title">Add employee</div>
        <div className="grid-2">
          <input className="input" placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <input className="input" type="email" placeholder="Email address" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        </div>
        <div className="input-row">
          <input className="input" type="password" placeholder="Temporary password (min 6 characters)" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" required minLength={6} />
          <button className="btn btn-primary" disabled={adding || !form.name.trim() || !form.email.trim() || form.password.length < 6}>
            <Icon name="plus" size={14} /> {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        {addMsg && <div className={'form-msg ' + (addMsg.type === 'ok' ? 'form-msg-ok' : 'form-msg-err')}>{addMsg.text}</div>}
      </form>
    </>
  );
}

function AccountTab({ onLogout }) {
  const [pw, setPw]   = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);
    if (pw.next !== pw.confirm) { setMsg({ type: 'err', text: 'New passwords do not match' }); return; }
    if (pw.next.length < 8)     { setMsg({ type: 'err', text: 'Use at least 8 characters' }); return; }
    try {
      await changePassword(pw.current, pw.next);
      setMsg({ type: 'ok', text: 'Password changed.' });
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    }
  }

  return (
    <>
      <form className="setting-row" onSubmit={handleSubmit}>
        <div className="setting-row-title">Change password</div>
        <input className="input" type="password" placeholder="Current password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} autoComplete="current-password" required />
        <input className="input" type="password" placeholder="New password (min 8 characters)" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} autoComplete="new-password" required />
        <input className="input" type="password" placeholder="Confirm new password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} autoComplete="new-password" required />
        {msg && <div className={'form-msg ' + (msg.type === 'ok' ? 'form-msg-ok' : 'form-msg-err')}>{msg.text}</div>}
        <div><button className="btn btn-primary" disabled={!pw.current || !pw.next || !pw.confirm}>Change password</button></div>
      </form>
      <div className="setting-row">
        <div className="setting-row-head">
          <div>
            <div className="setting-row-title">Sign out</div>
            <div className="muted-small">Your Google connection stays linked.</div>
          </div>
          <button className="btn btn-secondary" onClick={onLogout}><Icon name="logout" size={14} /> Sign out</button>
        </div>
      </div>
    </>
  );
}
