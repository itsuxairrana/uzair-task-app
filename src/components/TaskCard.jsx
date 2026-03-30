import { useState, useEffect } from 'react';
import { useTaskStore } from '../store/taskStore';
import { isSignedIn, signIn } from '../services/googleAuth';
import { pushTaskToCalendar, deleteCalendarEvent } from '../services/calendarApi';
import { pushTaskToGoogleTasks, deleteGoogleTask } from '../services/tasksApi';
import { sendTaskEmail, getEmployeeEmail } from '../services/gmailApi';

const PRIORITY_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
const STATUS_COLOR   = { todo: '#9ca3af', in_progress: '#3b82f6', done: '#16a34a' };
const STATUS_LABEL   = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };

function fmtDate(d) {
  if (!d) return '';
  const [, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m - 1]} ${+day}`;
}

// ── SVG icon helpers ──────────────────────────────────────────────────────────
const CheckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M1.5 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const CalIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <rect x="0.75" y="1.5" width="8.5" height="7.75" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
    <path d="M.75 4h8.5M3 .75v1.5M7 .75v1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
  </svg>
);
const UserIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <circle cx="5" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.1"/>
    <path d="M1.5 9.5c0-2 1.6-3.5 3.5-3.5s3.5 1.6 3.5 3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
  </svg>
);
const SyncIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M5.5 1.5A4 4 0 1 1 1.5 5.5H3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M1.5 3.5v2h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2 3.5h8M4.5 3.5V2h3v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <rect x="2.5" y="3.5" width="7" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M4.5 5.5v3M7.5 5.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);
const ChevronIcon = ({ open }) => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
    <path d="M2.5 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function TaskCard({ task, onEdit }) {
  const { setTaskStatus, deleteTask, setGoogleIds, toggleMilestone } = useTaskStore();
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [syncMsg, setSyncMsg]     = useState('');
  const [notifying, setNotifying] = useState(false);

  const [employeeEmail, setEmployeeEmail] = useState(() => getEmployeeEmail(task.assigned_to));
  const showNotify = !!task.assigned_to;

  useEffect(() => {
    const refresh = () => setEmployeeEmail(getEmployeeEmail(task.assigned_to));
    window.addEventListener('team_updated', refresh);
    refresh(); // also re-read on every render cycle when assigned_to changes
    return () => window.removeEventListener('team_updated', refresh);
  }, [task.assigned_to]);

  const milestones  = task.milestones || [];
  const doneCount   = milestones.filter(m => m.done).length;
  const totalCount  = milestones.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const _ld = new Date();
  const _localToday = `${_ld.getFullYear()}-${String(_ld.getMonth()+1).padStart(2,'0')}-${String(_ld.getDate()).padStart(2,'0')}`;
  const isOverdue = task.due_date && task.due_date < _localToday && task.status !== 'done';

  async function handleNotify() {
    if (!employeeEmail) {
      setSyncMsg(`Go to Settings → Team, add "${task.assigned_to}" with their email`);
      setTimeout(() => setSyncMsg(''), 5000);
      return;
    }
    if (!isSignedIn()) { setSyncMsg('Sign in with Google first.'); setTimeout(() => setSyncMsg(''), 3000); return; }
    setNotifying(true); setSyncMsg('Sending email…');
    try {
      await sendTaskEmail(task, employeeEmail, task.assigned_to);
      setSyncMsg(`Email sent to ${task.assigned_to}`);
    } catch (err) {
      // Gmail scope missing — auto re-authorize then retry
      if (err.message.includes('re-auth triggered')) {
        setSyncMsg('Requesting Gmail access…');
        try {
          await signIn();
          await sendTaskEmail(task, employeeEmail, task.assigned_to);
          setSyncMsg(`Email sent to ${task.assigned_to}`);
        } catch (err2) {
          setSyncMsg(err2.message);
        }
      } else {
        setSyncMsg(err.message);
      }
    } finally {
      setNotifying(false);
      setTimeout(() => setSyncMsg(''), 5000);
    }
  }

  async function handleSyncToGoogle() {
    if (!isSignedIn()) {
      setSyncMsg('Sign in with Google first.');
      setTimeout(() => setSyncMsg(''), 3000);
      return;
    }
    setSyncing(true); setSyncMsg('Syncing…');
    try {
      const [eventId, gtaskId] = await Promise.all([
        task.due_date ? pushTaskToCalendar(task, employeeEmail) : Promise.resolve(null),
        pushTaskToGoogleTasks(task),
      ]);
      setGoogleIds(task.id, { google_calendar_event_id: eventId, google_task_id: gtaskId });
      setSyncMsg('Synced!');
    } catch (err) {
      setSyncMsg(err.message);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(''), 4000);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${task.title}"?`)) return;
    try {
      if (task.google_calendar_event_id) await deleteCalendarEvent(task.google_calendar_event_id);
      if (task.google_task_id) await deleteGoogleTask(task.google_task_id, task.workspace);
    } catch { /* non-critical */ }
    deleteTask(task.id);
  }

  function cycleStatus() {
    const cycle = { todo: 'in_progress', in_progress: 'done', done: 'todo' };
    setTaskStatus(task.id, cycle[task.status]);
  }

  return (
    <div className={`task-card priority-${task.priority}${task.status === 'done' ? ' task-done' : ''}${isOverdue ? ' task-overdue' : ''}`}>

      {/* ── Header ── */}
      <div className="tc-header">
        {/* Status circle */}
        <button className="tc-status-btn" onClick={cycleStatus} title={`Status: ${STATUS_LABEL[task.status]}`}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            {task.status === 'done' ? (
              <>
                <circle cx="9" cy="9" r="8" fill={STATUS_COLOR.done}/>
                <path d="M5.5 9l2.5 2.5 5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              </>
            ) : task.status === 'in_progress' ? (
              <circle cx="9" cy="9" r="7.5" stroke={STATUS_COLOR.in_progress} strokeWidth="2" strokeDasharray="4 3" strokeDashoffset="1"/>
            ) : (
              <circle cx="9" cy="9" r="7.5" stroke={STATUS_COLOR.todo} strokeWidth="1.5"/>
            )}
          </svg>
        </button>

        <span className={`tc-title${task.status === 'done' ? ' tc-done' : ''}`}>
          {task.title}
        </span>

        {/* Priority dot */}
        <span
          className="tc-priority-dot"
          style={{ background: PRIORITY_COLOR[task.priority] }}
          title={task.priority}
        />

        {totalCount > 0 && (
          <button className="tc-expand-btn" onClick={() => setExpanded(e => !e)}>
            <ChevronIcon open={expanded} />
          </button>
        )}
      </div>

      {/* ── Progress bar ── */}
      {totalCount > 0 && (
        <div className="tc-progress-row">
          <div className="tc-progress-bar">
            <div className="tc-progress-fill" style={{ width: progressPct + '%' }} />
          </div>
          <span className="tc-progress-label">{doneCount}/{totalCount}</span>
        </div>
      )}

      {/* ── Notes ── */}
      {task.notes && !expanded && (
        <p className="tc-notes">{task.notes}</p>
      )}

      {/* ── Milestones (expanded) ── */}
      {expanded && totalCount > 0 && (
        <div className="tc-milestones">
          {task.notes && <p className="tc-notes">{task.notes}</p>}
          {milestones.map((m, idx) => {
            const isActive = !m.done && milestones.slice(0, idx).every(p => p.done);
            return (
              <div
                key={m.id}
                className={`tc-milestone${m.done ? ' ms-done' : isActive ? ' ms-active' : ''}`}
                onClick={() => toggleMilestone(task.id, m.id)}
              >
                <div className={`ms-circle${m.done ? ' ms-circle-done' : isActive ? ' ms-circle-active' : ''}`}>
                  {m.done ? <CheckIcon /> : idx + 1}
                </div>
                <div className="ms-body">
                  <span className="ms-title">{m.title}</span>
                  {m.instruction && <span className="ms-hint">{m.instruction}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Meta chips ── */}
      <div className="tc-meta">
        {/* Status badge */}
        <span className={`tc-status-pill sp-${task.status}`}>
          {STATUS_LABEL[task.status]}
        </span>

        {/* Date */}
        {task.due_date && (
          <span className={`tc-chip${isOverdue ? ' chip-overdue' : ''}`}>
            <CalIcon />
            {fmtDate(task.due_date)}{task.due_time ? ' · ' + task.due_time : ''}
          </span>
        )}

        {/* Assigned — only if not default Uzair */}
        {task.assigned_to && task.assigned_to !== 'Uzair' && (
          <span className="tc-chip">
            <UserIcon />
            {task.assigned_to}
          </span>
        )}

        {/* Client */}
        {task.client_tag && task.client_tag !== 'N/A' && (
          <span className="tc-chip chip-client">{task.client_tag}</span>
        )}

        {/* Synced */}
        {(task.google_calendar_event_id || task.google_task_id) && (
          <span className="tc-chip chip-synced">
            <SyncIcon />
            Synced
          </span>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="tc-actions">
        <button className="tc-btn" onClick={() => onEdit(task)}>
          <EditIcon /> Edit
        </button>
        <button className="tc-btn" onClick={handleSyncToGoogle} disabled={syncing}>
          <SyncIcon /> {syncing ? '…' : 'Sync'}
        </button>
        {showNotify && (
          <button
            className={`tc-btn tc-btn-notify${!employeeEmail ? ' tc-btn-no-email' : ''}`}
            onClick={handleNotify}
            disabled={notifying}
            title={employeeEmail ? `Send task to ${task.assigned_to} (${employeeEmail})` : `Add ${task.assigned_to}'s email in Settings → Team`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 3l5 3.5L11 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><rect x="1" y="2" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/></svg>
            {notifying ? '…' : 'Notify'}
          </button>
        )}
        <button className="tc-btn tc-btn-danger" onClick={handleDelete}>
          <TrashIcon /> Delete
        </button>
        {syncMsg && <span className="tc-sync-msg">{syncMsg}</span>}
      </div>
    </div>
  );
}
