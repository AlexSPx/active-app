CREATE TABLE web_auth_flows (
    id_hash TEXT PRIMARY KEY NOT NULL,
    state TEXT NOT NULL,
    nonce TEXT NOT NULL,
    verifier TEXT NOT NULL,
    expires_at INTEGER NOT NULL
) STRICT;
CREATE TABLE web_session_metadata (
    session_hash TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL
) STRICT;
