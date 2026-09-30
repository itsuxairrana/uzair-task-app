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
