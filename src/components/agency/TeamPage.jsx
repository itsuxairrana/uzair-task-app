import { useEffect, useMemo, useRef, useState } from 'react';
import { useTeamStore } from '../../store/teamStore';
import { useTaskStore } from '../../store/taskStore';
import { useUiStore } from '../../store/uiStore';
import { useAgencyStore } from '../../store/agencyStore';
import { deleteTaskFromDB } from '../../services/taskSyncApi';
import { localISO, daysUntil, fmtShortDate, timeAgo } from '../../utils/date';
import TaskForm from '../TaskForm';
import Icon from '../Icon';

const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
const FILTERS = [['open', 'Open'], ['done', 'Done'], ['all', 'All']];

// The real team view: employees from the server and the tasks they can see in their dashboard.
export default function TeamPage() {
  const employees = useTeamStore(s => s.employees);
  const serverTasks = useTeamStore(s => s.serverTasks);
  const loaded = useTeamStore(s => s.loaded);
  const error = useTeamStore(s => s.error);
  const loadServerTasks = useTeamStore(s => s.loadServerTasks);
  const loadEmployees = useTeamStore(s => s.loadEmployees);
  const localTasks = useTaskStore(s => s.tasks);
  const deleteTask = useTaskStore(s => s.deleteTask);
  const navFocus = useUiStore(s => s.navFocus);
  const clearFocus = useUiStore(s => s.clearFocus);
  const openSettings = useUiStore(s => s.openSettings);

  const [member, setMember]       = useState('all'); // employee name or 'all'
  const [filter, setFilter]       = useState('open');
  const [form, setForm]           = useState(null);  // { task } | { defaults }
  const [highlight, setHighlight] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const rowRefs = useRef({});

  const today = localISO();

  useEffect(() => { loadServerTasks(); }, [loadServerTasks]);

  // Arriving from a notification: show that task and flash it (state adjusted during render).
  const [seenFocus, setSeenFocus] = useState(null);
  if (navFocus?.taskId && navFocus !== seenFocus) {
    setSeenFocus(navFocus);
    setMember('all');
    setFilter('all');
    setHighlight(navFocus.taskId);
  }
  useEffect(() => { if (navFocus) clearFocus(); }, [navFocus, clearFocus]);

  useEffect(() => {
    if (!highlight) return;
    const el = rowRefs.current[highlight];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHighlight(null), 3200);
    return () => clearTimeout(t);
  }, [highlight, serverTasks]);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([loadEmployees(), loadServerTasks()]);
    setRefreshing(false);
  }

  const statsFor = name => {
    const mine = serverTasks.filter(t => (t.assignee_name || t.assigned_to) === name);
    return {
      open: mine.filter(t => t.status !== 'done').length,
      progress: mine.filter(t => t.status === 'in_progress').length,
      done: mine.filter(t => t.status === 'done').length,
      overdue: mine.filter(t => t.status !== 'done' && t.due_date && t.due_date < today).length,
    };
  };

  const shown = useMemo(() => serverTasks
    .filter(t => member === 'all' || (t.assignee_name || t.assigned_to) === member)
    .filter(t => filter === 'all' || (filter === 'done' ? t.status === 'done' : t.status !== 'done'))
    .sort((a, b) => {
      if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
      if (a.due_date !== b.due_date) return !a.due_date ? 1 : !b.due_date ? -1 : a.due_date.localeCompare(b.due_date);
      return (b.updated_at || '').localeCompare(a.updated_at || '');
    }), [serverTasks, member, filter]);

  // Group by employee; tasks whose employee was removed land in "Unassigned".
  const groups = useMemo(() => {
    const names = member === 'all' ? [...employees.map(e => e.name)] : [member];
    const out = names.map(name => ({ name, tasks: shown.filter(t => t.assignee_name === name) }));
    const orphans = shown.filter(t => !t.assignee_name);
    if (member === 'all' && orphans.length) out.push({ name: null, tasks: orphans });
    return out.filter(g => g.tasks.length > 0 || (member !== 'all'));
  }, [employees, shown, member]);

  function editTask(st) {
    const local = localTasks.find(t => t.id === st.id);
    setForm({ task: local || { ...st, milestones: (st.milestones || []).map(m => ({ ...m, done: !!Number(m.done) })) } });
  }

  async function removeTask(st) {
    if (!confirm(`Delete "${st.title}"? ${st.assignee_name || 'The employee'} will no longer see it.`)) return;
    if (localTasks.some(t => t.id === st.id)) deleteTask(st.id);
    else await deleteTaskFromDB(st.id);
    setTimeout(loadServerTasks, 400);
  }

  function closeForm() {
    setForm(null);
    setTimeout(loadServerTasks, 700); // let the background sync land first
  }

  if (employees.length === 0 && loaded) {
    return (
      <div className="page">
        <div className="empty empty-lg">
          <div className="empty-icon"><Icon name="users" size={22} /></div>
          <div className="empty-title">No team members yet</div>
          <div className="empty-sub">Add an employee to give them a login. Tasks you assign to them appear in their dashboard, and you get notified when they finish.</div>
          <button className="btn btn-primary" onClick={() => openSettings('team')}><Icon name="plus" size={15} /> Add employee</button>
        </div>
        <LegacyTeamTasks employees={employees} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-actions">
        <p className="page-lede">Tasks here are live in each employee's dashboard. You're notified when they mark one done.</p>
        <div className="page-actions-btns">
          <button className="btn btn-ghost btn-icon" onClick={refresh} title="Refresh" aria-label="Refresh" disabled={refreshing}>
            <Icon name="refresh" size={16} className={refreshing ? 'spin' : ''} />
          </button>
          <button className="btn btn-secondary" onClick={() => openSettings('team')}><Icon name="users" size={15} /> Manage members</button>
          <button className="btn btn-primary" onClick={() => setForm({ defaults: { assigned_to: member !== 'all' ? member : employees[0]?.name, workspace: 'team' } })} disabled={!employees.length}>
            <Icon name="plus" size={15} /> Assign task
          </button>
        </div>
      </div>

      {error && <div className="callout callout-red">{error}</div>}

      <div className="member-grid">
        <button className={'member-card' + (member === 'all' ? ' is-active' : '')} onClick={() => setMember('all')}>
          <span className="avatar avatar-muted"><Icon name="users" size={15} /></span>
          <span className="member-card-body">
            <span className="member-card-name">Everyone</span>
            <span className="member-card-meta">{serverTasks.filter(t => t.status !== 'done').length} open</span>
          </span>
        </button>
        {employees.map((e, i) => {
          const s = statsFor(e.name);
          return (
            <button key={e.id} className={'member-card' + (member === e.name ? ' is-active' : '')} onClick={() => setMember(e.name)}>
              <span className={`avatar avatar-c${i % 6}`}>{e.name.charAt(0).toUpperCase()}</span>
              <span className="member-card-body">
                <span className="member-card-name">{e.name}</span>
                <span className="member-card-meta">
                  {s.open} open{s.progress ? ` · ${s.progress} in progress` : ''}
                  {s.overdue > 0 && <span className="text-red"> · {s.overdue} overdue</span>}
                </span>
              </span>
              <span className="member-card-done" title="Completed">{s.done}<Icon name="check" size={12} /></span>
            </button>
          );
        })}
      </div>

      <div className="toolbar">
        <div className="segmented">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={'segmented-opt' + (filter === id ? ' is-active' : '')} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      </div>

      {!loaded ? (
        <div className="skeleton-list"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
      ) : groups.every(g => g.tasks.length === 0) ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="inbox" size={22} /></div>
          <div className="empty-title">{filter === 'done' ? 'Nothing completed yet' : 'No open team tasks'}</div>
          <div className="empty-sub">Use <strong>Assign task</strong>, or pick an employee in <strong>Assign to</strong> when creating any task.</div>
        </div>
      ) : groups.map(g => (
        <section key={g.name || 'unassigned'} className="team-group">
          <div className="team-group-head">
            <span className="team-group-name">{g.name || 'Unassigned (employee removed)'}</span>
            <span className="muted-small">{g.tasks.length} task{g.tasks.length !== 1 ? 's' : ''}</span>
          </div>
          {g.tasks.length === 0 ? (
            <div className="empty-inline">No {filter === 'done' ? 'completed' : filter === 'open' ? 'open' : ''} tasks for {g.name}.</div>
          ) : (
            <div className="list-card">
              {g.tasks.map(t => (
                <TeamTaskRow
                  key={t.id} t={t} today={today}
                  highlighted={highlight === t.id}
                  rowRef={el => { rowRefs.current[t.id] = el; }}
                  onEdit={() => editTask(t)} onDelete={() => removeTask(t)}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      <LegacyTeamTasks employees={employees} />

      {form && <TaskForm task={form.task || null} defaults={form.defaults} onClose={closeForm} />}
    </div>
  );
}

function TeamTaskRow({ t, today, highlighted, rowRef, onEdit, onDelete }) {
  const ms = t.milestones || [];
  const done = ms.filter(m => Number(m.done)).length;
  const days = daysUntil(t.due_date);
  const overdue = t.status !== 'done' && t.due_date && t.due_date < today;
  return (
    <div ref={rowRef} className={'list-row team-row' + (highlighted ? ' is-highlight' : '') + (t.status === 'done' ? ' is-done' : '')}>
      <span className={`status-dot status-${t.status}`} title={STATUS_LABEL[t.status]} />
      <div className="list-row-main">
        <div className="list-row-title">{t.title}</div>
        <div className="list-row-meta">
          <span className={`pill pill-${t.status}`}>{STATUS_LABEL[t.status] || t.status}</span>
          <span className={`prio prio-${t.priority}`}>{t.priority}</span>
          {t.due_date && (
            <span className={overdue ? 'text-red' : ''}>
              <Icon name="calendar" size={12} /> {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due ${fmtShortDate(t.due_date)}`}
            </span>
          )}
          {ms.length > 0 && (
            <span className="mini-progress" title={`${done} of ${ms.length} steps done`}>
              <span className="mini-progress-bar"><span style={{ width: `${Math.round((done / ms.length) * 100)}%` }} /></span>
              {done}/{ms.length} steps
            </span>
          )}
          {t.client_tag && <span className="chip chip-sm">{t.client_tag}</span>}
          {t.updated_at && <span className="muted-small">Updated {timeAgo(t.updated_at)}</span>}
        </div>
      </div>
      <div className="list-row-actions">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onEdit} title="Edit" aria-label="Edit"><Icon name="pencil" size={14} /></button>
        <button className="btn btn-ghost btn-icon btn-sm btn-danger-text" onClick={onDelete} title="Delete" aria-label="Delete"><Icon name="trash" size={14} /></button>
      </div>
    </div>
  );
}

// Team tasks from the old browser-only Team page. Employees never saw these — offer to move them over.
function LegacyTeamTasks({ employees }) {
  const teamTasks = useAgencyStore(s => s.teamTasks);
  const deleteTeamTask = useAgencyStore(s => s.deleteTeamTask);
  const addTask = useTaskStore(s => s.addTask);
  const [target, setTarget] = useState({});

  if (!teamTasks?.length) return null;

  function moveToEmployee(t) {
    const assignee = target[t.id] || employees.find(e => e.name === t.assignee)?.name || employees[0]?.name;
    if (!assignee) return;
    addTask({
      title: t.title,
      notes: [t.description, t.notes].filter(Boolean).join('\n'),
      due_date: t.deadline || '',
      status: t.status === 'done' ? 'done' : t.status === 'todo' ? 'todo' : 'in_progress',
      assigned_to: assignee,
      workspace: 'team',
      source: 'legacy_team',
    });
    deleteTeamTask(t.id);
    setTimeout(() => useTeamStore.getState().loadServerTasks(), 700);
  }

  return (
    <section className="team-group">
      <div className="callout callout-amber">
        <strong>{teamTasks.length} old team task{teamTasks.length !== 1 ? 's' : ''} saved only in this browser.</strong>{' '}
        The previous Team page never sent these to employees. Move them over or delete them.
      </div>
      <div className="list-card">
        {teamTasks.map(t => (
          <div key={t.id} className="list-row">
            <span className={`status-dot status-${t.status === 'pending_review' ? 'in_progress' : t.status}`} />
            <div className="list-row-main">
              <div className="list-row-title">{t.title}</div>
              <div className="list-row-meta">
                <span>For {t.assignee || '—'}</span>
                {t.deadline && <span>Due {fmtShortDate(t.deadline)}</span>}
              </div>
            </div>
            <div className="list-row-actions">
              {employees.length > 0 && (
                <>
                  <select className="select select-sm" value={target[t.id] || employees.find(e => e.name === t.assignee)?.name || employees[0].name} onChange={e => setTarget(p => ({ ...p, [t.id]: e.target.value }))} aria-label="Send to">
                    {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                  </select>
                  <button className="btn btn-secondary btn-sm" onClick={() => moveToEmployee(t)}>Send</button>
                </>
              )}
              <button className="btn btn-ghost btn-icon btn-sm btn-danger-text" onClick={() => { if (confirm(`Delete "${t.title}"?`)) deleteTeamTask(t.id); }} aria-label="Delete"><Icon name="trash" size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
