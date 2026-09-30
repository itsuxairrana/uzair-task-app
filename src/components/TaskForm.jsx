import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTaskStore, isEmployee } from '../store/taskStore';
import { getTeam } from '../services/gmailApi';
import Icon from './Icon';
import TimeInput from './TimeInput';

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

// `defaults` pre-fills a new task (e.g. { assigned_to, workspace } from the Team page).
export default function TaskForm({ task, defaults, onClose }) {
  const addTask = useTaskStore(s => s.addTask);
  const updateTask = useTaskStore(s => s.updateTask);
  const [form, setForm] = useState(() => task ? { ...EMPTY, ...task } : { ...EMPTY, ...defaults });
  const [milestones, setMilestones] = useState(() => (task?.milestones || []).map(m => ({ ...m })));
  const [newMs, setNewMs] = useState({ title: '', instruction: '' });
  const [teamMembers, setTeamMembers] = useState(() => ['Uzair', ...getTeam().map(m => m.name)]);

  useEffect(() => {
    const refresh = () => setTeamMembers(['Uzair', ...getTeam().map(m => m.name)]);
    window.addEventListener('team_updated', refresh);
    return () => window.removeEventListener('team_updated', refresh);
  }, []);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function updateMsField(idx, field, value) {
    setMilestones(ms => ms.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  }

  function addNewMs() {
    if (!newMs.title.trim()) return;
    setMilestones(ms => [...ms, { id: uuidv4(), title: newMs.title.trim(), instruction: newMs.instruction.trim(), done: false }]);
    setNewMs({ title: '', instruction: '' });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    // A step typed but not yet added is almost always meant to be kept.
    const pending = newMs.title.trim() ? [{ id: uuidv4(), title: newMs.title.trim(), instruction: newMs.instruction.trim(), done: false }] : [];
    const payload = { ...form, title: form.title.trim(), milestones: [...milestones.filter(m => m.title.trim()), ...pending] };
    // Tasks created on another device exist only on the server — adopt them locally with the same id.
    const existsLocally = task && useTaskStore.getState().tasks.some(t => t.id === task.id);
    if (existsLocally) updateTask(task.id, payload);
    else addTask(task ? { ...payload, id: task.id } : payload);
    onClose();
  }

  const assigneeOptions = teamMembers.includes(form.assigned_to) || !form.assigned_to ? teamMembers : [...teamMembers, form.assigned_to];

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" role="dialog" aria-label={task ? 'Edit task' : 'New task'}>
        <div className="modal-header">
          <h2>{task ? 'Edit task' : 'New task'}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body form">
          <input
            className="input input-title"
            type="text"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Task title"
            autoFocus
            required
            aria-label="Title"
          />
          <textarea
            className="textarea"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Notes, links, context…"
            rows={3}
            aria-label="Notes"
          />

          <div className="grid-3">
            <label className="field">
              <span className="field-label">Status</span>
              <select className="select" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Priority</span>
              <select className="select" value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Workspace</span>
              <select className="select" value={form.workspace} onChange={e => set('workspace', e.target.value)}>
                <option value="uzair_visuals">Uzair Visuals</option>
                <option value="personal">Personal</option>
                <option value="client">Client projects</option>
                <option value="team">Team</option>
              </select>
            </label>
          </div>

          <div className="grid-3">
            <label className="field">
              <span className="field-label">Due date</span>
              <input className="input" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </label>
            <div className="field" role="group" aria-label="Time">
              <span className="field-label">Time</span>
              <TimeInput value={form.due_time} onChange={v => set('due_time', v)} />
            </div>
            <label className="field">
              <span className="field-label">Assign to</span>
              <select className="select" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
                {assigneeOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
          {isEmployee(form.assigned_to) && (
            <div className="callout callout-accent">
              <Icon name="users" size={14} /> {form.assigned_to} will see this in their dashboard as soon as you save.
            </div>
          )}

          <label className="field">
            <span className="field-label">Client / project</span>
            <input className="input" type="text" value={form.client_tag} onChange={e => set('client_tag', e.target.value)} placeholder="e.g. Horizon Media" />
          </label>

          <div className="field">
            <span className="field-label">Steps {milestones.length > 0 && <span className="count">{milestones.length}</span>}</span>
            <div className="steps">
              {milestones.map((m, idx) => (
                <div key={m.id} className="step-row">
                  <span className="step-num">{idx + 1}</span>
                  <div className="step-inputs">
                    <input className="input input-sm" value={m.title} onChange={e => updateMsField(idx, 'title', e.target.value)} placeholder="Step" />
                    <input className="input input-sm input-quiet" value={m.instruction || ''} onChange={e => updateMsField(idx, 'instruction', e.target.value)} placeholder="How-to (optional)" />
                  </div>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setMilestones(ms => ms.filter((_, i) => i !== idx))} aria-label="Remove step"><Icon name="x" size={14} /></button>
                </div>
              ))}
              <div className="step-row step-row-new">
                <span className="step-num"><Icon name="plus" size={12} /></span>
                <div className="step-inputs">
                  <input
                    className="input input-sm" value={newMs.title}
                    onChange={e => setNewMs(n => ({ ...n, title: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewMs(); } }}
                    placeholder="Add a step — press Enter"
                  />
                  <input
                    className="input input-sm input-quiet" value={newMs.instruction}
                    onChange={e => setNewMs(n => ({ ...n, instruction: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewMs(); } }}
                    placeholder="How-to (optional)"
                  />
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addNewMs} disabled={!newMs.title.trim()}>Add</button>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{task ? 'Save changes' : 'Create task'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
