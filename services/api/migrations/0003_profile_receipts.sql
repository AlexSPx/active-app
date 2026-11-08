-- Survives account cascades solely to fence deleted identities and replay deletion.
CREATE TABLE deleted_identities (
    identity_digest BLOB PRIMARY KEY NOT NULL,
    operation_key TEXT,
    fingerprint BLOB,
    response_body BLOB
) STRICT;
