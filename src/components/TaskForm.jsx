import { useState, useEffect } from 'react';
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
  const [teamMembers, setTeamMembers] = useState(() => ['Uzair', ...getTeam().map(m => m.name)]);

  useEffect(() => {
    const refresh = () => setTeamMembers(['Uzair', ...getTeam().map(m => m.name)]);
    window.addEventListener('team_updated', refresh);
    return () => window.removeEventListener('team_updated', refresh);
  }, []);

  useEffect(() => {
    if (task) setForm({ ...EMPTY, ...task });
    else setForm(EMPTY);
  }, [task]);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (task) {
      updateTask(task.id, form);
    } else {
      addTask(form);
    }
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{task ? 'Edit Task' : 'Add Task'}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="task-form">
          <label>
            Title *
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
              placeholder="Additional context..."
              rows={3}
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
              placeholder="e.g. Rehman Foods"
            />
          </label>

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
