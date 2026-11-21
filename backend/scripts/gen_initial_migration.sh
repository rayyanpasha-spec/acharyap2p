#!/usr/bin/env bash
# Generates the INITIAL Alembic migration by autogenerating against an EMPTY SQLite file.
#
# Run ONCE, from anywhere, after the models are final:
#     bash backend/scripts/gen_initial_migration.sh
#
# Result: backend/alembic/versions/0001_initial_schema.py
#
# Afterwards:
#   1. Read the generated file. It is produced from SQLite, so check the column types / JSON columns also make
#      sense on PostgreSQL (they normally do: sa.JSON, sa.String, sa.Boolean, sa.DateTime, sa.Float, sa.Text).
#   2. Test it on an empty database:   cd backend && alembic upgrade head
#   3. Commit it. Render then runs `alembic upgrade head` on every deploy (see render.yaml).
#
# After any later model change use:   cd backend && alembic revision --autogenerate -m "describe change"
#
# NOTE: if a database was first created by the app's create_all() (local dev convenience) and has no
# `alembic_version` table, run `alembic stamp head` once instead of `alembic upgrade head`.
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BACKEND_DIR"

if ls alembic/versions/*.py >/dev/null 2>&1; then
  echo "alembic/versions already contains a migration - refusing to generate another initial one." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
DB_FILE="$TMP_DIR/empty.db"
# Git Bash on Windows: hand Python a Windows-style path.
if command -v cygpath >/dev/null 2>&1; then DB_FILE="$(cygpath -m "$DB_FILE")"; fi

export DATABASE_URL="sqlite:///${DB_FILE}"
export MONGODB_URI=""
export SEED_DEMO_DATA="false"

# The empty database is at "no revision", which is what autogenerate needs for an initial migration.
alembic revision --autogenerate -m "initial schema" --rev-id 0001

echo "Created: $(ls alembic/versions/0001_*.py)"
echo "Review it, then run: alembic upgrade head"
