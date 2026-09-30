import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../store/uiStore';
import { useTeamStore } from '../store/teamStore';
import { timeAgo } from '../utils/date';
import { NAV_LABEL } from '../nav';
import WorkspaceTabs from './WorkspaceTabs';
import Icon from './Icon';

const TASK_VIEWS = new Set(['tasks', 'today', 'overdue']);

export default function Topbar({ aiOpen, onToggleAi }) {
  const activeNav = useUiStore(s => s.activeNav);
  const setMobileOpen = useUiStore(s => s.setMobileNavOpen);

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
        <NotificationsMenu />
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

function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const notifications = useTeamStore(s => s.notifications);
  const markRead = useTeamStore(s => s.markRead);
  const loadNotifications = useTeamStore(s => s.loadNotifications);
  const loadServerTasks = useTeamStore(s => s.loadServerTasks);
  const navigate = useUiStore(s => s.navigate);
  const unread = notifications.filter(n => !Number(n.is_read)).length;

  useEffect(() => {
    if (!open) return;
    loadNotifications();
    const onDown = e => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, loadNotifications]);

  function openNotification(n) {
    if (!Number(n.is_read)) markRead(n.id);
    setOpen(false);
    loadServerTasks();
    navigate('team', n.task_id ? { taskId: n.task_id } : null);
  }

  return (
    <div className="notif" ref={wrapRef}>
      <button className={'icon-btn notif-btn' + (open ? ' is-on' : '')} onClick={() => setOpen(o => !o)} aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
        <Icon name="bell" size={17} />
        {unread > 0 && <span className="notif-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="popover notif-menu">
          <div className="popover-head">
            <span>Notifications</span>
            {unread > 0 && <button className="link-btn" onClick={() => markRead('all')}>Mark all read</button>}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <Icon name="inbox" size={22} />
                <span>You're all caught up</span>
                <span className="muted-small">When your team finishes a task, it shows up here.</span>
              </div>
            ) : notifications.slice(0, 15).map(n => (
              <button key={n.id} className={'notif-item' + (Number(n.is_read) ? '' : ' is-unread')} onClick={() => openNotification(n)}>
                <span className="notif-icon"><Icon name="checkCircle" size={16} /></span>
                <span className="notif-body">
                  <span className="notif-msg">{n.message}</span>
                  <span className="notif-time">{timeAgo(n.created_at)} · View in Team</span>
                </span>
                {!Number(n.is_read) && <span className="dot dot-accent" />}
              </button>
            ))}
          </div>
          <div className="popover-foot">
            <button className="link-btn" onClick={() => { setOpen(false); navigate('team'); }}>
              Open Team <Icon name="arrowRight" size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
