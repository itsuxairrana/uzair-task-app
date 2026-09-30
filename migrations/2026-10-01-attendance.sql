-- Attendance: one row per app session (sign-in/open → sign-out or last activity).
CREATE TABLE IF NOT EXISTS attendance (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day           TEXT NOT NULL,   -- working day in Asia/Karachi, YYYY-MM-DD
  check_in      TEXT NOT NULL,   -- ISO UTC
  last_seen     TEXT NOT NULL,   -- ISO UTC, bumped by the app every few minutes
  check_out     TEXT,            -- ISO UTC; NULL while the session is open
  checkout_kind TEXT             -- 'signout' | 'auto' (closed tab / went idle)
);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id, day);
CREATE INDEX IF NOT EXISTS idx_attendance_day ON attendance(day);
