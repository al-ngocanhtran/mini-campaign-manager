#!/usr/bin/env bash
# One-command bootstrap: verify host prereqs, install host deps, bring up
# the Docker stack, wait for the backend to be healthy, run migrations,
# and seed demo data. Safe to re-run.
set -euo pipefail

# Always operate from the repo root, regardless of where this was invoked.
cd "$(dirname "$0")/.."

# Host Node major required for husky hooks, lint, and typecheck.
# (The Dockerfiles pin their own node:20 internally — this gate is host-side.)
REQUIRED_NODE_MAJOR=22

err() { printf 'error: %s\n' "$*" >&2; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "missing required command: $1"
    [ $# -gt 1 ] && err "  hint: $2"
    exit 1
  fi
}

# 1. Host environment ------------------------------------------------------
echo "==> Checking host environment"

require_cmd node   "install Node.js >= ${REQUIRED_NODE_MAJOR} (https://nodejs.org, or use nvm/asdf)"
require_cmd yarn   "Yarn 4 ships via Corepack — run: corepack enable"
require_cmd docker "install Docker Desktop or Docker Engine"
require_cmd curl   "install curl (used for the backend health check below)"

# Compose v2 is a docker subcommand; v1 (docker-compose) is EOL.
if ! docker compose version >/dev/null 2>&1; then
  err "docker compose v2 not available"
  err "  hint: upgrade Docker Desktop, or install the docker-compose-plugin package"
  exit 1
fi

# Daemon must actually be running, not just installed.
if ! docker info >/dev/null 2>&1; then
  err "docker daemon is not running"
  err "  hint: start Docker Desktop (or: sudo systemctl start docker)"
  exit 1
fi

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt "$REQUIRED_NODE_MAJOR" ]; then
  err "Node.js >= ${REQUIRED_NODE_MAJOR} required (found $(node -v))"
  err "  hint: nvm install ${REQUIRED_NODE_MAJOR} && nvm use ${REQUIRED_NODE_MAJOR}"
  exit 1
fi

# 2. .env ------------------------------------------------------------------
echo "==> Checking .env"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "    created .env from .env.example"
fi

# docker-compose.yml treats JWT_SECRET as required (${JWT_SECRET:?...}).
# Catch the placeholder here so we fail with a useful hint instead of
# the raw compose error.
if grep -qE '^JWT_SECRET=(your-secret-here)?[[:space:]]*$' .env; then
  err "JWT_SECRET in .env is unset or still the placeholder"
  err "  fix: yarn workspace campaign-manager-backend run generate-jwt-secret"
  err "       then paste the output as JWT_SECRET=... in .env"
  exit 1
fi

# 3. Host dependencies -----------------------------------------------------
# Required even though dev runs in Docker — husky's prepare hook installs
# git hooks here, and IDE typecheck/lint resolve from these node_modules.
echo "==> Installing host dependencies (yarn install)"
yarn install

# 4. Bring up the stack ----------------------------------------------------
# The 'postgres' service has its own healthcheck and creates the
# 'campaign_manager' database on first volume init via POSTGRES_DB.
# The 'backend' service uses depends_on: condition: service_healthy,
# so it only starts once Postgres is accepting connections.
echo "==> Building and starting docker compose stack"
docker compose up -d --build

# 5. Wait for backend health ----------------------------------------------
# Replaces the old `sleep 2` race. The backend exposes /health once it has
# booted and connected to Postgres.
echo "==> Waiting for backend to be healthy"
for i in $(seq 1 30); do
  if curl -fsS http://localhost:3001/health >/dev/null 2>&1; then
    echo "    backend healthy after ${i}s"
    break
  fi
  if [ "$i" -eq 30 ]; then
    err "backend did not become healthy within 30s"
    err "  check logs: docker compose logs backend"
    exit 1
  fi
  sleep 1
done

# 6. Seed demo data --------------------------------------------------------
# Migrations are owned by the backend container's CMD (`yarn run migrate &&
# yarn run start` in backend/Dockerfile), so by the time /health responded
# above, the schema is up to date. Seeding is one-shot and tracked by
# sequelize-cli, so re-runs are no-ops once applied.
echo "==> Seeding demo data"
docker compose exec -T backend yarn run seed

cat <<EOF

Setup complete.

  Frontend: http://localhost:5173
  Backend:  http://localhost:3001/health
  Login:    demo@example.com / passworD@123

EOF
