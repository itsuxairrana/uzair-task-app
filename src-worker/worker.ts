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
  // Attendance must never block signing in.
  if (user.role === "employee") await attendancePing(env, Number(user.id)).catch((e) => console.error("[uv-tasks] attendance check-in failed:", e));
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

// Accept "https://…", "http://…" or "www.…"; anything else (javascript:, data:, …) is dropped.
function toHttpUrl(v: unknown): string | null {
  const s = text(v);
  if (!s || /\s/.test(s)) return null;
  const u = /^www\./i.test(s) ? `https://${s}` : s;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const COMMENT_STATS = `(SELECT COUNT(*) FROM task_comments c WHERE c.task_id=t.id) AS comment_count,
  (SELECT MAX(c.created_at) FROM task_comments c WHERE c.task_id=t.id) AS last_comment_at`;

// `key` goes in notifications.task_id: a task id, or e.g. "routine:<user>:<day>".
async function notify(env: Env, userId: number, type: string, message: string, key: string | null = null) {
  await env.DB.prepare("INSERT INTO notifications (user_id, type, message, task_id) VALUES (?,?,?,?)").bind(userId, type, message, key).run();
}

// ── /api/db_tasks.php ─────────────────────────────────────────────────────────
async function handleTasks(req: Request, env: Env, auth: JwtPayload, url: URL): Promise<Response> {
  const isAdmin = auth.role === "admin";
  const userId = auth.sub;

  if (req.method === "GET") {
    const tasks = isAdmin
      ? await all(env, `SELECT t.*, u.name AS assignee_name, ${COMMENT_STATS} FROM tasks t LEFT JOIN users u ON t.assigned_user_id=u.id ORDER BY t.created_at DESC`)
      : await all(env, `SELECT t.*, ${COMMENT_STATS} FROM tasks t WHERE t.assigned_user_id=? ORDER BY t.created_at DESC`, userId);
    for (const t of tasks) t.milestones = await all(env, "SELECT * FROM milestones WHERE task_id=? ORDER BY rowid ASC", t.id);
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

    const exists = await first(env, "SELECT id, assigned_user_id FROM tasks WHERE id=?", b.id);
    if (assigneeId && (!exists || Number(exists.assigned_user_id) !== assigneeId)) {
      await notify(env, assigneeId, "task_assigned", `${auth.name} assigned you: "${text(b.title)}"`, b.id);
    }
    if (exists) {
      await env.DB.prepare(
        `UPDATE tasks SET title=?, notes=?, priority=?, status=?, due_date=?, due_time=?, assigned_to=?, assigned_user_id=?, workspace=?, client_tag=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      ).bind(text(b.title), text(b.notes), b.priority || "medium", b.status || "todo", b.due_date || null, text(b.due_time), text(b.assigned_to), assigneeId, b.workspace || "personal", text(b.client_tag), b.id).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO tasks (id, title, notes, priority, status, due_date, due_time, assigned_to, assigned_user_id, workspace, client_tag, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(b.id, text(b.title), text(b.notes), b.priority || "medium", b.status || "todo", b.due_date || null, text(b.due_time), text(b.assigned_to), assigneeId, b.workspace || "personal", text(b.client_tag), userId).run();
    }

    if (Array.isArray(b.milestones)) {
      // Replace the whole list so removed steps disappear for the employee too.
      await env.DB.prepare("DELETE FROM milestones WHERE task_id=?").bind(b.id).run();
      if (b.milestones.length) {
        const stmts = b.milestones.map((m: any) =>
          env.DB.prepare("INSERT INTO milestones (id, task_id, title, instruction, done) VALUES (?,?,?,?,?)").bind(m.id, b.id, text(m.title), text(m.instruction), bool(m.done) ? 1 : 0),
        );
        await env.DB.batch(stmts);
      }
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
          // Optional hand-off: a short report and links to the files/deliverables.
          const report = text(b.report).slice(0, 4000);
          const links = (Array.isArray(b.links) ? b.links : []).map(toHttpUrl).filter(Boolean).slice(0, 10) as string[];
          const fileIds = pendingFileIds(b.file_ids);
          let msg = `${auth.name} completed task: "${t.title}"`;
          if (report || links.length || fileIds.length) {
            const body = [report, ...links].filter(Boolean).join("\n");
            const r = await env.DB.prepare("INSERT INTO task_comments (task_id, user_id, body, kind) VALUES (?,?,?,'submission')").bind(id, auth.sub, body).run();
            const files = await attachFiles(env, auth, id, Number(r.meta.last_row_id), fileIds);
            const parts = [plural(links.length, "link"), plural(files, "file")].filter(Boolean);
            msg += parts.length ? ` and sent their work (${parts.join(", ")})` : " and sent a report";
          }
          await notify(env, Number(t.created_by), "task_completed", msg, id);
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
    await deleteFiles(env, "SELECT id, r2_key FROM task_files WHERE task_id=?", id);
    await env.DB.prepare("DELETE FROM tasks WHERE id=?").bind(id).run();
    return json({ ok: true });
  }

  return errResp("Method not allowed", 405);
}

// ── /api/notifications.php ───────────────────────────────────────────────────
async function handleNotifications(req: Request, env: Env, auth: JwtPayload): Promise<Response> {
  const userId = auth.sub;
  if (req.method === "GET") {
    const rows = await all(env, "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 50", userId);
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

// ── /api/routines — daily checklist per employee ─────────────────────────────
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALL_DAYS = "0123456"; // JS weekday digits, 0 = Sunday
const TIME_ZONE = "Asia/Karachi"; // the team's working time zone (evening alert, server-side "today")

const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const onDay = (days: unknown, day: string) => String(days ?? ALL_DAYS).includes(String(weekdayOf(day)));
function normDays(v: unknown): string | null {
  const set = new Set(String(v ?? "").split("").filter((c) => /[0-6]/.test(c)));
  return set.size ? [...set].sort().join("") : null;
}
const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

// Active routine items for one employee that apply on `day`, plus how many are checked.
async function routineProgress(env: Env, userId: number, day: string) {
  const items = (await all(env, "SELECT id, days FROM routines WHERE user_id=? AND active=1", userId)).filter((r) => onDay(r.days, day));
  if (!items.length) return { total: 0, done: 0 };
  const checked = new Set((await all(env, "SELECT routine_id FROM routine_checks WHERE day=?", day)).map((c) => Number(c.routine_id)));
  return { total: items.length, done: items.filter((r) => checked.has(Number(r.id))).length };
}

async function handleRoutines(req: Request, env: Env, auth: JwtPayload, url: URL): Promise<Response> {
  const isAdmin = auth.role === "admin";
  const route = url.pathname.slice("/api/routines".length);

  if (req.method === "GET" && route === "") {
    // ?day=YYYY-MM-DD (today, client-local) and optional ?since= for history
    const day = url.searchParams.get("day") ?? "";
    const since = url.searchParams.get("since") ?? day;
    if (!DAY_RE.test(day) || !DAY_RE.test(since)) return errResp("day must be YYYY-MM-DD");
    const routines = isAdmin
      ? await all(env, "SELECT r.id, r.user_id, r.title, r.notes, r.position, r.days, u.name AS user_name FROM routines r JOIN users u ON u.id=r.user_id WHERE r.active=1 ORDER BY r.user_id, r.position, r.id")
      : (await all(env, "SELECT id, user_id, title, notes, position, days FROM routines WHERE user_id=? AND active=1 ORDER BY position, id", auth.sub)).filter((r) => onDay(r.days, day));
    const checks = isAdmin
      ? await all(env, "SELECT c.routine_id, c.day, c.done_at, r.user_id FROM routine_checks c JOIN routines r ON r.id=c.routine_id WHERE r.active=1 AND c.day BETWEEN ? AND ?", since, day)
      : await all(env, "SELECT c.routine_id, c.day, c.done_at, r.user_id FROM routine_checks c JOIN routines r ON r.id=c.routine_id WHERE r.user_id=? AND r.active=1 AND c.day BETWEEN ? AND ?", auth.sub, since, day);
    return json({ routines, checks });
  }

  if (req.method === "PUT" && route === "/check") {
    const b = await req.json<any>().catch(() => ({}));
    const routineId = int(b.routine_id);
    const day = text(b.day);
    if (!routineId || !DAY_RE.test(day)) return errResp("routine_id and day required");
    const r = await first(env, "SELECT id, user_id FROM routines WHERE id=? AND active=1", routineId);
    if (!r || (!isAdmin && Number(r.user_id) !== auth.sub)) return errResp("Forbidden", 403);
    if (bool(b.done)) await env.DB.prepare("INSERT OR IGNORE INTO routine_checks (routine_id, day) VALUES (?,?)").bind(routineId, day).run();
    else await env.DB.prepare("DELETE FROM routine_checks WHERE routine_id=? AND day=?").bind(routineId, day).run();

    // Tell the admins once per day when an employee finishes the whole routine.
    if (!isAdmin && bool(b.done)) {
      const { total, done } = await routineProgress(env, auth.sub, day);
      const key = `routine:${auth.sub}:${day}`;
      if (total > 0 && done >= total && !(await first(env, "SELECT id FROM notifications WHERE type='routine_done' AND task_id=?", key))) {
        for (const a of await all(env, "SELECT id FROM users WHERE role='admin'")) {
          await notify(env, Number(a.id), "routine_done", `${auth.name} finished today's daily routine (${done}/${total})`, key);
        }
      }
    }
    return json({ ok: true });
  }

  if (!isAdmin) return errResp("Forbidden", 403);

  if (req.method === "POST" && route === "") {
    const b = await req.json<any>().catch(() => ({}));
    const userId = int(b.user_id);
    const title = text(b.title).slice(0, 200);
    if (!userId || !title) return errResp("Employee and title are required");
    if (!(await first(env, "SELECT id FROM users WHERE id=? AND role='employee'", userId))) return errResp("Unknown employee");
    const days = b.days === undefined ? ALL_DAYS : normDays(b.days);
    if (!days) return errResp("Pick at least one day");
    const pos = int((await first(env, "SELECT COALESCE(MAX(position), 0) + 1 AS p FROM routines WHERE user_id=?", userId))?.p);
    const r = await env.DB.prepare("INSERT INTO routines (user_id, title, notes, position, days) VALUES (?,?,?,?,?)").bind(userId, title, text(b.notes).slice(0, 500), pos, days).run();
    return json({ ok: true, id: r.meta.last_row_id }, 201);
  }

  if (req.method === "PATCH" && route === "") {
    const b = await req.json<any>().catch(() => ({}));
    const id = int(b.id);
    const cur = id ? await first(env, "SELECT title, notes, days FROM routines WHERE id=? AND active=1", id) : null;
    if (!cur) return errResp("Routine item not found", 404);
    const title = b.title === undefined ? text(cur.title) : text(b.title).slice(0, 200);
    const notes = b.notes === undefined ? text(cur.notes) : text(b.notes).slice(0, 500);
    const days = b.days === undefined ? text(cur.days) || ALL_DAYS : normDays(b.days);
    if (!title) return errResp("Title can't be empty");
    if (!days) return errResp("Pick at least one day");
    await env.DB.prepare("UPDATE routines SET title=?, notes=?, days=? WHERE id=?").bind(title, notes, days, id).run();
    return json({ ok: true });
  }

  if (req.method === "DELETE" && route === "") {
    const id = int(url.searchParams.get("id"));
    if (!id) return errResp("id required");
    await env.DB.prepare("UPDATE routines SET active=0 WHERE id=?").bind(id).run();
    return json({ ok: true });
  }

  return errResp("Not found", 404);
}

