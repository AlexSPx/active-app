-- UUIDs are canonical lowercase text. Instants are UTC RFC 3339 strings; dates and
-- local times use ISO 8601. Application boundaries validate UUIDs, instants and timezones.
-- Chronological indexes split instants into whole UTC seconds and fractional digits.
-- Removing trailing fractional zeroes makes equivalent instants share the same key.
CREATE TABLE instance_metadata (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    instance_id TEXT NOT NULL UNIQUE
) STRICT;
CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    timezone TEXT,
    measurements_present INTEGER NOT NULL DEFAULT 0 CHECK (measurements_present IN (0, 1)),
    height_cm REAL CHECK (height_cm IS NULL OR height_cm > 0),
    weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg > 0),
    registration_completed INTEGER NOT NULL DEFAULT 0 CHECK (registration_completed IN (0, 1)),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    history_revision INTEGER NOT NULL DEFAULT 0 CHECK (history_revision >= 0),
    created_at TEXT NOT NULL CHECK(
        substr(created_at, 1, 19) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]' AND
        unixepoch(substr(created_at, 1, 19) || 'Z') IS NOT NULL AND
        (substr(created_at, 20) = 'Z' OR (substr(created_at, 20, 1) = '.' AND
         length(created_at) > 21 AND substr(created_at, -1) = 'Z' AND
         substr(created_at, 21, length(created_at) - 21) NOT GLOB '*[^0-9]*'))),
    CHECK(measurements_present = 1 OR (height_cm IS NULL AND weight_kg IS NULL))
) STRICT;
CREATE TABLE identities (
    issuer TEXT NOT NULL, subject TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (issuer, subject)
) STRICT;
-- Session contents and lifecycle are owned by the selected OIDC implementation.
CREATE TABLE sessions (
    id_hash TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL CHECK(
        substr(expires_at, 1, 19) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]' AND
        unixepoch(substr(expires_at, 1, 19) || 'Z') IS NOT NULL AND
        (substr(expires_at, 20) = 'Z' OR (substr(expires_at, 20, 1) = '.' AND
         length(expires_at) > 21 AND substr(expires_at, -1) = 'Z' AND
         substr(expires_at, 21, length(expires_at) - 21) NOT GLOB '*[^0-9]*')))
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL,
    dataset_version TEXT NOT NULL, source_key TEXT NOT NULL,
    name TEXT NOT NULL, retired INTEGER NOT NULL DEFAULT 0 CHECK (retired IN (0, 1)),
    level TEXT, category TEXT, force TEXT, mechanic TEXT, equipment TEXT,
    UNIQUE(dataset_version, source_key)
) STRICT;
CREATE TABLE exercise_legacy_keys (
    namespace TEXT NOT NULL, legacy_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL REFERENCES exercises(id),
    PRIMARY KEY(namespace, legacy_id)
) STRICT;
CREATE TABLE exercise_muscles (
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('PRIMARY', 'SECONDARY')),
    position INTEGER NOT NULL CHECK(position >= 0), muscle TEXT NOT NULL,
    PRIMARY KEY(exercise_id, kind, position)
) STRICT;
CREATE TABLE exercise_instructions (
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position >= 0), instruction TEXT NOT NULL,
    PRIMARY KEY(exercise_id, position)
) STRICT;
CREATE TABLE workouts (
    id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT, version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
    created_at TEXT NOT NULL CHECK(
        substr(created_at, 1, 19) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]' AND
        unixepoch(substr(created_at, 1, 19) || 'Z') IS NOT NULL AND
        (substr(created_at, 20) = 'Z' OR (substr(created_at, 20, 1) = '.' AND
         length(created_at) > 21 AND substr(created_at, -1) = 'Z' AND
         substr(created_at, 21, length(created_at) - 21) NOT GLOB '*[^0-9]*'))), UNIQUE(owner_id, id)
) STRICT;
CREATE INDEX workouts_owner_created ON workouts(owner_id, unixepoch(substr(created_at, 1, 19) || 'Z'),
    CASE WHEN length(created_at) > 20 THEN rtrim(substr(created_at, 21, length(created_at) - 21), '0') ELSE '' END, id);
