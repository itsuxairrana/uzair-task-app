import { useState, useEffect } from 'react';
import { useTaskStore } from './store/taskStore';
import { initGoogleAuth, signIn, signOut, isSignedIn, getGoogleUser, setGoogleClientId, getStoredGoogleClientId } from './services/googleAuth';
import { MODELS, isModelAvailable, getStoredKey, setStoredKey } from './services/aiRouter';
import { getTeam, saveTeam } from './services/gmailApi';
import { verifyToken, clearAuth, getUser, changePassword } from './services/authApi';
import { fetchNotifications, markNotificationsRead, resetEmployeePassword } from './services/taskSyncApi';
import EmployeeDashboard from './components/EmployeeDashboard';
import WorkspaceTabs from './components/WorkspaceTabs';
import Dashboard from './components/Dashboard';
import Chat from './components/Chat';
import ConfirmScreen from './components/ConfirmScreen';
import LoginScreen from './components/LoginScreen';
import './App.css';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.35"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.35"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.35"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.35"/></svg> },
  { id: 'today',     label: 'Today',     icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1.25" y="2" width="12.5" height="11.5" rx="2" stroke="currentColor" strokeWidth="1.35"/><path d="M1.25 5.5h12.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/><path d="M4.5 1v2M10.5 1v2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/><path d="M4.5 8.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id: 'overdue',   label: 'Overdue',   icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.35"/><path d="M7.5 4.5v3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="7.5" cy="10.5" r=".75" fill="currentColor"/></svg> },
  { id: 'settings',  label: 'Settings',  icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="2.25" stroke="currentColor" strokeWidth="1.35"/><path d="M7.5 1.5v1.25M7.5 12.25V13.5M1.5 7.5h1.25M12.25 7.5H13.5M3.1 3.1l.9.9M11 11l.9.9M3.1 11.9l.9-.9M11 4l.9-.9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/></svg> },
];

// Models that have API keys (excludes 'free').
// 'haiku' shares the same key as 'claude' — saving under 'claude' covers both.
const KEY_MODELS = [
  { id: 'gemini', label: 'Gemini API Key',          hint: 'FREE — aistudio.google.com', link: 'https://aistudio.google.com/app/apikey', placeholder: 'AIza...' },
  { id: 'claude', label: 'Claude API Key',           hint: 'console.anthropic.com (covers Haiku + Sonnet)', link: 'https://console.anthropic.com/', placeholder: 'sk-ant-api03-...' },
  { id: 'gpt4',   label: 'OpenAI API Key',           hint: 'platform.openai.com',        link: 'https://platform.openai.com/',           placeholder: 'sk-...' },
  { id: 'grok',   label: 'Grok API Key',             hint: 'console.x.ai',               link: 'https://console.x.ai/',                  placeholder: 'xai-...' },
];

// ── Settings Modal ────────────────────────────────────────────────────────────

