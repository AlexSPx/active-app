ALTER TABLE routines ADD COLUMN updated_at TEXT;
UPDATE routines SET updated_at=created_at;
