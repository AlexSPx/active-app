use crate::{
    AppState, auth,
    boundary::{ApiError, Validate},
    db, idempotency, profile,
    requests::{CreateWorkout, Template, UpdateWorkout, VersionQuery},
};
use axum::{
    Router,
    body::to_bytes,
    extract::{Path, Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::any,
};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use sqlx::{Row, Sqlite, Transaction};
use uuid::Uuid;

fn internal<E>(_: E) -> ApiError {
    ApiError::new(
        StatusCode::INTERNAL_SERVER_ERROR,
        "INTERNAL_ERROR",
        "Internal error",
    )
}
fn parse<T: DeserializeOwned + Validate>(bytes: &[u8]) -> Result<T, ApiError> {
    let v: T = serde_json::from_slice(bytes).map_err(|_| ApiError::validation("body"))?;
    v.validate()?;
    Ok(v)
}
fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/workouts", any(collection))
        .route("/api/workouts/{id}", any(item))
}
async fn collection(State(state): State<AppState>, req: Request) -> Result<Response, ApiError> {
    handle(state, None, req).await
}
async fn item(
    State(state): State<AppState>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Response, ApiError> {
    if !crate::boundary::valid_id(&id) {
        return Err(ApiError::validation("id"));
    }
    handle(state, Some(id), req).await
}
async fn handle(state: AppState, id: Option<String>, req: Request) -> Result<Response, ApiError> {
    let (parts, body) = req.into_parts();
    let method = parts.method.as_str();
    let principal = auth::authenticate(&state, &parts.headers, method != "GET").await?;
    if !matches!(
        (method, id.is_some()),
        ("GET" | "POST", false) | ("PUT" | "DELETE", true)
    ) {
        return Err(ApiError::new(
            StatusCode::METHOD_NOT_ALLOWED,
            "METHOD_NOT_ALLOWED",
            "Method not allowed",
        ));
    }
    let bytes = to_bytes(body, state.body_limit)
        .await
        .map_err(|_| ApiError::validation("body"))?;
    let version = if method == "DELETE" {
        let pairs: Vec<_> =
            url::form_urlencoded::parse(parts.uri.query().unwrap_or("").as_bytes()).collect();
        if pairs.len() != 1
            || pairs[0].0 != "baseVersion"
            || pairs[0].1.is_empty()
            || !pairs[0].1.bytes().all(|b| b.is_ascii_digit())
        {
            return Err(ApiError::validation("query"));
        }
        let v = pairs[0]
            .1
            .parse()
            .map_err(|_| ApiError::validation("query"))?;
        VersionQuery { base_version: v }.validate()?;
        Some(v)
    } else {
        if parts.uri.query().is_some() {
            return Err(ApiError::validation("query"));
        }
        None
    };
    if matches!(method, "GET" | "DELETE") && !bytes.is_empty() {
        return Err(ApiError::validation("body"));
    }
    if method == "GET" {
        let owner = profile::provision(&state.pool, &principal).await?;
        let mut tx = state.pool.begin().await.map_err(internal)?;
        let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM workouts WHERE owner_id=? ORDER BY unixepoch(substr(created_at,1,19)||'Z'), CASE WHEN length(created_at)>20 THEN rtrim(substr(created_at,21,length(created_at)-21),'0') ELSE '' END,id LIMIT 1001").bind(&owner).fetch_all(&mut *tx).await.map_err(internal)?;
        if ids.len() > 1000 {
            return Err(ApiError::validation("limit"));
        }
        let mut result = Vec::new();
        for id in ids {
            result.push(read(&mut tx, &owner, &id).await?);
        }
        return Ok(axum::Json(result).into_response());
    }
    let keys = parts.headers.get_all("idempotency-key");
    if keys.iter().count() != 1 {
        return Err(ApiError::validation("idempotencyKey"));
    }
    let key = keys
        .iter()
        .next()
        .unwrap()
        .to_str()
        .map_err(|_| ApiError::validation("idempotencyKey"))?;
    if key.trim().is_empty() || key.len() > 256 {
        return Err(ApiError::validation("idempotencyKey"));
    }
    enum Input {
        Create(CreateWorkout),
        Update(UpdateWorkout),
        Delete(u64),
    }
    if matches!(method, "POST" | "PUT") {
        let types = parts.headers.get_all("content-type");
        let valid = types.iter().count() == 1
            && types
                .iter()
                .next()
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| {
                    let media = v.split(';').next().unwrap_or("").trim();
                    media.eq_ignore_ascii_case("application/json")
                        || (media.starts_with("application/") && media.ends_with("+json"))
                });
        if !valid {
            return Err(ApiError::validation("body"));
        }
    }
    let input = match method {
        "POST" => Input::Create(parse(&bytes)?),
        "PUT" => Input::Update(parse(&bytes)?),
        _ => Input::Delete(version.unwrap()),
    };
    let canonical = match &input {
        Input::Create(v) => serde_json::to_vec(v),
        Input::Update(v) => serde_json::to_vec(v),
        Input::Delete(v) => serde_json::to_vec(v),
    }
    .map_err(internal)?;
    let owner = profile::provision(&state.pool, &principal).await?;
    let mut tx = db::begin_write(&state.pool)
        .await
        .map_err(db::write_error)?;
    // Provisioning and mutation use separate transactions; account deletion can intervene.
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id=?)")
        .bind(&owner)
        .fetch_one(&mut *tx)
        .await
        .map_err(internal)?;
    if !exists {
        return Err(ApiError::not_found());
    }
    let target = match &id {
        Some(id) => format!(
            "/api/workouts/{id}{}",
            version
                .map(|v| format!("?baseVersion={v}"))
                .unwrap_or_default()
        ),
        None => "/api/workouts".to_owned(),
    };
    let request = idempotency::Request {
        owner: &owner,
        key,
        method,
        target: &target,
        canonical_body: &canonical,
    };
    if let Some(receipt) = idempotency::claim(&mut tx, &request).await? {
        return Ok((
            receipt.status,
            [("content-type", "application/json")],
            receipt.body,
        )
            .into_response());
    }
    let result = match input {
        Input::Create(v) => create(&mut tx, &owner, v).await?,
        Input::Update(v) => update(&mut tx, &owner, id.as_deref().unwrap(), v).await?,
        Input::Delete(v) => delete(&mut tx, &owner, id.as_deref().unwrap(), v).await?,
    };
    let body = serde_json::to_vec(&result).map_err(internal)?;
    let receipt = idempotency::Receipt {
        status: if method == "POST" {
            StatusCode::CREATED
        } else {
            StatusCode::OK
        },
        body,
    };
    idempotency::complete(&mut tx, &request, &receipt).await?;
    tx.commit().await.map_err(internal)?;
    Ok((
        receipt.status,
        [("content-type", "application/json")],
        receipt.body,
    )
        .into_response())
}