function SettingsModal({ onClose, googleConnected, googleUser, googleLoading, onGoogleConnect, onGoogleDisconnect, onLogout, dbTeam }) {
  const [inputs, setInputs] = useState(() =>
    Object.fromEntries(KEY_MODELS.map(m => [m.id, getStoredKey(m.id)]))
  );
  const [saved, setSaved]       = useState({});
  const [visible, setVisible]   = useState({});
  const [activeTab, setActiveTab] = useState('keys'); // 'keys' | 'google' | 'team' | 'account'
  const [gcId, setGcId]         = useState(getStoredGoogleClientId);
  const [gcSaved, setGcSaved]   = useState(false);
  const [team, setTeam]         = useState(getTeam);
  const [newName, setNewName]   = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPass, setNewPass]   = useState('');
  const [resetPw, setResetPw]   = useState({}); // { [id]: newPassword }
  const [resetMsg, setResetMsg] = useState({});  // { [id]: 'ok'|'err' }
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew]         = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMsg, setPwMsg]         = useState(null); // {type:'ok'|'err', text}

  function handleSave(modelId) {
    setStoredKey(modelId, inputs[modelId]);
    setSaved(prev => ({ ...prev, [modelId]: true }));
    setTimeout(() => setSaved(prev => ({ ...prev, [modelId]: false })), 2000);
  }

  function handleClear(modelId) {
    setStoredKey(modelId, '');
    setInputs(prev => ({ ...prev, [modelId]: '' }));
  }

  function toggleVisible(modelId) {
    setVisible(prev => ({ ...prev, [modelId]: !prev[modelId] }));
  }

  function handleSaveGcId() {
    setGoogleClientId(gcId);
    setGcSaved(true);
    setTimeout(() => setGcSaved(false), 2500);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-modal">
        <div className="modal-header">
          <h2>Settings</h2>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button className="close-btn logout-btn" onClick={onLogout} title="Sign out">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="settings-tabs">
          <button className={'settings-tab' + (activeTab === 'keys' ? ' settings-tab-active' : '')} onClick={() => setActiveTab('keys')}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="5" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.3"/><path d="M7.5 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M5 4.5v2M4 5.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            API Keys
          </button>
          <button className={'settings-tab' + (activeTab === 'google' ? ' settings-tab-active' : '')} onClick={() => setActiveTab('google')}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 6.5h11M6.5 1a8 8 0 0 1 0 11M6.5 1a8 8 0 0 0 0 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            Google{googleConnected && <span className="tab-dot-ok" />}
          </button>
          <button className={'settings-tab' + (activeTab === 'team' ? ' settings-tab-active' : '')} onClick={() => setActiveTab('team')}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="4.5" cy="4" r="2" stroke="currentColor" strokeWidth="1.3"/><circle cx="9" cy="4" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M1 11c0-2 1.6-3.5 3.5-3.5S8 9 8 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M9 7.5c1.7.3 3 1.7 3 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            Team{team.length > 0 && <span className="tab-count">{team.length}</span>}
          </button>
          <button className={'settings-tab' + (activeTab === 'account' ? ' settings-tab-active' : '')} onClick={() => setActiveTab('account')}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 12c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            Account
          </button>
        </div>

        <div className="settings-body">

          {/* ── API Keys tab ── */}
          {activeTab === 'keys' && (
            <>
              <p className="settings-info">
                Keys are saved in your browser (localStorage) — no restart needed.
                The <strong>Free Local Parser</strong> always works without any key.
              </p>

              <div className="settings-keys">
                {KEY_MODELS.map(m => {
                  const hasKey = isModelAvailable(m.id);
                  const isSaved = saved[m.id];
                  return (
                    <div key={m.id} className="sk-row">
                      <div className="sk-top">
                        <div className="sk-info">
                          <span className="sk-label">{m.label}</span>
                          <a className="sk-hint" href={m.link} target="_blank" rel="noopener noreferrer">
                            {m.hint} ↗
                          </a>
                        </div>
                        <span className={'sk-badge ' + (hasKey ? 'sk-badge-ok' : 'sk-badge-missing')}>
                          {hasKey ? '✓ Active' : 'Not set'}
                        </span>
                      </div>

                      <div className="sk-input-row">
                        <input
                          className="sk-input"
                          type={visible[m.id] ? 'text' : 'password'}
                          value={inputs[m.id]}
                          onChange={e => setInputs(prev => ({ ...prev, [m.id]: e.target.value }))}
                          placeholder={m.placeholder}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button className="sk-eye-btn" type="button" onClick={() => toggleVisible(m.id)} title={visible[m.id] ? 'Hide' : 'Show'}>
                          {visible[m.id]
                            ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 6.5S3 2.5 6.5 2.5 12 6.5 12 6.5 10 10.5 6.5 10.5 1 6.5 1 6.5z" stroke="currentColor" strokeWidth="1.3"/><line x1="2" y1="11" x2="11" y2="2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                            : <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 6.5S3 2.5 6.5 2.5 12 6.5 12 6.5 10 10.5 6.5 10.5 1 6.5 1 6.5z" stroke="currentColor" strokeWidth="1.3"/><circle cx="6.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.3"/></svg>
                          }
                        </button>
                        <button
                          className={'sk-save-btn' + (isSaved ? ' sk-saved' : '')}
                          type="button"
                          onClick={() => handleSave(m.id)}
                          disabled={!inputs[m.id]?.trim()}
                        >
                          {isSaved ? '✓ Saved' : 'Save'}
                        </button>
                        {hasKey && (
                          <button className="sk-clear-btn" type="button" onClick={() => handleClear(m.id)} title="Remove key">
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="settings-note">
                Keys are stored only in your browser and never sent to any server other than the AI provider you choose.
              </div>
            </>
          )}

          {/* ── Google tab ── */}
          {activeTab === 'google' && (
            <div className="google-connect-section">
              <div className="gc-header">
                <div className="gc-title">🗓 Google Calendar &amp; Tasks</div>
                <div className="gc-desc">
                  Sync tasks to Google Calendar and Google Tasks. Paste your Client ID below — no <code>.env</code> edit needed.
                </div>
              </div>

              {/* ── Client ID input ── */}
              <div className="gc-client-id-block">
                <div className="gc-cid-label">
                  <strong>Google OAuth Client ID</strong>
                  <span className={'sk-badge ' + (gcId.trim() ? 'sk-badge-ok' : 'sk-badge-missing')}>
                    {gcId.trim() ? '✓ Set' : 'Not set'}
                  </span>
                </div>
                <div className="sk-input-row">
                  <input
                    className="sk-input"
                    type="text"
                    value={gcId}
                    onChange={e => setGcId(e.target.value)}
                    placeholder="1234567890-abc123.apps.googleusercontent.com"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    className={'sk-save-btn' + (gcSaved ? ' sk-saved' : '')}
                    type="button"
                    onClick={handleSaveGcId}
                    disabled={!gcId.trim()}
                  >
                    {gcSaved ? '✓ Saved' : 'Save'}
                  </button>
                  {gcId.trim() && (
                    <button className="sk-clear-btn" type="button" onClick={() => { setGcId(''); setGoogleClientId(''); }}>
                      Clear
                    </button>
                  )}
                </div>
                {gcSaved && (
                  <p className="gc-save-hint">✓ Saved! Reload the page once, then click Connect below.</p>
                )}
              </div>

              <div className="gc-help-row">
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">
                  Get Client ID from Google Cloud Console ↗
                </a>
                <span className="gc-help-note">Credentials → OAuth 2.0 Client ID → Web app → add <code>http://localhost:5173</code></span>
              </div>

              {/* ── Connection status / button ── */}
              {googleConnected ? (
                <div className="gc-connected">
                  <div className="gc-user-row">
                    {googleUser?.picture
                      ? <img src={googleUser.picture} alt="avatar" className="gc-avatar" />
                      : <span className="gc-avatar-placeholder"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M3 16c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span>
                    }
                    <div className="gc-user-info">
                      <span className="gc-user-name">{googleUser?.name || 'Google User'}</span>
                      <span className="gc-user-email">{googleUser?.email || ''}</span>
                    </div>
                    <span className="gc-badge-ok">✓ Connected</span>
                  </div>
                  <div className="gc-perms">
                    <span className="gc-perm-tag">Calendar Events</span>
                    <span className="gc-perm-tag">Tasks</span>
                  </div>
                  <button className="gc-disconnect-btn" onClick={onGoogleDisconnect}>Disconnect</button>
                </div>
              ) : (
                <div className="gc-disconnected">
                  <button
                    className="gc-connect-btn"
                    onClick={onGoogleConnect}
                    disabled={googleLoading || !gcId.trim()}
                    title={!gcId.trim() ? 'Paste your Client ID above first' : ''}
                  >
                    {googleLoading ? 'Connecting…' : 'Connect Google Account'}
                  </button>
                  {!gcId.trim() && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                      ↑ Paste your Client ID above to enable this button
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Team tab ── */}
          {activeTab === 'team' && (
            <div className="team-section">
              <p className="settings-info">
                Manage employees. Each employee gets their own login and sees only their assigned tasks.
              </p>

              {/* DB employees with password reset */}
              {dbTeam.length === 0 ? (
                <div className="team-empty">No employees yet. Add one below.</div>
              ) : (
                <div className="team-list">
                  {dbTeam.map(member => (
                    <div key={member.id} className="team-row team-row-expanded">
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                        <div className="team-avatar">{member.name.charAt(0).toUpperCase()}</div>
                        <div className="team-info">
                          <span className="team-name">{member.name}</span>
                          <span className="team-email">{member.email}</span>
                        </div>
                        <span className="team-role-badge">{member.role}</span>
                      </div>
                      <div className="sk-input-row" style={{marginTop:4}}>
                        <input
                          className="sk-input"
                          type="password"
                          placeholder="New password for this user"
                          value={resetPw[member.id] || ''}
                          onChange={e => setResetPw(p => ({...p, [member.id]: e.target.value}))}
                          autoComplete="new-password"
                        />
                        <button
                          className={'sk-save-btn' + (resetMsg[member.id] === 'ok' ? ' sk-saved' : '')}
                          disabled={!resetPw[member.id]?.trim()}
                          onClick={async () => {
                            try {
                              await resetEmployeePassword(member.id, resetPw[member.id]);
                              setResetMsg(m => ({...m, [member.id]: 'ok'}));
                              setResetPw(p => ({...p, [member.id]: ''}));
                              setTimeout(() => setResetMsg(m => ({...m, [member.id]: ''})), 2500);
                            } catch(e) {
                              setResetMsg(m => ({...m, [member.id]: 'err'}));
                            }
                          }}
                        >
                          {resetMsg[member.id] === 'ok' ? '✓ Updated' : 'Set Password'}
                        </button>
                      </div>
                      {resetMsg[member.id] === 'err' && <div style={{fontSize:11,color:'#ef4444',marginTop:4}}>Failed to update password</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Add employee form */}
              <div className="team-add-form" style={{flexDirection:'column',gap:8}}>
                <div style={{display:'flex',gap:8}}>
                  <input className="sk-input" type="text" placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} />
                  <input className="sk-input" type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                </div>
                <div style={{display:'flex',gap:8}}>
                  <input className="sk-input" type="password" placeholder="Password (min 6 chars)" value={newPass} onChange={e => setNewPass(e.target.value)} />
                  <button
                    className="sk-save-btn"
                    disabled={!newName.trim() || !newEmail.trim() || !newPass.trim()}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('add_employee', { detail: { name: newName.trim(), email: newEmail.trim(), password: newPass } }));
                      setNewName(''); setNewEmail(''); setNewPass('');
                    }}
                  >+ Add Employee</button>
                </div>
              </div>

              <div className="settings-note">
                Employees log in at <strong>task.uzairvisuals.com</strong> with their email and password. They see only tasks assigned to them.
              </div>
            </div>
          )}

          {/* ── Account tab ── */}
          {activeTab === 'account' && (
            <div className="team-section">
              <p className="settings-info">Change your login password.</p>
              <div className="team-add-form" style={{flexDirection:'column',gap:10}}>
                <input
                  className="sk-input"
                  type="password"
                  placeholder="Current password"
                  value={pwCurrent}
                  onChange={e => setPwCurrent(e.target.value)}
                  autoComplete="current-password"
                />
                <input
                  className="sk-input"
                  type="password"
                  placeholder="New password (min 8 chars)"
                  value={pwNew}
                  onChange={e => setPwNew(e.target.value)}
                  autoComplete="new-password"
                />
                <input
                  className="sk-input"
                  type="password"
                  placeholder="Confirm new password"
                  value={pwConfirm}
                  onChange={e => setPwConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                {pwMsg && (
                  <div style={{fontSize:12, color: pwMsg.type === 'ok' ? '#22c55e' : '#ef4444', padding:'4px 0'}}>
                    {pwMsg.text}
                  </div>
                )}
                <button
                  className="sk-save-btn"
                  style={{alignSelf:'flex-start'}}
                  disabled={!pwCurrent || !pwNew || !pwConfirm}
                  onClick={async () => {
                    setPwMsg(null);
                    if (pwNew !== pwConfirm) { setPwMsg({type:'err', text:'Passwords do not match'}); return; }
                    if (pwNew.length < 8)    { setPwMsg({type:'err', text:'Min 8 characters'}); return; }
                    try {
                      await changePassword(pwCurrent, pwNew);
                      setPwMsg({type:'ok', text:'Password changed successfully!'});
                      setPwCurrent(''); setPwNew(''); setPwConfirm('');
                    } catch(e) {
                      setPwMsg({type:'err', text: e.message});
                    }
                  }}
                >
                  Change Password
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [authUser, setAuthUser]   = useState(getUser);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    verifyToken().then(user => { setAuthUser(user); setAuthReady(true); });
  }, []);

  if (!authReady) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0d1f3c', color:'#fff', fontSize:14 }}>
      Loading…
    </div>
  );
  if (!authUser) return <LoginScreen onLogin={setAuthUser} />;

  const handleLogout = () => { clearAuth(); setAuthUser(null); };

  // Employees get their own simple dashboard
  if (authUser.role === 'employee') {
    return <EmployeeDashboard authUser={authUser} onLogout={handleLogout} />;
  }

  return <AppShell authUser={authUser} onLogout={handleLogout} />;
}

function AppShell({ authUser, onLogout }) {
  const { setPendingTasks, pendingTasks } = useTaskStore();
  const [googleUser, setGoogleUser]           = useState(getGoogleUser());
  const [googleConnected, setGoogleConnected] = useState(isSignedIn());
  const [googleLoading, setGoogleLoading]     = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [chatOpen, setChatOpen]               = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeNav, setActiveNav]             = useState('dashboard');
  const [showSettings, setShowSettings]       = useState(false);
  const [notifications, setNotifications]     = useState([]);
  const [showNotifs, setShowNotifs]           = useState(false);
  const [dbTeam, setDbTeam]                   = useState([]);

  useEffect(() => {
    initGoogleAuth();
    function onAuthChange() {
      setGoogleUser(getGoogleUser());
      setGoogleConnected(isSignedIn());
    }
    window.addEventListener('google_auth_change', onAuthChange);

    // Load notifications + team
    loadNotifications();
    loadDbTeam();
    const notifInterval = setInterval(loadNotifications, 30000);

    // Listen for add_employee event from settings modal
    function onAddEmployee(e) {
      const { name, email, password } = e.detail;
      import('./services/authApi').then(({ addTeamMember }) => {
        addTeamMember(name, email, password).then(loadDbTeam).catch(err => alert(err.message));
      });
    }
    window.addEventListener('add_employee', onAddEmployee);

    return () => {
      window.removeEventListener('google_auth_change', onAuthChange);
      window.removeEventListener('add_employee', onAddEmployee);
      clearInterval(notifInterval);
    };
  }, []);

  async function loadNotifications() {
    try {
      const data = await fetchNotifications();
      setNotifications(data.notifications || []);
    } catch {}
  }

  async function loadDbTeam() {
    try {
      const { fetchTeam } = await import('./services/authApi');
      const users = await fetchTeam();
      setDbTeam(users.filter(u => u.role === 'employee'));
    } catch {}
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      await signIn();
      setGoogleUser(getGoogleUser());
      setGoogleConnected(isSignedIn());
    } catch (err) {
      alert('Google sign-in failed: ' + err.message);
    } finally {
      setGoogleLoading(false);
    }
  }

  function handleGoogleSignOut() {
    signOut();
    setGoogleUser(null);
    setGoogleConnected(false);
  }

  function handleTasksParsed(tasks) {
    setPendingTasks(tasks);
    setShowConfirm(true);
  }

  function handleNav(id) {
    if (id === 'settings') { setShowSettings(true); return; }
    setActiveNav(id);
  }

  return (
    <div className="app-shell">

      {/* ── Sidebar ── */}
      <aside className={'sidebar' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <span className="brand-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M9 2L4 9h4l-1 5 5-7H8l1-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg></span>
            {!sidebarCollapsed && <span className="brand-name">Task OS</span>}
          </div>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(c => !c)}>
            {sidebarCollapsed ? '›' : '‹'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={'nav-item' + (activeNav === item.id ? ' nav-active' : '')}
              onClick={() => handleNav(item.id)}
              title={sidebarCollapsed ? item.label : ''}
            >
              <span className="nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="nav-label">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {googleConnected ? (
            <div className="sidebar-user">
              {googleUser?.picture
                ? <img src={googleUser.picture} alt="avatar" className="sb-avatar" />
                : <span className="sb-avatar-placeholder"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span>
              }
              {!sidebarCollapsed && (
                <div className="sb-user-info">
                  <span className="sb-user-name">{googleUser?.name || 'Connected'}</span>
                  <button className="sb-signout" onClick={handleGoogleSignOut}>Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <button
              className={'google-connect-btn' + (sidebarCollapsed ? ' btn-icon-only' : '')}
              onClick={() => { setShowSettings(true); }}
              title="Connect Google Calendar + Tasks"
            >
              <span className="gc-icon"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5.5 8.5a3 3 0 0 0 4.2 0l1.8-1.8a3 3 0 0 0-4.2-4.2L6.5 3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M8.5 5.5a3 3 0 0 0-4.2 0L2.5 7.3a3 3 0 0 0 4.2 4.2L7.5 10.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span>
              {!sidebarCollapsed && <span>Connect Google</span>}
            </button>
          )}

          {/* Logout button */}
          <button
            className={'sb-logout-btn' + (sidebarCollapsed ? ' sb-logout-collapsed' : '')}
            onClick={onLogout}
            title="Logout"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-left">
            <WorkspaceTabs />
          </div>
          <div className="topbar-right">
            {/* Notification bell */}
            <div className="notif-wrap">
              <button className="topbar-btn notif-btn" onClick={() => { setShowNotifs(o => !o); }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5a4 4 0 0 1 4 4v2.5l1 1.5H1.5L2.5 8V5.5a4 4 0 0 1 4-4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3"/></svg>
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span className="notif-badge">{notifications.filter(n => !n.is_read).length}</span>
                )}
              </button>
              {showNotifs && (
                <div className="notif-dropdown">
                  <div className="notif-header">
                    <span>Notifications</span>
                    {notifications.some(n => !n.is_read) && (
                      <button className="notif-mark-all" onClick={async () => {
                        await markNotificationsRead('all');
                        setNotifications(ns => ns.map(n => ({...n, is_read: 1})));
                      }}>Mark all read</button>
                    )}
                  </div>
                  {notifications.length === 0
                    ? <div className="notif-empty">No notifications</div>
                    : notifications.slice(0, 10).map(n => (
                      <div key={n.id} className={'notif-item' + (n.is_read ? ' notif-read' : '')}
                        onClick={async () => {
                          await markNotificationsRead(n.id);
                          setNotifications(ns => ns.map(x => x.id === n.id ? {...x, is_read: 1} : x));
                        }}>
                        <div className="notif-msg">{n.message}</div>
                        <div className="notif-time">{new Date(n.created_at).toLocaleString()}</div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
            <button
              className={'topbar-btn' + (chatOpen ? ' topbar-btn-active' : '')}
              onClick={() => setChatOpen(o => !o)}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="5" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M4 5h5M4 7h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M6.5 9v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> AI Chat
            </button>
          </div>
        </header>

        <div className={'app-body' + (chatOpen ? ' app-body-split' : '')}>
          <div className="content-area">
            <Dashboard activeNav={activeNav} />
          </div>
          {chatOpen && (
            <div className="chat-panel-wrap">
              <Chat onTasksParsed={handleTasksParsed} />
            </div>
          )}
        </div>
      </div>

      {showConfirm && pendingTasks.length > 0 && (
        <ConfirmScreen onDone={() => setShowConfirm(false)} />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          googleConnected={googleConnected}
          googleUser={googleUser}
          googleLoading={googleLoading}
          onGoogleConnect={handleGoogleSignIn}
          onGoogleDisconnect={handleGoogleSignOut}
          onLogout={onLogout}
          dbTeam={dbTeam}
        />
      )}
    </div>
  );
}