// ── /api/comments — task conversation (admin ↔ assigned employee) ────────────
async function canSeeTask(env: Env, auth: JwtPayload, taskId: string) {
  const t = await first(env, "SELECT id, title, created_by, assigned_user_id FROM tasks WHERE id=?", taskId);
  if (!t) return null;
  if (auth.role !== "admin" && Number(t.assigned_user_id) !== auth.sub) return null;
  return t;
}

async function handleComments(req: Request, env: Env, auth: JwtPayload, url: URL): Promise<Response> {
  if (req.method === "GET") {
    const taskId = text(url.searchParams.get("task_id"));
    if (!taskId || !(await canSeeTask(env, auth, taskId))) return errResp("Task not found", 404);
    const comments = await all(env,
      "SELECT c.id, c.task_id, c.user_id, c.body, c.kind, c.created_at, u.name AS user_name, u.role AS user_role FROM task_comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.task_id=? ORDER BY c.id ASC",
      taskId);
    const files = await all(env, "SELECT id, comment_id, name, size, type FROM task_files WHERE task_id=? AND comment_id IS NOT NULL ORDER BY id", taskId);
    for (const c of comments) c.files = files.filter((f) => f.comment_id === c.id);
    return json({ comments });
  }

  if (req.method === "POST") {
    const b = await req.json<any>().catch(() => ({}));
    const taskId = text(b.task_id);
    const body = text(b.body).slice(0, 4000);
    const fileIds = pendingFileIds(b.file_ids);
    if (!taskId || (!body && !fileIds.length)) return errResp("Message is empty");
    const t = await canSeeTask(env, auth, taskId);
    if (!t) return errResp("Task not found", 404);
    const r = await env.DB.prepare("INSERT INTO task_comments (task_id, user_id, body) VALUES (?,?,?)").bind(taskId, auth.sub, body).run();
    const files = await attachFiles(env, auth, taskId, Number(r.meta.last_row_id), fileIds);
    if (!body && !files) {
      await env.DB.prepare("DELETE FROM task_comments WHERE id=?").bind(r.meta.last_row_id).run();
      return errResp("Those files are no longer available — attach them again");
    }

    // Notify the other side: admin → assigned employee, employee → the admin who created the task.
    const snippet = body ? (body.length > 80 ? body.slice(0, 77) + "…" : body) : `sent ${plural(files, "file")}`;
    const recipient = auth.role === "admin" ? t.assigned_user_id : t.created_by;
    if (recipient && Number(recipient) !== auth.sub) {
      await notify(env, Number(recipient), "comment", `${auth.name} on "${t.title}": ${snippet}`, taskId);
    }
    return json({ ok: true, id: r.meta.last_row_id }, 201);
  }

  if (req.method === "DELETE") {
    const id = int(url.searchParams.get("id"));
    const c = await first(env, "SELECT user_id FROM task_comments WHERE id=?", id);
    if (!c || Number(c.user_id) !== auth.sub) return errResp("You can only delete your own messages", 403);
    await deleteFiles(env, "SELECT id, r2_key FROM task_files WHERE comment_id=?", id);
    await env.DB.prepare("DELETE FROM task_comments WHERE id=?").bind(id).run();
    return json({ ok: true });
  }

  return errResp("Method not allowed", 405);
}

