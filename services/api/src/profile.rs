//! Profile operations for use only after credentials have been verified by the auth layer.
use axum::http::StatusCode;
use sqlx::{Row, Sqlite, SqlitePool, Transaction};
use uuid::Uuid;

use crate::{
    boundary::{ApiError, Validate},
    db,
    requests::{Measurements, UpdateProfile},
    responses::{DeletedProfile, Profile},
};

/// Constructed by the authentication implementation after validating the issuer, subject,
/// token audience, type, expiry and signature (or a bound server-side session).
#[derive(Clone, Debug)]
pub struct VerifiedPrincipal {
    pub issuer: String,
    pub subject: String,
    pub verified_email: Option<String>,
}

fn internal(_: sqlx::Error) -> ApiError {
    ApiError::new(
        StatusCode::INTERNAL_SERVER_ERROR,
        "INTERNAL_ERROR",
        "Internal error",
    )
}

/// Resolve an immutable provider identity, provisioning exactly one Active account.
pub async fn provision(
    pool: &SqlitePool,
    principal: &VerifiedPrincipal,
) -> Result<String, ApiError> {
    if principal.issuer.is_empty() || principal.subject.is_empty() {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "UNAUTHENTICATED",
            "Authentication required",
        ));
    }
    let mut tx = db::begin_write(pool).await.map_err(internal)?;
    ensure_not_deleted(&mut tx, principal).await?;
    if let Some(id) = sqlx::query_scalar::<_, String>(
        "SELECT user_id FROM identities WHERE issuer=? AND subject=?",
    )
    .bind(&principal.issuer)
    .bind(&principal.subject)
    .fetch_optional(&mut *tx)
    .await
    .map_err(internal)?
    {
        tx.commit().await.map_err(internal)?;
        return Ok(id);
    }
    let email = principal
        .verified_email
        .as_deref()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::FORBIDDEN,
                "FORBIDDEN",
                "Verified email required",
            )
        })?;
    // Validate the initial email with the same rules as subsequent profile updates.
    let candidate = UpdateProfile {
        base_version: 1,
        email: Some(email.to_owned()),
        username: None,
        first_name: None,
        last_name: None,
        timezone: None,
        measurements: None,
        registration_completed: None,
    };
    candidate.validate().map_err(|_| {
        ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Verified email required",
        )
    })?;
    let id = Uuid::new_v4().to_string();
    let username = format!("user_{}", Uuid::new_v4().simple());
    let username = &username[..29];
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    sqlx::query("INSERT INTO users(id,email,username,first_name,last_name,created_at) VALUES(?,?,?,'User','User',?)")
        .bind(&id).bind(email).bind(username).bind(now).execute(&mut *tx).await.map_err(internal)?;
    sqlx::query("INSERT INTO identities(issuer,subject,user_id) VALUES(?,?,?)")
        .bind(&principal.issuer)
        .bind(&principal.subject)
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
    tx.commit().await.map_err(internal)?;
    Ok(id)
}

async fn read(tx: &mut Transaction<'_, Sqlite>, owner: &str) -> Result<Profile, ApiError> {
    let row = sqlx::query("SELECT u.*, a.routine_id FROM users u LEFT JOIN active_routines a ON a.owner_id=u.id WHERE u.id=?")
        .bind(owner).fetch_optional(&mut **tx).await.map_err(internal)?.ok_or_else(ApiError::not_found)?;
    Ok(Profile {
        id: row.get("id"),
        email: row.get("email"),
        username: row.get("username"),
        first_name: row.get("first_name"),
        last_name: row.get("last_name"),
        created_at: row.get("created_at"),
        timezone: row.get("timezone"),
        active_routine_id: row.get("routine_id"),
        measurements: if row.get::<bool, _>("measurements_present") {
            Some(Measurements {
                weight_kg: row.get("weight_kg"),
                height_cm: row.get("height_cm"),
            })
        } else {
            None
        },
        registration_completed: row.get("registration_completed"),
        profile_version: row.get::<i64, _>("version") as u64,
    })
}

pub async fn get(pool: &SqlitePool, owner: &str) -> Result<Profile, ApiError> {
    let mut tx = pool.begin().await.map_err(internal)?;
    let profile = read(&mut tx, owner).await?;
    tx.commit().await.map_err(internal)?;
    Ok(profile)
}

