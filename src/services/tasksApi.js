/**
 * Google Tasks API — Sync tasks to Google Task lists.
 *
 * Workspace → Task list mapping:
 *   uzair_visuals → "Uzair Visuals Tasks"
 *   personal      → "Personal Tasks"
 *   client        → "Client Projects"
 *   team          → "Team Tasks"
 */

import { getAccessToken } from './googleAuth';

const BASE_URL = 'https://www.googleapis.com/tasks/v1';

const WORKSPACE_LIST_NAME = {
  uzair_visuals: 'Uzair Visuals Tasks',
  personal: 'Personal Tasks',
  client: 'Client Projects',
  team: 'Team Tasks',
};

// Cache of { listName → listId } to avoid repeated lookups
const listIdCache = {};

function authHeaders() {
  const token = getAccessToken();
  if (!token) throw new Error('Not signed in to Google. Please connect your Google account.');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Get or create a task list by name. Returns list ID.
 */
async function getOrCreateList(listName) {
  if (listIdCache[listName]) return listIdCache[listName];

  // Fetch existing lists
  const res = await fetch(`${BASE_URL}/users/@me/lists`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error('Tasks API 403: Enable "Google Tasks API" in Google Cloud Console → APIs & Services → Enabled APIs, then disconnect and reconnect Google in Settings.');
    throw new Error(err?.error?.message || `Tasks API error ${res.status}`);
  }
  const data = await res.json();

  const existing = (data.items || []).find(l => l.title === listName);
  if (existing) {
    listIdCache[listName] = existing.id;
    return existing.id;
  }

  // Create the list
  const createRes = await fetch(`${BASE_URL}/users/@me/lists`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title: listName }),
  });
  if (!createRes.ok) throw new Error(`Failed to create task list "${listName}"`);
  const newList = await createRes.json();
  listIdCache[listName] = newList.id;
  return newList.id;
}

/**
 * Push a single task to Google Tasks.
 * Returns the created Google Task ID.
 */
export async function pushTaskToGoogleTasks(task) {
  const listName = WORKSPACE_LIST_NAME[task.workspace] || 'Uzair Visuals Tasks';
  const listId = await getOrCreateList(listName);

  const body = {
    title: task.title,
    notes: buildNotes(task),
    status: task.status === 'done' ? 'completed' : 'needsAction',
  };

  if (task.due_date) {
    // Google Tasks due date: RFC 3339 timestamp at midnight UTC
    body.due = `${task.due_date}T00:00:00.000Z`;
  }

  const res = await fetch(`${BASE_URL}/lists/${listId}/tasks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Tasks API error ${res.status}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Push multiple tasks to Google Tasks.
 * Returns array of { taskId, googleTaskId | error }
 */
export async function pushTasksToGoogleTasks(tasks) {
  const results = [];
  for (const task of tasks) {
    try {
      const googleTaskId = await pushTaskToGoogleTasks(task);
      results.push({ taskId: task.id, googleTaskId });
    } catch (error) {
      results.push({ taskId: task.id, error: error.message });
    }
  }
  return results;
}

/**
 * Mark a Google Task as complete.
 */
export async function completeGoogleTask(googleTaskId, workspace) {
  if (!googleTaskId) return;
  const listName = WORKSPACE_LIST_NAME[workspace] || 'Uzair Visuals Tasks';
  const listId = await getOrCreateList(listName);

  await fetch(`${BASE_URL}/lists/${listId}/tasks/${googleTaskId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status: 'completed' }),
  });
}

/**
 * Delete a Google Task.
 */
export async function deleteGoogleTask(googleTaskId, workspace) {
  if (!googleTaskId) return;
  const listName = WORKSPACE_LIST_NAME[workspace] || 'Uzair Visuals Tasks';
  const listId = await getOrCreateList(listName);

  await fetch(`${BASE_URL}/lists/${listId}/tasks/${googleTaskId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNotes(task) {
  const lines = [];
  if (task.notes) lines.push(task.notes);
  lines.push(`Priority: ${task.priority}`);
  lines.push(`Assigned to: ${task.assigned_to}`);
  if (task.client_tag) lines.push(`Client: ${task.client_tag}`);
  return lines.join('\n');
}
