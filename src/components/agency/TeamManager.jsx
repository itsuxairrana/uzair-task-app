import { useState } from 'react';
import { useAgencyStore } from '../../store/agencyStore';

const ASSIGNEES = ['Junaid', 'Hamza', 'Collaborator'];
const STATUSES  = ['todo', 'in_progress', 'pending_review', 'done'];

const STATUS_LABEL = {
  todo:           'To Do',
  in_progress:    'In Progress',
  pending_review: 'Pending Review',
  done:           'Done',
};

const STATUS_COLOR = {
  todo:           'agency-badge-grey',
  in_progress:    'agency-badge-blue',
  pending_review: 'agency-badge-orange',
  done:           'agency-badge-green',
};

const EMPTY = { assignee: 'Junaid', title: '', description: '', deadline: '', notes: '', status: 'todo' };

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date(new Date().toISOString().split('T')[0])) / 86400000);
}

export default function TeamManager() {
  const { teamTasks, addTeamTask, updateTeamTask, deleteTeamTask, approveTeamTask } = useAgencyStore();

  const [showAdd,  setShowAdd]  = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [form,     setForm]     = useState(EMPTY);

  function openAdd()   { setForm(EMPTY); setEditTask(null); setShowAdd(true); }
  function openEdit(t) { setForm({ assignee: t.assignee, title: t.title, description: t.description || '', deadline: t.deadline || '', notes: t.notes || '', status: t.status }); setEditTask(t); setShowAdd(true); }

  function handleSubmit(e) {
    e.preventDefault();
    if (editTask) {
      updateTeamTask(editTask.id, { ...form });
    } else {
      addTeamTask({ ...form });
    }
    setShowAdd(false);
  }

  function advance(task) {
    const next = { todo: 'in_progress', in_progress: 'pending_review' };
    if (next[task.status]) updateTeamTask(task.id, { status: next[task.status] });
  }

  // Pending count per person (not done)
  function pendingCount(assignee) {
    return teamTasks.filter(t => t.assignee === assignee && t.status !== 'done').length;
  }

  // Total pending across all (for header badge)
  const totalPending = teamTasks.filter(t => t.status !== 'done').length;

  return (
    <div className="agency-page">

      {/* Header */}
      <div className="agency-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="agency-page-title">Team Tasks</div>
          {totalPending > 0 && (
            <span className="agency-badge agency-badge-orange">{totalPending} pending</span>
          )}
        </div>
        <button className="agency-btn agency-btn-primary" onClick={openAdd}>+ Add Task</button>
      </div>

      {/* 3 sections — one per assignee */}
      {ASSIGNEES.map(person => {
        const tasks = teamTasks.filter(t => t.assignee === person);
        const pending = pendingCount(person);

        return (
          <div key={person} style={{ marginBottom: 24 }}>

            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: person === 'Junaid' ? '#f97316' : person === 'Hamza' ? '#0057B8' : '#8b5cf6',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13, flexShrink: 0,
              }}>
                {person[0]}
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{person}</span>
              {pending > 0 && (
                <span className="agency-badge agency-badge-orange" style={{ fontSize: 10 }}>
                  {pending} pending
                </span>
              )}
            </div>

            {/* Task cards */}
            {tasks.length === 0 ? (
              <div style={{ fontSize: 12, color: '#cbd5e1', paddingLeft: 40, paddingBottom: 4 }}>
                No tasks assigned
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 40 }}>
                {tasks.map(t => {
                  const days    = daysUntil(t.deadline);
                  const overdue = days !== null && days < 0 && t.status !== 'done';
                  const urgent  = days !== null && days <= 2 && days >= 0 && t.status !== 'done';

                  return (
                    <div key={t.id} className="agency-card" style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>

                        {/* Left: title + description */}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
                            <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{t.title}</span>
                            <span className={`agency-badge ${STATUS_COLOR[t.status]}`} style={{ fontSize: 10 }}>
                              {STATUS_LABEL[t.status]}
                            </span>
                            {t.uzair_approved && (
                              <span className="agency-badge agency-badge-green" style={{ fontSize: 10 }}>✓ Approved</span>
                            )}
                          </div>

                          {t.description && (
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{t.description}</div>
                          )}

                          {t.deadline && (
                            <div style={{ fontSize: 11, color: overdue ? '#b91c1c' : urgent ? '#d97706' : '#94a3b8', fontWeight: overdue || urgent ? 600 : 400, marginBottom: 4 }}>
                              {overdue ? `⚠ Overdue by ${Math.abs(days)}d` : urgent ? `⚡ Due in ${days}d` : `Due ${t.deadline}`}
                            </div>
                          )}

                          {t.notes && (
                            <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>{t.notes}</div>
                          )}
                        </div>

                        {/* Right: action buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
                          {t.status === 'todo' && (
                            <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => advance(t)}>
                              ▶ Start
                            </button>
                          )}
                          {t.status === 'in_progress' && (
                            <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => advance(t)}>
                              ↑ Send for review
                            </button>
                          )}
                          {t.status === 'pending_review' && (
                            <button className="agency-btn agency-btn-primary agency-btn-sm" onClick={() => approveTeamTask(t.id)}>
                              ✓ Approve
                            </button>
                          )}
                          <button className="agency-btn agency-btn-secondary agency-btn-sm" onClick={() => openEdit(t)}>Edit</button>
                          <button className="agency-btn agency-btn-danger agency-btn-sm" onClick={() => { if (confirm(`Delete "${t.title}"?`)) deleteTeamTask(t.id); }}>✕</button>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        );
      })}

      {/* Empty state if no tasks at all */}
      {teamTasks.length === 0 && (
        <div className="agency-card" style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', marginTop: -8 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
          <div style={{ fontSize: 14 }}>No team tasks yet. Click <strong>+ Add Task</strong> to assign work.</div>
        </div>
      )}

      {/* Add / Edit modal */}
      {showAdd && (
        <div className="agency-modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="agency-modal">
            <div className="agency-modal-title">{editTask ? 'Edit Task' : 'Add Team Task'}</div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Assign To</label>
                  <select className="agency-form-select" value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}>
                    {ASSIGNEES.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>

                <div className="agency-form-row" style={{ margin: 0 }}>
                  <label className="agency-form-label">Deadline</label>
                  <input className="agency-form-input" type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
                </div>

                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Task Title *</label>
                  <input className="agency-form-input" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Design 3 logo concepts" />
                </div>

                <div className="agency-form-row" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="agency-form-label">Description</label>
                  <textarea className="agency-form-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Additional details" />
                </div>

                {editTask && (
                  <div className="agency-form-row" style={{ margin: 0 }}>
                    <label className="agency-form-label">Status</label>
                    <select className="agency-form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </div>
                )}

                <div className="agency-form-row" style={{ margin: 0, gridColumn: editTask ? 'auto' : '1 / -1' }}>
                  <label className="agency-form-label">Notes</label>
                  <input className="agency-form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
                </div>

              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="agency-btn agency-btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="agency-btn agency-btn-primary">{editTask ? 'Save Changes' : 'Add Task'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
