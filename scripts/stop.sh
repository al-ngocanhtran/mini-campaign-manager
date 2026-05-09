#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Stopping docker compose stack (volume preserved)"
docker compose down

echo "Done. Run 'yarn start' to bring it back up, or 'yarn clean' to wipe data."
