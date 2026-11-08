//! Reusable HTTP boundary types. Domain routes must validate ownership after extraction.
use axum::{
    Json,
    extract::{FromRequest, FromRequestParts, Query, Request},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub code: &'static str,
    pub message: &'static str,
    pub current_version: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<&'static str>,
    #[serde(skip)]
    status: StatusCode,
}
impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: &'static str) -> Self {
        Self {
            status,
            code,
            message,
            current_version: None,
            field: None,
        }
    }
    pub fn validation(field: &'static str) -> Self {
        Self {
            field: Some(field),
            ..Self::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Invalid request",
            )
        }
    }
    pub fn stale(current_version: u64) -> Self {
        Self {
            current_version: Some(current_version),
            ..Self::new(StatusCode::CONFLICT, "STALE_VERSION", "Version conflict")
        }
    }
    pub fn not_found() -> Self {
        Self::new(StatusCode::NOT_FOUND, "NOT_FOUND", "Not found")
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self)).into_response()
    }
}

pub trait Validate {
    fn validate(&self) -> Result<(), ApiError>;
}
pub struct ValidatedJson<T>(pub T);
impl<S, T> FromRequest<S> for ValidatedJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned + Validate,
{
    type Rejection = ApiError;
    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let Json(value) = Json::<T>::from_request(req, state)
            .await
            .map_err(|_| ApiError::validation("body"))?;
        value.validate()?;
        Ok(Self(value))
    }
}

pub struct ValidatedQuery<T>(pub T);
impl<S, T> FromRequestParts<S> for ValidatedQuery<T>
where
    S: Send + Sync,
    T: DeserializeOwned + Validate,
{
    type Rejection = ApiError;
    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        state: &S,
    ) -> Result<Self, Self::Rejection> {
        let Query(value) = Query::<T>::from_request_parts(parts, state)
            .await
            .map_err(|_| ApiError::validation("query"))?;
        value.validate()?;
        Ok(Self(value))
    }
}

macro_rules! identifier {
    ($name:ident) => {
        #[derive(Clone, Debug, PartialEq, Eq, Serialize)]
        #[serde(transparent)]
        pub struct $name(String);
        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                let value = String::deserialize(deserializer)?;
                Self::parse(value).map_err(|_| serde::de::Error::custom("invalid identifier"))
            }
        }
        impl $name {
            pub fn parse(value: String) -> Result<Self, ApiError> {
                if !valid_id(&value) {
                    return Err(ApiError::validation("id"));
                }
                Ok(Self(value))
            }
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }
    };
}
identifier!(AccountId);
identifier!(WorkoutId);
identifier!(RoutineId);

pub(crate) fn valid_id(s: &str) -> bool {
    !s.is_empty() && s != "." && s != ".." && s.encode_utf16().count() <= 256
}
pub(crate) fn valid_text(s: &str) -> bool {
    let blank = |c: char| matches!(c, '\u{0009}'..='\u{000D}' | '\u{0020}' | '\u{00A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}');
    !s.trim_matches(blank).is_empty() && s.encode_utf16().count() <= 200
}
pub(crate) fn integer<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    let n = serde_json::Number::deserialize(d)?;
    let f = n
        .as_f64()
        .ok_or_else(|| serde::de::Error::custom("invalid integer"))?;
    if !(0.0..=9_007_199_254_740_991.0).contains(&f) || f.fract() != 0.0 {
        return Err(serde::de::Error::custom("invalid integer"));
    }
    Ok(f as u64)
}
pub(crate) fn optional_integer<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Option<u64>, D::Error> {
    integer(d).map(Some)
}
pub(crate) fn integers<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<u64>, D::Error> {
    #[derive(Deserialize)]
    struct Item(#[serde(deserialize_with = "integer")] u64);
    Vec::<Item>::deserialize(d).map(|v| v.into_iter().map(|i| i.0).collect())
}
fn day_index<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u8, D::Error> {
    u8::try_from(integer(d)?).map_err(serde::de::Error::custom)
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DayType {
    Workout,
    Rest,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PatternItem {
    #[serde(deserialize_with = "day_index")]
    pub day_index: u8,
    pub day_type: DayType,
    #[serde(deserialize_with = "required_nullable")]
    pub workout_id: Option<WorkoutId>,
}
pub(crate) fn required_nullable<'de, D: serde::Deserializer<'de>, T: Deserialize<'de>>(
    deserializer: D,
) -> Result<Option<T>, D::Error> {
    Option::<T>::deserialize(deserializer)
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RoutineType {
    Sequential,
    WeeklyCompletion,
}
fn default_routine_type() -> RoutineType {
    RoutineType::Sequential
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateRoutine {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_routine_type")]
    pub routine_type: RoutineType,
    pub pattern: Vec<PatternItem>,
    pub start_date: String,
    #[serde(default)]
    pub active: bool,
    #[serde(
        default,
        deserialize_with = "optional_integer",
        skip_serializing_if = "Option::is_none"
    )]
    pub profile_base_version: Option<u64>,
}
impl Validate for CreateRoutine {
    fn validate(&self) -> Result<(), ApiError> {
        if !valid_text(&self.name) {
            return Err(ApiError::validation("name"));
        }
        if self
            .description
            .as_ref()
            .is_some_and(|v| v.encode_utf16().count() > 10000)
        {
            return Err(ApiError::validation("description"));
        }
        if self.pattern.is_empty()
            || self.pattern.len() > 7
            || self.pattern.iter().enumerate().any(|(i, item)| {
                usize::from(item.day_index) != i
                    || match (&item.day_type, &item.workout_id) {
                        (DayType::Rest, None) => false,
                        (DayType::Workout, Some(id)) => WorkoutId::parse(id.0.clone()).is_err(),
                        _ => true,
                    }
            })
        {
            return Err(ApiError::validation("pattern"));
        }
        if !valid_date(&self.start_date) {
            return Err(ApiError::validation("startDate"));
        }
        if self
            .profile_base_version
            .is_some_and(|v| v == 0 || v > 9_007_199_254_740_991)
            || (self.active && self.profile_base_version.is_none())
        {
            return Err(ApiError::validation("profileBaseVersion"));
        }
        Ok(())
    }
}
pub(crate) fn valid_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10
        || b[4] != b'-'
        || b[7] != b'-'
        || !b
            .iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
    {
        return false;
    }
    let year: u32 = s[0..4].parse().unwrap_or(0);
    let month: usize = s[5..7].parse().unwrap_or(0);
    let day: u32 = s[8..10].parse().unwrap_or(0);
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    month > 0 && month <= 12 && day > 0 && day <= days[month - 1]
}

/// Check a state-changing cookie session request against its server-side CSRF secret.
/// The origin must be the external server origin, not merely a trusted CORS origin.
pub fn check_session_csrf(
    headers: &axum::http::HeaderMap,
    server_origin: &str,
    expected: &[u8],
) -> Result<(), ApiError> {
    use subtle::ConstantTimeEq;
    let origin = headers.get_all("origin");
    let token = headers.get_all("x-csrf-token");
    let valid = origin.iter().count() == 1
        && origin
            .iter()
            .next()
            .is_some_and(|value| value.as_bytes() == server_origin.as_bytes())
        && token.iter().count() == 1
        && token.iter().next().is_some_and(|value| {
            !expected.is_empty() && bool::from(value.as_bytes().ct_eq(expected))
        });
    if valid {
        Ok(())
    } else {
        Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Forbidden",
        ))
    }
}
