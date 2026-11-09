CREATE TABLE expected_exercise_source_keys (
    dataset_version TEXT NOT NULL,
    source_key TEXT NOT NULL,
    exercise_id TEXT NOT NULL REFERENCES exercises(id),
    PRIMARY KEY(dataset_version, source_key)
) STRICT;
INSERT INTO expected_exercise_source_keys(dataset_version, source_key, exercise_id)
    SELECT dataset_version, source_key, exercise_id FROM exercise_source_keys;
INSERT OR IGNORE INTO expected_exercise_source_keys(dataset_version, source_key, exercise_id)
    SELECT dataset_version, source_key, id FROM exercises;