// ── /api/files — attachments on task messages, stored in R2 ──────────────────
// Upload first (POST, raw body), then send the returned ids with a message or hand-in.
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 10;
// Stay inside R2's free tier (10 GB stored, 1M uploads/month) with room to spare, so it never bills.
const STORAGE_CAP_BYTES = 9 * 1024 ** 3;
const MONTHLY_UPLOAD_CAP = 500_000;
// Types a browser may show inline. Everything else (html, svg, …) is served as a download.
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"]);

const plural = (n: number, word: string) => (n ? `${n} ${word}${n > 1 ? "s" : ""}` : "");
const pendingFileIds = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(int).filter((n) => n > 0))].slice(0, MAX_FILES) : []);

// Link this user's not-yet-sent uploads on this task to a message. Returns how many were linked.
async function attachFiles(env: Env, auth: JwtPayload, taskId: string, commentId: number, ids: number[]) {
  if (!ids.length) return 0;
  const r = await env.DB.prepare(
    `UPDATE task_files SET comment_id=? WHERE task_id=? AND user_id=? AND comment_id IS NULL AND id IN (${ids.map(() => "?").join(",")})`,
  ).bind(commentId, taskId, auth.sub, ...ids).run();
  return r.meta.changes ?? 0;
}

async function deleteFiles(env: Env, sql: string, ...args: unknown[]) {
  const rows = await all(env, sql, ...args);
  if (!rows.length) return;
  if (env.FILES) await env.FILES.delete(rows.map((f) => String(f.r2_key)));
  for (const f of rows) await env.DB.prepare("DELETE FROM task_files WHERE id=?").bind(f.id).run();
}

