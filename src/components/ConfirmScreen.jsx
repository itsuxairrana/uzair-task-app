import { useState } from 'react';
import { useTaskStore } from '../store/taskStore';
import { isSignedIn } from '../services/googleAuth';
import { pushTasksToCalendar } from '../services/calendarApi';
import { pushTasksToGoogleTasks } from '../services/tasksApi';
import { getTeam } from '../services/gmailApi';

export default function ConfirmScreen({ onDone }) {
  const { pendingTasks, updatePendingTask, removePendingTask, confirmPendingTasks, discardPendingTasks, setGoogleIds } = useTaskStore();
  const [selected, setSelected] = useState(() => new Set(pendingTasks.map(t => t.id)));
  const teamMembers = ['Uzair', ...getTeam().map(m => m.name)];
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  if (pendingTasks.length === 0) return null;

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === pendingTasks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingTasks.map(t => t.id)));
    }
  }

  async function handleSaveAll() {
    const saved = confirmPendingTasks([...selected]);
    if (isSignedIn() && saved.length > 0) {
      setSyncing(true);
      setSyncStatus('Pushing to Google…');
      try {
        const [calResults, taskResults] = await Promise.all([
          pushTasksToCalendar(saved.filter(t => t.due_date)),
          pushTasksToGoogleTasks(saved),
        ]);
        // Update google IDs in store
        const calMap = Object.fromEntries(calResults.map(r => [r.taskId, r.eventId]));
        const taskMap = Object.fromEntries(taskResults.map(r => [r.taskId, r.googleTaskId]));
        for (const task of saved) {
          setGoogleIds(task.id, {
            google_calendar_event_id: calMap[task.id] || null,
            google_task_id: taskMap[task.id] || null,
          });
        }
        setSyncStatus(`Synced ${saved.length} task(s) to Google!`);
      } catch (err) {
        setSyncStatus(`Saved locally. Google sync failed: ${err.message}`);
      } finally {
        setSyncing(false);
        setTimeout(onDone, 1500);
      }
    } else {
      onDone();
    }
  }

  function handleDiscard() {
    discardPendingTasks();
    onDone();
  }

  return (
    <div className="modal-overlay">
      <div className="modal confirm-modal">
        <div className="modal-header">
          <h2>Review AI Tasks</h2>
          <span className="modal-subtitle">{pendingTasks.length} task(s) parsed from Claude</span>
        </div>

        <div className="confirm-toolbar">
          <label className="select-all">
            <input
              type="checkbox"
              checked={selected.size === pendingTasks.length}
              onChange={toggleAll}
            />
            Select All
          </label>
          <span className="selected-count">{selected.size} selected</span>
        </div>

        <div className="confirm-task-list">
          {pendingTasks.map(task => (
            <div key={task.id} className={`confirm-task-item${selected.has(task.id) ? ' selected' : ''}`}>
              <input
                type="checkbox"
                checked={selected.has(task.id)}
                onChange={() => toggleSelect(task.id)}
              />
              <div className="confirm-task-body">
                <input
                  className="confirm-title-input"
                  value={task.title}
                  onChange={e => updatePendingTask(task.id, { title: e.target.value })}
                />
                <div className="confirm-task-row">
                  <select
                    value={task.priority}
                    onChange={e => updatePendingTask(task.id, { priority: e.target.value })}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <input
                    type="date"
                    value={task.due_date}
                    onChange={e => updatePendingTask(task.id, { due_date: e.target.value })}
                  />
                  <input
                    type="time"
                    value={task.due_time}
                    onChange={e => updatePendingTask(task.id, { due_time: e.target.value })}
                  />
                  <select
                    value={task.assigned_to}
                    onChange={e => updatePendingTask(task.id, { assigned_to: e.target.value })}
                  >
                    {teamMembers.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <select
                    value={task.workspace}
                    onChange={e => updatePendingTask(task.id, { workspace: e.target.value })}
                  >
                    <option value="uzair_visuals">Uzair Visuals</option>
                    <option value="personal">Personal</option>
                    <option value="client">Client Projects</option>
                    <option value="team">Team Tasks</option>
                  </select>
                </div>
                {task.notes && <p className="confirm-notes">{task.notes}</p>}
              </div>
              <button
                className="remove-btn"
                onClick={() => { removePendingTask(task.id); selected.delete(task.id); setSelected(new Set(selected)); }}
                title="Remove this task"
              >✕</button>
            </div>
          ))}
        </div>

        {syncStatus && <div className="sync-status">{syncStatus}</div>}

        <div className="confirm-actions">
          <button className="btn-secondary" onClick={handleDiscard}>Discard All</button>
          <button
            className="btn-primary"
            onClick={handleSaveAll}
            disabled={selected.size === 0 || syncing}
          >
            {syncing ? 'Saving…' : `Save ${selected.size} Task(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
