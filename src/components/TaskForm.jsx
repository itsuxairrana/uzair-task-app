import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTaskStore } from '../store/taskStore';
import { getTeam } from '../services/gmailApi';

const EMPTY = {
  title: '',
  notes: '',
  priority: 'medium',
  status: 'todo',
  due_date: '',
  due_time: '',
  assigned_to: 'Uzair',
  workspace: 'uzair_visuals',
  client_tag: '',
};

export default function TaskForm({ task, onClose }) {
  const { addTask, updateTask } = useTaskStore();
  const [form, setForm] = useState(EMPTY);
  const [milestones, setMilestones] = useState([]);
  const [newMs, setNewMs] = useState({ title: '', instruction: '' });
  const [teamMembers, setTeamMembers] = useState(() => ['Uzair', ...getTeam().map(m => m.name)]);

  useEffect(() => {
    const refresh = () => setTeamMembers(['Uzair', ...getTeam().map(m => m.name)]);
    window.addEventListener('team_updated', refresh);
    return () => window.removeEventListener('team_updated', refresh);
  }, []);

  useEffect(() => {
    if (task) {
      setForm({ ...EMPTY, ...task });
      setMilestones((task.milestones || []).map(m => ({ ...m })));
    } else {
      setForm(EMPTY);
      setMilestones([]);
    }
    setNewMs({ title: '', instruction: '' });
  }, [task]);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function updateMsField(idx, field, value) {
    setMilestones(ms => ms.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  }

  function removeMs(idx) {
    setMilestones(ms => ms.filter((_, i) => i !== idx));
  }

  function addNewMs() {
    if (!newMs.title.trim()) return;
    setMilestones(ms => [...ms, {
      id: uuidv4(),
      title: newMs.title.trim(),
      instruction: newMs.instruction.trim(),
      done: false,
    }]);
    setNewMs({ title: '', instruction: '' });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const payload = { ...form, milestones };
    if (task) {
      updateTask(task.id, payload);
    } else {
      addTask(payload);
    }
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2>{task ? 'Edit Task' : 'New Task'}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="task-form">
          <label>
            Title <span style={{ color: '#ef4444' }}>*</span>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
              required
            />
          </label>

          <label>
            Notes
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Additional context or description..."
              rows={2}
            />
          </label>

          <div className="form-row">
            <label>
              Priority
              <select value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>

            <label>
              Status
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              Due Date
              <input
                type="date"
                value={form.due_date}
                onChange={e => set('due_date', e.target.value)}
              />
            </label>

            <label>
              Due Time
              <input
                type="time"
                value={form.due_time}
                onChange={e => set('due_time', e.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Assign To
              <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
                {teamMembers.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>

            <label>
              Workspace
              <select value={form.workspace} onChange={e => set('workspace', e.target.value)}>
                <option value="uzair_visuals">Uzair Visuals</option>
                <option value="personal">Personal</option>
                <option value="client">Client Projects</option>
                <option value="team">Team Tasks</option>
              </select>
            </label>
          </div>

          <label>
            Client / Project Tag
            <input
              type="text"
              value={form.client_tag}
              onChange={e => set('client_tag', e.target.value)}
              placeholder="e.g. Horizon Media, Brand Refresh"
            />
          </label>

          {/* ── Milestones ── */}
          <div className="form-milestones">
            <div className="fm-header">
              <label>
                Milestones
                {milestones.length > 0 && <span className="fm-count">{milestones.length}</span>}
              </label>
            </div>

            {milestones.map((m, idx) => (
              <div key={m.id} className="fm-row">
                <span className="fm-num">{idx + 1}</span>
                <div className="fm-inputs">
                  <input
                    className="fm-title-input"
                    value={m.title}
                    onChange={e => updateMsField(idx, 'title', e.target.value)}
                    placeholder="Step title"
                  />
                  <input
                    className="fm-inst-input"
                    value={m.instruction}
                    onChange={e => updateMsField(idx, 'instruction', e.target.value)}
                    placeholder="How-to instruction (optional)"
                  />
                </div>
                <button type="button" className="fm-del-btn" onClick={() => removeMs(idx)} title="Remove step">×</button>
              </div>
            ))}

            {/* Add new milestone row */}
            <div className="fm-add-row">
              <input
                className="fm-title-input"
                value={newMs.title}
                onChange={e => setNewMs(n => ({ ...n, title: e.target.value }))}
                placeholder="New step title…"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewMs(); } }}
              />
              <input
                className="fm-inst-input"
                value={newMs.instruction}
                onChange={e => setNewMs(n => ({ ...n, instruction: e.target.value }))}
                placeholder="Instruction (optional)"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewMs(); } }}
              />
              <button
                type="button"
                className="fm-add-btn"
                onClick={addNewMs}
                disabled={!newMs.title.trim()}
              >
                + Add Step
              </button>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">
              {task ? 'Save Changes' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
