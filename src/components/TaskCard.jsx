import { useState, useEffect, useCallback } from 'react';
import { useTaskStore, isEmployee } from '../store/taskStore';
import { isSignedIn, signIn } from '../services/googleAuth';
import { pushTaskToCalendar, deleteCalendarEvent } from '../services/calendarApi';
import { pushTaskToGoogleTasks, deleteGoogleTask } from '../services/tasksApi';
import { sendTaskEmail, getEmployeeEmail } from '../services/gmailApi';
import { localISO, daysUntil, fmtShortDate } from '../utils/date';
import { useTeamStore } from '../store/teamStore';
import { getUser } from '../services/authApi';
import TaskThread from './TaskThread';
import CheckItem from './CheckItem';
import Linkify from './Linkify';
import Icon from './Icon';

const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
const NEXT_STATUS  = { todo: 'in_progress', in_progress: 'done', done: 'todo' };

function StatusButton({ status, onClick }) {
  return (
    <button className={`status-btn status-btn-${status}`} onClick={onClick} title={`${STATUS_LABEL[status]} — click to change`} aria-label={`Status: ${STATUS_LABEL[status]}`}>
      {status === 'done' && <Icon name="check" size={12} strokeWidth={3} />}
    </button>
  );
}

export default function TaskCard({ task, onEdit }) {
  const setTaskStatus = useTaskStore(s => s.setTaskStatus);
  const deleteTask = useTaskStore(s => s.deleteTask);
  const setGoogleIds = useTaskStore(s => s.setGoogleIds);
  const toggleMilestone = useTaskStore(s => s.toggleMilestone);
  const [expanded, setExpanded]   = useState(false);
  const [busy, setBusy]           = useState('');
  const [msg, setMsg]             = useState('');
  const [google, setGoogle]       = useState(isSignedIn());
  const [employeeEmail, setEmployeeEmail] = useState(() => getEmployeeEmail(task.assigned_to));
  const [threadOpen, setThreadOpen] = useState(false);
  const serverCopy = useTeamStore(s => s.serverTasks.find(t => t.id === task.id));
  const msgCount = Number(serverCopy?.comment_count) || 0;
  const unreadMsgs = useTeamStore(s => s.notifications.some(n => n.type === 'comment' && n.task_id === task.id && !Number(n.is_read)));
  const closeThread = useCallback(() => setThreadOpen(false), []);
  const markThreadSeen = useCallback(taskId => {
    const { notifications, markRead } = useTeamStore.getState();
    notifications.filter(n => n.type === 'comment' && n.task_id === taskId && !Number(n.is_read)).forEach(n => markRead(n.id));
  }, []);
  const reloadServer = useCallback(() => useTeamStore.getState().loadServerTasks(), []);

  useEffect(() => {
    const refresh = () => setEmployeeEmail(getEmployeeEmail(task.assigned_to));
    const onGoogle = () => setGoogle(isSignedIn());
    refresh();
    window.addEventListener('team_updated', refresh);
    window.addEventListener('google_auth_change', onGoogle);
    return () => {
      window.removeEventListener('team_updated', refresh);
      window.removeEventListener('google_auth_change', onGoogle);
    };
  }, [task.assigned_to]);

  const forEmployee = isEmployee(task.assigned_to);
  const milestones  = task.milestones || [];
  const doneCount   = milestones.filter(m => m.done).length;
  const totalCount  = milestones.length;
  const days        = daysUntil(task.due_date);
  const isOverdue   = task.due_date && task.due_date < localISO() && task.status !== 'done';
  const isToday     = days === 0 && task.status !== 'done';

  function flash(text, ms = 4000) {
    setMsg(text);
    setTimeout(() => setMsg(''), ms);
  }

  async function handleNotify() {
    if (!employeeEmail) { flash(`No email on file for ${task.assigned_to}.`); return; }
    if (!google) { flash('Connect Google in Settings to send email.'); return; }
    setBusy('notify');
    try {
      await sendTaskEmail(task, employeeEmail, task.assigned_to);
      flash(`Emailed ${task.assigned_to}`);
    } catch (err) {
      if (err.message.includes('re-auth triggered')) {
        flash('Gmail access needed — reconnecting Google…');
        await signIn().catch(e => flash(e.message));
      } else {
        flash(err.message);
      }
    } finally {
      setBusy('');
    }
  }

  async function handleSyncToGoogle() {
    setBusy('sync');
    try {
      const [eventId, gtaskId] = await Promise.all([
        task.due_date ? pushTaskToCalendar(task, employeeEmail) : Promise.resolve(null),
        pushTaskToGoogleTasks(task),
      ]);
      setGoogleIds(task.id, { google_calendar_event_id: eventId, google_task_id: gtaskId });
      flash(task.due_date ? 'Added to Google Calendar & Tasks' : 'Added to Google Tasks');
    } catch (err) {
      flash(err.message);
    } finally {
      setBusy('');
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${task.title}"?${forEmployee ? ` ${task.assigned_to} will no longer see it.` : ''}`)) return;
    try {
      if (task.google_calendar_event_id) await deleteCalendarEvent(task.google_calendar_event_id);
      if (task.google_task_id) await deleteGoogleTask(task.google_task_id, task.workspace);
    } catch { /* non-critical */ }
    deleteTask(task.id);
  }

  const synced = task.google_calendar_event_id || task.google_task_id;

  return (
    <div className={'task' + (task.status === 'done' ? ' is-done' : '') + (isOverdue ? ' is-overdue' : '') + (expanded ? ' is-expanded' : '')}>
      <div className="task-main">
        <StatusButton status={task.status} onClick={() => setTaskStatus(task.id, NEXT_STATUS[task.status])} />

        <div className="task-body">
          <button className="task-title" onClick={() => (totalCount || task.notes ? setExpanded(e => !e) : onEdit(task))}>
            {task.title}
          </button>
          {task.notes && !expanded && <p className="task-notes"><Linkify text={task.notes} /></p>}

          <div className="task-meta">
            <span className={`prio prio-${task.priority}`}>{task.priority}</span>
            {task.status === 'in_progress' && <span className="pill pill-in_progress">In progress</span>}
            {task.due_date && (
              <span className={'meta' + (isOverdue ? ' text-red' : isToday ? ' text-accent' : '')}>
                <Icon name="calendar" size={12} />
                {isOverdue ? `${Math.abs(days)}d overdue` : isToday ? 'Today' : days === 1 ? 'Tomorrow' : fmtShortDate(task.due_date)}
                {task.due_time ? ` · ${task.due_time}` : ''}
              </span>
            )}
            {task.assigned_to && task.assigned_to !== 'Uzair' && (
              <span className="meta" title={forEmployee ? `Shared with ${task.assigned_to}` : ''}>
                <Icon name="user" size={12} /> {task.assigned_to}
              </span>
            )}
            {totalCount > 0 && (
              <button className="meta meta-btn" onClick={() => setExpanded(e => !e)}>
                <span className="mini-progress-bar"><span style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }} /></span>
                {doneCount}/{totalCount}
                <Icon name="chevronDown" size={12} className={expanded ? 'rot-180' : ''} />
              </button>
            )}
            {task.client_tag && task.client_tag !== 'N/A' && <span className="chip chip-sm">{task.client_tag}</span>}
            {synced && <span className="meta" title="Synced to Google"><Icon name="refresh" size={12} /> Google</span>}
          </div>
        </div>

        <div className={'task-actions' + (unreadMsgs ? ' task-actions-visible' : '')}>
          {forEmployee && (
            <button className={'btn btn-ghost btn-sm thread-btn' + (msgCount ? ' has-count' : '') + (unreadMsgs ? ' is-unread' : '')} onClick={() => setThreadOpen(true)} title={`Conversation with ${task.assigned_to}`} aria-label="Conversation">
              <Icon name="message" size={15} />{msgCount > 0 && <span>{msgCount}</span>}
            </button>
          )}
          {forEmployee && (
            <button className="btn btn-ghost btn-icon btn-sm" onClick={handleNotify} disabled={!!busy} title={`Email ${task.assigned_to} the brief`} aria-label="Email employee">
              <Icon name="mail" size={15} />
            </button>
          )}
          {google && (
            <button className="btn btn-ghost btn-icon btn-sm" onClick={handleSyncToGoogle} disabled={!!busy} title="Add to Google Calendar & Tasks" aria-label="Sync to Google">
              <Icon name="refresh" size={15} className={busy === 'sync' ? 'spin' : ''} />
            </button>
          )}
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(task)} title="Edit" aria-label="Edit"><Icon name="pencil" size={15} /></button>
          <button className="btn btn-ghost btn-icon btn-sm btn-danger-text" onClick={handleDelete} title="Delete" aria-label="Delete"><Icon name="trash" size={15} /></button>
        </div>
      </div>

      {expanded && (
        <div className="task-detail">
          {task.notes && <p className="task-notes task-notes-full"><Linkify text={task.notes} /></p>}
          {totalCount > 0 && (
            <div className="checklist">
              {milestones.map((m, idx) => {
                const isNext = !m.done && milestones.slice(0, idx).every(p => p.done);
                return (
                  <CheckItem key={m.id} done={m.done} next={isNext} index={idx + 1} title={m.title} hint={m.instruction} onToggle={() => toggleMilestone(task.id, m.id)} />
                );
              })}
            </div>
          )}
        </div>
      )}

      {msg && <div className="task-flash">{msg}</div>}
      {threadOpen && (
        <TaskThread
          task={{ ...task, ...(serverCopy || {}) }}
          me={getUser() || { id: 0, role: 'admin' }}
          onClose={closeThread} onSeen={markThreadSeen} onPosted={reloadServer}
        />
      )}
    </div>
  );
}
