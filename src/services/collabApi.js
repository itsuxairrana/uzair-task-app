import { getToken } from './authApi';

// Daily routines and task conversations (see /api/routines and /api/comments in the Worker).
const API = import.meta.env.VITE_API_URL || '/api';

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ── Daily routine ──
export const fetchRoutines   = (day, since = day) => call('GET', `/routines?day=${day}&since=${since}`);
export const addRoutine      = (userId, title, notes = '', days = '0123456') => call('POST', '/routines', { user_id: userId, title, notes, days });
// `changes` is any of { title, notes, days }.
export const updateRoutine   = (id, changes) => call('PATCH', '/routines', { id, ...changes });
export const removeRoutine   = id => call('DELETE', `/routines?id=${id}`);
export const setRoutineCheck = (routineId, day, done) => call('PUT', '/routines/check', { routine_id: routineId, day, done });

// ── Task conversation ──
export const fetchComments = taskId => call('GET', `/comments?task_id=${encodeURIComponent(taskId)}`).then(d => d.comments);
export const postComment   = (taskId, body) => call('POST', '/comments', { task_id: taskId, body });
export const deleteComment = id => call('DELETE', `/comments?id=${id}`);

// ── Attendance ──
export const attendancePing    = () => call('POST', '/attendance/ping');
export const attendanceSignout = () => call('POST', '/attendance/signout');
export const fetchAttendance   = (from, to = from) => call('GET', `/attendance?from=${from}&to=${to}`).then(d => d.sessions || []);
