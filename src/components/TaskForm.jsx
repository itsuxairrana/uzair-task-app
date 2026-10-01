import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTaskStore, isEmployee, whenSynced } from '../store/taskStore';
import { uploadFile, postComment, MAX_FILE_MB } from '../services/collabApi';
import { AttachButton, PendingFiles } from './Attachments';
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
  // Files are kept in the browser until save, then uploaded to the task's conversation.
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
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

  function pickFiles(list) {
    const fresh = [...list].slice(0, 10 - files.length).map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`, file: f, name: f.name, size: f.size, progress: 0,
      status: f.size > MAX_FILE_MB * 1024 * 1024 || !f.size ? 'error' : 'ready',
      error: !f.size ? 'Empty file' : f.size > MAX_FILE_MB * 1024 * 1024 ? `Over ${MAX_FILE_MB} MB` : '',
    }));
    setFiles(cur => [...cur, ...fresh]);
  }

  async function uploadAll(taskId) {
    const ready = files.filter(f => f.status === 'ready');
    if (!ready.length) return;
    setSaving(true);
    setSaveError('');
    if (!(await whenSynced(taskId))) throw new Error("The task couldn't be saved to the server, so the files weren't sent.");
    const ids = [];
    for (const it of ready) {
      setFiles(cur => cur.map(f => (f.key === it.key ? { ...f, status: 'uploading' } : f)));
      const up = await uploadFile(taskId, it.file, p => setFiles(cur => cur.map(f => (f.key === it.key ? { ...f, progress: p } : f))));
      ids.push(up.id);
      setFiles(cur => cur.map(f => (f.key === it.key ? { ...f, status: 'done' } : f)));
    }
    await postComment(taskId, '', ids);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || saving) return;
    // A step typed but not yet added is almost always meant to be kept.
    const pending = newMs.title.trim() ? [{ id: uuidv4(), title: newMs.title.trim(), instruction: newMs.instruction.trim(), done: false }] : [];
    const payload = { ...form, title: form.title.trim(), milestones: [...milestones.filter(m => m.title.trim()), ...pending] };
    // Tasks created on another device exist only on the server — adopt them locally with the same id.
    const existsLocally = task && useTaskStore.getState().tasks.some(t => t.id === task.id);
    const sendFiles = isEmployee(form.assigned_to) && files.some(f => f.status === 'ready');
    const id = task?.id || uuidv4();
    if (existsLocally) updateTask(id, payload);
    else addTask({ ...payload, id });
    if (!sendFiles) return onClose();
    try {
      await uploadAll(id);
      onClose();
    } catch (err) {
      setSaving(false);
      setSaveError(`Task saved, but the files didn't upload: ${err.message} You can attach them in the task's conversation.`);
    }
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

          <div className="field">
            <span className="field-label">Files {files.length > 0 && <span className="count">{files.length}</span>}</span>
            {isEmployee(form.assigned_to) ? (
              <>
                <PendingFiles items={files} onRemove={it => setFiles(cur => cur.filter(f => f.key !== it.key))} />
                {files.length < 10 && !saving && <div><AttachButton onFiles={pickFiles} className="link-btn" label="Attach files" /></div>}
                {files.length > 0 && <div className="muted-small">Sent to {form.assigned_to} in the task's conversation when you save (up to {MAX_FILE_MB} MB each).</div>}
              </>
            ) : (
              <div className="muted-small">Assign the task to a team member to attach files for them.</div>
            )}
          </div>
          {saveError && <div className="form-msg form-msg-err">{saveError}</div>}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>{saveError ? 'Close' : 'Cancel'}</button>
            {!saveError && (
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Uploading files…' : task ? 'Save changes' : 'Create task'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
