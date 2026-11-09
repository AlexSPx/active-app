use crate::{AppState, auth, boundary::ApiError, db, responses};
use axum::{
    Json, Router,
    extract::{RawQuery, State},
    http::{HeaderMap, StatusCode},
    routing::get,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use std::collections::HashSet;
use uuid::Uuid;

pub const DATASET_VERSION: &str = "free-exercise-db:f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5";
const DATASET: &str = include_str!("../../../apps/client/lib/data/exercise-catalog.json");

pub async fn seed(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    import(pool, DATASET, DATASET_VERSION).await
}

pub async fn import(pool: &SqlitePool, data: &str, version: &str) -> Result<(), sqlx::Error> {
    let invalid = || sqlx::Error::Protocol("invalid exercise dataset".into());
    if !crate::boundary::valid_id(version) {
        return Err(invalid());
    }
    let mut items: Vec<Value> = serde_json::from_str(data).map_err(|_| invalid())?;
    if items.is_empty() {
        return Err(invalid());
    }
    let mut keys = HashSet::new();
    for item in &mut items {
        let obj = item.as_object_mut().ok_or_else(invalid)?;
        let key = obj
            .get("sourceKey")
            .and_then(Value::as_str)
            .filter(|s| crate::boundary::valid_id(s))
            .ok_or_else(invalid)?
            .to_owned();
        if !keys.insert(key.clone())
            || obj.get("id").and_then(Value::as_str) != Some(&format!("local:exercise:{key}"))
        {
            return Err(invalid());
        }
        obj.insert("retired".into(), false.into());
        let exercise: responses::Exercise =
            serde_json::from_value(item.clone()).map_err(|_| invalid())?;
        if exercise.name.trim().is_empty() {
            return Err(invalid());
        }
    }
    let hash = format!("{:x}", Sha256::digest(data.as_bytes()));
    let mut tx = db::begin_write(pool).await?;
    sqlx::query("UPDATE exercises SET retired=1")
        .execute(&mut *tx)
        .await?;
    for item in &items {
        let key = item["sourceKey"].as_str().ok_or_else(invalid)?;
        let matches: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT exercise_id FROM exercise_source_keys WHERE source_key=?",
        )
        .bind(key)
        .fetch_all(&mut *tx)
        .await?;
        if matches.len() > 1 {
            return Err(invalid());
        }
        let id = matches
            .into_iter()
            .next()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        sqlx::query("INSERT INTO exercises(id,dataset_version,source_key,name,level,category,force,mechanic,equipment,retired) VALUES(?,?,?,?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET dataset_version=excluded.dataset_version,source_key=excluded.source_key,name=excluded.name,level=excluded.level,category=excluded.category,force=excluded.force,mechanic=excluded.mechanic,equipment=excluded.equipment,retired=0")
            .bind(&id).bind(version).bind(key).bind(item["name"].as_str()).bind(item["level"].as_str()).bind(item["category"].as_str()).bind(item["force"].as_str()).bind(item["mechanic"].as_str()).bind(item["equipment"].as_str()).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO exercise_source_keys(dataset_version,source_key,exercise_id) VALUES(?,?,?) ON CONFLICT(dataset_version,source_key) DO NOTHING").bind(version).bind(key).bind(&id).execute(&mut *tx).await?;
        sqlx::query("DELETE FROM exercise_muscles WHERE exercise_id=?")
            .bind(&id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM exercise_instructions WHERE exercise_id=?")
            .bind(&id)
            .execute(&mut *tx)
            .await?;
        for (field, kind) in [
            ("primaryMuscles", "PRIMARY"),
            ("secondaryMuscles", "SECONDARY"),
        ] {
            for (pos, muscle) in item[field]
                .as_array()
                .ok_or_else(invalid)?
                .iter()
                .enumerate()
            {
                sqlx::query("INSERT INTO exercise_muscles VALUES(?,?,?,?)")
                    .bind(&id)
                    .bind(kind)
                    .bind(pos as i64)
                    .bind(muscle.as_str())
                    .execute(&mut *tx)
                    .await?;
            }
        }
        for (pos, instruction) in item["instructions"]
            .as_array()
            .ok_or_else(invalid)?
            .iter()
            .enumerate()
        {
            sqlx::query("INSERT INTO exercise_instructions VALUES(?,?,?)")
                .bind(&id)
                .bind(pos as i64)
                .bind(instruction.as_str())
                .execute(&mut *tx)
                .await?;
        }
    }
    sqlx::query("INSERT INTO catalog_metadata VALUES(1,?,1,?) ON CONFLICT(singleton) DO UPDATE SET catalog_version=CASE WHEN source_dataset_version != excluded.source_dataset_version OR content_hash != excluded.content_hash THEN catalog_version+1 ELSE catalog_version END, source_dataset_version=excluded.source_dataset_version, content_hash=excluded.content_hash").bind(version).bind(hash).execute(&mut *tx).await?;
    tx.commit().await
}

pub async fn snapshot(pool: &SqlitePool) -> Result<Value, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let meta = sqlx::query(
        "SELECT source_dataset_version,catalog_version FROM catalog_metadata WHERE singleton=1",
    )
    .fetch_one(&mut *tx)
    .await?;
    let version: String = meta.try_get(0)?;
    let rows = sqlx::query("SELECT id,source_key,retired,name,level,force,mechanic,equipment,category FROM exercises ORDER BY source_key").fetch_all(&mut *tx).await?;
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let id: String = row.try_get("id")?;
        let muscles = sqlx::query(
            "SELECT kind,muscle FROM exercise_muscles WHERE exercise_id=? ORDER BY kind,position",
        )
        .bind(&id)
        .fetch_all(&mut *tx)
        .await?;
        let mut primary = Vec::new();
        let mut secondary = Vec::new();
        for muscle in muscles {
            let kind: String = muscle.try_get(0)?;
            let value: String = muscle.try_get(1)?;
            if kind == "PRIMARY" {
                primary.push(value)
            } else {
                secondary.push(value)
            }
        }
        let instructions: Vec<String> = sqlx::query_scalar(
            "SELECT instruction FROM exercise_instructions WHERE exercise_id=? ORDER BY position",
        )
        .bind(&id)
        .fetch_all(&mut *tx)
        .await?;
        items.push(json!({"id":id,"sourceKey":row.try_get::<String,_>("source_key")?,"retired":row.try_get::<bool,_>("retired")?,"name":row.try_get::<String,_>("name")?,"level":row.try_get::<Option<String>,_>("level")?,"force":row.try_get::<Option<String>,_>("force")?,"mechanic":row.try_get::<Option<String>,_>("mechanic")?,"equipment":row.try_get::<Option<String>,_>("equipment")?,"category":row.try_get::<Option<String>,_>("category")?,"primaryMuscles":primary,"secondaryMuscles":secondary,"instructions":instructions}));
    }
    tx.commit().await?;
    Ok(
        json!({"catalogVersion":meta.try_get::<i64,_>(1)?,"sourceDatasetVersion":version,"mappingComplete":true,"unresolvedSourceKeys":[],"unresolvedLegacyIds":[],"items":items}),
    )
}

