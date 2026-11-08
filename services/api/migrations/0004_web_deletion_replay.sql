-- A former session can replay only its exact deletion acknowledgement until its
-- original expiry; fresh verified login can create a new recovery-only proof.
-- No issuer, subject, provider credentials or training records survive here.
CREATE TABLE deleted_web_sessions (
    session_hash TEXT PRIMARY KEY NOT NULL,
    csrf_token TEXT NOT NULL,
    operation_key TEXT NOT NULL,
    fingerprint BLOB NOT NULL,
    response_body BLOB NOT NULL,
    expires_at INTEGER NOT NULL
) STRICT;
