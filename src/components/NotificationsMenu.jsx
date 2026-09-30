import { useEffect, useRef, useState } from 'react';
import { timeAgo } from '../utils/date';
import Icon from './Icon';

const TYPE = {
  task_completed: { icon: 'checkCircle', tone: 'green',  hint: 'View in Team' },
  comment:        { icon: 'message',     tone: 'accent', hint: 'Open conversation' },
  task_assigned:  { icon: 'inbox',       tone: 'accent', hint: 'View task' },
  routine_done:   { icon: 'repeat',      tone: 'green',  hint: 'View daily routine' },
};

// Bell + dropdown, shared by the admin shell and the employee dashboard.
export default function NotificationsMenu({ notifications, onOpen, onMarkRead, onRefresh, emptyHint, footer }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const unread = notifications.filter(n => !Number(n.is_read)).length;

  useEffect(() => {
    if (!open) return;
    onRefresh?.();
    const onDown = e => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onRefresh]);

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
            {unread > 0 && <button className="link-btn" onClick={() => onMarkRead('all')}>Mark all read</button>}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <Icon name="inbox" size={22} />
                <span>You're all caught up</span>
                {emptyHint && <span className="muted-small">{emptyHint}</span>}
              </div>
            ) : notifications.slice(0, 20).map(n => {
              const t = TYPE[n.type] || TYPE.task_completed;
              const isUnread = !Number(n.is_read);
              return (
                <button
                  key={n.id}
                  className={'notif-item' + (isUnread ? ' is-unread' : '')}
                  onClick={() => { if (isUnread) onMarkRead(n.id); setOpen(false); onOpen(n); }}
                >
                  <span className={`notif-icon notif-icon-${t.tone}`}><Icon name={t.icon} size={15} /></span>
                  <span className="notif-body">
                    <span className="notif-msg">{n.message}</span>
                    <span className="notif-time">{timeAgo(n.created_at)} · {t.hint}</span>
                  </span>
                  {isUnread && <span className="dot dot-accent" />}
                </button>
              );
            })}
          </div>
          {footer && <div className="popover-foot" onClick={() => setOpen(false)}>{footer}</div>}
        </div>
      )}
    </div>
  );
}
