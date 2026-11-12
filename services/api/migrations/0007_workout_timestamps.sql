ALTER TABLE workouts ADD COLUMN updated_at TEXT;
ALTER TABLE workouts ADD COLUMN template_id TEXT;
ALTER TABLE workouts ADD COLUMN template_updated_at TEXT;
UPDATE workouts SET updated_at=created_at, template_id=id, template_updated_at=created_at;
