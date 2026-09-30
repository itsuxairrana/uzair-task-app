import { AppError, Env, JwtPayload, all, bool, createJWT, first, genPassword, hashPassword, int, isEmail, signState, text, verifyJWT, verifyPassword, verifyState } from "./util";

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const ALLOWED_ORIGINS = new Set(["https://task.uzairvisuals.com", "http://localhost:5173", "http://localhost:4173"]);

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra } });
}
const errResp = (msg: string, status = 400, extra: Record<string, string> = {}) => json({ error: msg }, status, extra);

async function readAuth(req: Request, env: Env): Promise<JwtPayload | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const m = /Bearer\s+(.+)/i.exec(auth);
  if (!m) return null;
  return verifyJWT(env.JWT_SECRET, m[1].trim());
}

// ── /api/login.php ───────────────────────────────────────────────────────────
async function handleLogin(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return errResp("Method not allowed", 405);
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("DELETE FROM login_attempts WHERE at < ?").bind(now - 86400).run();
  const fails = int((await first(env, "SELECT COUNT(*) AS n FROM login_attempts WHERE ip=? AND at > ?", ip, now - LOCK_MINUTES * 60))?.n);
  if (fails >= MAX_FAILS) return errResp(`Too many attempts. Try again in ${LOCK_MINUTES} minutes.`, 429);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errResp("Bad request");
  }
  const email = text(body.email).toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return errResp("Email and password are required");

  const user = await first(env, "SELECT * FROM users WHERE lower(email)=?", email);
  if (!user || !(await verifyPassword(password, String(user.password_hash)))) {
    await env.DB.prepare("INSERT INTO login_attempts (ip, at) VALUES (?, ?)").bind(ip, now).run();
    return errResp("Invalid email or password", 401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip=?").bind(ip).run();

  const token = await createJWT(env.JWT_SECRET, Number(user.id), String(user.name), String(user.email), String(user.role));
  return json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

// ── /api/me.php ──────────────────────────────────────────────────────────────
async function handleMe(env: Env, auth: JwtPayload): Promise<Response> {
  const user = await first(env, "SELECT id, name, email, role FROM users WHERE id=?", auth.sub);
  if (!user) return errResp("User not found", 404);
  return json({ user });
}

// ── /api/change_password.php ─────────────────────────────────────────────────
async function handleChangePassword(req: Request, env: Env, auth: JwtPayload): Promise<Response> {
  const b = await req.json<any>().catch(() => ({}));
  const current = String(b.current_password ?? "");
  const next = String(b.new_password ?? "");
  if (!current || !next) return errResp("Both current and new password are required");
  if (next.length < 8) return errResp("New password must be at least 8 characters");
  const row = await first(env, "SELECT password_hash FROM users WHERE id=?", auth.sub);
  if (!row || !(await verifyPassword(current, String(row.password_hash)))) return errResp("Current password is incorrect", 401);
  await env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(await hashPassword(next), auth.sub).run();
  return json({ ok: true, message: "Password changed successfully" });
}

// ── /api/users.php (admin only) ──────────────────────────────────────────────
async function handleUsers(req: Request, env: Env, auth: JwtPayload, url: URL): Promise<Response> {
  if (auth.role !== "admin") return errResp("Unauthorized", 401);

  if (req.method === "GET") {
    const users = await all(env, "SELECT id, name, email, role, created_at FROM users ORDER BY role DESC, name ASC");
    return json({ users });
  }

  if (req.method === "POST") {
    const b = await req.json<any>().catch(() => ({}));
    const name = text(b.name);
    const email = text(b.email);
    const password = String(b.password || genPassword());
    const role = b.role === "admin" ? "admin" : "employee";
    if (!name || !email) return errResp("Name and email are required");
    if (!isEmail(email)) return errResp("Invalid email address");
    const dupe = await first(env, "SELECT id FROM users WHERE lower(email)=?", email.toLowerCase());
    if (dupe) return errResp("Email already exists");
    const hash = await hashPassword(password);
    const r = await env.DB.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)").bind(name, email, hash, role).run();
    return json({ ok: true, id: r.meta.last_row_id, temporary_password: password, message: `Account created. Share the temporary password with ${name}.` }, 201);
  }

  if (req.method === "PATCH") {
    const b = await req.json<any>().catch(() => ({}));
    const id = int(b.id);
    const pwd = String(b.new_password ?? "");
    if (!id || pwd.length < 6) return errResp("User ID and password (min 6 chars) required");
    await env.DB.prepare("UPDATE users SET password_hash=? WHERE id=? AND role='employee'").bind(await hashPassword(pwd), id).run();
    return json({ ok: true, message: "Password updated" });
  }

  if (req.method === "DELETE") {
    const id = int(url.searchParams.get("id"));
    if (!id) return errResp("User ID required");
    if (id === auth.sub) return errResp("Cannot delete your own account");
    await env.DB.prepare("DELETE FROM users WHERE id=? AND role='employee'").bind(id).run();
    return json({ ok: true });
  }

  return errResp("Method not allowed", 405);
}

// ── /api/db_tasks.php ─────────────────────────────────────────────────────────
async function handleTasks(req: Request, env: Env, auth: JwtPayload, url: URL): Promise<Response> {
  const isAdmin = auth.role === "admin";
  const userId = auth.sub;

  if (req.method === "GET") {
    const tasks = isAdmin
      ? await all(env, `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON t.assigned_user_id=u.id ORDER BY t.created_at DESC`)
      : await all(env, `SELECT t.* FROM tasks t WHERE t.assigned_user_id=? ORDER BY t.created_at DESC`, userId);
    for (const t of tasks) t.milestones = await all(env, "SELECT * FROM milestones WHERE task_id=? ORDER BY id ASC", t.id);
    return json({ tasks });
  }

  if (req.method === "POST") {
    if (!isAdmin) return errResp("Forbidden", 403);
    const b = await req.json<any>().catch(() => ({}));
    if (!b.id) return errResp("Task ID required");

    let assigneeId: number | null = null;
    if (b.assigned_to) {
      const row = await first(env, "SELECT id FROM users WHERE name=? AND role='employee'", text(b.assigned_to));
      if (row) assigneeId = Number(row.id);
    }

    const exists = await first(env, "SELECT id FROM tasks WHERE id=?", b.id);
    if (exists) {
      await env.DB.prepare(
        `UPDATE tasks SET title=?, notes=?, priority=?, status=?, due_date=?, due_time=?, assigned_to=?, assigned_user_id=?, workspace=?, client_tag=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      ).bind(text(b.title), text(b.notes), b.priority || "medium", b.status || "todo", b.due_date || null, text(b.due_time), text(b.assigned_to), assigneeId, b.workspace || "personal", text(b.client_tag), b.id).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO tasks (id, title, notes, priority, status, due_date, due_time, assigned_to, assigned_user_id, workspace, client_tag, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(b.id, text(b.title), text(b.notes), b.priority || "medium", b.status || "todo", b.due_date || null, text(b.due_time), text(b.assigned_to), assigneeId, b.workspace || "personal", text(b.client_tag), userId).run();
    }

    if (Array.isArray(b.milestones) && b.milestones.length) {
      await env.DB.prepare("DELETE FROM milestones WHERE task_id=?").bind(b.id).run();
      const stmts = b.milestones.map((m: any) =>
        env.DB.prepare("INSERT INTO milestones (id, task_id, title, instruction, done) VALUES (?,?,?,?,?)").bind(m.id, b.id, text(m.title), text(m.instruction), bool(m.done) ? 1 : 0),
      );
      await env.DB.batch(stmts);
    }
    return json({ ok: true });
  }

  if (req.method === "PUT") {
    const b = await req.json<any>().catch(() => ({}));
    const id = b.id;
    if (!id) return errResp("Task ID required");

    if (!isAdmin) {
      const owns = await first(env, "SELECT id FROM tasks WHERE id=? AND assigned_user_id=?", id, userId);
      if (!owns) return errResp("Forbidden", 403);
    }

    if (b.milestone_id !== undefined) {
      await env.DB.prepare("UPDATE milestones SET done=? WHERE id=? AND task_id=?").bind(bool(b.done) ? 1 : 0, b.milestone_id, id).run();
      return json({ ok: true });
    }

    if (b.status !== undefined) {
      await env.DB.prepare("UPDATE tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.status, id).run();
      if (!isAdmin && b.status === "done") {
        const t = await first(env, "SELECT title, created_by FROM tasks WHERE id=?", id);
        if (t) {
          const msg = `${auth.name} completed task: "${t.title}"`;
          await env.DB.prepare("INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, 'task_completed', ?, ?)").bind(t.created_by, msg, id).run();
        }
      }
      return json({ ok: true });
    }

    return errResp("Nothing to update");
  }

  if (req.method === "DELETE") {
    if (!isAdmin) return errResp("Forbidden", 403);
    const id = url.searchParams.get("id");
    if (!id) return errResp("Task ID required");
    await env.DB.prepare("DELETE FROM tasks WHERE id=?").bind(id).run();
    return json({ ok: true });
  }

  return errResp("Method not allowed", 405);
}

// ── /api/notifications.php ───────────────────────────────────────────────────
async function handleNotifications(req: Request, env: Env, auth: JwtPayload): Promise<Response> {
  const userId = auth.sub;
  if (req.method === "GET") {
    const rows = await all(env, "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50", userId);
    const unread = rows.filter((n) => !bool(n.is_read));
    return json({ notifications: rows, unread_count: unread.length });
  }
  if (req.method === "PUT") {
    const b = await req.json<any>().catch(() => ({}));
    const id = b.id ?? "all";
    if (id === "all") await env.DB.prepare("UPDATE notifications SET is_read=1 WHERE user_id=?").bind(userId).run();
    else await env.DB.prepare("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?").bind(id, userId).run();
    return json({ ok: true });
  }
  return errResp("Method not allowed", 405);
}

// ── /api/google/* — server-side OAuth; refresh token stays in D1 until Disconnect ──
const GOOGLE_SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");
const googleConfigured = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const googleRedirectUri = (url: URL) => `${url.origin}/api/google/callback`;

async function googleTokenRequest(env: Env, params: Record<string, string>): Promise<any> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  const data = await res.json<any>().catch(() => ({}));
  return { ok: res.ok, ...data };
}

// GET /api/google/callback — Google redirects the browser here (no Authorization header; user comes from `state`).
async function handleGoogleCallback(env: Env, url: URL): Promise<Response> {
  const back = (result: string, detail = "") => {
    if (result !== "connected") console.log("[google] connect failed:", result, detail);
    return Response.redirect(`${url.origin}/?google=${encodeURIComponent(result)}`, 302);
  };
  if (!googleConfigured(env)) return back("not_configured");
  if (url.searchParams.get("error")) return back(url.searchParams.get("error")!);
  const userId = await verifyState(env.JWT_SECRET, url.searchParams.get("state") ?? "");
  const code = url.searchParams.get("code");
  if (!userId || !code) return back("invalid_request");
  if (!(await first(env, "SELECT id FROM users WHERE id=?", userId))) return back("invalid_request");

  const tok = await googleTokenRequest(env, { grant_type: "authorization_code", code, redirect_uri: googleRedirectUri(url) });
  if (!tok.ok || !tok.access_token) return back(tok.error || "token_exchange_failed", text(tok.error_description));

  const existing = await first(env, "SELECT refresh_token FROM google_accounts WHERE user_id=?", userId);
  const refresh = tok.refresh_token || text(existing?.refresh_token);
  if (!refresh) return back("no_refresh_token");

  const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } })
    .then((r) => r.json<any>()).catch(() => ({}));
  const exp = Math.floor(Date.now() / 1000) + int(tok.expires_in);
  await env.DB.prepare(
    `INSERT INTO google_accounts (user_id, refresh_token, access_token, access_exp, email, name, picture, updated_at)
     VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET refresh_token=excluded.refresh_token, access_token=excluded.access_token,
       access_exp=excluded.access_exp, email=excluded.email, name=excluded.name, picture=excluded.picture, updated_at=CURRENT_TIMESTAMP`,
  ).bind(userId, refresh, tok.access_token, exp, text(info.email), text(info.name), text(info.picture)).run();
  return back("connected");
}

async function handleGoogle(req: Request, env: Env, auth: JwtPayload, url: URL): Promise<Response> {
  const route = url.pathname.slice("/api/google/".length);
  const now = Math.floor(Date.now() / 1000);

  if (route === "status" && req.method === "GET") {
    const row = await first(env, "SELECT email, name, picture FROM google_accounts WHERE user_id=?", auth.sub);
    return json({
      configured: googleConfigured(env),
      connected: !!row,
      user: row ? { email: row.email, name: row.name, picture: row.picture } : null,
    });
  }

  if (!googleConfigured(env)) return errResp("Google isn't configured on the server", 503);

  if (route === "start" && req.method === "POST") {
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: googleRedirectUri(url),
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: await signState(env.JWT_SECRET, auth.sub),
    });
    return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
  }

  if (route === "token" && req.method === "GET") {
    const row = await first(env, "SELECT refresh_token, access_token, access_exp FROM google_accounts WHERE user_id=?", auth.sub);
    if (!row) return json({ error: "Google not connected", reconnect: true }, 409);
    if (row.access_token && int(row.access_exp) > now + 120) {
      return json({ access_token: row.access_token, expires_in: int(row.access_exp) - now });
    }
    const tok = await googleTokenRequest(env, { grant_type: "refresh_token", refresh_token: text(row.refresh_token) });
    if (!tok.ok || !tok.access_token) {
      if (tok.error === "invalid_grant") {
        // Revoked in the Google account, or expired — only then do we drop the link.
        await env.DB.prepare("DELETE FROM google_accounts WHERE user_id=?").bind(auth.sub).run();
        return json({ error: "Google access was revoked — please reconnect", reconnect: true }, 409);
      }
      return errResp("Couldn't refresh Google access — try again", 502);
    }
    const exp = now + int(tok.expires_in);
    await env.DB.prepare("UPDATE google_accounts SET access_token=?, access_exp=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?")
      .bind(tok.access_token, exp, auth.sub).run();
    return json({ access_token: tok.access_token, expires_in: int(tok.expires_in) });
  }

  if (route === "disconnect" && req.method === "POST") {
    const row = await first(env, "SELECT refresh_token FROM google_accounts WHERE user_id=?", auth.sub);
    if (row?.refresh_token) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: text(row.refresh_token) }),
      }).catch(() => {});
    }
    await env.DB.prepare("DELETE FROM google_accounts WHERE user_id=?").bind(auth.sub).run();
    return json({ ok: true });
  }

  return errResp("Not found", 404);
}

// ── Router ───────────────────────────────────────────────────────────────────
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin");
    const cors = corsHeaders(origin);

    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) return new Response(null, { status: 204, headers: cors });

    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
      if (url.pathname.startsWith("/api/")) return errResp("Task OS is not configured yet.", 503, cors);
    } else if (url.pathname.startsWith("/api/")) {
      try {
        let res: Response;
        if (url.pathname === "/api/login.php") {
          res = await handleLogin(req, env);
        } else if (url.pathname === "/api/google/callback" && req.method === "GET") {
          return await handleGoogleCallback(env, url);
        } else {
          const auth = await readAuth(req, env);
          if (!auth) {
            res = errResp("Unauthorized", 401);
          } else if (url.pathname === "/api/me.php") res = await handleMe(env, auth);
          else if (url.pathname === "/api/change_password.php") res = await handleChangePassword(req, env, auth);
          else if (url.pathname === "/api/users.php") res = await handleUsers(req, env, auth, url);
          else if (url.pathname === "/api/db_tasks.php") res = await handleTasks(req, env, auth, url);
          else if (url.pathname === "/api/notifications.php") res = await handleNotifications(req, env, auth);
          else if (url.pathname.startsWith("/api/google/")) res = await handleGoogle(req, env, auth, url);
          else res = errResp("Not found", 404);
        }
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
        return res;
      } catch (e) {
        if (e instanceof AppError) return errResp(e.message, e.status, cors);
        console.error("[uv-tasks] error:", e);
        return errResp("Server error — please try again", 500, cors);
      }
    }

    // Static assets (built SPA) for everything else.
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
