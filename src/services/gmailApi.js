/**
 * Gmail API — Send task assignment emails.
 * Requires gmail.send scope (added to googleAuth.js SCOPES).
 * User must disconnect and reconnect Google once to grant this permission.
 */

import { getAccessToken } from './googleAuth';

const TEAM_KEY = 'uzair_team';

// ── Team management (localStorage) ───────────────────────────────────────────

/** Get all team members: [{ name, email, role? }] */
export function getTeam() {
  try { return JSON.parse(localStorage.getItem(TEAM_KEY) || '[]'); }
  catch { return []; }
}

/** Save full team array */
export function saveTeam(team) {
  localStorage.setItem(TEAM_KEY, JSON.stringify(team));
}

/** Look up an employee's email by their display name (case-insensitive) */
export function getEmployeeEmail(name) {
  if (!name) return null;
  const team = getTeam();
  return team.find(m => m.name.toLowerCase() === name.toLowerCase())?.email || null;
}

// ── Email sending ─────────────────────────────────────────────────────────────

/**
 * Send a task assignment email via Gmail API.
 * @param {object} task - the full task object
 * @param {string} recipientEmail - employee email address
 * @param {string} recipientName  - employee display name
 */
export async function sendTaskEmail(task, recipientEmail, recipientName) {
  const token = getAccessToken();
  if (!token) throw new Error('Sign in to Google first (Settings → Google).');

  const html = buildTaskEmailHtml(task, recipientName);
  const subject = `Task assigned: ${task.title}`;

  const rawMessage = [
    `To: ${recipientName} <${recipientEmail}>`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ].join('\r\n');

  // Gmail requires base64url encoding
  const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || '';
    const lower = msg.toLowerCase();
    if (res.status === 403) {
      if (lower.includes('has not been used') || lower.includes('disabled') || lower.includes('not enabled')) {
        throw new Error('Gmail API is not enabled. Go to console.cloud.google.com → APIs & Services → Library → search "Gmail API" → Enable it.');
      }
      if (lower.includes('insufficient') || lower.includes('scope') || lower.includes('authorization')) {
        throw new Error('Gmail permission needed — re-auth triggered');
      }
      throw new Error(`Gmail 403: ${msg || 'Gmail API not enabled in Google Cloud Console'}`);
    }
    throw new Error(msg || `Gmail error ${res.status}`);
  }

  return (await res.json()).id;
}

// ── HTML email builder ────────────────────────────────────────────────────────

function buildTaskEmailHtml(task, recipientName) {
  const priorityColor  = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' }[task.priority] || '#6b7280';
  const priorityLabel  = { high: 'High', medium: 'Medium', low: 'Low' }[task.priority] || 'Medium';
  const statusLabel    = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }[task.status] || 'To Do';

  const milestoneRows = (task.milestones || []).map((m, i) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e2e7ef;vertical-align:top;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;min-width:22px;background:#f0f3f7;border-radius:50%;font-size:11px;font-weight:700;color:#6b7a99;margin-right:10px;">${i + 1}</span>
        <strong style="font-size:13px;color:#1a2332;">${escHtml(m.title)}</strong>
        ${m.instruction ? `<div style="font-size:12px;color:#6b7a99;margin-top:4px;margin-left:32px;">${escHtml(m.instruction)}</div>` : ''}
      </td>
    </tr>`).join('');

  const dueLine = task.due_date
    ? `<span style="background:#f0f3f7;color:#1a2332;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:600;">Due ${task.due_date}${task.due_time ? ' · ' + task.due_time : ''}</span>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f6f9;margin:0;padding:24px;">
<div style="max-width:560px;margin:0 auto;">

  <!-- Card -->
  <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.09);">

    <!-- Header bar -->
    <div style="background:#0d1f3c;padding:18px 28px;display:flex;align-items:center;gap:12px;">
      <div style="width:30px;height:30px;background:#0057B8;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;font-weight:900;text-align:center;line-height:30px;">+</div>
      <span style="color:#fff;font-size:14px;font-weight:700;letter-spacing:0.3px;">Uzair Task OS</span>
    </div>

    <!-- Body -->
    <div style="padding:28px 28px 24px;">
      <p style="margin:0 0 6px;font-size:11px;color:#6b7a99;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">
        Hi ${escHtml(recipientName)}, a task has been assigned to you
      </p>
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:800;color:#1a2332;line-height:1.3;">${escHtml(task.title)}</h2>

      <!-- Badges -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;">
        <span style="background:${priorityColor}22;color:${priorityColor};border:1px solid ${priorityColor}44;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;">${priorityLabel} Priority</span>
        ${dueLine}
        <span style="background:#f0f3f7;color:#6b7a99;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:600;">${statusLabel}</span>
      </div>

      <!-- Notes -->
      ${task.notes ? `<div style="background:#f4f6f9;border-radius:8px;padding:12px 14px;font-size:13px;color:#6b7a99;margin-bottom:20px;">${escHtml(task.notes)}</div>` : ''}

      <!-- Milestones -->
      ${(task.milestones || []).length > 0 ? `
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#1a2332;text-transform:uppercase;letter-spacing:0.8px;">Steps to complete</p>
        <table style="width:100%;border-collapse:collapse;">${milestoneRows}</table>
      ` : ''}

      <!-- CTA note -->
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e7ef;">
        <p style="margin:0;font-size:12px;color:#9aa5bc;line-height:1.6;">
          Reply to this email to update progress or ask questions.<br/>
          When complete, reply with <strong>"Done"</strong> so the team gets notified.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f4f6f9;padding:12px 28px;text-align:center;border-top:1px solid #e2e7ef;">
      <p style="margin:0;font-size:11px;color:#9aa5bc;">Sent from <strong>Uzair Task OS</strong> · Uzair Visuals</p>
    </div>
  </div>
</div>
</body></html>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
