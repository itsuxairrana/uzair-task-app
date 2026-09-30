/**
 * Google connection — server-side OAuth (authorization-code flow).
 *
 * The Worker holds the Client ID/secret and stores a long-lived refresh token per
 * Task OS user in D1, so the connection survives logout, reloads and other devices
 * until the user clicks Disconnect. The browser only ever receives short-lived
 * access tokens (fetched from /api/google/token and cached in memory).
 *
 * Setup: GOOGLE_CLIENT_ID var in wrangler.jsonc, GOOGLE_CLIENT_SECRET via
 * `wrangler secret put`, redirect URI https://task.uzairvisuals.com/api/google/callback
 */

import { authHeaders } from './authApi';

const API = import.meta.env.VITE_API_URL || '/api';

let status = { configured: false, connected: false, user: null };
let accessToken = null;
let tokenExpiry = 0;

function emitChange() {
  window.dispatchEvent(new Event('google_auth_change'));
}

/** Re-read connection status from the server. */
export async function refreshGoogleStatus() {
  try {
    const res = await fetch(`${API}/google/status`, { headers: authHeaders() });
    if (res.ok) status = await res.json();
  } catch { /* offline — keep last known status */ }
  emitChange();
  return status;
}

/** Redirects to Google's consent page; comes back to /?google=connected. */
export async function signIn() {
  const res = await fetch(`${API}/google/start`, { method: 'POST', headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not start Google sign-in');
  window.location.href = data.url;
  return new Promise(() => {}); // page is navigating away
}

/** Disconnect — revokes the refresh token server-side and forgets it. */
export async function signOut() {
  await fetch(`${API}/google/disconnect`, { method: 'POST', headers: authHeaders() }).catch(() => {});
  clearGoogleCache();
  status = { ...status, connected: false, user: null };
  emitChange();
}

/** Forget the in-memory access token (call on app logout). */
export function clearGoogleCache() {
  accessToken = null;
  tokenExpiry = 0;
  status = { configured: status.configured, connected: false, user: null };
}

/** A valid access token, fetched/refreshed via the server when needed. */
export async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  const res = await fetch(`${API}/google/token`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.reconnect) {
      status = { ...status, connected: false, user: null };
      emitChange();
    }
    return null;
  }
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

export function isSignedIn()        { return status.connected; }
export function isGoogleConfigured() { return status.configured; }
export function getGoogleUser()     { return status.user; }
