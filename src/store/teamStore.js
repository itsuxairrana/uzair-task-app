import { create } from 'zustand';
import { fetchTeam, addTeamMember, removeTeamMember } from '../services/authApi';
import { fetchDbTasks, fetchNotifications, markNotificationsRead } from '../services/taskSyncApi';
import { saveTeam } from '../services/gmailApi';
import { fetchRoutines } from '../services/collabApi';
import { localISO, addDaysISO } from '../utils/date';
import { useTaskStore } from './taskStore';

let taskReq = 0; // only the newest response may update state (polls and clicks can overlap)

// Server-backed team data for the admin: employees, the tasks assigned to them, and
// notifications about their progress. Polled by the app shell.
export const useTeamStore = create((set, get) => ({
  employees: [],
  serverTasks: [],
  notifications: [],
  routines: [],       // active daily-routine items for every employee
  routineChecks: [],  // { routine_id, day, done_at, user_id } for the last 7 days
  loaded: false,
  error: '',

  async loadEmployees() {
    try {
      const users = await fetchTeam();
      const employees = users.filter(u => u.role === 'employee');
      set({ employees });
      // TaskForm, TaskCard and the task store read this mirror to know who is an employee.
      saveTeam(employees.map(u => ({ name: u.name, email: u.email })));
      window.dispatchEvent(new Event('team_updated'));
    } catch (e) {
      set({ error: e.message || 'Could not load team' });
    }
  },

  async loadServerTasks() {
    const req = ++taskReq;
    try {
      const serverTasks = await fetchDbTasks();
      if (req !== taskReq) return;
      set({ serverTasks, loaded: true, error: '' });
      useTaskStore.getState().applyServerTasks(serverTasks);
    } catch (e) {
      if (req !== taskReq) return;
      set({ loaded: true, error: e.message || 'Could not load team tasks' });
    }
  },

  async loadNotifications() {
    try {
      const data = await fetchNotifications();
      const notifications = data.notifications || [];
      const knownIds = new Set(get().notifications.map(n => n.id));
      const hasNew = notifications.some(n => !knownIds.has(n.id));
      set({ notifications });
      // Someone just finished something — pull their task changes right away.
      if (hasNew) { get().loadServerTasks(); get().loadRoutines(); }
    } catch { /* offline — keep the last list */ }
  },

  async loadRoutines() {
    try {
      const today = localISO();
      const data = await fetchRoutines(today, addDaysISO(today, -6));
      set({ routines: data.routines || [], routineChecks: data.checks || [] });
    } catch { /* keep the last known routine state */ }
  },

  async refreshAll() {
    await Promise.all([get().loadEmployees(), get().loadServerTasks(), get().loadNotifications(), get().loadRoutines()]);
  },

  async markRead(id = 'all') {
    set(s => ({
      notifications: s.notifications.map(n => (id === 'all' || n.id === id) ? { ...n, is_read: 1 } : n),
    }));
    await markNotificationsRead(id).catch(() => {});
  },

  async addEmployee(name, email, password) {
    const res = await addTeamMember(name, email, password);
    await get().loadEmployees();
    return res;
  },

  async removeEmployee(id) {
    await removeTeamMember(id);
    await Promise.all([get().loadEmployees(), get().loadServerTasks()]);
  },
}));
