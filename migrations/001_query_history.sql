-- 001 — query_history: every /api/query call is logged here so admins can see
-- what users asked, what was retrieved, what was answered, and how long it took.
-- Idempotent: safe to re-run. The runner tracks applied versions in
-- schema_migrations so we never apply the same file twice.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(255) PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS query_history (
    id              BIGSERIAL PRIMARY KEY,
    session_id      VARCHAR(100),
    question        TEXT NOT NULL,
    rewritten_query TEXT,
    answer          TEXT NOT NULL,
    sources         JSONB,
    in_scope        BOOLEAN NOT NULL DEFAULT TRUE,
    embed_ms        DOUBLE PRECISION,
    search_ms       DOUBLE PRECISION,
    rewrite_ms      DOUBLE PRECISION,
    gen_ms          DOUBLE PRECISION,
    total_ms        DOUBLE PRECISION,
    tokens          INTEGER,
    tokens_per_sec  DOUBLE PRECISION,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS query_history_created_at_idx
    ON query_history (created_at DESC);

CREATE INDEX IF NOT EXISTS query_history_session_idx
    ON query_history (session_id);
