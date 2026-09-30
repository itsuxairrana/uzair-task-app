-- Mirrors the MySQL schema from public/api/setup.php.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','employee')),
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  notes            TEXT,
  priority         TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status           TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  due_date         TEXT,
  due_time         TEXT DEFAULT '',
  assigned_to      TEXT DEFAULT '',
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  workspace        TEXT NOT NULL DEFAULT 'personal',
  client_tag       TEXT DEFAULT '',
  created_by       INTEGER NOT NULL REFERENCES users(id),
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assigned_user_id);

CREATE TABLE IF NOT EXISTS milestones (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  instruction TEXT,
  done        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_milestones_task ON milestones(task_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'task_completed',
  message    TEXT NOT NULL,
  task_id    TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- Login lockout (same pattern as uv-pos-app).
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(ip, at);

-- Google connection per Task OS user (server-side OAuth; refresh token never leaves the Worker).
CREATE TABLE IF NOT EXISTS google_accounts (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  access_token  TEXT,
  access_exp    INTEGER NOT NULL DEFAULT 0,
  email         TEXT,
  name          TEXT,
  picture       TEXT,
  updated_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Daily routine: a checklist the admin sets per employee; checked off fresh each day.
CREATE TABLE IF NOT EXISTS routines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  notes      TEXT DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1, -- removed items are deactivated so history stays intact
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);

CREATE TABLE IF NOT EXISTS routine_checks (
  routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  day        TEXT NOT NULL, -- employee's local date, YYYY-MM-DD
  done_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (routine_id, day)
);
CREATE INDEX IF NOT EXISTS idx_routine_checks_day ON routine_checks(day);

-- Conversation on a task between the admin and the assigned employee.
CREATE TABLE IF NOT EXISTS task_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
