import { getToken } from './authApi';

// Phone / desktop alerts (web push). The server sends them through /api/push; sw.js displays them.
const API = import.meta.env.VITE_API_URL || '/api';

async function call(method, path, body, token = getToken()) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

/** 'on' | 'off' | 'blocked' (denied in browser settings) | 'needs-install' (iPhone, not added to Home Screen) | 'unsupported' */
export async function pushStatus() {
  if (!supported()) return isIOS() && !isInstalled() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

const keyBytes = b64 => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '=')), c => c.charCodeAt(0));

/** Ask permission, subscribe this browser and register it with the server. Must run from a click. */
export async function enablePush() {
  if (!supported()) throw new Error("This browser can't receive alerts.");
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Alerts were blocked. Allow notifications for this site in your browser settings, then try again.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { key } = await call('GET', '/push/key');
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await call('POST', '/push/subscribe', sub.toJSON());
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await call('POST', '/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

/** Alerts are on for this device: make sure the server still has it (e.g. after signing in again). */
export async function resyncPush() {
  try {
    if (!supported() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await call('POST', '/push/subscribe', sub.toJSON());
  } catch { /* alerts are best-effort */ }
}

/** On sign-out: stop this device receiving the signed-out person's alerts (the browser keeps its subscription). */
export function forgetDevice() {
  const token = getToken(); // read now, the caller clears it right after
  if (!token || !supported()) return;
  navigator.serviceWorker.getRegistration()
    .then(reg => reg?.pushManager.getSubscription())
    .then(sub => sub && call('POST', '/push/unsubscribe', { endpoint: sub.endpoint }, token))
    .catch(() => {});
}
