import { getToken } from './authApi';

const API = import.meta.env.VITE_API_URL || '/api';

function headers() {
  return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

/** Admin: push a task to the DB (called when task is assigned to an employee) */
export async function syncTask(task) {
  try {
    await fetch(`${API}/db_tasks.php`, {
      method: 'POST', headers: headers(), body: JSON.stringify(task),
    });
  } catch {}
}

/** Admin: delete task from DB */
export async function deleteTaskFromDB(id) {
  try {
    await fetch(`${API}/db_tasks.php?id=${id}`, { method: 'DELETE', headers: headers() });
  } catch {}
}

/** Employee: fetch own tasks */
export async function fetchMyTasks() {
  const res  = await fetch(`${API}/db_tasks.php`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.tasks;
}

/** Employee: update task status */
export async function updateTaskStatus(id, status) {
  const res  = await fetch(`${API}/db_tasks.php`, {
    method: 'PUT', headers: headers(), body: JSON.stringify({ id, status }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

/** Employee: toggle milestone */
export async function updateMilestone(taskId, milestoneId, done) {
  const res  = await fetch(`${API}/db_tasks.php`, {
    method: 'PUT', headers: headers(),
    body: JSON.stringify({ id: taskId, milestone_id: milestoneId, done }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

/** Admin: get notifications */
export async function fetchNotifications() {
  const res  = await fetch(`${API}/notifications.php`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

/** Admin: mark notifications read */
export async function markNotificationsRead(id = 'all') {
  await fetch(`${API}/notifications.php`, {
    method: 'PUT', headers: headers(), body: JSON.stringify({ id }),
  });
}

/** Admin: reset employee password */
export async function resetEmployeePassword(id, newPassword) {
  const res  = await fetch(`${API}/users.php`, {
    method: 'PATCH', headers: headers(), body: JSON.stringify({ id, new_password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
