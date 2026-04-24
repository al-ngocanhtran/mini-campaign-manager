#!/usr/bin/env bash
# Stop hook: detects when plan/README.md issues flip from `[ ]` to `[x]` and
# appends a session-log entry. Silent when nothing changed. Idempotent.
#
# Stop hooks receive Claude's session JSON on stdin (not used here).
# Reads CLAUDE_PROJECT_DIR; falls back to git rev-parse so it also works
# when invoked manually from any cwd inside the repo.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
PLAN_FILE="$PROJECT_DIR/plan/README.md"
SNAPSHOT_FILE="$PROJECT_DIR/.claude/.plan-snapshot"
MARKER="<!-- HOOK_INSERT_BELOW -->"

# Drain stdin so Claude's writer doesn't see a broken pipe
cat >/dev/null

[[ -f "$PLAN_FILE" ]] || exit 0

# Extract IDs on lines that are checked: `- [x] **`ID-NNN`**`
extract_checked() {
  grep -oE -- '- \[x\] \*\*`[A-Z]+-[0-9]+`\*\*' "$1" 2>/dev/null \
    | grep -oE '`[A-Z]+-[0-9]+`' \
    | tr -d '`' \
    | sort -u
}

current=$(extract_checked "$PLAN_FILE" || true)

# First run: snapshot only, no log entry
if [[ ! -f "$SNAPSHOT_FILE" ]]; then
  printf '%s\n' "$current" > "$SNAPSHOT_FILE"
  exit 0
fi

previous=$(cat "$SNAPSHOT_FILE" 2>/dev/null || true)

# Newly-checked = in current, not in previous
newly_resolved=$(comm -23 \
  <(printf '%s\n' "$current" | sort -u) \
  <(printf '%s\n' "$previous" | sort -u) \
  | grep -v '^$' || true)

# Update snapshot regardless (covers the un-check → re-check case cleanly)
printf '%s\n' "$current" > "$SNAPSHOT_FILE"

if [[ -z "$newly_resolved" ]]; then
  exit 0
fi

# Confirm marker exists; if not, silently bail (don't corrupt the file)
grep -qF "$MARKER" "$PLAN_FILE" || exit 0

ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ids=$(printf '%s\n' "$newly_resolved" | paste -sd ', ' -)
ref=$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || printf '%s' "no-git")
entry="- **${ts}** — resolved: ${ids} — at \`${ref}\`"

# Insert directly above the marker line. Newest entries stack at the bottom of
# the Session log section (just above the marker).
tmp="${PLAN_FILE}.tmp.$$"
awk -v entry="$entry" -v marker="$MARKER" '
  $0 == marker { print entry; print marker; next }
  { print }
' "$PLAN_FILE" > "$tmp"
mv "$tmp" "$PLAN_FILE"
