import { useState, useEffect, useCallback } from 'react';
import { fetchMyTasks, updateTaskStatus, updateMilestone } from '../services/taskSyncApi';
import { useUiStore } from '../store/uiStore';
import { localISO, daysUntil, fmtShortDate } from '../utils/date';
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

  useEffect(() => {
    load();
    // New assignments show up without a manual refresh.
    const t = setInterval(() => { if (document.visibilityState === 'visible') load({ quiet: true }); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function changeStatus(task, status) {
    setUpdating(u => ({ ...u, [task.id]: true }));
    try {
      await updateTaskStatus(task.id, status);
      setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status } : t));
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
          <p className="muted-text">{loading ? 'Loading your tasks…' : openCount ? `You have ${openCount} open task${openCount !== 1 ? 's' : ''}.` : 'No open tasks right now.'}</p>
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
            <div className="empty-sub">New tasks from Uzair appear here automatically.</div>
          </div>
        ) : (
          <div className="task-list">
            {shown.map(task => {
              const ms = task.milestones || [];
              const done = ms.filter(m => Number(m.done)).length;
              const days = daysUntil(task.due_date);
              const overdue = task.status !== 'done' && task.due_date && task.due_date < today;
              const isOpen = expanded[task.id];
              return (
                <div key={task.id} className={'task' + (task.status === 'done' ? ' is-done' : '') + (overdue ? ' is-overdue' : '')}>
                  <div className="task-main">
                    <span className={`status-dot status-${task.status}`} />
                    <div className="task-body">
                      <div className="task-title task-title-static">{task.title}</div>
                      {task.notes && <p className="task-notes task-notes-full">{task.notes}</p>}
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
                      </div>
                    </div>
                    <div className="task-actions task-actions-visible">
                      {task.status === 'todo' && (
                        <button className="btn btn-secondary btn-sm" disabled={updating[task.id]} onClick={() => changeStatus(task, 'in_progress')}>Start</button>
                      )}
                      {task.status !== 'done' ? (
                        <button className="btn btn-primary btn-sm" disabled={updating[task.id]} onClick={() => changeStatus(task, 'done')}>
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
                          const isDone = !!Number(m.done);
                          return (
                            <button key={m.id} className={'check-item' + (isDone ? ' is-done' : '')} onClick={() => toggleMs(task, m)}>
                              <span className="check-box">{isDone ? <Icon name="check" size={11} strokeWidth={3} /> : idx + 1}</span>
                              <span className="check-text">
                                <span className="check-title">{m.title}</span>
                                {m.instruction && <span className="check-hint">{m.instruction}</span>}
                              </span>
                            </button>
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
    </div>
  );
}
