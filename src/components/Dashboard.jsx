import { useState, useEffect, useMemo } from 'react';
import { useTaskStore } from '../store/taskStore';
import TaskCard from './TaskCard';
import TaskForm from './TaskForm';
import { getTeam } from '../services/gmailApi';
import MorningHQ from './agency/MorningHQ';
import PlatformChecklist from './agency/PlatformChecklist';
import RevenueDashboard  from './agency/RevenueDashboard';
import ClientPipeline    from './agency/ClientPipeline';

const STATUS_OPTIONS = ['all', 'todo', 'in_progress', 'done'];
const PRIORITY_OPTIONS = ['all', 'high', 'medium', 'low'];

export default function Dashboard({ activeNav }) {
  const {
    tasks: allTasksRaw,
    getFilteredTasks, getTodayTasks, getOverdueTasks,
    filters, setFilter, activeWorkspace, getStatsByWorkspace,
  } = useTaskStore();

  const [editTask, setEditTask] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState(() => ['all', 'Uzair', ...getTeam().map(m => m.name)]);

  useEffect(() => {
    const refresh = () => setAssigneeOptions(['all', 'Uzair', ...getTeam().map(m => m.name)]);
    window.addEventListener('team_updated', refresh);
    return () => window.removeEventListener('team_updated', refresh);
  }, []);

  // Agency module routes — before any other logic
  if (activeNav === 'morning_hq')         return <MorningHQ />;
  if (activeNav === 'platform_checklist') return <PlatformChecklist />;
  if (activeNav === 'revenue')            return <RevenueDashboard />;
  if (activeNav === 'pipeline')           return <ClientPipeline />;

  // Sync view with sidebar nav
  const navView = activeNav === 'today' ? 'today' : activeNav === 'overdue' ? 'overdue' : 'all';
  const [view, setView] = useState(navView);
  useEffect(() => { setView(navView); }, [navView]);

  const stats = getStatsByWorkspace(activeWorkspace);
  const allTasks = getFilteredTasks();
  const todayTasks = getTodayTasks();
  const overdueTasks = getOverdueTasks();

  const displayTasks = view === 'today' ? todayTasks
    : view === 'overdue' ? overdueTasks
    : allTasks;

  // Unique platform tags from all tasks (only show tab bar when tags exist)
  const platforms = useMemo(() => {
    const tags = [...new Set(allTasksRaw.map(t => t.client_tag).filter(Boolean))].sort();
    return tags;
  }, [allTasksRaw]);

  function handleEdit(task) { setEditTask(task); setShowForm(true); }
  function handleAddNew() { setEditTask(null); setShowForm(true); }

  return (
    <div className="dashboard">

      {/* ── Stat cards ── */}
      <div className="stat-cards">
        <div className="stat-card">
          <div className="sc-num">{stats.total}</div>
          <div className="sc-label">Total Tasks</div>
        </div>
        <div className="stat-card sc-done">
          <div className="sc-num">{stats.done}</div>
          <div className="sc-label">Done</div>
        </div>
        <div className="stat-card sc-progress">
          <div className="sc-num">{stats.in_progress}</div>
          <div className="sc-label">In Progress</div>
        </div>
        <div className="stat-card sc-high">
          <div className="sc-num">{stats.high_priority}</div>
          <div className="sc-label">High Priority</div>
        </div>
      </div>

      {/* ── Platform filter tabs (shown only when tasks have tags) ── */}
      {platforms.length > 0 && (
        <div className="platform-tabs">
          <button
            className={'ptab' + (filters.clientTag === 'all' ? ' ptab-active' : '')}
            onClick={() => setFilter('clientTag', 'all')}
          >
            All
          </button>
          {platforms.map(tag => (
            <button
              key={tag}
              className={'ptab' + (filters.clientTag === tag ? ' ptab-active' : '')}
              onClick={() => setFilter('clientTag', tag)}
            >
              {tag.charAt(0).toUpperCase() + tag.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="db-toolbar">
        <div className="view-tabs">
          {[
            { id: 'all',     label: 'All Tasks' },
            { id: 'today',   label: `Today${todayTasks.length ? ' · ' + todayTasks.length : ''}` },
            { id: 'overdue', label: `Overdue${overdueTasks.length ? ' · ' + overdueTasks.length : ''}` },
          ].map(t => (
            <button
              key={t.id}
              className={'vt-btn' + (view === t.id ? ' vt-active' : '') + (t.id === 'overdue' && overdueTasks.length ? ' vt-overdue' : '')}
              onClick={() => setView(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="db-filters">
          <select value={filters.status} onChange={e => setFilter('status', e.target.value)}>
            {STATUS_OPTIONS.map(o => (
              <option key={o} value={o}>{o === 'all' ? 'All Status' : o.replace('_', ' ')}</option>
            ))}
          </select>
          <select value={filters.priority} onChange={e => setFilter('priority', e.target.value)}>
            {PRIORITY_OPTIONS.map(o => (
              <option key={o} value={o}>{o === 'all' ? 'All Priority' : o.charAt(0).toUpperCase() + o.slice(1)}</option>
            ))}
          </select>
          <select value={filters.assignee} onChange={e => setFilter('assignee', e.target.value)}>
            {assigneeOptions.map(o => (
              <option key={o} value={o}>{o === 'all' ? 'All Assignees' : o}</option>
            ))}
          </select>
        </div>

        <button className="add-task-btn" onClick={handleAddNew}>
          + Add Task
        </button>
      </div>

      {/* ── Task list ── */}
      <div className="task-list">
        {displayTasks.length === 0 ? (
          <div className="empty-state">
            {view === 'today' && <><div className="empty-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="2" y="4" width="24" height="22" rx="3.5" stroke="currentColor" strokeWidth="1.6"/><path d="M2 10h24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M8 2v4M20 2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M8 17h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></div><p>No tasks due today.</p></>}
            {view === 'overdue' && <><div className="empty-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="1.6"/><path d="M14 8v6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="14" cy="20" r="1.2" fill="currentColor"/></svg></div><p>No overdue tasks — great job!</p></>}
            {view === 'all' && (
              <>
                <div className="empty-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="2" y="2" width="24" height="24" rx="4" stroke="currentColor" strokeWidth="1.6"/><path d="M8 14h12M8 9h12M8 19h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></div>
                <p>No tasks yet.</p>
                <p className="empty-sub">Open the AI chat and describe your work, or click <strong>+ Add Task</strong>.</p>
              </>
            )}
          </div>
        ) : (
          displayTasks.map(task => (
            <TaskCard key={task.id} task={task} onEdit={handleEdit} />
          ))
        )}
      </div>

      {showForm && (
        <TaskForm
          task={editTask}
          onClose={() => { setShowForm(false); setEditTask(null); }}
        />
      )}
    </div>
  );
}
