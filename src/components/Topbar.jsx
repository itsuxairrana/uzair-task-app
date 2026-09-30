import { useUiStore } from '../store/uiStore';
import { useTeamStore } from '../store/teamStore';
import { NAV_LABEL } from '../nav';
import WorkspaceTabs from './WorkspaceTabs';
import NotificationsMenu from './NotificationsMenu';
import Icon from './Icon';

const TASK_VIEWS = new Set(['tasks', 'today', 'overdue']);

export default function Topbar({ aiOpen, onToggleAi }) {
  const activeNav = useUiStore(s => s.activeNav);
  const setMobileOpen = useUiStore(s => s.setMobileNavOpen);
  const navigate = useUiStore(s => s.navigate);
  const notifications = useTeamStore(s => s.notifications);
  const markRead = useTeamStore(s => s.markRead);
  const loadNotifications = useTeamStore(s => s.loadNotifications);

  // Every notification leads somewhere on the Team page.
  function openNotification(n) {
    const store = useTeamStore.getState();
    store.loadServerTasks();
    if (n.type === 'routine_done') {
      store.loadRoutines();
      const userId = Number(String(n.task_id || '').split(':')[1]) || null;
      navigate('team', { view: 'routine', userId });
    } else {
      navigate('team', n.task_id ? { taskId: n.task_id, thread: n.type === 'comment' } : null);
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-btn topbar-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Icon name="menu" size={18} />
        </button>
        <h1 className="topbar-title">{NAV_LABEL[activeNav] || 'Task OS'}</h1>
        {TASK_VIEWS.has(activeNav) && <WorkspaceTabs />}
      </div>
      <div className="topbar-right">
        <NotificationsMenu
          notifications={notifications}
          onOpen={openNotification}
          onMarkRead={markRead}
          onRefresh={loadNotifications}
          emptyHint="Messages, finished tasks and completed routines from your team show up here."
          footer={<button className="link-btn" onClick={() => navigate('team')}>Open Team <Icon name="arrowRight" size={13} /></button>}
        />
        <button
          className={'btn btn-secondary btn-sm ai-toggle' + (aiOpen ? ' is-on' : '')}
          onClick={onToggleAi}
          title={aiOpen ? 'Hide AI assistant (Ctrl+J)' : 'Show AI assistant (Ctrl+J)'}
        >
          <Icon name="sparkles" size={15} />
          <span className="ai-toggle-label">AI</span>
        </button>
      </div>
    </header>
  );
}
