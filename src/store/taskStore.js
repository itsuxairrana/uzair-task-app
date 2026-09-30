import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { deleteTaskFromDB, syncTask } from '../services/taskSyncApi';
import { getTeam } from '../services/gmailApi';

const LS_KEY = 'uzair_task_os_tasks';

function loadFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveToStorage(tasks) {
  localStorage.setItem(LS_KEY, JSON.stringify(tasks));
}

// Employees (from the server's user list, mirrored in localStorage by App).
export function isEmployee(name) {
  return !!name && getTeam().some(m => m.name === name);
}

// Keep the server copy in step with the local one: employees only see tasks that live on the server.
function syncAssignment(before, after) {
  if (after && isEmployee(after.assigned_to)) syncTask(after);
  else if (before && isEmployee(before.assigned_to)) deleteTaskFromDB(before.id).catch(() => {});
}

export const useTaskStore = create((set, get) => ({
  // ── State ───────────────────────────────────────────────────────────────────
  tasks: loadFromStorage(),
  pendingTasks: [],
  activeWorkspace: 'all',
  filters: {
    status: 'all',
    priority: 'all',
    assignee: 'all',
    clientTag: 'all',
  },

  // ── Task CRUD ───────────────────────────────────────────────────────────────

  addTask(task) {
    const newTask = {
      id: uuidv4(),
      title: '',
      notes: '',
      priority: 'medium',
      status: 'todo',
      due_date: '',
      due_time: '',
      assigned_to: 'Uzair',
      workspace: 'uzair_visuals',
      client_tag: '',
      source: 'manual',
      created_at: new Date().toISOString(),
      milestones: [],          // ← { id, title, instruction, done }
      google_calendar_event_id: null,
      google_task_id: null,
      ...task,
    };
    set(state => {
      const tasks = [...state.tasks, newTask];
      saveToStorage(tasks);
      return { tasks };
    });
    syncAssignment(null, newTask);
    return newTask;
  },

  addTasks(taskArray) {
    set(state => {
      const tasks = [...state.tasks, ...taskArray];
      saveToStorage(tasks);
      return { tasks };
    });
    taskArray.forEach(t => syncAssignment(null, t));
  },

  // `fromServer` = the change came from the server (employee update), so don't echo it back.
  updateTask(id, updates, { fromServer = false } = {}) {
    const before = get().tasks.find(t => t.id === id);
    set(state => {
      const tasks = state.tasks.map(t => t.id === id ? { ...t, ...updates } : t);
      saveToStorage(tasks);
      return { tasks };
    });
    if (!fromServer) syncAssignment(before, get().tasks.find(t => t.id === id));
  },

  deleteTask(id) {
    deleteTaskFromDB(id).catch(() => {});
    set(state => {
      const tasks = state.tasks.filter(t => t.id !== id);
      saveToStorage(tasks);
      return { tasks };
    });
  },

  setTaskStatus(id, status) {
    get().updateTask(id, { status });
  },

  // ── Milestone actions ────────────────────────────────────────────────────────

  toggleMilestone(taskId, milestoneId) {
    set(state => {
      const tasks = state.tasks.map(t => {
        if (t.id !== taskId) return t;
        const milestones = (t.milestones || []).map(m =>
          m.id === milestoneId ? { ...m, done: !m.done } : m
        );
        // Auto-advance task status when all milestones done
        const allDone = milestones.length > 0 && milestones.every(m => m.done);
        return { ...t, milestones, status: allDone ? 'done' : t.status === 'done' ? 'in_progress' : t.status };
      });
      saveToStorage(tasks);
      return { tasks };
    });
    syncAssignment(null, get().tasks.find(t => t.id === taskId));
  },

  // ── Google sync ─────────────────────────────────────────────────────────────

  setGoogleIds(id, { google_calendar_event_id, google_task_id }) {
    get().updateTask(id, { google_calendar_event_id, google_task_id }, { fromServer: true });
  },

  // Apply status/milestone changes employees made on the server to the local copies.
  applyServerTasks(serverTasks) {
    const byId = new Map(serverTasks.map(t => [t.id, t]));
    let changed = false;
    const tasks = get().tasks.map(t => {
      const s = byId.get(t.id);
      if (!s) return t;
      const milestones = (t.milestones || []).map(m => {
        const sm = (s.milestones || []).find(x => x.id === m.id);
        return sm && !!sm.done !== !!m.done ? { ...m, done: !!sm.done } : m;
      });
      const msChanged = milestones.some((m, i) => m !== (t.milestones || [])[i]);
      if (s.status === t.status && !msChanged) return t;
      changed = true;
      return { ...t, status: s.status, milestones };
    });
    if (changed) { saveToStorage(tasks); set({ tasks }); }
  },

  // ── Pending tasks (AI confirm screen) ───────────────────────────────────────

  setPendingTasks(tasks) {
    set({ pendingTasks: tasks });
  },

  updatePendingTask(id, updates) {
    set(state => ({
      pendingTasks: state.pendingTasks.map(t => t.id === id ? { ...t, ...updates } : t),
    }));
  },

  removePendingTask(id) {
    set(state => ({
      pendingTasks: state.pendingTasks.filter(t => t.id !== id),
    }));
  },

  confirmPendingTasks(selectedIds) {
    const { pendingTasks, addTasks } = get();
    const toSave = selectedIds
      ? pendingTasks.filter(t => selectedIds.includes(t.id))
      : pendingTasks;
    addTasks(toSave);
    set({ pendingTasks: [] });
    return toSave;
  },

  discardPendingTasks() {
    set({ pendingTasks: [] });
  },

  // ── Workspace / Filter ───────────────────────────────────────────────────────

  setActiveWorkspace(workspace) {
    set({ activeWorkspace: workspace });
  },

  setFilter(key, value) {
    set(state => ({
      filters: { ...state.filters, [key]: value },
    }));
  },

  // ── Derived selectors ────────────────────────────────────────────────────────

  getFilteredTasks() {
    const { tasks, activeWorkspace, filters } = get();
    return tasks.filter(task => {
      if (activeWorkspace !== 'all' && task.workspace !== activeWorkspace) return false;
      if (filters.status !== 'all' && task.status !== filters.status) return false;
      if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
      if (filters.assignee !== 'all' && task.assigned_to !== filters.assignee) return false;
      if (filters.clientTag !== 'all' && task.client_tag !== filters.clientTag) return false;
      return true;
    });
  },

  getTodayTasks() {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return get().tasks.filter(t => t.due_date === today);
  },

  getOverdueTasks() {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return get().tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done');
  },

  getStatsByWorkspace(workspace) {
    const tasks = workspace === 'all'
      ? get().tasks
      : get().tasks.filter(t => t.workspace === workspace);
    const high = tasks.filter(t => t.priority === 'high' && t.status !== 'done').length;
    return {
      total: tasks.length,
      todo: tasks.filter(t => t.status === 'todo').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      done: tasks.filter(t => t.status === 'done').length,
      high_priority: high,
    };
  },
}));
