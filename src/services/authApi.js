const API = import.meta.env.VITE_API_URL || '/api';

const TOKEN_KEY = 'uzair_auth_token';
const USER_KEY  = 'uzair_auth_user';

export function getToken()  { return localStorage.getItem(TOKEN_KEY); }
export function getUser()   {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
  catch { return null; }
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
export function isAdmin()   { return getUser()?.role === 'admin'; }

export async function login(email, password) {
  const res  = await fetch(`${API}/login.php`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY,  JSON.stringify(data.user));
  return data.user;
}

export async function verifyToken() {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API}/me.php`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { clearAuth(); return null; }
    const data = await res.json();
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  } catch {
    // Network error — use cached user so app still works offline
    return getUser();
  }
}

export function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

// ── Team management (admin only) ──────────────────────────────────────────────
export async function fetchTeam() {
  const res = await fetch(`${API}/users.php`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.users;
}

export async function addTeamMember(name, email, password) {
  const res  = await fetch(`${API}/users.php`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function removeTeamMember(id) {
  const res  = await fetch(`${API}/users.php?id=${id}`, { method: 'DELETE', headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
