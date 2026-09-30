import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchMyTasks, updateTaskStatus, updateMilestone, fetchNotifications, markNotificationsRead } from '../services/taskSyncApi';
import { fetchRoutines, setRoutineCheck } from '../services/collabApi';
import { useUiStore } from '../store/uiStore';
import { localISO, daysUntil, fmtShortDate, timeAgo } from '../utils/date';
import NotificationsMenu from './NotificationsMenu';
import TaskThread from './TaskThread';
import CheckItem from './CheckItem';
import Linkify from './Linkify';
import Icon from './Icon';

const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
const FILTERS = ['all', 'todo', 'in_progress', 'done'];

export default function EmployeeDashboard({ authUser, onLogout }) {
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState({});
  const [updating, setUpdating] = useState({});
  const [filter, setFilter]     = useState('all');
  const [notifications, setNotifications] = useState([]);
  const [threadId, setThreadId] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [finishing, setFinishing] = useState(null); // task being marked done
  const taskRefs = useRef({});
  const notifRef = useRef([]); // latest list, for comparisons outside render
  const theme = useUiStore(s => s.theme);
  const setTheme = useUiStore(s => s.setTheme);

  const load = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (!quiet) setLoading(true);
      setTasks(await fetchMyTasks());
      setError('');
    } catch (e) {
      setError(e.message || 'Could not load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      const prev = notifRef.current;
      const next = data.notifications || [];
      notifRef.current = next;
      setNotifications(next);
      // Something new arrived (assignment or reply) — refresh the task list too.
      if (prev.length && next.some(n => !prev.some(p => p.id === n.id))) load({ quiet: true });
    } catch { /* offline — keep the last list */ }
  }, [load]);

  useEffect(() => {
    load();
    loadNotifications();
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadNotifications();
    }, 30000);
    const t2 = setInterval(() => { if (document.visibilityState === 'visible') load({ quiet: true }); }, 90000);
    return () => { clearInterval(t); clearInterval(t2); };
  }, [load, loadNotifications]);

  useEffect(() => {
    document.title = `${notifications.some(n => !Number(n.is_read)) ? `(${notifications.filter(n => !Number(n.is_read)).length}) ` : ''}My work · Task OS`;
  }, [notifications]);

  useEffect(() => {
    if (!highlight) return;
    taskRefs.current[highlight]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHighlight(null), 3200);
    return () => clearTimeout(t);
  }, [highlight, tasks]);

  function applyRead(match) {
    notifRef.current = notifRef.current.map(n => match(n) ? { ...n, is_read: 1 } : n);
    setNotifications(notifRef.current);
  }

  function markRead(id) {
    applyRead(n => id === 'all' || n.id === id);
    markNotificationsRead(id).catch(() => {});
  }

  function openNotification(n) {
    if (n.type === 'routine_reminder') {
      document.querySelector('.routine-today')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!n.task_id) return;
    setFilter('all');
    setHighlight(n.task_id);
    load({ quiet: true });
    if (n.type === 'comment') setThreadId(n.task_id);
  }

  const markThreadSeen = useCallback(taskId => {
    const isThread = n => n.type === 'comment' && n.task_id === taskId;
    notifRef.current.filter(n => isThread(n) && !Number(n.is_read)).forEach(n => markNotificationsRead(n.id).catch(() => {}));
    notifRef.current = notifRef.current.map(n => isThread(n) ? { ...n, is_read: 1 } : n);
    setNotifications(notifRef.current);
  }, []);
  const closeThread = useCallback(() => setThreadId(null), []);
  const refreshQuiet = useCallback(() => load({ quiet: true }), [load]);

  async function changeStatus(task, status, handoff) {
    setUpdating(u => ({ ...u, [task.id]: true }));
    try {
      await updateTaskStatus(task.id, status, handoff);
      setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status } : t));
      if (handoff?.report || handoff?.links?.length) load({ quiet: true }); // pick up the new message count
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating(u => ({ ...u, [task.id]: false }));
    }
  }

  async function toggleMs(task, ms) {
    const done = !Number(ms.done);
    try {
      await updateMilestone(task.id, ms.id, done);
      setTasks(ts => ts.map(t => t.id !== task.id ? t : { ...t, milestones: t.milestones.map(m => m.id === ms.id ? { ...m, done } : m) }));
    } catch (e) {
      setError(e.message);
    }
  }

  const today = localISO();
  const counts = Object.fromEntries(FILTERS.map(f => [f, f === 'all' ? tasks.length : tasks.filter(t => t.status === f).length]));
  const shown = (filter === 'all' ? tasks : tasks.filter(t => t.status === filter)).slice().sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
    if (a.due_date !== b.due_date) return !a.due_date ? 1 : !b.due_date ? -1 : a.due_date.localeCompare(b.due_date);
    return 0;
  });
  const openCount = tasks.filter(t => t.status !== 'done').length;
  const threadTask = threadId && tasks.find(t => t.id === threadId);

  return (
    <div className="emp-shell">
      <header className="emp-header">
        <div className="brand">
          <span className="brand-mark">UV</span>
          <span className="brand-text">
            <span className="brand-name">Task OS</span>
            <span className="brand-sub">Uzair Visuals</span>
          </span>
        </div>
        <div className="emp-header-right">
          <NotificationsMenu
            notifications={notifications}
            onOpen={openNotification}
            onMarkRead={markRead}
            onRefresh={loadNotifications}
            emptyHint="New tasks and replies from Uzair show up here."
          />
          <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme" aria-label="Toggle theme">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
          <span className="emp-username">{authUser?.name}</span>
          <button className="btn btn-secondary btn-sm" onClick={onLogout}><Icon name="logout" size={14} /> Sign out</button>
        </div>
      </header>

      <main className="emp-main">
        <div className="emp-hero">
          <h1 className="page-heading">Hi, {authUser?.name?.split(' ')[0]}</h1>
          <p className="muted-text">{parseToday()}</p>
        </div>

        <DailyRoutine />

        <div className="section-head">
          <h2 className="section-title"><Icon name="listChecks" size={17} /> Tasks</h2>
          <span className="muted-small">{loading ? 'Loading…' : openCount ? `${openCount} open` : 'Nothing open'}</span>
        </div>

        <div className="toolbar">
          <div className="segmented">
            {FILTERS.map(f => (
              <button key={f} className={'segmented-opt' + (filter === f ? ' is-active' : '')} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : STATUS_LABEL[f]}
                {counts[f] > 0 && <span className="seg-count">{counts[f]}</span>}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm toolbar-end" onClick={() => load()}><Icon name="refresh" size={14} /> Refresh</button>
        </div>

        {error && <div className="callout callout-red">{error}</div>}

        {loading ? (
          <div className="skeleton-list"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><Icon name="inbox" size={22} /></div>
            <div className="empty-title">{filter === 'all' ? 'No tasks assigned yet' : `Nothing ${STATUS_LABEL[filter].toLowerCase()}`}</div>
            <div className="empty-sub">New tasks from Uzair appear here automatically, and you'll get a notification.</div>
          </div>
        ) : (
          <div className="task-list">
            {shown.map(task => {
              const ms = task.milestones || [];
              const done = ms.filter(m => Number(m.done)).length;
              const days = daysUntil(task.due_date);
              const overdue = task.status !== 'done' && task.due_date && task.due_date < today;
              const isOpen = expanded[task.id];
              const msgCount = Number(task.comment_count) || 0;
              return (
                <div key={task.id} ref={el => { taskRefs.current[task.id] = el; }} className={'task' + (task.status === 'done' ? ' is-done' : '') + (overdue ? ' is-overdue' : '') + (highlight === task.id ? ' is-highlight' : '')}>
                  <div className="task-main">
                    <span className={`status-dot status-${task.status}`} />
                    <div className="task-body">
                      <div className="task-title task-title-static">{task.title}</div>
                      {task.notes && <p className="task-notes task-notes-full"><Linkify text={task.notes} /></p>}
                      <div className="task-meta">
                        <span className={`pill pill-${task.status}`}>{STATUS_LABEL[task.status]}</span>
                        <span className={`prio prio-${task.priority}`}>{task.priority}</span>
                        {task.due_date && (
                          <span className={'meta' + (overdue ? ' text-red' : days === 0 && task.status !== 'done' ? ' text-accent' : '')}>
                            <Icon name="calendar" size={12} />
                            {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `Due ${fmtShortDate(task.due_date)}`}
                            {task.due_time ? ` · ${task.due_time}` : ''}
                          </span>
                        )}
                        {task.client_tag && <span className="chip chip-sm">{task.client_tag}</span>}
                        {ms.length > 0 && (
                          <button className="meta meta-btn" onClick={() => setExpanded(e => ({ ...e, [task.id]: !e[task.id] }))}>
                            <span className="mini-progress-bar"><span style={{ width: `${Math.round((done / ms.length) * 100)}%` }} /></span>
                            {done}/{ms.length} steps
                            <Icon name="chevronDown" size={12} className={isOpen ? 'rot-180' : ''} />
                          </button>
                        )}
                        {task.last_comment_at && <span className="meta">Last message {timeAgo(task.last_comment_at)}</span>}
                      </div>
                    </div>
                    <div className="task-actions task-actions-visible">
                      <button className={'btn btn-ghost btn-sm thread-btn' + (msgCount ? ' has-count' : '')} onClick={() => setThreadId(task.id)} title="Message Uzair about this task">
                        <Icon name="message" size={14} /> {msgCount > 0 ? msgCount : 'Discuss'}
                      </button>
                      {task.status === 'todo' && (
                        <button className="btn btn-secondary btn-sm" disabled={updating[task.id]} onClick={() => changeStatus(task, 'in_progress')}>Start</button>
                      )}
                      {task.status !== 'done' ? (
                        <button className="btn btn-primary btn-sm" disabled={updating[task.id]} onClick={() => setFinishing(task)}>
                          <Icon name="check" size={14} /> {updating[task.id] ? 'Saving…' : 'Mark done'}
                        </button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" disabled={updating[task.id]} onClick={() => changeStatus(task, 'in_progress')}>Reopen</button>
                      )}
                    </div>
                  </div>
                  {isOpen && ms.length > 0 && (
                    <div className="task-detail">
                      <div className="checklist">
                        {ms.map((m, idx) => {
                          return (
                            <CheckItem key={m.id} done={!!Number(m.done)} index={idx + 1} title={m.title} hint={m.instruction} onToggle={() => toggleMs(task, m)} />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {finishing && (
        <FinishTaskModal
          task={finishing}
          onCancel={() => setFinishing(null)}
          onFinish={async handoff => { const t = finishing; setFinishing(null); await changeStatus(t, 'done', handoff); }}
        />
      )}
      {threadTask && (
        <TaskThread task={threadTask} me={authUser} onClose={closeThread} onSeen={markThreadSeen} onPosted={refreshQuiet} />
      )}
    </div>
  );
}

function parseToday() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Today's routine checklist; resets every day (checks are stored per date on the server).
function DailyRoutine() {
  const [items, setItems]   = useState(null);
  const [doneIds, setDone]  = useState(new Set());
  const [error, setError]   = useState('');
  const [day, setDay]       = useState(localISO());

  const load = useCallback(() => {
    const d = localISO();
    return fetchRoutines(d).then(data => {
      setDay(d);
      setItems(data.routines || []);
      setDone(new Set((data.checks || []).filter(c => c.day === d).map(c => c.routine_id)));
      setError('');
    }, e => {
      setError(e.message);
      setItems(prev => prev || []);
    });
  }, []);

  useEffect(() => {
    load();
    // Pick up edits from Uzair and roll over at midnight.
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function toggle(item) {
    const next = !doneIds.has(item.id);
    setDone(s => { const n = new Set(s); if (next) n.add(item.id); else n.delete(item.id); return n; });
    try {
      await setRoutineCheck(item.id, day, next);
    } catch (e) {
      setError(e.message);
      setDone(s => { const n = new Set(s); if (next) n.delete(item.id); else n.add(item.id); return n; });
    }
  }

  if (items === null) return <div className="skeleton" style={{ height: 120 }} />;
  if (items.length === 0 && !error) return null; // no routine set for this employee

  const doneCount = items.filter(i => doneIds.has(i.id)).length;
  const complete = items.length > 0 && doneCount === items.length;

  return (
    <section className={'routine-today' + (complete ? ' is-complete' : '')}>
      <div className="routine-today-head">
        <div>
          <h2 className="section-title"><Icon name="repeat" size={17} /> Today's routine</h2>
          <div className="muted-small">{complete ? 'All done for today — nice work.' : 'Resets every day. Uzair is notified when you finish.'}</div>
        </div>
        <span className={'routine-ring' + (complete ? ' is-complete' : '')} style={{ '--p': `${items.length ? Math.round((doneCount / items.length) * 100) : 0}%` }}>
          {doneCount}/{items.length}
        </span>
      </div>
      <div className="checklist">
        {items.map(item => {
          return (
            <CheckItem key={item.id} done={doneIds.has(item.id)} title={item.title} hint={item.notes} onToggle={() => toggle(item)} />
          );
        })}
      </div>
      {error && <div className="form-msg form-msg-err">{error}</div>}
    </section>
  );
}

// Mark a task done and optionally hand in the work: file links (Drive, Dropbox, Figma…) and a short report.
function FinishTaskModal({ task, onCancel, onFinish }) {
  const [links, setLinks]   = useState(['']);
  const [report, setReport] = useState('');
  const [busy, setBusy]     = useState(false);
  const clean = links.map(l => l.trim()).filter(Boolean);
  const invalid = clean.filter(l => !/^(https?:\/\/|www\.)\S+$/i.test(l));

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  async function submit(e) {
    e.preventDefault();
    if (invalid.length) return;
    setBusy(true);
    await onFinish({ report: report.trim(), links: clean });
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-label="Finish task">
        <div className="modal-header">
          <h2>Finish task</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onCancel} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="finish-task-title">{task.title}</div>
          <div className="field">
            <span className="field-label">Links to your work <span className="muted-small">(optional)</span></span>
            {links.map((l, i) => (
              <div key={i} className="input-row">
                <input
                  className="input" type="text" inputMode="url" autoComplete="off" value={l} autoFocus={i === 0}
                  onChange={e => setLinks(ls => ls.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder="https://drive.google.com/…"
                />
                {links.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))} aria-label="Remove link"><Icon name="x" size={14} /></button>
                )}
              </div>
            ))}
            {links.length < 10 && (
              <div><button type="button" className="link-btn" onClick={() => setLinks(ls => [...ls, ''])}><Icon name="plus" size={13} /> Add another link</button></div>
            )}
            {invalid.length > 0 && <div className="form-msg form-msg-err">Links should start with https:// (or www.)</div>}
          </div>
          <label className="field">
            <span className="field-label">Report <span className="muted-small">(optional)</span></span>
            <textarea className="textarea" rows={4} value={report} onChange={e => setReport(e.target.value)} placeholder="What you did, anything Uzair should check…" maxLength={4000} />
          </label>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || invalid.length > 0}>
              <Icon name="check" size={14} /> {clean.length || report.trim() ? 'Send & mark done' : 'Mark done'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
