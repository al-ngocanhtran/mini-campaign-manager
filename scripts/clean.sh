#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

FORCE=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) FORCE=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [ "$FORCE" -ne 1 ]; then
  echo "This will destroy the postgres volume and all containers."
  read -r -p "Type 'yes' to proceed: " ans
  if [ "$ans" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "==> Tearing down containers, volumes, and orphans"
docker compose down -v --remove-orphans

echo "Done. Run 'yarn setup' to bootstrap again."
