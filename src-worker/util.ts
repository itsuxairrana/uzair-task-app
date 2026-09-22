export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET: string;
}

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type Row = Record<string, unknown>;

// ── Small sanitizers ─────────────────────────────────────────────────────────
export const text = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
export const int = (v: unknown): number => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
};
export const bool = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// ── base64url ────────────────────────────────────────────────────────────────
function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const enc = new TextEncoder();
const dec = new TextDecoder();

// ── HMAC ─────────────────────────────────────────────────────────────────────
async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function hmacSign(secret: string, data: string): Promise<Uint8Array> {
  const key = await hmacKey(secret);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── JWT (HS256) ──────────────────────────────────────────────────────────────
export interface JwtPayload {
  sub: number;
  name: string;
  email: string;
  role: "admin" | "employee";
  iat: number;
  exp: number;
}

export async function createJWT(secret: string, sub: number, name: string, email: string, role: string): Promise<string> {
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "HS256" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlEncode(enc.encode(JSON.stringify({ sub, name, email, role, iat: now, exp: now + 7 * 86400 })));
  const sig = b64urlEncode(await hmacSign(secret, `${header}.${payload}`));
  return `${header}.${payload}.${sig}`;
}

export async function verifyJWT(secret: string, token: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = b64urlEncode(await hmacSign(secret, `${h}.${p}`));
  if (!safeEqual(expected, sig)) return null;
  try {
    const data = JSON.parse(dec.decode(b64urlDecode(p))) as JwtPayload;
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

// ── Passwords: PBKDF2-SHA256, 100k iterations (native Web Crypto, no deps) ────
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Raw(password, salt);
  return `${b64urlEncode(salt)}.${b64urlEncode(hash)}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(".");
  if (!saltB64 || !hashB64) return false;
  const salt = b64urlDecode(saltB64);
  const hash = await pbkdf2Raw(password, salt);
  return safeEqual(b64urlEncode(hash), hashB64);
}
async function pbkdf2Raw(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

export function randomToken(bytes = 16): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function genPassword(): string {
  // 12 random chars from an unambiguous alphabet — handed to the admin to distribute.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// ── D1 helpers ───────────────────────────────────────────────────────────────
export async function all(env: Env, sql: string, ...args: unknown[]): Promise<Row[]> {
  return (await env.DB.prepare(sql).bind(...args).all<Row>()).results ?? [];
}
export async function first(env: Env, sql: string, ...args: unknown[]): Promise<Row | null> {
  return await env.DB.prepare(sql).bind(...args).first<Row>();
}
