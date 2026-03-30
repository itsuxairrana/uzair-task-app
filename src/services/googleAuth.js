/**
 * Google OAuth 2.0 — Client-side via Google Identity Services (GIS)
 *
 * Setup:
 * 1. Go to https://console.cloud.google.com/ → APIs & Services → Credentials
 * 2. Create OAuth 2.0 Client ID (Web Application)
 * 3. Add http://localhost:5173 and your production URL to Authorized JS origins
 * 4. Copy Client ID into VITE_GOOGLE_CLIENT_ID in .env
 * 5. Enable: Google Calendar API, Google Tasks API
 *
 * The GIS script is loaded dynamically. After sign-in, an access token is stored
 * in memory and used by calendarApi.js and tasksApi.js.
 */

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

let tokenClient = null;
let accessToken = null;
let tokenExpiry = null;

const GC_ID_KEY = 'uzair_google_client_id';

/** Save Google Client ID to localStorage so it can be entered in Settings UI. */
export function setGoogleClientId(id) {
  const v = id?.trim();
  if (v) localStorage.setItem(GC_ID_KEY, v);
  else localStorage.removeItem(GC_ID_KEY);
}

/** Get stored Google Client ID. */
export function getStoredGoogleClientId() {
  return localStorage.getItem(GC_ID_KEY) || '';
}

/** Get the active Client ID: localStorage → .env */
function getClientId() {
  return localStorage.getItem(GC_ID_KEY) || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
}

/** Load the GIS script if not already loaded. */
function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/** Initialize the token client (call once on app load). */
export async function initGoogleAuth() {
  const clientId = getClientId();
  if (!clientId) return; // Google auth not configured — silently skip

  await loadGisScript();

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse.error) return;
      accessToken = tokenResponse.access_token;
      tokenExpiry = Date.now() + (tokenResponse.expires_in - 60) * 1000;
      // Persist user info
      fetchUserInfo(accessToken);
    },
  });
}

/** Trigger Google sign-in popup. Returns a Promise that resolves when token received. */
export function signIn() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Google Auth not initialized. Set VITE_GOOGLE_CLIENT_ID in .env'));
      return;
    }
    // Override callback to resolve the promise
    tokenClient.callback = (tokenResponse) => {
      if (tokenResponse.error) {
        reject(new Error(tokenResponse.error));
        return;
      }
      accessToken = tokenResponse.access_token;
      tokenExpiry = Date.now() + (tokenResponse.expires_in - 60) * 1000;
      fetchUserInfo(accessToken).then(resolve).catch(resolve);
    };
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

/** Sign out — revoke token and clear state. */
export function signOut() {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  tokenExpiry = null;
  localStorage.removeItem('google_user');
  window.dispatchEvent(new Event('google_auth_change'));
}

/** Get the current valid access token, refreshing if needed. */
export function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }
  return null;
}

/** Check if user is signed in to Google. */
export function isSignedIn() {
  return !!getAccessToken();
}

/** Fetch user profile info and store it. */
async function fetchUserInfo(token) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const info = await res.json();
    localStorage.setItem('google_user', JSON.stringify({
      name: info.name,
      email: info.email,
      picture: info.picture,
    }));
    window.dispatchEvent(new Event('google_auth_change'));
    return info;
  } catch {
    window.dispatchEvent(new Event('google_auth_change'));
  }
}

/** Get stored user profile (name, email, picture). */
export function getGoogleUser() {
  try {
    return JSON.parse(localStorage.getItem('google_user') || 'null');
  } catch {
    return null;
  }
}
