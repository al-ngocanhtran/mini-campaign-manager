#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

DB_NAME="${TEST_DB_NAME:-campaign_manager_test}"
DB_USER="${TEST_DB_USER:-postgres}"
DB_PASS="${TEST_DB_PASS:-postgres}"
DB_HOST="${TEST_DB_HOST:-localhost}"
DB_PORT="${TEST_DB_PORT:-5432}"

echo "==> Ensuring postgres container is up"
docker compose up -d postgres >/dev/null

echo "==> Waiting for postgres to accept connections"
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "$DB_USER" -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Ensuring database '$DB_NAME' exists"
exists=$(docker compose exec -T postgres psql -U "$DB_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")
if [ "$exists" != "1" ]; then
  docker compose exec -T postgres createdb -U "$DB_USER" "$DB_NAME"
  echo "    created"
else
  echo "    already exists"
fi

echo "==> Running tests"
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME" \
  yarn workspace campaign-manager-backend run test "$@"
