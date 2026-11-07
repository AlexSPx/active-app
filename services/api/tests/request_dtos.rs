use active_api::{
    boundary::{CreateRoutine, Validate, ValidatedJson, ValidatedQuery},
    requests::*,
};
use axum::{
    Json, Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
    routing::{get, post},
};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn echo<T: DeserializeOwned + Serialize + Validate>(
    ValidatedJson(value): ValidatedJson<T>,
) -> Json<T> {
    Json(value)
}
async fn query(ValidatedQuery(value): ValidatedQuery<VersionQuery>) -> Json<VersionQuery> {
    Json(value)
}
fn harness() -> Router {
    Router::new()
        .route("/query", get(query))
        .route("/profile.update", post(echo::<UpdateProfile>))
        .route("/workout.create", post(echo::<CreateWorkout>))
        .route("/workout.update", post(echo::<UpdateWorkout>))
        .route("/routine.create", post(echo::<CreateRoutine>))
        .route("/routine.update", post(echo::<UpdateRoutine>))
        .route("/record.create", post(echo::<CreateRecord>))
        .route("/snapshot.put", post(echo::<PutSnapshot>))
        .route("/preferences.put", post(echo::<PutPreferences>))
        .route("/version", post(echo::<VersionQuery>))
        .route("/routine.delete", post(echo::<RoutineDeleteQuery>))
        .route("/catalog.search", post(echo::<SearchQuery>))
        .route("/path", post(echo::<IdPath>))
        .route("/empty", post(echo::<EmptyParams>))
}
async fn send(route: &str, value: &Value) -> (StatusCode, Value) {
    let response = harness()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/{route}"))
                .header("content-type", "application/json")
                .body(Body::from(value.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let body = to_bytes(response.into_body(), 100_000).await.unwrap();
    (status, serde_json::from_slice(&body).unwrap())
}
#[tokio::test]
async fn request_families_round_trip_and_reject_invalid_fields() {
    let cases = vec![
        (
            "profile.update",
            json!({"baseVersion":1,"username":"alex_1","email":"a@example.com","firstName":"A","lastName":"B","timezone":null,"measurements":{"weightKg":70,"heightCm":null},"registrationCompleted":true}),
            json!({"baseVersion":1,"measurements":{"weightKg":0,"heightCm":null}}),
            "measurements",
        ),
        (
            "workout.create",
            json!({"title":"Gym","template":{"exercises":[{"exerciseId":"e","reps":[5],"weight":[10],"durationSeconds":[2]}]}}),
            json!({"title":"Gym","template":{"exercises":[{"exerciseId":"e","reps":[5],"weight":[]}]}}),
            "template",
        ),
        (
            "workout.update",
            json!({"baseVersion":1,"notes":null}),
            json!({"baseVersion":1,"title":"  "}),
            "title",
        ),
        (
            "routine.create",
            json!({"name":"Plan","pattern":[{"dayIndex":0,"dayType":"REST","workoutId":null}],"startDate":"2024-02-29"}),
            json!({"name":"Plan","pattern":[{"dayIndex":1,"dayType":"REST","workoutId":null}],"startDate":"2024-02-29"}),
            "pattern",
        ),
        (
            "routine.update",
            json!({"baseVersion":1,"description":null,"active":false,"profileBaseVersion":2}),
            json!({"baseVersion":1,"active":false}),
            "profileBaseVersion",
        ),
        (
            "record.create",
            json!({"clientRecordId":"c","workoutId":null,"workoutTitle":"Gym","startTime":"2024-01-01T00:00Z","completedAt":"2024-01-01T01:00:00Z","completionTimezone":"UTC","exerciseRecords":[{"exerciseId":null,"identity":{"sourceDatasetVersion":"v","sourceKey":"k","legacyNamespace":null,"legacyId":null},"exerciseName":"Squat","reps":[5],"weight":[10]}]}),
            json!({"clientRecordId":"c","workoutId":null,"workoutTitle":"Gym","startTime":"2024-01-01T01:00:00Z","completedAt":"2024-01-01T00:00:00Z","completionTimezone":"UTC","exerciseRecords":[]}),
            "completedAt",
        ),
        (
            "snapshot.put",
            json!({"baseVersion":0,"historyRevision":0,"rulesVersion":"v","currentStreak":0,"longestStreak":0,"nextWorkoutId":null,"nextWorkoutDeadline":null,"streakFreezeCount":0,"lastWorkoutCountedDate":null,"weeklyCompletedWorkoutIds":[],"currentWeekStart":null}),
            json!({"baseVersion":0,"historyRevision":0,"rulesVersion":"","currentStreak":0,"longestStreak":0,"nextWorkoutId":null,"nextWorkoutDeadline":null,"streakFreezeCount":0,"lastWorkoutCountedDate":null,"weeklyCompletedWorkoutIds":[],"currentWeekStart":null}),
            "rulesVersion",
        ),
        (
            "preferences.put",
            json!({"baseVersion":0,"enabled":true,"schedule":["09:30","20:00"],"timezone":"Europe/Sofia"}),
            json!({"baseVersion":0,"enabled":true,"schedule":["09:30","09:30"],"timezone":"UTC"}),
            "schedule",
        ),
        (
            "version",
            json!({"baseVersion":1}),
            json!({"baseVersion":0}),
            "baseVersion",
        ),
        (
            "routine.delete",
            json!({"baseVersion":1,"profileBaseVersion":2}),
            json!({"baseVersion":1,"profileBaseVersion":0}),
            "profileBaseVersion",
        ),
        (
            "catalog.search",
            json!({"name":"squat"}),
            json!({"name":" "}),
            "name",
        ),
        ("path", json!({"id":"a/b"}), json!({"id":""}), "id"),
        ("empty", json!({}), json!({"extra":1}), "body"),
    ];
    let mut fixtures = serde_json::Map::new();
    for (route, valid, invalid, field) in cases {
        let (status, output) = send(route, &valid).await;
        assert_eq!(status, StatusCode::OK, "{route}: {output}");
        fixtures.insert(route.to_owned(), json!({"valid":output,"invalid":invalid}));
        let (status, error) = send(route, &invalid).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{route}: {invalid}");
        assert_eq!(error["code"], "VALIDATION_ERROR");
        assert_eq!(error["field"], field);
    }
    if let Ok(dir) = std::env::var("ACTIVE_CONTRACT_FIXTURES") {
        std::fs::write(
            format!("{dir}/requests.json"),
            serde_json::to_vec(&fixtures).unwrap(),
        )
        .unwrap();
    }
}

#[tokio::test]
async fn edge_cases_cover_nested_rules_nulls_and_numeric_forms() {
    let cases = [
        ("path", json!({"id":"."})),
        ("path", json!({"id":".."})),
        (
            "workout.create",
            json!({"title":"A","template":{"exercises":[{"exerciseId":".."}]}}),
        ),
        (
            "routine.update",
            json!({"baseVersion":1,"pattern":[{"dayIndex":0,"dayType":"WORKOUT","workoutId":"."}]}),
        ),
        (
            "snapshot.put",
            json!({"baseVersion":0,"historyRevision":0,"rulesVersion":"v","currentStreak":0,"longestStreak":0,"nextWorkoutId":null,"nextWorkoutDeadline":null,"streakFreezeCount":0,"lastWorkoutCountedDate":null,"weeklyCompletedWorkoutIds":[".."],"currentWeekStart":null}),
        ),
        (
            "profile.update",
            json!({"baseVersion":1,"username":"no","timezone":"UTC"}),
        ),
        (
            "profile.update",
            json!({"baseVersion":1,"email":"bad..email@example.com"}),
        ),
        (
            "profile.update",
            json!({"baseVersion":1,"timezone":"Mars/Olympus"}),
        ),
        ("profile.update", json!({"baseVersion":1,"firstName":null})),
        (
            "workout.create",
            json!({"title":"A","template":{"exercises":[{"exerciseId":"e","reps":[-1],"weight":[0]}]}}),
        ),
        (
            "workout.create",
            json!({"title":"A","template":{"exercises":[{"exerciseId":"e","reps":[],"weight":[],"extra":true}]}}),
        ),
        ("workout.update", json!({"baseVersion":1,"template":null})),
        (
            "routine.update",
            json!({"baseVersion":1,"pattern":[{"dayIndex":0,"dayType":"WORKOUT","workoutId":null}]}),
        ),
        (
            "routine.update",
            json!({"baseVersion":1,"routineType":"OTHER"}),
        ),
        (
            "record.create",
            json!({"clientRecordId":"c","workoutId":null,"workoutTitle":"x","startTime":"2024-01-01T00:00:00Z","completedAt":"2024-01-01T00:00:00Z","completionTimezone":"UTC","exerciseRecords":[{"exerciseId":null,"identity":{"sourceDatasetVersion":"v","sourceKey":null,"legacyNamespace":null,"legacyId":null},"exerciseName":"x"}]}),
        ),
        (
            "record.create",
            json!({"clientRecordId":"c","workoutId":null,"workoutTitle":"x","startTime":"2024-01-01T00:00:60Z","completedAt":"2024-01-01T00:01:00Z","completionTimezone":"UTC","exerciseRecords":[]}),
        ),
        (
            "snapshot.put",
            json!({"baseVersion":0,"historyRevision":0,"rulesVersion":"v","currentStreak":0,"longestStreak":0,"nextWorkoutId":null,"nextWorkoutDeadline":"2023-02-29","streakFreezeCount":0,"lastWorkoutCountedDate":null,"weeklyCompletedWorkoutIds":[],"currentWeekStart":null}),
        ),
        (
            "preferences.put",
            json!({"baseVersion":0,"enabled":true,"schedule":["24:00"],"timezone":"UTC"}),
        ),
        ("version", json!({"baseVersion":9007199254740992_u64})),
    ];
    for (route, invalid) in cases {
        let (status, error) = send(route, &invalid).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{route}: {invalid}");
        assert_eq!(error["code"], "VALIDATION_ERROR");
        assert!(error["field"].is_string());
    }
    for (route, valid) in [
        (
            "profile.update",
            json!({"baseVersion":1,"timezone":null,"measurements":null}),
        ),
        ("workout.update", json!({"baseVersion":1,"notes":null})),
        (
            "routine.update",
            json!({"baseVersion":1,"description":null}),
        ),
        (
            "preferences.put",
            json!({"baseVersion":0,"enabled":false,"schedule":[],"timezone":"europe/sofia"}),
        ),
    ] {
        let (status, output) = send(route, &valid).await;
        assert_eq!(status, StatusCode::OK, "{route}: {output}");
        assert_eq!(output, valid);
    }
    let response = harness()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/profile.update")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"baseVersion":1.0}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn decoded_query_uses_typed_validation() {
    for (query, expected) in [
        ("baseVersion=1", StatusCode::OK),
        ("baseVersion=0", StatusCode::BAD_REQUEST),
        ("baseVersion=1&extra=x", StatusCode::BAD_REQUEST),
    ] {
        let response = harness()
            .oneshot(
                Request::builder()
                    .uri(format!("/query?{query}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if expected != StatusCode::OK {
            let value: Value =
                serde_json::from_slice(&to_bytes(response.into_body(), 10000).await.unwrap())
                    .unwrap();
            assert_eq!(value["code"], "VALIDATION_ERROR");
            assert!(value["field"].is_string());
        }
    }
}