fn internal(_: sqlx::Error) -> ApiError {
    ApiError::new(
        StatusCode::INTERNAL_SERVER_ERROR,
        "INTERNAL_ERROR",
        "Internal error",
    )
}
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/exercises/catalog", get(catalog))
        .route("/api/exercises/search", get(search))
}
async fn catalog(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    auth::authenticate(&state, &headers, false).await?;
    Ok(Json(snapshot(&state.pool).await.map_err(internal)?))
}
async fn search(
    State(state): State<AppState>,
    headers: HeaderMap,
    RawQuery(query): RawQuery,
) -> Result<Json<Value>, ApiError> {
    auth::authenticate(&state, &headers, false).await?;
    let query = query.ok_or_else(|| ApiError::validation("query"))?;
    let pairs: Vec<_> = url::form_urlencoded::parse(query.as_bytes()).collect();
    if pairs.len() != 1 || pairs[0].0 != "name" || !crate::boundary::valid_text(&pairs[0].1) {
        return Err(ApiError::validation("query"));
    }
    let name = pairs[0].1.to_lowercase();
    let snapshot = snapshot(&state.pool).await.map_err(internal)?;
    let items: Vec<_> = snapshot["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|v| {
            v["retired"] == false && v["name"].as_str().unwrap().to_lowercase().contains(&name)
        })
        .cloned()
        .collect();
    Ok(Json(json!(items)))
}
