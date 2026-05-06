"""
Apply versioned SQL migrations to the gta6_rag database.

Usage:
    python migrations/run_migrations.py

What it does:
    1. Reads .env for ConnectionStrings__Postgres if present (else uses defaults).
    2. Creates schema_migrations table if missing.
    3. Reads migrations/*.sql sorted by filename.
    4. Skips ones whose version is already in schema_migrations.
    5. Wraps each remaining migration in a transaction; records the version on success.

Migrations should be:
    - Named NNN_short_description.sql (NNN is the version key).
    - Idempotent (use CREATE TABLE IF NOT EXISTS, etc.) so re-runs are safe.
"""
import os
import re
import sys
import glob
import psycopg2

DEFAULTS = {
    "host": "localhost",
    "port": 5432,
    "database": "gta6_rag",
    "user": "postgres",
    "password": "postgres",
}


def parse_dotnet_conn_string(raw: str) -> dict:
    """Convert ASP.NET-style 'Host=...;Port=...;...' into psycopg2 kwargs."""
    out = dict(DEFAULTS)
    for part in raw.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        k, v = part.split("=", 1)
        k = k.strip().lower()
        v = v.strip()
        if k == "host":
            out["host"] = v
        elif k == "port":
            out["port"] = int(v)
        elif k == "database":
            out["database"] = v
        elif k == "username":
            out["user"] = v
        elif k == "password":
            out["password"] = v
    return out


def load_dotenv_file(path: str) -> dict:
    env = {}
    if not os.path.isfile(path):
        return env
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*(?:__[A-Za-z0-9_]+)*)\s*=\s*(.*)$", line)
            if not m:
                continue
            key, val = m.group(1), m.group(2)
            if val and val[0] in "\"'" and val[-1] == val[0]:
                val = val[1:-1]
            env[key] = val
    return env


def db_config() -> dict:
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(here)
    dotenv = load_dotenv_file(os.path.join(repo, "backend", ".env"))

    raw = os.environ.get("ConnectionStrings__Postgres") or dotenv.get("ConnectionStrings__Postgres")
    if raw:
        return parse_dotnet_conn_string(raw)
    return DEFAULTS


def main() -> int:
    cfg = db_config()
    print(f"Connecting to {cfg['host']}:{cfg['port']}/{cfg['database']} as {cfg['user']}...")
    conn = psycopg2.connect(**cfg)
    conn.autocommit = False

    migrations_dir = os.path.dirname(os.path.abspath(__file__))
    files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))
    if not files:
        print("No migration files found.")
        return 0

    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version    VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        conn.commit()

        cur.execute("SELECT version FROM schema_migrations")
        applied = {row[0] for row in cur.fetchall()}

    pending = []
    for path in files:
        version = os.path.splitext(os.path.basename(path))[0]
        if version in applied:
            print(f"  ✓ {version}  (already applied)")
        else:
            pending.append((version, path))

    if not pending:
        print("All migrations already applied.")
        conn.close()
        return 0

    for version, path in pending:
        print(f"  → applying {version}...")
        with open(path) as f:
            sql = f.read()
        with conn.cursor() as cur:
            try:
                cur.execute(sql)
                cur.execute(
                    "INSERT INTO schema_migrations (version) VALUES (%s) ON CONFLICT DO NOTHING",
                    (version,),
                )
                conn.commit()
                print(f"     ok")
            except Exception as e:
                conn.rollback()
                print(f"     FAILED: {e}", file=sys.stderr)
                conn.close()
                return 1

    conn.close()
    print(f"Applied {len(pending)} migration(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
