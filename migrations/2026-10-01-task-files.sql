-- Files attached to task messages / hand-ins. The bytes live in R2 (binding FILES) under r2_key.
-- comment_id is NULL while an upload hasn't been sent yet (cleaned up by the daily cron).
CREATE TABLE IF NOT EXISTS task_files (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT NOT NULL,
  comment_id INTEGER,
  user_id    INTEGER,
  name       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  type       TEXT NOT NULL DEFAULT 'application/octet-stream',
  r2_key     TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id);
CREATE INDEX IF NOT EXISTS idx_task_files_comment ON task_files(comment_id);
