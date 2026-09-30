-- For databases created before these columns existed (schema.sql already includes them).
ALTER TABLE routines ADD COLUMN days TEXT NOT NULL DEFAULT '0123456';
ALTER TABLE task_comments ADD COLUMN kind TEXT NOT NULL DEFAULT 'message';
