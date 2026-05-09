#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "==> No .env found; run 'yarn setup' first for a clean bootstrap" >&2
  exit 1
fi

echo "==> Starting docker compose stack"
docker compose up -d

echo "==> Waiting for postgres to be healthy"
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres -d campaign_manager >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

cat <<EOF

Stack is up.

  Frontend: http://localhost:5173
  Backend:  http://localhost:3001/health

EOF
