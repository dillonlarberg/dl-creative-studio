#!/usr/bin/env bash
# Live-tail the runOutpaintBatch Cloud Run logs, formatted for human eyes.
#
# Polls `firebase functions:log` every few seconds and prints only newly-seen
# lines. Each structured event lands on one line:
#   12:35:42  source_staged       batch=abc1234…
#   12:35:48  p1_done             batch=abc1234…  p1Ms=5821
#   12:36:31  output_complete     batch=abc1234…  output=o1ab…  p2Ms=42150
#   12:36:33  batch_finalised     batch=abc1234…  status=completed  totalMs=82001
#
# Why polling instead of `gcloud logging tail`:
#   `gcloud logging tail` lives in `gcloud beta` and needs a grpcio Python
#   wheel that often isn't installed on dev machines — when missing it
#   silently hangs after printing the header. `firebase functions:log` is
#   already installed (we use it for deploys), so polling is the path that
#   "just works".
#
# Usage:
#   npm run dev:logs
#   ./scripts/tail-resize-logs.sh
#
# Env:
#   RESIZE_LOGS_PROJECT  Override the Firebase project (default: prod)
#   RESIZE_LOGS_POLL_S   Seconds between polls (default: 4)

set -euo pipefail

PROJECT="${RESIZE_LOGS_PROJECT:-automated-creative-e10d7}"
POLL_S="${RESIZE_LOGS_POLL_S:-4}"
SEEN_FILE="$(mktemp -t resize-logs.XXXXXX)"
trap 'rm -f "$SEEN_FILE"' EXIT

echo "🔭 Tailing runOutpaintBatch logs in $PROJECT (poll ${POLL_S}s; Ctrl-C to stop)…" >&2
echo >&2

format_line() {
  local line="$1"
  local ts event tail json

  ts=$(echo "$line" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+' | head -1)
  local time_only="${ts##*T}"

  json=$(echo "$line" | grep -oE '\{.*\}$' | head -1 || true)

  if [[ -n "$json" ]]; then
    event=$(echo "$json" | sed -nE 's/.*"event"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -1)
    [[ -z "$event" ]] && event=$(echo "$json" | sed -nE 's/.*"message"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -1)

    tail=""
    for pair in "batchId:batch" "outputId:output" "status:status" "reason:reason" "category:cat" "p1Ms:p1Ms" "p2Ms:p2Ms" "totalMs:totalMs"; do
      local key="${pair%%:*}"
      local label="${pair##*:}"
      local val
      val=$(echo "$json" | sed -nE "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"?([^\",}]+)\"?.*/\1/p" | head -1)
      if [[ -n "$val" ]]; then
        if [[ "$key" == "batchId" || "$key" == "outputId" ]]; then
          tail+="${label}=${val:0:8}…  "
        else
          tail+="${label}=${val}  "
        fi
      fi
    done
  else
    event=$(echo "$line" | sed -E 's/^[^:]+:[^:]+:[^:]+ [A-Z] [a-z0-9-]+: //' | head -c 80)
    tail=""
  fi

  local label="${event:-—}"
  printf '%s  %-20s  %s\n' "${time_only:-—}" "$label" "$tail"
}

while true; do
  # `firebase functions:log` prints newest-first; we want oldest-first so the
  # output reads top-to-bottom chronologically. `tac` is GNU-only; `tail -r`
  # works on macOS but not Linux. Use awk for portability.
  firebase functions:log --only runOutpaintBatch --project "$PROJECT" --lines 50 2>/dev/null \
    | awk '{a[NR]=$0} END {for (i=NR; i>=1; i--) print a[i]}' \
    | while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        # Dedup on the formatted output (timestamp + event + parsed fields),
        # not the raw log line. firebase functions:log re-fetches sometimes
        # vary the raw prefix (trace IDs, exec IDs) which made the previous
        # raw-line hash spam duplicates on every poll.
        formatted=$(format_line "$line")
        hash=$(printf '%s' "$formatted" | shasum | cut -d' ' -f1)
        if ! grep -q "^$hash$" "$SEEN_FILE" 2>/dev/null; then
          echo "$hash" >> "$SEEN_FILE"
          printf '%s\n' "$formatted"
        fi
      done
  sleep "$POLL_S"
done
