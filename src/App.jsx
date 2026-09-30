import { useState, useEffect, useSyncExternalStore } from 'react';
import { useTaskStore } from './store/taskStore';
import { useAgencyStore } from './store/agencyStore';
import { useUiStore } from './store/uiStore';
import { useTeamStore } from './store/teamStore';
import { signIn, signOut, isSignedIn, getGoogleUser, isGoogleConfigured, refreshGoogleStatus, clearGoogleCache } from './services/googleAuth';
import { verifyToken, clearAuth, getUser } from './services/authApi';
import { localISO } from './utils/date';
import EmployeeDashboard from './components/EmployeeDashboard';
import Dashboard from './components/Dashboard';
import Chat from './components/Chat';
import ConfirmScreen from './components/ConfirmScreen';
import LoginScreen from './components/LoginScreen';
import SettingsModal from './components/SettingsModal';
import Sidebar from './components/Sidebar';
import { NAV_LABEL } from './nav';
import Topbar from './components/Topbar';
import Icon from './components/Icon';
import './App.css';

// ── Theme / viewport ──────────────────────────────────────────────────────────

function useMediaQuery(query) {
  return useSyncExternalStore(
    cb => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
  );
}

function useApplyTheme() {
  const theme = useUiStore(s => s.theme);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0b0b0c' : '#f6f7f9');
  }, [resolved]);
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [authUser, setAuthUser]   = useState(getUser);
  const [authReady, setAuthReady] = useState(false);
  useApplyTheme();

  useEffect(() => {
    verifyToken().then(user => { setAuthUser(user); setAuthReady(true); });
  }, []);

  if (!authReady) return <div className="boot"><span className="brand-mark">UV</span></div>;
  if (!authUser) return <LoginScreen onLogin={setAuthUser} />;

  const handleLogout = () => { clearAuth(); clearGoogleCache(); setAuthUser(null); };

  // Employees get their own simple dashboard
  if (authUser.role === 'employee') {
    return <EmployeeDashboard authUser={authUser} onLogout={handleLogout} />;
  }

  return <AppShell authUser={authUser} onLogout={handleLogout} />;
}