CREATE TABLE workout_exercises (
    owner_id TEXT NOT NULL, workout_id TEXT NOT NULL, position INTEGER NOT NULL CHECK(position >= 0),
    exercise_id TEXT NOT NULL REFERENCES exercises(id), notes TEXT,
    PRIMARY KEY(workout_id, position),
    FOREIGN KEY(owner_id, workout_id) REFERENCES workouts(owner_id, id) ON DELETE CASCADE
) STRICT;
CREATE TABLE workout_sets (
    workout_id TEXT NOT NULL, exercise_position INTEGER NOT NULL, position INTEGER NOT NULL CHECK(position >= 0),
    kind TEXT NOT NULL CHECK(kind IN ('WEIGHT', 'DURATION')),
    reps INTEGER CHECK(reps IS NULL OR reps >= 0), weight_kg REAL CHECK(weight_kg IS NULL OR weight_kg >= 0),
    duration_seconds REAL CHECK(duration_seconds IS NULL OR duration_seconds >= 0),
    CHECK((kind = 'WEIGHT' AND reps IS NOT NULL AND weight_kg IS NOT NULL AND duration_seconds IS NULL) OR
          (kind = 'DURATION' AND reps IS NULL AND weight_kg IS NULL AND duration_seconds IS NOT NULL)),
    PRIMARY KEY(workout_id, exercise_position, kind, position),
    FOREIGN KEY(workout_id, exercise_position) REFERENCES workout_exercises(workout_id, position) ON DELETE CASCADE
) STRICT;
CREATE TABLE routines (
    id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, description TEXT, routine_type TEXT NOT NULL CHECK(routine_type IN ('SEQUENTIAL','WEEKLY_COMPLETION')),
    start_date TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0), created_at TEXT NOT NULL CHECK(
        substr(created_at, 1, 19) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]' AND
        unixepoch(substr(created_at, 1, 19) || 'Z') IS NOT NULL AND
        (substr(created_at, 20) = 'Z' OR (substr(created_at, 20, 1) = '.' AND
         length(created_at) > 21 AND substr(created_at, -1) = 'Z' AND
         substr(created_at, 21, length(created_at) - 21) NOT GLOB '*[^0-9]*'))),
    UNIQUE(owner_id, id)
) STRICT;
CREATE INDEX routines_owner_created ON routines(owner_id, unixepoch(substr(created_at, 1, 19) || 'Z'),
    CASE WHEN length(created_at) > 20 THEN rtrim(substr(created_at, 21, length(created_at) - 21), '0') ELSE '' END, id);
CREATE TABLE active_routines (
    owner_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    routine_id TEXT NOT NULL,
    FOREIGN KEY(owner_id, routine_id) REFERENCES routines(owner_id, id) ON DELETE CASCADE
) STRICT;
CREATE TABLE routine_pattern (
    owner_id TEXT NOT NULL, routine_id TEXT NOT NULL, day_index INTEGER NOT NULL CHECK(day_index BETWEEN 0 AND 6),
    day_type TEXT NOT NULL CHECK(day_type IN ('REST','WORKOUT')), workout_id TEXT,
    CHECK((day_type = 'REST' AND workout_id IS NULL) OR (day_type = 'WORKOUT' AND workout_id IS NOT NULL)),
    PRIMARY KEY(routine_id, day_index),
    FOREIGN KEY(owner_id, routine_id) REFERENCES routines(owner_id, id) ON DELETE CASCADE,
    FOREIGN KEY(owner_id, workout_id) REFERENCES workouts(owner_id, id)
) STRICT;
CREATE INDEX routine_pattern_workout ON routine_pattern(owner_id, workout_id);
-- Tombstones outlive deletion of their corresponding record.
CREATE TABLE client_record_ids (
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, client_record_id TEXT NOT NULL,
    PRIMARY KEY(owner_id, client_record_id)
) STRICT;
CREATE TABLE workout_records (
    id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_record_id TEXT NOT NULL, workout_id TEXT, workout_title TEXT NOT NULL, notes TEXT,
    start_time TEXT NOT NULL CHECK(
        substr(start_time, 1, 19) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]' AND
        unixepoch(substr(start_time, 1, 19) || 'Z') IS NOT NULL AND
        (substr(start_time, 20) = 'Z' OR (substr(start_time, 20, 1) = '.' AND
         length(start_time) > 21 AND substr(start_time, -1) = 'Z' AND
         substr(start_time, 21, length(start_time) - 21) NOT GLOB '*[^0-9]*'))), completed_at TEXT NOT NULL CHECK(
        substr(completed_at, 1, 19) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]' AND
        unixepoch(substr(completed_at, 1, 19) || 'Z') IS NOT NULL AND
        (substr(completed_at, 20) = 'Z' OR (substr(completed_at, 20, 1) = '.' AND
         length(completed_at) > 21 AND substr(completed_at, -1) = 'Z' AND
         substr(completed_at, 21, length(completed_at) - 21) NOT GLOB '*[^0-9]*'))), completion_timezone TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0), created_at TEXT NOT NULL CHECK(
        substr(created_at, 1, 19) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]' AND
        unixepoch(substr(created_at, 1, 19) || 'Z') IS NOT NULL AND
        (substr(created_at, 20) = 'Z' OR (substr(created_at, 20, 1) = '.' AND
         length(created_at) > 21 AND substr(created_at, -1) = 'Z' AND
         substr(created_at, 21, length(created_at) - 21) NOT GLOB '*[^0-9]*'))),
    UNIQUE(owner_id, id), UNIQUE(owner_id, client_record_id),
    FOREIGN KEY(owner_id, client_record_id) REFERENCES client_record_ids(owner_id, client_record_id),
    FOREIGN KEY(owner_id, workout_id) REFERENCES workouts(owner_id, id)
) STRICT;
CREATE INDEX records_chronology ON workout_records(owner_id, unixepoch(substr(completed_at, 1, 19) || 'Z'),
    CASE WHEN length(completed_at) > 20 THEN rtrim(substr(completed_at, 21, length(completed_at) - 21), '0') ELSE '' END, id);
