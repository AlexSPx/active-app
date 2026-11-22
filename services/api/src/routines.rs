use crate::{
    AppState, auth,
    boundary::{ApiError, CreateRoutine, Validate},
    db, idempotency, profile,
    requests::{RoutineDeleteQuery, UpdateRoutine},
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
        .route("/api/routines", any(collection))
        .route("/api/routines/active", any(active))
        .route("/api/routines/{id}", any(item))
}
async fn collection(State(state): State<AppState>, req: Request) -> Result<Response, ApiError> {
    handle(state, None, req).await
}
async fn active(State(state): State<AppState>, req: Request) -> Result<Response, ApiError> {
    handle(state, Some("active".to_owned()), req).await
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
        ("GET" | "POST", false) | ("GET" | "PUT" | "DELETE", true)
    ) {
        return Err(ApiError::new(
            StatusCode::METHOD_NOT_ALLOWED,
            "METHOD_NOT_ALLOWED",
            "Method not allowed",
        ));
    }
    if id.as_deref() == Some("active") && method != "GET" {
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
        if pairs.len() != 2 {
            return Err(ApiError::validation("query"));
        }
        let mut base = None;
        let mut profile = None;
        for (name, value) in pairs {
            if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
                return Err(ApiError::validation("query"));
            }
            let value = value.parse().map_err(|_| ApiError::validation("query"))?;
            match name.as_ref() {
                "baseVersion" if base.is_none() => base = Some(value),
                "profileBaseVersion" if profile.is_none() => profile = Some(value),
                _ => return Err(ApiError::validation("query")),
            }
        }
        let v = RoutineDeleteQuery {
            base_version: base.ok_or_else(|| ApiError::validation("query"))?,
            profile_base_version: profile.ok_or_else(|| ApiError::validation("query"))?,
        };
        v.validate()?;
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
        if let Some(id) = id {
            let id = if id == "active" {
                sqlx::query_scalar("SELECT routine_id FROM active_routines WHERE owner_id=?")
                    .bind(&owner)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(internal)?
                    .ok_or_else(ApiError::not_found)?
            } else {
                id
            };
            return Ok(axum::Json(read(&mut tx, &owner, &id).await?).into_response());
        }
        let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM routines WHERE owner_id=? ORDER BY unixepoch(substr(created_at,1,19)||'Z'), CASE WHEN length(created_at)>20 THEN rtrim(substr(created_at,21,length(created_at)-21),'0') ELSE '' END,id LIMIT 1001").bind(&owner).fetch_all(&mut *tx).await.map_err(internal)?;
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
        Create(CreateRoutine),
        Update(UpdateRoutine),
        Delete(RoutineDeleteQuery),
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
        _ => Input::Delete(
            version
                .as_ref()
                .map(|v| RoutineDeleteQuery {
                    base_version: v.base_version,
                    profile_base_version: v.profile_base_version,
                })
                .unwrap(),
        ),
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
            "/api/routines/{id}{}",
            version
                .as_ref()
                .map(|v| format!(
                    "?baseVersion={}&profileBaseVersion={}",
                    v.base_version, v.profile_base_version
                ))
                .unwrap_or_default()
        ),
        None => "/api/routines".to_owned(),
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

