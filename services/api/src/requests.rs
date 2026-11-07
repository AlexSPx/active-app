//! Typed request bodies and decoded parameters for the version 1 wire contract.
use crate::boundary::{ApiError, PatternItem, RoutineType, Validate, WorkoutId};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const MAX_INT: u64 = 9_007_199_254_740_991;
fn len(s: &str) -> usize {
    s.encode_utf16().count()
}
fn id(s: &str) -> bool {
    super::boundary::valid_id(s)
}
fn text(s: &str) -> bool {
    super::boundary::valid_text(s)
}
fn notes(s: &Option<String>) -> bool {
    s.as_ref().is_none_or(|s| len(s) <= 10000)
}
fn version(v: u64) -> bool {
    v > 0 && v <= MAX_INT
}
fn zone(s: &str) -> bool {
    (s == "UTC" || s.contains('/')) && chrono_tz::Tz::from_str_insensitive(s).is_ok()
}
fn date(s: &str) -> bool {
    super::boundary::valid_date(s)
}
fn check(ok: bool, field: &'static str) -> Result<(), ApiError> {
    if ok {
        Ok(())
    } else {
        Err(ApiError::validation(field))
    }
}
fn nullable<'de, D: serde::Deserializer<'de>, T: Deserialize<'de>>(
    d: D,
) -> Result<Option<Option<T>>, D::Error> {
    Option::<T>::deserialize(d).map(Some)
}
fn present<'de, D: serde::Deserializer<'de>, T: Deserialize<'de>>(
    d: D,
) -> Result<Option<T>, D::Error> {
    T::deserialize(d).map(Some)
}
fn aligned(reps: &[u64], weight: &[f64], duration: &[f64]) -> bool {
    reps.len() == weight.len()
        && reps.iter().all(|v| *v <= MAX_INT)
        && weight
            .iter()
            .chain(duration)
            .all(|v| v.is_finite() && *v >= 0.0)
}
fn pattern(items: &[PatternItem]) -> bool {
    !items.is_empty()
        && items.len() <= 7
        && items.iter().enumerate().all(|(i, item)| {
            usize::from(item.day_index) == i
                && matches!(
                    (&item.day_type, &item.workout_id),
                    (crate::boundary::DayType::Rest, None)
                        | (crate::boundary::DayType::Workout, Some(_))
                )
        })
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Measurements {
    #[serde(deserialize_with = "super::boundary::required_nullable")]
    pub weight_kg: Option<f64>,
    #[serde(deserialize_with = "super::boundary::required_nullable")]
    pub height_cm: Option<f64>,
}
impl Measurements {
    fn valid(&self) -> bool {
        [self.weight_kg, self.height_cm]
            .into_iter()
            .flatten()
            .all(|n| n.is_finite() && n > 0.0)
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateProfile {
    #[serde(deserialize_with = "super::boundary::integer")]
    pub base_version: u64,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub username: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub email: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub first_name: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub last_name: Option<String>,
    #[serde(
        default,
        deserialize_with = "nullable",
        skip_serializing_if = "Option::is_none"
    )]
    pub timezone: Option<Option<String>>,
    #[serde(
        default,
        deserialize_with = "nullable",
        skip_serializing_if = "Option::is_none"
    )]
    pub measurements: Option<Option<Measurements>>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub registration_completed: Option<bool>,
}
impl Validate for UpdateProfile {
    fn validate(&self) -> Result<(), ApiError> {
        check(version(self.base_version), "baseVersion")?;
        check(
            self.username.as_ref().is_none_or(|s| {
                (3..=30).contains(&s.len())
                    && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
            }),
            "username",
        )?;
        check(self.email.as_ref().is_none_or(|s| { let re = regex::Regex::new(r"^[A-Za-z0-9_'+.\-]*[A-Za-z0-9_+\-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$").unwrap(); len(s) <= 254 && !s.starts_with('.') && !s.contains("..") && re.is_match(s) }), "email")?;
        check(
            self.first_name.as_ref().is_none_or(|s| text(s)),
            "firstName",
        )?;
        check(self.last_name.as_ref().is_none_or(|s| text(s)), "lastName")?;
        check(
            self.timezone
                .as_ref()
                .and_then(|v| v.as_ref())
                .is_none_or(|s| zone(s)),
            "timezone",
        )?;
        check(
            self.measurements
                .as_ref()
                .and_then(|v| v.as_ref())
                .is_none_or(Measurements::valid),
            "measurements",
        )
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemplateExercise {
    pub exercise_id: String,
    #[serde(default, deserialize_with = "super::boundary::integers")]
    pub reps: Vec<u64>,
    #[serde(default)]
    pub weight: Vec<f64>,
    #[serde(default)]
    pub duration_seconds: Vec<f64>,
    #[serde(default)]
    pub notes: Option<String>,
}
impl TemplateExercise {
    fn valid(&self) -> bool {
        id(&self.exercise_id)
            && aligned(&self.reps, &self.weight, &self.duration_seconds)
            && notes(&self.notes)
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Template {
    pub exercises: Vec<TemplateExercise>,
}
impl Template {
    fn valid(&self) -> bool {
        self.exercises.iter().all(TemplateExercise::valid)
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateWorkout {
    pub title: String,
    #[serde(default)]
    pub notes: Option<String>,
    pub template: Template,
}
impl Validate for CreateWorkout {
    fn validate(&self) -> Result<(), ApiError> {
        check(text(&self.title), "title")?;
        check(notes(&self.notes), "notes")?;
        check(self.template.valid(), "template")
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateWorkout {
    #[serde(deserialize_with = "super::boundary::integer")]
    pub base_version: u64,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub title: Option<String>,
    #[serde(
        default,
        deserialize_with = "nullable",
        skip_serializing_if = "Option::is_none"
    )]
    pub notes: Option<Option<String>>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub template: Option<Template>,
}
impl Validate for UpdateWorkout {
    fn validate(&self) -> Result<(), ApiError> {
        check(version(self.base_version), "baseVersion")?;
        check(self.title.as_ref().is_none_or(|s| text(s)), "title")?;
        check(self.notes.as_ref().is_none_or(notes), "notes")?;
        check(
            self.template.as_ref().is_none_or(Template::valid),
            "template",
        )
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateRoutine {
    #[serde(deserialize_with = "super::boundary::integer")]
    pub base_version: u64,
    #[serde(
        default,
        deserialize_with = "super::boundary::optional_integer",
        skip_serializing_if = "Option::is_none"
    )]
    pub profile_base_version: Option<u64>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub name: Option<String>,
    #[serde(
        default,
        deserialize_with = "nullable",
        skip_serializing_if = "Option::is_none"
    )]
    pub description: Option<Option<String>>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub routine_type: Option<RoutineType>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub pattern: Option<Vec<PatternItem>>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub start_date: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub active: Option<bool>,
}
impl Validate for UpdateRoutine {
    fn validate(&self) -> Result<(), ApiError> {
        check(version(self.base_version), "baseVersion")?;
        check(
            self.profile_base_version.is_none_or(version)
                && (self.active.is_none() || self.profile_base_version.is_some()),
            "profileBaseVersion",
        )?;
        check(self.name.as_ref().is_none_or(|s| text(s)), "name")?;
        check(self.description.as_ref().is_none_or(notes), "description")?;
        check(self.pattern.as_ref().is_none_or(|v| pattern(v)), "pattern")?;
        check(
            self.start_date.as_ref().is_none_or(|s| date(s)),
            "startDate",
        )
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Identity {
    #[serde(deserialize_with = "super::boundary::required_nullable")]
    pub source_dataset_version: Option<String>,
    #[serde(deserialize_with = "super::boundary::required_nullable")]
    pub source_key: Option<String>,
    #[serde(deserialize_with = "super::boundary::required_nullable")]
    pub legacy_namespace: Option<String>,
    #[serde(deserialize_with = "super::boundary::required_nullable")]
    pub legacy_id: Option<String>,
}
impl Identity {
    fn valid(&self) -> bool {
        let a = self.source_dataset_version.is_some();
        let b = self.legacy_namespace.is_some();
        a == self.source_key.is_some()
            && b == self.legacy_id.is_some()
            && (a || b)
            && [
                &self.source_dataset_version,
                &self.source_key,
                &self.legacy_namespace,
                &self.legacy_id,
            ]
            .into_iter()
            .flatten()
            .all(|s| id(s))
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExerciseRecord {
    #[serde(deserialize_with = "super::boundary::required_nullable")]
    pub exercise_id: Option<String>,
    pub identity: Identity,
    pub exercise_name: String,
    #[serde(default, deserialize_with = "super::boundary::integers")]
    pub reps: Vec<u64>,
    #[serde(default)]
    pub weight: Vec<f64>,
    #[serde(default)]
    pub duration_seconds: Vec<f64>,
    #[serde(default)]
    pub notes: Option<String>,
}
impl ExerciseRecord {
    fn valid(&self) -> bool {
        self.exercise_id.as_ref().is_none_or(|s| id(s))
            && self.identity.valid()
            && text(&self.exercise_name)
            && aligned(&self.reps, &self.weight, &self.duration_seconds)
            && notes(&self.notes)
    }
}
fn instant(s: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    let re = regex::Regex::new(
        r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]+)?)?Z$",
    )
    .unwrap();
    if !re.is_match(s) {
        return None;
    }
    let normalized = if s.len() == 17 {
        format!("{}:00Z", &s[..16])
    } else {
        s.to_owned()
    };
    chrono::DateTime::parse_from_rfc3339(&normalized)
        .ok()
        .and_then(|v| chrono::DateTime::from_timestamp_millis(v.timestamp_millis()))
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateRecord {
    pub client_record_id: String,
    #[serde(deserialize_with = "super::boundary::required_nullable")]
    pub workout_id: Option<WorkoutId>,
    pub workout_title: String,
    #[serde(default)]
    pub notes: Option<String>,
    pub start_time: String,
    pub completed_at: String,
    pub completion_timezone: String,
    pub exercise_records: Vec<ExerciseRecord>,
}
impl Validate for CreateRecord {
    fn validate(&self) -> Result<(), ApiError> {
        check(id(&self.client_record_id), "clientRecordId")?;
        check(text(&self.workout_title), "workoutTitle")?;
        check(notes(&self.notes), "notes")?;
        let start = instant(&self.start_time);
        let end = instant(&self.completed_at);
        check(start.is_some(), "startTime")?;
        check(end.is_some_and(|v| Some(v) >= start), "completedAt")?;
        check(zone(&self.completion_timezone), "completionTimezone")?;
        check(
            self.exercise_records.iter().all(ExerciseRecord::valid),
            "exerciseRecords",
        )
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PutSnapshot {
    #[serde(deserialize_with = "super::boundary::integer")]
    pub base_version: u64,
    #[serde(deserialize_with = "super::boundary::integer")]
    pub history_revision: u64,
    pub rules_version: String,
    #[serde(deserialize_with = "super::boundary::integer")]
    pub current_streak: u64,
    #[serde(deserialize_with = "super::boundary::integer")]
    pub longest_streak: u64,
    #[serde(deserialize_with = "super::boundary::required_nullable")]
    pub next_workout_id: Option<WorkoutId>,
    #[serde(deserialize_with = "super::boundary::required_nullable")]
    pub next_workout_deadline: Option<String>,
    #[serde(deserialize_with = "super::boundary::integer")]
    pub streak_freeze_count: u64,
    #[serde(deserialize_with = "super::boundary::required_nullable")]
    pub last_workout_counted_date: Option<String>,
    pub weekly_completed_workout_ids: Vec<WorkoutId>,
    #[serde(deserialize_with = "super::boundary::required_nullable")]
    pub current_week_start: Option<String>,
}
impl Validate for PutSnapshot {
    fn validate(&self) -> Result<(), ApiError> {
        check(
            [
                self.base_version,
                self.history_revision,
                self.current_streak,
                self.longest_streak,
                self.streak_freeze_count,
            ]
            .iter()
            .all(|v| *v <= MAX_INT),
            "version",
        )?;
        check(id(&self.rules_version), "rulesVersion")?;
        check(
            [
                &self.next_workout_deadline,
                &self.last_workout_counted_date,
                &self.current_week_start,
            ]
            .into_iter()
            .flatten()
            .all(|s| date(s)),
            "date",
        )
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PutPreferences {
    #[serde(deserialize_with = "super::boundary::integer")]
    pub base_version: u64,
    pub enabled: bool,
    pub schedule: Vec<String>,
    pub timezone: String,
}
impl Validate for PutPreferences {
    fn validate(&self) -> Result<(), ApiError> {
        check(self.base_version <= MAX_INT, "baseVersion")?;
        let mut seen = HashSet::new();
        check(
            self.schedule.iter().all(|s| {
                let b = s.as_bytes();
                b.len() == 5
                    && b[2] == b':'
                    && b[0].is_ascii_digit()
                    && b[1].is_ascii_digit()
                    && b[3].is_ascii_digit()
                    && b[4].is_ascii_digit()
                    && &s[..2] <= "23"
                    && &s[3..] <= "59"
                    && seen.insert(s)
            }),
            "schedule",
        )?;
        check(zone(&self.timezone), "timezone")
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VersionQuery {
    pub base_version: u64,
}
impl Validate for VersionQuery {
    fn validate(&self) -> Result<(), ApiError> {
        check(version(self.base_version), "baseVersion")
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoutineDeleteQuery {
    pub base_version: u64,
    pub profile_base_version: u64,
}
impl Validate for RoutineDeleteQuery {
    fn validate(&self) -> Result<(), ApiError> {
        check(version(self.base_version), "baseVersion")?;
        check(version(self.profile_base_version), "profileBaseVersion")
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SearchQuery {
    pub name: String,
}
impl Validate for SearchQuery {
    fn validate(&self) -> Result<(), ApiError> {
        check(text(&self.name), "name")
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IdPath {
    pub id: String,
}
impl Validate for IdPath {
    fn validate(&self) -> Result<(), ApiError> {
        check(id(&self.id), "id")
    }
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmptyParams {}
impl Validate for EmptyParams {
    fn validate(&self) -> Result<(), ApiError> {
        Ok(())
    }
}
