import { useState, useEffect } from 'react';
import { fetchMyTasks, updateTaskStatus, updateMilestone } from '../services/taskSyncApi';

const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
const STATUS_COLOR = { todo: '#94a3b8', in_progress: '#f59e0b', done: '#22c55e' };
const PRI_COLOR    = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };

export default function EmployeeDashboard({ authUser, onLogout }) {
  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [expanded, setExpanded]   = useState({});
  const [updating, setUpdating]   = useState({});
  const [filter, setFilter]       = useState('all'); // all | todo | in_progress | done

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const t = await fetchMyTasks();
      setTasks(t);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(task, status) {
    setUpdating(u => ({ ...u, [task.id]: true }));
    try {
      await updateTaskStatus(task.id, status);
      setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status } : t));
    } finally {
      setUpdating(u => ({ ...u, [task.id]: false }));
    }
  }

  async function toggleMs(task, ms) {
    const done = !ms.done;
    await updateMilestone(task.id, ms.id, done);
    setTasks(ts => ts.map(t => {
      if (t.id !== task.id) return t;
      const milestones = t.milestones.map(m => m.id === ms.id ? { ...m, done } : m);
      const allDone = milestones.length > 0 && milestones.every(m => m.done);
      return { ...t, milestones, status: allDone ? 'done' : t.status };
    }));
  }

  const shown = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  const counts = {
    all: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  return (
    <div className="emp-shell">
      {/* Header */}
      <header className="emp-header">
        <div className="emp-brand">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M9 2L4 9h4l-1 5 5-7H8l1-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
          Task OS
        </div>
        <div className="emp-user">
          <span className="emp-username">{authUser?.name}</span>
          <button className="emp-logout" onClick={onLogout} title="Logout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout
          </button>
        </div>
      </header>

      <div className="emp-body">
        {/* Sidebar filters */}
        <aside className="emp-sidebar">
          <div className="emp-greeting">Hi, {authUser?.name?.split(' ')[0]} 👋</div>
          <div className="emp-filters">
            {['all','todo','in_progress','done'].map(f => (
              <button key={f} className={'emp-filter' + (filter === f ? ' emp-filter-active' : '')} onClick={() => setFilter(f)}>
                <span className="ef-label">{f === 'all' ? 'All Tasks' : STATUS_LABEL[f]}</span>
                <span className="ef-count">{counts[f]}</span>
              </button>
            ))}
          </div>
          <div className="emp-refresh">
            <button className="emp-refresh-btn" onClick={load}>↻ Refresh</button>
          </div>
        </aside>

        {/* Task list */}
        <main className="emp-main">
          {loading && <div className="emp-loading">Loading your tasks…</div>}
          {error   && <div className="emp-error">{error}</div>}
          {!loading && !error && shown.length === 0 && (
            <div className="emp-empty">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="8" y="8" width="32" height="32" rx="6" stroke="#334155" strokeWidth="2"/><path d="M16 24h16M16 30h10" stroke="#334155" strokeWidth="2" strokeLinecap="round"/></svg>
              <p>No tasks assigned yet</p>
            </div>
          )}

          {shown.map(task => {
            const ms = task.milestones || [];
            const done = ms.filter(m => m.done).length;
            const pct  = ms.length ? Math.round((done / ms.length) * 100) : (task.status === 'done' ? 100 : 0);
            const isOpen = expanded[task.id];

            return (
              <div key={task.id} className={'emp-task' + (task.status === 'done' ? ' emp-task-done' : '')}>
                <div className="emp-task-top">
                  <div className="emp-task-meta">
                    <span className="emp-pri" style={{ background: PRI_COLOR[task.priority] + '22', color: PRI_COLOR[task.priority] }}>
                      {task.priority}
                    </span>
                    {task.due_date && (
                      <span className="emp-due">Due {task.due_date}</span>
                    )}
                    {task.client_tag && (
                      <span className="emp-client">{task.client_tag}</span>
                    )}
                  </div>

                  <div className="emp-task-status">
                    <span className="emp-status-dot" style={{ background: STATUS_COLOR[task.status] }} />
                    <span style={{ color: STATUS_COLOR[task.status], fontSize: 11, fontWeight: 600 }}>
                      {STATUS_LABEL[task.status]}
                    </span>
                  </div>
                </div>

                <div className="emp-task-title">{task.title}</div>
                {task.notes && <div className="emp-task-notes">{task.notes}</div>}

                {ms.length > 0 && (
                  <div className="emp-progress-wrap">
                    <div className="emp-progress-bar">
                      <div className="emp-progress-fill" style={{ width: pct + '%' }} />
                    </div>
                    <span className="emp-progress-txt">{done}/{ms.length} steps</span>
                  </div>
                )}

                <div className="emp-task-actions">
                  {ms.length > 0 && (
                    <button className="emp-expand-btn" onClick={() => setExpanded(e => ({ ...e, [task.id]: !e[task.id] }))}>
                      {isOpen ? '▲ Hide steps' : '▼ Show steps'}
                    </button>
                  )}

                  <div className="emp-status-btns">
                    {task.status !== 'in_progress' && task.status !== 'done' && (
                      <button className="emp-btn emp-btn-start" disabled={updating[task.id]} onClick={() => changeStatus(task, 'in_progress')}>
                        Start
                      </button>
                    )}
                    {task.status !== 'done' && (
                      <button className="emp-btn emp-btn-done" disabled={updating[task.id]} onClick={() => changeStatus(task, 'done')}>
                        {updating[task.id] ? '…' : '✓ Mark Done'}
                      </button>
                    )}
                    {task.status === 'done' && (
                      <button className="emp-btn emp-btn-reopen" onClick={() => changeStatus(task, 'in_progress')}>
                        Reopen
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && ms.length > 0 && (
                  <div className="emp-milestones">
                    {ms.map(m => (
                      <div key={m.id} className={'emp-ms' + (m.done ? ' emp-ms-done' : '')} onClick={() => toggleMs(task, m)}>
                        <span className="emp-ms-check">{m.done ? '✓' : '○'}</span>
                        <div className="emp-ms-info">
                          <span className="emp-ms-title">{m.title}</span>
                          {m.instruction && <span className="emp-ms-inst">{m.instruction}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </main>
      </div>
    </div>
  );
}