async fn read(tx: &mut Transaction<'_, Sqlite>, owner: &str, id: &str) -> Result<Value, ApiError> {
    let row = sqlx::query("SELECT r.*,u.version AS profile_version FROM routines r JOIN users u ON u.id=r.owner_id WHERE r.owner_id=? AND r.id=?")
        .bind(owner).bind(id).fetch_optional(&mut **tx).await.map_err(internal)?.ok_or_else(ApiError::not_found)?;
    let rows = sqlx::query("SELECT day_index,day_type,workout_id FROM routine_pattern WHERE owner_id=? AND routine_id=? ORDER BY day_index")
        .bind(owner).bind(id).fetch_all(&mut **tx).await.map_err(internal)?;
    let pattern: Vec<Value> = rows.iter().map(|r| json!({"dayIndex":r.get::<i64,_>("day_index"),"dayType":r.get::<String,_>("day_type"),"workoutId":r.get::<Option<String>,_>("workout_id")})).collect();
    Ok(
        json!({"id":id,"name":row.get::<String,_>("name"),"description":row.get::<Option<String>,_>("description"),"userId":owner,"routineType":row.get::<String,_>("routine_type"),"pattern":pattern,"startDate":row.get::<String,_>("start_date"),"createdAt":row.get::<String,_>("created_at"),"updatedAt":row.get::<String,_>("updated_at"),"version":row.get::<i64,_>("version"),"profileVersion":row.get::<i64,_>("profile_version")}),
    )
}
async fn check_profile(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    base: u64,
) -> Result<(), ApiError> {
    let version: i64 = sqlx::query_scalar("SELECT version FROM users WHERE id=?")
        .bind(owner)
        .fetch_optional(&mut **tx)
        .await
        .map_err(internal)?
        .ok_or_else(ApiError::not_found)?;
    if version as u64 != base {
        return Err(ApiError::stale(version as u64));
    }
    Ok(())
}
async fn set_active(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    id: &str,
    active: bool,
) -> Result<(), ApiError> {
    let current: Option<String> =
        sqlx::query_scalar("SELECT routine_id FROM active_routines WHERE owner_id=?")
            .bind(owner)
            .fetch_optional(&mut **tx)
            .await
            .map_err(internal)?;
    let next = if active {
        Some(id)
    } else if current.as_deref() == Some(id) {
        None
    } else {
        current.as_deref()
    };
    if current.as_deref() != next {
        let changed = sqlx::query(
            "UPDATE users SET version=version+1 WHERE id=? AND version<9007199254740991",
        )
        .bind(owner)
        .execute(&mut **tx)
        .await
        .map_err(internal)?;
        if changed.rows_affected() != 1 {
            return Err(internal(()));
        }
        sqlx::query("DELETE FROM active_routines WHERE owner_id=?")
            .bind(owner)
            .execute(&mut **tx)
            .await
            .map_err(internal)?;
        if let Some(next) = next {
            sqlx::query("INSERT INTO active_routines VALUES(?,?)")
                .bind(owner)
                .bind(next)
                .execute(&mut **tx)
                .await
                .map_err(internal)?;
        }
    }
    Ok(())
}
async fn replace(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    id: &str,
    pattern: &[crate::boundary::PatternItem],
) -> Result<(), ApiError> {
    for item in pattern {
        if let Some(workout) = &item.workout_id {
            let exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM workouts WHERE owner_id=? AND id=?)",
            )
            .bind(owner)
            .bind(workout.as_str())
            .fetch_one(&mut **tx)
            .await
            .map_err(internal)?;
            if !exists {
                return Err(ApiError::not_found());
            }
        }
    }
    sqlx::query("DELETE FROM routine_pattern WHERE owner_id=? AND routine_id=?")
        .bind(owner)
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(internal)?;
    for item in pattern {
        let kind = match item.day_type {
            crate::boundary::DayType::Workout => "WORKOUT",
            crate::boundary::DayType::Rest => "REST",
        };
        sqlx::query("INSERT INTO routine_pattern VALUES(?,?,?,?,?)")
            .bind(owner)
            .bind(id)
            .bind(i64::from(item.day_index))
            .bind(kind)
            .bind(item.workout_id.as_ref().map(|x| x.as_str()))
            .execute(&mut **tx)
            .await
            .map_err(internal)?;
    }
    Ok(())
}
fn type_name(t: &crate::boundary::RoutineType) -> &'static str {
    match t {
        crate::boundary::RoutineType::Sequential => "SEQUENTIAL",
        crate::boundary::RoutineType::WeeklyCompletion => "WEEKLY_COMPLETION",
    }
}
async fn create(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    v: CreateRoutine,
) -> Result<Value, ApiError> {
    if let Some(base) = v.profile_base_version.filter(|_| v.active) {
        check_profile(tx, owner, base).await?;
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM routines WHERE owner_id=?")
        .bind(owner)
        .fetch_one(&mut **tx)
        .await
        .map_err(internal)?;
    if count >= 1000 {
        return Err(ApiError::validation("limit"));
    }
    let id = Uuid::new_v4().to_string();
    let time = now();
    sqlx::query("INSERT INTO routines(id,owner_id,name,description,routine_type,start_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(&id).bind(owner).bind(&v.name).bind(&v.description).bind(type_name(&v.routine_type)).bind(&v.start_date).bind(&time).bind(&time).execute(&mut **tx).await.map_err(internal)?;
    replace(tx, owner, &id, &v.pattern).await?;
    if v.active {
        set_active(tx, owner, &id, true).await?;
    }
    read(tx, owner, &id).await
}
async fn update(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    id: &str,
    v: UpdateRoutine,
) -> Result<Value, ApiError> {
    let before = read(tx, owner, id).await?;
    let version = before["version"].as_u64().ok_or_else(|| internal(()))?;
    if version != v.base_version {
        return Err(ApiError::stale(version));
    }
    if v.active.is_some() {
        check_profile(tx, owner, v.profile_base_version.unwrap()).await?;
    }
    let name = v
        .name
        .unwrap_or_else(|| before["name"].as_str().unwrap().to_owned());
    let description = v
        .description
        .unwrap_or_else(|| before["description"].as_str().map(str::to_owned));
    let kind = v
        .routine_type
        .as_ref()
        .map(type_name)
        .unwrap_or_else(|| before["routineType"].as_str().unwrap());
    let start = v
        .start_date
        .unwrap_or_else(|| before["startDate"].as_str().unwrap().to_owned());
    let mut changed = before["name"] != json!(name)
        || before["description"] != json!(description)
        || before["routineType"] != json!(kind)
        || before["startDate"] != json!(start);
    if let Some(pattern) = v.pattern {
        // Validate references even when the supplied pattern matches stored state.
        let differs = before["pattern"] != serde_json::to_value(&pattern).map_err(internal)?;
        replace(tx, owner, id, &pattern).await?;
        changed |= differs;
    }
    if changed {
        if version >= 9_007_199_254_740_991 {
            return Err(internal(()));
        }
        sqlx::query("UPDATE routines SET name=?,description=?,routine_type=?,start_date=?,version=version+1,updated_at=? WHERE owner_id=? AND id=?").bind(name).bind(description).bind(kind).bind(start).bind(now()).bind(owner).bind(id).execute(&mut **tx).await.map_err(internal)?;
    }
    if let Some(active) = v.active {
        set_active(tx, owner, id, active).await?;
    }
    read(tx, owner, id).await
}
async fn delete(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    id: &str,
    v: RoutineDeleteQuery,
) -> Result<Value, ApiError> {
    let before = read(tx, owner, id).await?;
    let version = before["version"].as_u64().ok_or_else(|| internal(()))?;
    if version != v.base_version {
        return Err(ApiError::stale(version));
    }
    check_profile(tx, owner, v.profile_base_version).await?;
    set_active(tx, owner, id, false).await?;
    sqlx::query("DELETE FROM routines WHERE owner_id=? AND id=?")
        .bind(owner)
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(internal)?;
    let profile_version: i64 = sqlx::query_scalar("SELECT version FROM users WHERE id=?")
        .bind(owner)
        .fetch_one(&mut **tx)
        .await
        .map_err(internal)?;
    Ok(json!({"deletedRoutineId":id,"profileVersion":profile_version}))
}