function AppShell({ authUser, onLogout }) {
  const pendingTasks = useTaskStore(s => s.pendingTasks);
  const setPendingTasks = useTaskStore(s => s.setPendingTasks);
  const tasks = useTaskStore(s => s.tasks);
  const activeNav = useUiStore(s => s.activeNav);
  const sidebarCollapsed = useUiStore(s => s.sidebarCollapsed);
  const aiOpen = useUiStore(s => s.aiOpen);
  const setAiOpen = useUiStore(s => s.setAiOpen);
  const toggleSidebar = useUiStore(s => s.toggleSidebar);
  const settingsTab = useUiStore(s => s.settingsTab);
  const openSettings = useUiStore(s => s.openSettings);
  const notifications = useTeamStore(s => s.notifications);
  const refreshTeam = useTeamStore(s => s.refreshAll);

  // On narrow screens the assistant is an overlay, so it starts closed and isn't remembered.
  const isNarrow = useMediaQuery('(max-width: 1100px)');
  const [narrowAiOpen, setNarrowAiOpen] = useState(false);
  const showAi = isNarrow ? narrowAiOpen : aiOpen;
  const setShowAi = open => (isNarrow ? setNarrowAiOpen(open) : setAiOpen(open));

  const [googleUser, setGoogleUser]             = useState(getGoogleUser());
  const [googleConnected, setGoogleConnected]   = useState(isSignedIn());
  const [googleConfigured, setGoogleConfigured] = useState(isGoogleConfigured());
  const [googleLoading, setGoogleLoading]       = useState(false);
  const [showConfirm, setShowConfirm]           = useState(false);

  // ── Sidebar badges ──
  const invoices    = useAgencyStore(s => s.invoices);
  const clients     = useAgencyStore(s => s.clients);
  const projects    = useAgencyStore(s => s.projects);
  const dailyChecks = useAgencyStore(s => s.dailyChecks);
  const platforms   = useAgencyStore(s => s.platforms);

  const today = localISO();
  const openTasks     = tasks.filter(t => t.status !== 'done');
  const overdueCount  = openTasks.filter(t => t.due_date && t.due_date < today).length;
  const todayCount    = openTasks.filter(t => t.due_date === today).length;
  const overdueInv    = (invoices || []).filter(i => !i.paid && i.due_date && i.due_date < today).length;
  const followUps     = (clients || []).filter(c => c.stage === 'proposal' && c.proposal_sent_date && Math.floor((Date.now() - new Date(c.proposal_sent_date)) / 86400000) >= 2).length;
  const lateProjects  = (projects || []).filter(p => p.deadline && p.deadline < today && p.deliverables?.some(d => !d.done)).length;
  const unread        = notifications.filter(n => !Number(n.is_read)).length;
  const todayChecks   = (dailyChecks || {})[today] || {};
  const platformsDone = platforms.length > 0 && platforms.every(p => todayChecks[p.id]);
  const badges = {
    today:              todayCount   ? { type: 'count', value: todayCount,   tone: 'grey' }   : null,
    overdue:            overdueCount ? { type: 'count', value: overdueCount, tone: 'red' }    : null,
    team:               unread       ? { type: 'count', value: unread,       tone: 'accent' } : null,
    revenue:            overdueInv   ? { type: 'count', value: overdueInv,   tone: 'orange' } : null,
    pipeline:           followUps    ? { type: 'count', value: followUps,    tone: 'orange' } : null,
    projects:           lateProjects ? { type: 'count', value: lateProjects, tone: 'red' }    : null,
    platform_checklist: platforms.length && !platformsDone ? { type: 'dot', tone: 'accent' } : null,
  };

  useEffect(() => {
    document.title = `${unread ? `(${unread}) ` : ''}${NAV_LABEL[activeNav] || 'Task OS'} · Task OS`;
  }, [unread, activeNav]);

  useEffect(() => {
    // Back from Google's consent page: /?google=connected|error
    const gParam = new URLSearchParams(window.location.search).get('google');
    if (gParam) {
      window.history.replaceState(null, '', window.location.pathname);
      if (gParam === 'connected') openSettings('google');
      else alert('Google connection failed: ' + gParam);
    }
    refreshGoogleStatus();

    function onAuthChange() {
      setGoogleUser(getGoogleUser());
      setGoogleConnected(isSignedIn());
      setGoogleConfigured(isGoogleConfigured());
    }
    window.addEventListener('google_auth_change', onAuthChange);

    // Team data: employees, their tasks (status/steps flow back into local tasks), notifications.
    refreshTeam();
    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      useTeamStore.getState().loadNotifications();
      useTeamStore.getState().loadServerTasks();
      useTeamStore.getState().loadRoutines();
    }, 30000);

    return () => {
      window.removeEventListener('google_auth_change', onAuthChange);
      clearInterval(poll);
    };
  }, [openSettings, refreshTeam]);

  // Keyboard shortcuts: Ctrl/Cmd+B sidebar, Ctrl/Cmd+J assistant.
  useEffect(() => {
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); toggleSidebar(); }
      if (k === 'j') {
        e.preventDefault();
        if (isNarrow) setNarrowAiOpen(o => !o);
        else setAiOpen(!useUiStore.getState().aiOpen);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNarrow, setAiOpen, toggleSidebar]);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      await signIn();
    } catch (err) {
      alert('Google sign-in failed: ' + err.message);
    } finally {
      setGoogleLoading(false);
    }
  }

  function handleGoogleSignOut() {
    if (!confirm('Disconnect Google? Calendar, Tasks and Gmail sync stop until you reconnect.')) return;
    signOut();
    setGoogleUser(null);
    setGoogleConnected(false);
  }

  function handleTasksParsed(parsed) {
    setPendingTasks(parsed);
    setShowConfirm(true);
  }

  const google = {
    connected: googleConnected, configured: googleConfigured, user: googleUser, loading: googleLoading,
    onConnect: handleGoogleSignIn, onDisconnect: handleGoogleSignOut,
  };

  return (
    <div className={'app-shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
      <Sidebar badges={badges} google={google} onLogout={onLogout} authUser={authUser} />

      <div className="app-main">
        <Topbar aiOpen={showAi} onToggleAi={() => setShowAi(!showAi)} />

        <div className="app-body">
          <main className="content" id="main">
            <div className="content-inner">
              <Dashboard activeNav={activeNav} />
            </div>
          </main>

          {showAi ? (
            <>
              {isNarrow && <div className="scrim scrim-ai" onClick={() => setShowAi(false)} />}
              <aside className={'ai-panel' + (isNarrow ? ' is-overlay' : '')} aria-label="AI assistant">
                <Chat onTasksParsed={handleTasksParsed} onCollapse={() => setShowAi(false)} />
              </aside>
            </>
          ) : !isNarrow && (
            <aside className="ai-rail" aria-label="AI assistant (collapsed)">
              <button className="ai-rail-btn" onClick={() => setShowAi(true)} title="Open AI assistant (Ctrl+J)">
                <Icon name="chevronsLeft" size={16} />
                <Icon name="sparkles" size={16} />
                <span className="ai-rail-label">AI assistant</span>
              </button>
            </aside>
          )}
        </div>
      </div>

      {showConfirm && pendingTasks.length > 0 && (
        <ConfirmScreen onDone={() => setShowConfirm(false)} />
      )}

      {settingsTab && <SettingsModal google={google} onLogout={onLogout} />}
    </div>
  );
}
