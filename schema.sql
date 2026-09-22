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
