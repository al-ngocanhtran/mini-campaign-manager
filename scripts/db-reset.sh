#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

DB_NAME="${DB_NAME:-campaign_manager}"
DB_USER="${DB_USER:-postgres}"

echo "==> Ensuring postgres container is up"
docker compose up -d postgres >/dev/null

echo "==> Waiting for postgres to accept connections"
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "$DB_USER" -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Dropping database '$DB_NAME' (if it exists)"
docker compose exec -T postgres psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid();" \
  >/dev/null
docker compose exec -T postgres dropdb -U "$DB_USER" --if-exists "$DB_NAME"

echo "==> Creating database '$DB_NAME'"
docker compose exec -T postgres createdb -U "$DB_USER" "$DB_NAME"

echo "==> Ensuring backend container is up"
docker compose up -d backend >/dev/null

echo "==> Running migrations"
docker compose exec -T backend yarn run migrate

echo "==> Seeding demo data"
docker compose exec -T backend yarn run seed

cat <<EOF

Database reset complete.

  Database: $DB_NAME
  Login:    demo@example.com / passworD@123

EOF
