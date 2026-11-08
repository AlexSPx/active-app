//! HTTP response DTOs, independent of database rows.
use crate::boundary::{PatternItem, RoutineType};
use crate::requests::{Identity, Measurements};
use serde::{Deserialize, Serialize};

macro_rules! dto {
    ($name:ident { $($field:ident: $ty:ty),* $(,)? }) => {
        #[derive(Debug, Serialize, Deserialize)]
        #[serde(rename_all = "camelCase")]
        pub struct $name { $(pub $field: $ty),* }
    };
}
macro_rules! wire_enum {
    ($name:ident { $($variant:ident),* $(,)? }) => {
        #[derive(Debug, Serialize, Deserialize)]
        #[serde(rename_all = "SCREAMING_SNAKE_CASE")]
        pub enum $name { $($variant),* }
    };
}
wire_enum!(Category {
    Strength,
    Stretching,
    Plyometrics,
    Strongman,
    Powerlifting,
    Cardio,
    OlympicWeightlifting
});
wire_enum!(Level {
    Beginner,
    Intermediate,
    Expert
});
wire_enum!(Force { Pull, Push, Static });
wire_enum!(Mechanic {
    Compound,
    Isolation
});
wire_enum!(Equipment {
    BodyOnly,
    Machine,
    Other,
    FoamRoll,
    Kettlebells,
    Dumbbell,
    Cable,
    Barbell,
    Bands,
    MedicineBall,
    ExerciseBall,
    EZCurlBar
});

dto!(Profile { id: String, email: String, username: String, first_name: String, last_name: String, created_at: String, timezone: Option<String>, active_routine_id: Option<String>, measurements: Option<Measurements>, registration_completed: bool, profile_version: u64 });
dto!(DeletedProfile {
    deleted_user_id: String
});
dto!(Exercise { id: String, source_key: String, retired: bool, name: String, level: Option<Level>, force: Option<Force>, mechanic: Option<Mechanic>, equipment: Option<Equipment>, primary_muscles: Vec<String>, secondary_muscles: Vec<String>, instructions: Vec<String>, category: Option<Category> });
dto!(Catalog { catalog_version: u64, source_dataset_version: String, mapping_complete: bool, unresolved_source_keys: Vec<String>, unresolved_legacy_ids: Vec<String>, items: Vec<Exercise> });
dto!(ProgressionLog { exercise_record_id: String, exercise_id: String, exercise_name: String, created_at: String, reps: Vec<u64>, weight: Vec<f64>, duration_seconds: Vec<f64>, achieved_one_rm_value: Option<f64>, achieved_one_rm_set_index: Option<u64>, achieved_total_volume_value: Option<f64> });
dto!(TemplateExercise { exercise_id: String, exercise_title: String, reps: Vec<u64>, weight: Vec<f64>, duration_seconds: Vec<f64>, category: Option<Category>, primary_muscles: Vec<String>, secondary_muscles: Vec<String> });
dto!(WorkoutTemplate { id: String, exercises: Vec<TemplateExercise>, created_at: String, updated_at: String });
dto!(Workout { id: String, title: String, notes: Option<String>, created_at: String, updated_at: String, version: u64, workout_template: WorkoutTemplate });
dto!(EntityVersion {
    id: String,
    version: u64
});
dto!(DeletedWorkout { deleted_workout_id: String, routine_versions: Vec<EntityVersion> });
dto!(Routine { id: String, name: String, description: Option<String>, user_id: String, routine_type: RoutineType, pattern: Vec<PatternItem>, start_date: String, created_at: String, updated_at: String, version: u64, profile_version: u64 });
dto!(DeletedRoutine {
    deleted_routine_id: String,
    profile_version: u64
});
dto!(HistoryRevision {
    history_revision: u64
});
dto!(RecordExercise { exercise_id: Option<String>, exercise_name: String, reps: Vec<u64>, weight: Vec<f64>, duration_seconds: Vec<f64>, notes: Option<String>, achieved_one_rm_value: Option<f64>, achieved_one_rm_set_index: Option<u64>, achieved_total_volume_value: Option<f64>, identity: Identity });
dto!(Record { id: String, client_record_id: String, workout_id: Option<String>, workout_title: String, notes: Option<String>, created_at: String, start_time: String, completed_at: String, completion_timezone: String, version: u64, exercise_records: Vec<RecordExercise> });
dto!(CreatedRecord {
    workout_record: Record,
    history_revision: u64
});
dto!(DeletedRecord {
    deleted_record_id: String,
    history_revision: u64
});
dto!(Snapshot { version: u64, history_revision: u64, rules_version: String, current_streak: u64, longest_streak: u64, next_workout_id: Option<String>, next_workout_deadline: Option<String>, streak_freeze_count: u64, last_workout_counted_date: Option<String>, weekly_completed_workout_ids: Vec<String>, current_week_start: Option<String> });
dto!(Preferences { version: u64, enabled: bool, schedule: Vec<String>, timezone: String });
