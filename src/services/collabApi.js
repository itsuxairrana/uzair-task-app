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
export const postComment   = (taskId, body, fileIds = []) => call('POST', '/comments', { task_id: taskId, body, file_ids: fileIds });
export const deleteComment = id => call('DELETE', `/comments?id=${id}`);

// ── Email ──
// Sends a test message to the admin's own address (checks that Gmail sending works).
export const sendTestEmail = () => call('POST', '/email/test');

// ── Attendance ──
export const attendancePing    = () => call('POST', '/attendance/ping');
export const attendanceSignout = () => call('POST', '/attendance/signout');
export const fetchAttendance   = (from, to = from) => call('GET', `/attendance?from=${from}&to=${to}`).then(d => d.sessions || []);

// ── Attachments (stored in R2; see /api/files) ──
export const MAX_FILE_MB = 25;

// Raw upload with progress (fetch can't report upload progress). Resolves to { id, name, size, type }.
export function uploadFile(taskId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/files?task_id=${encodeURIComponent(taskId)}&name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && data.file) resolve(data.file);
      else reject(new Error(data.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed — check your connection'));
    xhr.send(file);
  });
}

export const removeUpload = id => call('DELETE', `/files/${id}`);

// Downloads need the auth header, so files are fetched as blobs rather than linked directly.
export async function fetchFileBlob(id) {
  const res = await fetch(`${API}/files/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Couldn't open the file (${res.status})`);
  }
  return res.blob();
}