/// Version check and update share a writer transaction. Auth and idempotency must wrap this operation before exposure.
pub async fn update(
    pool: &SqlitePool,
    owner: &str,
    patch: UpdateProfile,
) -> Result<Profile, ApiError> {
    patch.validate()?;
    let mut tx = db::begin_write(pool).await.map_err(internal)?;
    let result = update_tx(&mut tx, owner, patch).await?;
    tx.commit().await.map_err(internal)?;
    Ok(result)
}

pub(crate) async fn update_tx(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    patch: UpdateProfile,
) -> Result<Profile, ApiError> {
    patch.validate()?;
    let mut profile = read(tx, owner).await?;
    if profile.profile_version != patch.base_version {
        return Err(ApiError::stale(profile.profile_version));
    }
    let before = serde_json::to_value(&profile).expect("profile serializes");
    if let Some(v) = patch.username {
        profile.username = v;
    }
    if let Some(v) = patch.email {
        profile.email = v;
    }
    if let Some(v) = patch.first_name {
        profile.first_name = v;
    }
    if let Some(v) = patch.last_name {
        profile.last_name = v;
    }
    if let Some(v) = patch.timezone {
        profile.timezone = v;
    }
    if let Some(v) = patch.measurements {
        profile.measurements = v;
    }
    if let Some(v) = patch.registration_completed {
        profile.registration_completed = v;
    }
    if serde_json::to_value(&profile).expect("profile serializes") != before {
        if profile.profile_version >= 9_007_199_254_740_991 {
            return Err(ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "Internal error",
            ));
        }
        let result = sqlx::query("UPDATE users SET username=?,email=?,first_name=?,last_name=?,timezone=?,measurements_present=?,weight_kg=?,height_cm=?,registration_completed=?,version=version+1 WHERE id=?")
            .bind(&profile.username).bind(&profile.email).bind(&profile.first_name).bind(&profile.last_name).bind(&profile.timezone)
            .bind(profile.measurements.is_some()).bind(profile.measurements.as_ref().and_then(|m| m.weight_kg)).bind(profile.measurements.as_ref().and_then(|m| m.height_cm))
            .bind(profile.registration_completed).bind(owner).execute(&mut **tx).await;
        if let Err(e) = result {
            if e.as_database_error()
                .is_some_and(|e| e.is_unique_violation())
            {
                return Err(ApiError::new(
                    StatusCode::CONFLICT,
                    "USERNAME_TAKEN",
                    "Username already taken",
                ));
            }
            return Err(internal(e));
        }
        profile.profile_version += 1;
    }
    Ok(profile)
}

/// Delete the Active account and all owned rows atomically; never contacts the identity provider.
pub async fn delete(
    pool: &SqlitePool,
    owner: &str,
    base_version: u64,
) -> Result<DeletedProfile, ApiError> {
    crate::requests::VersionQuery { base_version }.validate()?;
    let mut tx = db::begin_write(pool).await.map_err(internal)?;
    let result = delete_tx(&mut tx, owner, base_version).await?;
    tx.commit().await.map_err(internal)?;
    Ok(result)
}

pub(crate) async fn delete_tx(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    base_version: u64,
) -> Result<DeletedProfile, ApiError> {
    crate::requests::VersionQuery { base_version }.validate()?;
    let profile = read(tx, owner).await?;
    if profile.profile_version != base_version {
        return Err(ApiError::stale(profile.profile_version));
    }
    let identities = sqlx::query("SELECT issuer, subject FROM identities WHERE user_id=?")
        .bind(owner)
        .fetch_all(&mut **tx)
        .await
        .map_err(internal)?;
    for row in identities {
        let digest = identity_digest(row.get("issuer"), row.get("subject"));
        sqlx::query("INSERT OR IGNORE INTO deleted_identities(identity_digest) VALUES(?)")
            .bind(digest)
            .execute(&mut **tx)
            .await
            .map_err(internal)?;
    }
    sqlx::query("DELETE FROM users WHERE id=?")
        .bind(owner)
        .execute(&mut **tx)
        .await
        .map_err(internal)?;
    Ok(DeletedProfile {
        deleted_user_id: owner.to_owned(),
    })
}

pub async fn get_preferences(
    pool: &SqlitePool,
    owner: &str,
) -> Result<crate::responses::Preferences, ApiError> {
    let mut tx = pool.begin().await.map_err(internal)?;
    let result = read_preferences(&mut tx, owner)
        .await?
        .ok_or_else(ApiError::not_found)?;
    tx.commit().await.map_err(internal)?;
    Ok(result)
}

