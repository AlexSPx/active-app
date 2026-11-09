CREATE TABLE catalog_metadata (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    source_dataset_version TEXT NOT NULL,
    catalog_version INTEGER NOT NULL CHECK(catalog_version > 0),
    content_hash TEXT NOT NULL
) STRICT;
CREATE TABLE exercise_source_keys (
    dataset_version TEXT NOT NULL,
    source_key TEXT NOT NULL,
    exercise_id TEXT NOT NULL REFERENCES exercises(id),
    PRIMARY KEY(dataset_version, source_key)
) STRICT;
INSERT INTO exercise_source_keys(dataset_version, source_key, exercise_id)
    SELECT dataset_version, source_key, id FROM exercises;