async fn replace(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    id: &str,
    template: &Template,
) -> Result<(), ApiError> {
    if template.exercises.len() > 1000
        || template
            .exercises
            .iter()
            .any(|e| e.reps.len() > 1000 || e.duration_seconds.len() > 1000)
    {
        return Err(ApiError::validation("template"));
    }
    for e in &template.exercises {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM exercises WHERE id=?)")
            .bind(&e.exercise_id)
            .fetch_one(&mut **tx)
            .await
            .map_err(internal)?;
        if !exists {
            return Err(ApiError::not_found());
        }
    }
    sqlx::query("DELETE FROM workout_exercises WHERE owner_id=? AND workout_id=?")
        .bind(owner)
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(internal)?;
    for (i, e) in template.exercises.iter().enumerate() {
        sqlx::query("INSERT INTO workout_exercises(owner_id,workout_id,position,exercise_id,notes) VALUES(?,?,?,?,?)").bind(owner).bind(id).bind(i as i64).bind(&e.exercise_id).bind(&e.notes).execute(&mut **tx).await.map_err(internal)?;
        for (j, (&reps, &weight)) in e.reps.iter().zip(&e.weight).enumerate() {
            sqlx::query("INSERT INTO workout_sets VALUES(?,?,?,'WEIGHT',?,?,NULL)")
                .bind(id)
                .bind(i as i64)
                .bind(j as i64)
                .bind(reps as i64)
                .bind(weight)
                .execute(&mut **tx)
                .await
                .map_err(internal)?;
        }
        for (j, &duration) in e.duration_seconds.iter().enumerate() {
            sqlx::query("INSERT INTO workout_sets VALUES(?,?,?,'DURATION',NULL,NULL,?)")
                .bind(id)
                .bind(i as i64)
                .bind(j as i64)
                .bind(duration)
                .execute(&mut **tx)
                .await
                .map_err(internal)?;
        }
    }
    Ok(())
}
async fn read(tx: &mut Transaction<'_, Sqlite>, owner: &str, id: &str) -> Result<Value, ApiError> {
    let row = sqlx::query("SELECT * FROM workouts WHERE owner_id=? AND id=?")
        .bind(owner)
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(internal)?
        .ok_or_else(ApiError::not_found)?;
    let entries=sqlx::query("SELECT we.position,we.notes,e.id,e.name,e.category FROM workout_exercises we JOIN exercises e ON e.id=we.exercise_id WHERE we.owner_id=? AND we.workout_id=? ORDER BY we.position").bind(owner).bind(id).fetch_all(&mut **tx).await.map_err(internal)?;
    let mut exercises = Vec::new();
    for e in entries {
        let exercise_id: String = e.get("id");
        let sets=sqlx::query("SELECT kind,reps,weight_kg,duration_seconds FROM workout_sets WHERE workout_id=? AND exercise_position=? ORDER BY position").bind(id).bind(e.get::<i64,_>("position")).fetch_all(&mut **tx).await.map_err(internal)?;
        let mut reps = Vec::new();
        let mut weights = Vec::new();
        let mut durations = Vec::new();
        for s in sets {
            if s.get::<String, _>("kind") == "WEIGHT" {
                reps.push(s.get::<i64, _>("reps"));
                weights.push(s.get::<f64, _>("weight_kg"));
            } else {
                durations.push(s.get::<f64, _>("duration_seconds"));
            }
        }
        let muscles = sqlx::query(
            "SELECT kind,muscle FROM exercise_muscles WHERE exercise_id=? ORDER BY kind,position",
        )
        .bind(&exercise_id)
        .fetch_all(&mut **tx)
        .await
        .map_err(internal)?;
        let mut primary = Vec::new();
        let mut secondary = Vec::new();
        for m in muscles {
            if m.get::<String, _>("kind") == "PRIMARY" {
                primary.push(m.get::<String, _>("muscle"));
            } else {
                secondary.push(m.get::<String, _>("muscle"));
            }
        }
        exercises.push(json!({"exerciseId":exercise_id,"exerciseTitle":e.get::<String,_>("name"),"notes":e.get::<Option<String>,_>("notes"),"category":e.get::<Option<String>,_>("category"),"primaryMuscles":primary,"secondaryMuscles":secondary,"reps":reps,"weight":weights,"durationSeconds":durations}));
    }
    let created: String = row.get("created_at");
    Ok(
        json!({"id":id,"title":row.get::<String,_>("title"),"notes":row.get::<Option<String>,_>("description"),"createdAt":created,"updatedAt":row.get::<String,_>("updated_at"),"version":row.get::<i64,_>("version"),"workoutTemplate":{"id":row.get::<String,_>("template_id"),"createdAt":created,"updatedAt":row.get::<String,_>("template_updated_at"),"exercises":exercises}}),
    )
}
async fn create(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    v: CreateWorkout,
) -> Result<Value, ApiError> {
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM workouts WHERE owner_id=?")
        .bind(owner)
        .fetch_one(&mut **tx)
        .await
        .map_err(internal)?;
    if count >= 1000 {
        return Err(ApiError::validation("limit"));
    }
    let id = Uuid::new_v4().to_string();
    let template_id = Uuid::new_v4().to_string();
    let time = now();
    sqlx::query("INSERT INTO workouts(id,owner_id,title,description,created_at,updated_at,template_id,template_updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(&id).bind(owner).bind(&v.title).bind(&v.notes).bind(&time).bind(&time).bind(template_id).bind(&time).execute(&mut **tx).await.map_err(internal)?;
    replace(tx, owner, &id, &v.template).await?;
    read(tx, owner, &id).await
}
async fn update(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    id: &str,
    v: UpdateWorkout,
) -> Result<Value, ApiError> {
    let row =
        sqlx::query("SELECT title,description,version FROM workouts WHERE owner_id=? AND id=?")
            .bind(owner)
            .bind(id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(internal)?
            .ok_or_else(ApiError::not_found)?;
    let version = row.get::<i64, _>("version") as u64;
    if version != v.base_version {
        return Err(ApiError::stale(version));
    }
    let title = v.title.unwrap_or_else(|| row.get("title"));
    let notes = v.notes.unwrap_or_else(|| row.get("description"));
    let mut changed = title != row.get::<String, _>("title")
        || notes != row.get::<Option<String>, _>("description");
    let mut template_changed = false;
    if let Some(template) = v.template {
        let before = stored_template(tx, owner, id).await?;
        let after = serde_json::to_value(&template).map_err(internal)?;
        if before != after {
            replace(tx, owner, id, &template).await?;
            changed = true;
            template_changed = true;
        }
    }
    if changed {
        if version >= 9_007_199_254_740_991 {
            return Err(internal(()));
        }
        let time = now();
        sqlx::query("UPDATE workouts SET title=?,description=?,version=version+1,updated_at=?,template_updated_at=CASE WHEN ? THEN ? ELSE template_updated_at END WHERE owner_id=? AND id=?").bind(title).bind(notes).bind(&time).bind(template_changed).bind(&time).bind(owner).bind(id).execute(&mut **tx).await.map_err(internal)?;
    }
    read(tx, owner, id).await
}
async fn stored_template(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    id: &str,
) -> Result<Value, ApiError> {
    let entries=sqlx::query("SELECT position,exercise_id,notes FROM workout_exercises WHERE owner_id=? AND workout_id=? ORDER BY position").bind(owner).bind(id).fetch_all(&mut **tx).await.map_err(internal)?;
    let mut exercises = Vec::new();
    for e in entries {
        let sets=sqlx::query("SELECT kind,reps,weight_kg,duration_seconds FROM workout_sets WHERE workout_id=? AND exercise_position=? ORDER BY position").bind(id).bind(e.get::<i64,_>("position")).fetch_all(&mut **tx).await.map_err(internal)?;
        let mut reps = Vec::new();
        let mut weights = Vec::new();
        let mut durations = Vec::new();
        for s in sets {
            if s.get::<String, _>("kind") == "WEIGHT" {
                reps.push(s.get::<i64, _>("reps"));
                weights.push(s.get::<f64, _>("weight_kg"));
            } else {
                durations.push(s.get::<f64, _>("duration_seconds"));
            }
        }
        exercises.push(json!({"exerciseId":e.get::<String,_>("exercise_id"),"notes":e.get::<Option<String>,_>("notes"),"reps":reps,"weight":weights,"durationSeconds":durations}));
    }
    Ok(json!({"exercises":exercises}))
}
async fn delete(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    id: &str,
    base: u64,
) -> Result<Value, ApiError> {
    let version: i64 = sqlx::query_scalar("SELECT version FROM workouts WHERE owner_id=? AND id=?")
        .bind(owner)
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(internal)?
        .ok_or_else(ApiError::not_found)?;
    if version as u64 != base {
        return Err(ApiError::stale(version as u64));
    }
    let routines=sqlx::query("SELECT DISTINCT r.id,r.version FROM routines r JOIN routine_pattern p ON p.owner_id=r.owner_id AND p.routine_id=r.id WHERE r.owner_id=? AND p.workout_id=? ORDER BY unixepoch(substr(r.created_at,1,19)||'Z'), CASE WHEN length(r.created_at)>20 THEN rtrim(substr(r.created_at,21,length(r.created_at)-21),'0') ELSE '' END,r.id").bind(owner).bind(id).fetch_all(&mut **tx).await.map_err(internal)?;
    let mut versions = Vec::new();
    for r in routines {
        let rid: String = r.get("id");
        let ver: i64 = r.get("version");
        if ver >= 9_007_199_254_740_991 {
            return Err(internal(()));
        }
        sqlx::query("UPDATE routines SET version=version+1,updated_at=? WHERE owner_id=? AND id=?")
            .bind(now())
            .bind(owner)
            .bind(&rid)
            .execute(&mut **tx)
            .await
            .map_err(internal)?;
        versions.push(json!({"id":rid,"version":ver+1}));
    }
    sqlx::query("UPDATE routine_pattern SET day_type='REST',workout_id=NULL WHERE owner_id=? AND workout_id=?").bind(owner).bind(id).execute(&mut **tx).await.map_err(internal)?;
    let records=sqlx::query("UPDATE workout_records SET workout_id=NULL,version=version+1 WHERE owner_id=? AND workout_id=? AND version<9007199254740991").bind(owner).bind(id).execute(&mut **tx).await.map_err(internal)?.rows_affected();
    if records > 0 {
        let updated = sqlx::query("UPDATE users SET history_revision=history_revision+1 WHERE id=? AND history_revision<9007199254740991").bind(owner).execute(&mut **tx).await.map_err(internal)?;
        if updated.rows_affected() != 1 {
            return Err(internal(()));
        }
    }
    let snapshot=sqlx::query("UPDATE streak_snapshots SET next_workout_deadline=CASE WHEN next_workout_id=? THEN NULL ELSE next_workout_deadline END,next_workout_id=CASE WHEN next_workout_id=? THEN NULL ELSE next_workout_id END,version=version+1 WHERE owner_id=? AND (next_workout_id=? OR EXISTS(SELECT 1 FROM streak_weekly_workouts WHERE owner_id=? AND workout_id=?)) AND version<9007199254740991").bind(id).bind(id).bind(owner).bind(id).bind(owner).bind(id).execute(&mut **tx).await.map_err(internal)?.rows_affected();
    if snapshot > 0 {
        sqlx::query("DELETE FROM streak_weekly_workouts WHERE owner_id=? AND workout_id=?")
            .bind(owner)
            .bind(id)
            .execute(&mut **tx)
            .await
            .map_err(internal)?;
    }
    sqlx::query("DELETE FROM workouts WHERE owner_id=? AND id=?")
        .bind(owner)
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(internal)?;
    Ok(json!({"deletedWorkoutId":id,"routineVersions":versions}))
}
