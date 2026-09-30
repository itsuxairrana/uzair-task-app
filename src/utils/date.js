// Local calendar dates as YYYY-MM-DD. `toISOString()` is UTC, which in Pakistan
// (UTC+5) reports yesterday's date until 5am — never use it for "today".
export function localISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse YYYY-MM-DD as a local date (new Date('YYYY-MM-DD') is UTC midnight). */
export function parseISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysISO(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return localISO(d);
}

/** Whole days from today until `iso` (negative = past). */
export function daysUntil(iso) {
  if (!iso) return null;
  return Math.round((parseISO(iso) - parseISO(localISO())) / 86400000);
}

export function fmtShortDate(iso) {
  if (!iso) return '';
  return parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function timeAgo(ts) {
  const t = typeof ts === 'string' && !ts.includes('T') && !ts.endsWith('Z') ? ts.replace(' ', 'T') + 'Z' : ts; // D1 CURRENT_TIMESTAMP is UTC
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Routine weekdays: `days` is a string of JS weekday digits, 0 = Sunday ──
export const ALL_DAYS = '0123456';
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

export function appliesOn(days, iso) {
  return String(days || ALL_DAYS).includes(String(parseISO(iso).getDay()));
}

export function daysLabel(days) {
  const d = String(days || ALL_DAYS);
  if (d === ALL_DAYS) return 'Every day';
  if (d === '12345') return 'Weekdays';
  if (d === '06') return 'Weekends';
  return WEEK_ORDER.filter(n => d.includes(String(n))).map(n => WEEKDAY_SHORT[n]).join(', ');
}

// ── 12-hour clock ──
/** "14:30" → "2:30 PM" (task due times are stored as 24-hour HH:MM). */
export function fmtTime12(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** A server timestamp (ISO, or D1's "YYYY-MM-DD HH:MM:SS" in UTC) → "9:05 AM" in local time. */
export function fmtClock(ts) {
  if (!ts) return '';
  const t = typeof ts === 'string' && !ts.includes('T') ? ts.replace(' ', 'T') + 'Z' : ts;
  return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** 27_000_000 → "7h 30m". */
export function fmtDuration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`;
}