function cleanFileName(v: unknown) {
  const name = text(v).replace(/[\\/\u0000-\u001f"]/g, "_").slice(0, 180);
  return name || "file";
}

async function handleFiles(req: Request, env: Env, auth: JwtPayload, url: URL): Promise<Response> {
  if (!env.FILES) return errResp("File uploads aren't set up yet.", 503);
  const id = int(url.pathname.split("/")[3]);

  if (req.method === "POST" && !id) {
    const taskId = text(url.searchParams.get("task_id"));
    if (!taskId || !(await canSeeTask(env, auth, taskId))) return errResp("Task not found", 404);
    const declared = int(req.headers.get("Content-Length"));
    if (declared > MAX_FILE_BYTES) return errResp("Files can be up to 25 MB", 413);
    const data = await req.arrayBuffer();
    if (!data.byteLength) return errResp("The file is empty");
    if (data.byteLength > MAX_FILE_BYTES) return errResp("Files can be up to 25 MB", 413);
    const usage = await first(env,
      "SELECT COALESCE(SUM(size),0) AS bytes, (SELECT COUNT(*) FROM task_files WHERE created_at >= strftime('%Y-%m-01','now')) AS month_uploads FROM task_files");
    if (Number(usage?.bytes) + data.byteLength > STORAGE_CAP_BYTES) return errResp("File storage is full (9 GB). Delete old tasks or messages with files to free space.", 507);
    if (Number(usage?.month_uploads) >= MONTHLY_UPLOAD_CAP) return errResp("Monthly upload limit reached — try again next month.", 429);
    const name = cleanFileName(url.searchParams.get("name"));
    const type = text(req.headers.get("Content-Type")).split(";")[0].toLowerCase().slice(0, 100) || "application/octet-stream";
    const key = `tasks/${taskId}/${crypto.randomUUID()}`;
    await env.FILES.put(key, data, { httpMetadata: { contentType: type } });
    const r = await env.DB.prepare("INSERT INTO task_files (task_id, user_id, name, size, type, r2_key) VALUES (?,?,?,?,?,?)")
      .bind(taskId, auth.sub, name, data.byteLength, type, key).run();
    return json({ file: { id: r.meta.last_row_id, name, size: data.byteLength, type } }, 201);
  }

  const f = id ? await first(env, "SELECT * FROM task_files WHERE id=?", id) : null;
  if (!f || !(await canSeeTask(env, auth, String(f.task_id)))) return errResp("File not found", 404);

  if (req.method === "GET") {
    const obj = await env.FILES.get(String(f.r2_key));
    if (!obj) return errResp("File not found", 404);
    const type = String(f.type);
    const inline = INLINE_TYPES.has(type);
    return new Response(obj.body, {
      headers: {
        "Content-Type": inline ? type : "application/octet-stream",
        "Content-Length": String(obj.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(String(f.name))}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'; sandbox",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // Remove an upload that hasn't been sent yet (sent files go away with their message).
  if (req.method === "DELETE") {
    if (Number(f.user_id) !== auth.sub || f.comment_id != null) return errResp("You can only remove files you haven't sent yet", 403);
    await deleteFiles(env, "SELECT id, r2_key FROM task_files WHERE id=?", id);
    return json({ ok: true });
  }

  return errResp("Method not allowed", 405);
}

// Uploads attached in the composer but never sent.
async function cleanupUnsentFiles(env: Env) {
  await deleteFiles(env, "SELECT id, r2_key FROM task_files WHERE comment_id IS NULL AND created_at < datetime('now', '-1 day')");
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
// ── /api/attendance — check-in/out from app usage ─────────────────────────────
// A session starts when an employee signs in or opens the app, stays open while the app pings
// (every few minutes), and ends on Sign out — or, if they just close it, at the last ping.
const IDLE_MS = 20 * 60 * 1000; // no ping for this long = the session ended at the last ping

async function attendancePing(env: Env, userId: number) {
  const now = new Date();
  const nowIso = now.toISOString();
  const day = todayIn(TIME_ZONE);
  const open = await first(env, "SELECT id, day, last_seen FROM attendance WHERE user_id=? AND check_out IS NULL ORDER BY id DESC LIMIT 1", userId);
  if (open && open.day === day && now.getTime() - Date.parse(String(open.last_seen)) < IDLE_MS) {
    await env.DB.prepare("UPDATE attendance SET last_seen=? WHERE id=?").bind(nowIso, open.id).run();
    return;
  }
  // Close anything left open (closed tab, sleep, or yesterday's session) at its last sign of life.
  await env.DB.prepare("UPDATE attendance SET check_out=MAX(last_seen, check_in), checkout_kind='auto' WHERE user_id=? AND check_out IS NULL").bind(userId).run();
  await env.DB.prepare("INSERT INTO attendance (user_id, day, check_in, last_seen) VALUES (?,?,?,?)").bind(userId, day, nowIso, nowIso).run();
}

async function handleAttendance(req: Request, env: Env, auth: JwtPayload, url: URL): Promise<Response> {
  const route = url.pathname.slice("/api/attendance".length);
  const isAdmin = auth.role === "admin";

  if (req.method === "POST" && route === "/ping") {
    if (!isAdmin) await attendancePing(env, auth.sub);
    return json({ ok: true });
  }

  if (req.method === "POST" && route === "/signout") {
    if (!isAdmin) {
      const nowIso = new Date().toISOString();
      await env.DB.prepare("UPDATE attendance SET check_out=?, last_seen=?, checkout_kind='signout' WHERE user_id=? AND check_out IS NULL").bind(nowIso, nowIso, auth.sub).run();
    }
    return json({ ok: true });
  }

  if (req.method === "GET" && route === "") {
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? from;
    if (!DAY_RE.test(from) || !DAY_RE.test(to)) return errResp("from/to must be YYYY-MM-DD");
    const rows = isAdmin
      ? await all(env, "SELECT a.*, u.name AS user_name FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.day BETWEEN ? AND ? ORDER BY a.day DESC, a.check_in ASC", from, to)
      : await all(env, "SELECT a.*, ? AS user_name FROM attendance a WHERE a.user_id=? AND a.day BETWEEN ? AND ? ORDER BY a.day DESC, a.check_in ASC", auth.name, auth.sub, from, to);
    const now = Date.now();
    // Sessions without a check-out are either live or were abandoned (closed at their last ping).
    for (const r of rows) {
      const live = !r.check_out && now - Date.parse(String(r.last_seen)) < IDLE_MS;
      r.online = live;
      r.effective_out = r.check_out ?? (live ? null : String(r.last_seen) > String(r.check_in) ? r.last_seen : r.check_in);
    }
    return json({ sessions: rows, idle_minutes: IDLE_MS / 60000 });
  }

  return errResp("Not found", 404);
}

// ── Evening routine check (cron, see wrangler.jsonc triggers) ────────────────
// Remind employees with unfinished routine items and tell the admins who's behind. Once per person per day.
async function eveningRoutineCheck(env: Env) {
  const day = todayIn(TIME_ZONE);
  const admins = await all(env, "SELECT id FROM users WHERE role='admin'");
  for (const e of await all(env, "SELECT id, name FROM users WHERE role='employee'")) {
    const uid = Number(e.id);
    const { total, done } = await routineProgress(env, uid, day);
    if (total === 0 || done >= total) continue;
    const key = `routine:${uid}:${day}`;
    if (await first(env, "SELECT id FROM notifications WHERE type='routine_missed' AND task_id=? LIMIT 1", key)) continue;
    const left = total - done;
    for (const a of admins) {
      await notify(env, Number(a.id), "routine_missed", `Evening check: ${e.name} has ${left} of ${total} routine item${total > 1 ? "s" : ""} left today`, key);
    }
    await notify(env, uid, "routine_reminder", `Reminder: ${left} routine item${left > 1 ? "s" : ""} left for today`, key);
  }
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(eveningRoutineCheck(env));
    ctx.waitUntil(cleanupUnsentFiles(env).catch((e) => console.error("[uv-tasks] file cleanup failed:", e)));
  },

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
          else if (url.pathname === "/api/routines" || url.pathname.startsWith("/api/routines/")) res = await handleRoutines(req, env, auth, url);
          else if (url.pathname === "/api/comments") res = await handleComments(req, env, auth, url);
          else if (url.pathname === "/api/files" || url.pathname.startsWith("/api/files/")) res = await handleFiles(req, env, auth, url);
          else if (url.pathname === "/api/attendance" || url.pathname.startsWith("/api/attendance/")) res = await handleAttendance(req, env, auth, url);
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
