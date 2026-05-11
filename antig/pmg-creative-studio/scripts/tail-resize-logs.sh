#!/usr/bin/env bash
# Live-tail the runOutpaintBatch Cloud Run logs, formatted for human eyes.
#
# Each structured event lands on one line:
#   12:34:56  batch_received    batch=abc1…  outputs=4
#   12:35:42  source_staged     batch=abc1…  720x720 image/png
#   12:35:48  p1_done           batch=abc1…  p1Ms=5821
#   12:36:31  output_complete   batch=abc1…  output=o1…  p2Ms=42150
#   12:36:33  batch_finalised   batch=abc1…  status=completed  totalMs=82001
#
# Requires: gcloud CLI authenticated as a user with logging.viewer on the
# `automated-creative-e10d7` project.
#
# Usage:
#   npm run dev:logs           # streams forever; Ctrl-C to stop
#   ./scripts/tail-resize-logs.sh

set -euo pipefail

PROJECT="${RESIZE_LOGS_PROJECT:-automated-creative-e10d7}"
SERVICE="${RESIZE_LOGS_SERVICE:-runoutpaintbatch}"

echo "🔭 Tailing $SERVICE logs in $PROJECT (Ctrl-C to stop)…" >&2
echo >&2

gcloud logging tail \
  "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$SERVICE\"" \
  --project="$PROJECT" \
  --format='value(timestamp,jsonPayload.event,jsonPayload.batchId,jsonPayload.outputId,jsonPayload.status,jsonPayload.reason,jsonPayload.totalMs,jsonPayload.p1Ms,jsonPayload.p2Ms,jsonPayload.message,textPayload)' \
  2>/dev/null \
  | while IFS=$'\t' read -r ts event batch output status reason totalMs p1Ms p2Ms message textPayload; do
      time_only=$(echo "$ts" | sed -E 's/.*T([0-9:]+).*/\1/')

      # Pretty event label, padded.
      label="${event:-${message:-${textPayload:-—}}}"
      label_padded=$(printf '%-18s' "$label")

      # Build a tail of relevant fields.
      tail=""
      [[ -n "${batch:-}" ]] && tail+="batch=${batch:0:8}…  "
      [[ -n "${output:-}" ]] && tail+="output=${output:0:8}…  "
      [[ -n "${status:-}" ]] && tail+="status=$status  "
      [[ -n "${reason:-}" ]] && tail+="reason=$reason  "
      [[ -n "${p1Ms:-}" ]] && tail+="p1Ms=$p1Ms  "
      [[ -n "${p2Ms:-}" ]] && tail+="p2Ms=$p2Ms  "
      [[ -n "${totalMs:-}" ]] && tail+="totalMs=$totalMs  "

      printf '%s  %s  %s\n' "$time_only" "$label_padded" "$tail"
    done
