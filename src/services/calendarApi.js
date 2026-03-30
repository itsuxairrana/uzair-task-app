/**
 * Google Calendar API — Create events from tasks.
 *
 * Color coding by priority:
 *   High   → Tomato (id: 11)
 *   Medium → Banana (id: 5)
 *   Low    → Peacock (id: 7)
 */

import { getAccessToken } from './googleAuth';

const BASE_URL = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_ID = 'primary';

const PRIORITY_COLOR = {
  high: '11',    // Tomato
  medium: '5',   // Banana
  low: '7',      // Peacock
};

function authHeaders() {
  const token = getAccessToken();
  if (!token) throw new Error('Not signed in to Google. Please connect your Google account.');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Push a single task to Google Calendar as an event.
 * Returns the created event's ID.
 */
export async function pushTaskToCalendar(task, attendeeEmail = null) {
  if (!task.due_date) return null;

  const start = buildDateTime(task.due_date, task.due_time);
  const end = buildDateTime(task.due_date, task.due_time, 60); // +60 min default

  const event = {
    summary: task.title,
    description: buildDescription(task),
    start,
    end,
    colorId: PRIORITY_COLOR[task.priority] || '5',
    // Include employee as guest if provided — they get a calendar notification
    ...(attendeeEmail && { attendees: [{ email: attendeeEmail }], guestsCanSeeOtherGuests: false }),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'email', minutes: 60 },
      ],
    },
  };

  const response = await fetch(`${BASE_URL}/calendars/${CALENDAR_ID}/events`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Calendar API error ${response.status}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Push multiple tasks to Google Calendar.
 * Returns array of { taskId, eventId | error }
 */
export async function pushTasksToCalendar(tasks) {
  const results = [];
  for (const task of tasks) {
    try {
      const eventId = await pushTaskToCalendar(task);
      results.push({ taskId: task.id, eventId });
    } catch (error) {
      results.push({ taskId: task.id, error: error.message });
    }
  }
  return results;
}

/**
 * Delete a calendar event by event ID.
 */
export async function deleteCalendarEvent(eventId) {
  if (!eventId) return;
  await fetch(`${BASE_URL}/calendars/${CALENDAR_ID}/events/${eventId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDateTime(date, time, addMinutes = 0) {
  if (time) {
    const [h, m] = time.split(':').map(Number);
    const dt = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
    dt.setMinutes(dt.getMinutes() + addMinutes);
    return { dateTime: dt.toISOString() };
  }
  // All-day event
  return { date };
}

function buildDescription(task) {
  const lines = [];
  if (task.notes) lines.push(task.notes);
  lines.push(`Priority: ${task.priority}`);
  lines.push(`Assigned to: ${task.assigned_to}`);
  if (task.client_tag) lines.push(`Client: ${task.client_tag}`);
  lines.push(`Workspace: ${task.workspace}`);
  lines.push(`Source: Uzair Task OS`);
  return lines.join('\n');
}
