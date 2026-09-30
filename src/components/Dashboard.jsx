import { useState, useEffect, useMemo } from 'react';
import { useTaskStore } from '../store/taskStore';
import { useUiStore } from '../store/uiStore';
import TaskCard from './TaskCard';
import TaskForm from './TaskForm';
import Icon from './Icon';
import { getTeam } from '../services/gmailApi';
import { localISO } from '../utils/date';
import MorningHQ from './agency/MorningHQ';
import PlatformChecklist from './agency/PlatformChecklist';
import RevenueDashboard  from './agency/RevenueDashboard';
import ClientPipeline    from './agency/ClientPipeline';
import ProjectTracker    from './agency/ProjectTracker';
import TeamPage          from './agency/TeamPage';
import ContentCalendar   from './agency/ContentCalendar';
import WeeklyReview      from './agency/WeeklyReview';
import DailyTasks        from './agency/DailyTasks';

const PAGES = {
  morning_hq:         MorningHQ,
  platform_checklist: PlatformChecklist,
  revenue:            RevenueDashboard,
  pipeline:           ClientPipeline,
  projects:           ProjectTracker,
  team:               TeamPage,
  content_calendar:   ContentCalendar,
  weekly_review:      WeeklyReview,
  daily_tasks:        DailyTasks,
};

export default function Dashboard({ activeNav }) {
  const Page = PAGES[activeNav];
  if (Page) return <Page key={activeNav} />;
  return <TaskList view={activeNav === 'today' ? 'today' : activeNav === 'overdue' ? 'overdue' : 'all'} />;
}

const STATUS_OPTIONS   = [['all', 'Any status'], ['todo', 'To do'], ['in_progress', 'In progress'], ['done', 'Done']];
const PRIORITY_OPTIONS = [['all', 'Any priority'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];

function TaskList({ view }) {
  const allTasksRaw = useTaskStore(s => s.tasks);
  const filters = useTaskStore(s => s.filters);
  const setFilter = useTaskStore(s => s.setFilter);
  const activeWorkspace = useTaskStore(s => s.activeWorkspace);
  const navigate = useUiStore(s => s.navigate);

  const [editTask, setEditTask] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState(() => ['Uzair', ...getTeam().map(m => m.name)]);

  useEffect(() => {
    const refresh = () => setAssigneeOptions(['Uzair', ...getTeam().map(m => m.name)]);
    window.addEventListener('team_updated', refresh);
    return () => window.removeEventListener('team_updated', refresh);
  }, []);

  const today = localISO();
  const inWorkspace = activeWorkspace === 'all' ? allTasksRaw : allTasksRaw.filter(t => t.workspace === activeWorkspace);
  const stats = {
    total: inWorkspace.length,
    done: inWorkspace.filter(t => t.status === 'done').length,
    in_progress: inWorkspace.filter(t => t.status === 'in_progress').length,
    high_priority: inWorkspace.filter(t => t.priority === 'high' && t.status !== 'done').length,
  };
  const allTasks = inWorkspace.filter(t =>
    (filters.status === 'all' || t.status === filters.status) &&
    (filters.priority === 'all' || t.priority === filters.priority) &&
    (filters.assignee === 'all' || t.assigned_to === filters.assignee) &&
    (filters.clientTag === 'all' || t.client_tag === filters.clientTag));
  const dueToday = inWorkspace.filter(t => t.due_date === today);
  const todayTasks = dueToday.filter(t => t.status !== 'done');
  const overdueTasks = inWorkspace.filter(t => t.due_date && t.due_date < today && t.status !== 'done');
  const displayTasks = view === 'today' ? dueToday : view === 'overdue' ? overdueTasks : allTasks;

  // Open tasks first, then by due date (undated last), then newest.
  const sorted = useMemo(() => [...displayTasks].sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
    if (a.due_date !== b.due_date) return !a.due_date ? 1 : !b.due_date ? -1 : a.due_date.localeCompare(b.due_date);
    return (b.created_at || '').localeCompare(a.created_at || '');
  }), [displayTasks]);

  const tags = useMemo(() => [...new Set(allTasksRaw.map(t => t.client_tag).filter(t => t && t !== 'N/A'))].sort(), [allTasksRaw]);
  const filtersActive = filters.status !== 'all' || filters.priority !== 'all' || filters.assignee !== 'all' || filters.clientTag !== 'all';

  function handleEdit(task) { setEditTask(task); setShowForm(true); }
  function handleAddNew() { setEditTask(null); setShowForm(true); }
  function clearFilters() { ['status', 'priority', 'assignee', 'clientTag'].forEach(k => setFilter(k, 'all')); }

  return (
    <div className="page">
      <div className="stats-row">
        <Stat label="Open" value={stats.total - stats.done} />
        <Stat label="In progress" value={stats.in_progress} tone="accent" />
        <Stat label="High priority" value={stats.high_priority} tone="red" />
        <Stat label="Done" value={stats.done} tone="green" />
      </div>

      <div className="toolbar">
        <div className="segmented">
          {[
            { id: 'all',     nav: 'tasks',   label: 'All' },
            { id: 'today',   nav: 'today',   label: 'Today',   count: todayTasks.length },
            { id: 'overdue', nav: 'overdue', label: 'Overdue', count: overdueTasks.length, danger: true },
          ].map(t => (
            <button key={t.id} className={'segmented-opt' + (view === t.id ? ' is-active' : '')} onClick={() => navigate(t.nav)}>
              {t.label}
              {t.count > 0 && <span className={'seg-count' + (t.danger ? ' is-danger' : '')}>{t.count}</span>}
            </button>
          ))}
        </div>

        {view === 'all' && (
          <div className="filters">
            <select className="select select-sm" value={filters.status} onChange={e => setFilter('status', e.target.value)} aria-label="Status">
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="select select-sm" value={filters.priority} onChange={e => setFilter('priority', e.target.value)} aria-label="Priority">
              {PRIORITY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="select select-sm" value={filters.assignee} onChange={e => setFilter('assignee', e.target.value)} aria-label="Assignee">
              <option value="all">Anyone</option>
              {assigneeOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {tags.length > 0 && (
              <select className="select select-sm" value={filters.clientTag} onChange={e => setFilter('clientTag', e.target.value)} aria-label="Client">
                <option value="all">Any client</option>
                {tags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {filtersActive && <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>}
          </div>
        )}

        <button className="btn btn-primary toolbar-end" onClick={handleAddNew}>
          <Icon name="plus" size={15} /> New task
        </button>
      </div>

      <div className="task-list">
        {sorted.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><Icon name={view === 'overdue' ? 'checkCircle' : view === 'today' ? 'calendar' : 'listChecks'} size={22} /></div>
            <div className="empty-title">
              {view === 'today' ? 'Nothing due today' : view === 'overdue' ? 'No overdue tasks' : filtersActive ? 'No tasks match these filters' : 'No tasks yet'}
            </div>
            <div className="empty-sub">
              {view === 'overdue' ? 'Nice — everything is on schedule.' : 'Add one with New task, or describe your work to the AI assistant.'}
            </div>
            {filtersActive && view === 'all' && <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear filters</button>}
          </div>
        ) : sorted.map(task => <TaskCard key={task.id} task={task} onEdit={handleEdit} />)}
      </div>

      {showForm && <TaskForm task={editTask} onClose={() => { setShowForm(false); setEditTask(null); }} />}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={'stat' + (tone ? ` stat-${tone}` : '')}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