async fn read_preferences(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
) -> Result<Option<crate::responses::Preferences>, ApiError> {
    let row =
        sqlx::query("SELECT version, enabled, timezone FROM reminder_preferences WHERE owner_id=?")
            .bind(owner)
            .fetch_optional(&mut **tx)
            .await
            .map_err(internal)?;
    let Some(row) = row else { return Ok(None) };
    let schedule = sqlx::query_scalar(
        "SELECT local_time FROM reminder_times WHERE owner_id=? ORDER BY position",
    )
    .bind(owner)
    .fetch_all(&mut **tx)
    .await
    .map_err(internal)?;
    Ok(Some(crate::responses::Preferences {
        version: row.get::<i64, _>("version") as u64,
        enabled: row.get("enabled"),
        schedule,
        timezone: row.get("timezone"),
    }))
}

pub async fn put_preferences(
    pool: &SqlitePool,
    owner: &str,
    input: crate::requests::PutPreferences,
) -> Result<crate::responses::Preferences, ApiError> {
    input.validate()?;
    let mut tx = db::begin_write(pool).await.map_err(internal)?;
    let result = put_preferences_tx(&mut tx, owner, input).await?;
    tx.commit().await.map_err(internal)?;
    Ok(result)
}

pub(crate) async fn put_preferences_tx(
    tx: &mut Transaction<'_, Sqlite>,
    owner: &str,
    input: crate::requests::PutPreferences,
) -> Result<crate::responses::Preferences, ApiError> {
    input.validate()?;
    read(tx, owner).await?;
    let existing = read_preferences(tx, owner).await?;
    let current = existing.as_ref().map_or(0, |p| p.version);
    if current != input.base_version {
        return Err(ApiError::stale(current));
    }
    let changed = existing.as_ref().is_none_or(|p| {
        p.enabled != input.enabled || p.timezone != input.timezone || p.schedule != input.schedule
    });
    let version = if changed {
        current
            .checked_add(1)
            .filter(|v| *v <= 9_007_199_254_740_991)
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Internal error",
                )
            })?
    } else {
        current
    };
    if changed {
        sqlx::query("INSERT INTO reminder_preferences(owner_id,version,enabled,timezone) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET version=excluded.version,enabled=excluded.enabled,timezone=excluded.timezone")
            .bind(owner).bind(version as i64).bind(input.enabled).bind(&input.timezone).execute(&mut **tx).await.map_err(internal)?;
        sqlx::query("DELETE FROM reminder_times WHERE owner_id=?")
            .bind(owner)
            .execute(&mut **tx)
            .await
            .map_err(internal)?;
        for (i, time) in input.schedule.iter().enumerate() {
            sqlx::query("INSERT INTO reminder_times(owner_id,position,local_time) VALUES(?,?,?)")
                .bind(owner)
                .bind(i as i64)
                .bind(time)
                .execute(&mut **tx)
                .await
                .map_err(internal)?;
        }
    }
    Ok(crate::responses::Preferences {
        version,
        enabled: input.enabled,
        schedule: input.schedule,
        timezone: input.timezone,
    })
}

/// A deleted identity is permanently fenced; a fresh account requires a new provider identity.
pub(crate) async fn ensure_not_deleted(
    tx: &mut Transaction<'_, Sqlite>,
    principal: &VerifiedPrincipal,
) -> Result<(), ApiError> {
    let found: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM deleted_identities WHERE identity_digest=?)",
    )
    .bind(identity_digest(&principal.issuer, &principal.subject))
    .fetch_one(&mut **tx)
    .await
    .map_err(internal)?;
    if found {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Account deleted",
        ));
    }
    Ok(())
}

pub(crate) fn identity_digest(issuer: &str, subject: &str) -> Vec<u8> {
    let mut input = (issuer.len() as u64).to_be_bytes().to_vec();
    input.extend_from_slice(issuer.as_bytes());
    input.extend_from_slice(subject.as_bytes());
    sha256(&input).to_vec()
}

pub(crate) fn sha256(data: &[u8]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    Sha256::digest(data).into()
}

#[cfg(test)]
mod digest_tests {
    #[test]
    fn sha256_known_vector() {
        assert_eq!(
            super::sha256(b"abc"),
            [
                0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae,
                0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61,
                0xf2, 0x00, 0x15, 0xad
            ]
        );
    }
}