CREATE INDEX records_workout ON workout_records(owner_id, workout_id);
CREATE TABLE record_exercises (
    record_id TEXT NOT NULL REFERENCES workout_records(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position >= 0), exercise_id TEXT REFERENCES exercises(id), exercise_name TEXT NOT NULL, notes TEXT,
    dataset_version TEXT, source_key TEXT, legacy_namespace TEXT, legacy_id TEXT,
    CHECK((dataset_version IS NULL) = (source_key IS NULL)),
    CHECK((legacy_namespace IS NULL) = (legacy_id IS NULL)),
    CHECK(source_key IS NOT NULL OR legacy_id IS NOT NULL),
    PRIMARY KEY(record_id, position)
) STRICT;
CREATE INDEX record_exercises_identity ON record_exercises(exercise_id, record_id);
CREATE TABLE record_sets (
    record_id TEXT NOT NULL, exercise_position INTEGER NOT NULL, position INTEGER NOT NULL CHECK(position >= 0),
    kind TEXT NOT NULL CHECK(kind IN ('WEIGHT', 'DURATION')),
    reps INTEGER CHECK(reps IS NULL OR reps >= 0), weight_kg REAL CHECK(weight_kg IS NULL OR weight_kg >= 0),
    duration_seconds REAL CHECK(duration_seconds IS NULL OR duration_seconds >= 0),
    CHECK((kind = 'WEIGHT' AND reps IS NOT NULL AND weight_kg IS NOT NULL AND duration_seconds IS NULL) OR
          (kind = 'DURATION' AND reps IS NULL AND weight_kg IS NULL AND duration_seconds IS NOT NULL)),
    PRIMARY KEY(record_id, exercise_position, kind, position),
    FOREIGN KEY(record_id, exercise_position) REFERENCES record_exercises(record_id, position) ON DELETE CASCADE
) STRICT;
CREATE TABLE personal_bests (
    record_id TEXT NOT NULL, exercise_position INTEGER NOT NULL,
    estimated_one_rep_max_kg REAL CHECK(estimated_one_rep_max_kg IS NULL OR estimated_one_rep_max_kg >= 0),
    volume_kg_reps REAL CHECK(volume_kg_reps IS NULL OR volume_kg_reps >= 0),
    PRIMARY KEY(record_id, exercise_position),
    FOREIGN KEY(record_id, exercise_position) REFERENCES record_exercises(record_id, position) ON DELETE CASCADE
) STRICT;
CREATE TABLE streak_snapshots (
    owner_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK(version > 0), history_revision INTEGER NOT NULL CHECK(history_revision >= 0),
    rules_version TEXT NOT NULL, current_streak INTEGER NOT NULL CHECK(current_streak >= 0),
    longest_streak INTEGER NOT NULL CHECK(longest_streak >= 0), next_workout_id TEXT, next_workout_deadline TEXT,
    streak_freeze_count INTEGER NOT NULL CHECK(streak_freeze_count >= 0), last_workout_counted_date TEXT,
    current_week_start TEXT,
    FOREIGN KEY(owner_id, next_workout_id) REFERENCES workouts(owner_id, id)
) STRICT;
CREATE TABLE streak_weekly_workouts (
    owner_id TEXT NOT NULL REFERENCES streak_snapshots(owner_id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position >= 0), workout_id TEXT NOT NULL,
    PRIMARY KEY(owner_id, position),
    FOREIGN KEY(owner_id, workout_id) REFERENCES workouts(owner_id, id)
) STRICT;
CREATE TABLE reminder_preferences (
    owner_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK(version > 0), timezone TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1))
) STRICT;
CREATE TABLE reminder_times (
    owner_id TEXT NOT NULL REFERENCES reminder_preferences(owner_id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position >= 0), local_time TEXT NOT NULL,
    PRIMARY KEY(owner_id, position), UNIQUE(owner_id, local_time)
) STRICT;
CREATE TABLE idempotency_receipts (
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, operation_key TEXT NOT NULL,
    method TEXT NOT NULL, target TEXT NOT NULL, body_hash BLOB NOT NULL,
    response_status INTEGER NOT NULL CHECK(response_status BETWEEN 100 AND 599), response_body BLOB NOT NULL,
    completed_at TEXT NOT NULL CHECK(
        substr(completed_at, 1, 19) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]' AND
        unixepoch(substr(completed_at, 1, 19) || 'Z') IS NOT NULL AND
        (substr(completed_at, 20) = 'Z' OR (substr(completed_at, 20, 1) = '.' AND
         length(completed_at) > 21 AND substr(completed_at, -1) = 'Z' AND
         substr(completed_at, 21, length(completed_at) - 21) NOT GLOB '*[^0-9]*'))), PRIMARY KEY(owner_id, operation_key)
) STRICT;
CREATE INDEX receipts_expiry ON idempotency_receipts(unixepoch(substr(completed_at, 1, 19) || 'Z'),
    CASE WHEN length(completed_at) > 20 THEN rtrim(substr(completed_at, 21, length(completed_at) - 21), '0') ELSE '' END);
