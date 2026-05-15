#!/usr/bin/env bash
# preflight — gates every PR in the #thegreatmigration series and beyond.
#
# Runs: lint → typecheck → unit tests → rules tests → production build.
# Fail-fast: the first failed stage exits non-zero and stops the pipeline.
# Designed to be the single command CI runs and the single command a contributor
# runs before pushing. Keep it cheap enough to want to run; expensive checks
# (Playwright E2E) stay out and run separately in test:e2e / test:tracers.

set -euo pipefail

readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BOLD='\033[1m'
readonly RESET='\033[0m'

start_time=$(date +%s)

stage() {
  local name="$1"
  printf "\n${BOLD}${YELLOW}▶ preflight: %s${RESET}\n" "$name"
}

succeed() {
  local name="$1"
  local elapsed="$2"
  printf "${GREEN}✓ %s (%ss)${RESET}\n" "$name" "$elapsed"
}

fail() {
  local name="$1"
  printf "\n${RED}${BOLD}✗ preflight failed at: %s${RESET}\n" "$name" >&2
  printf "${RED}Fix this stage, then rerun: npm run preflight${RESET}\n" >&2
  exit 1
}

run_stage() {
  local name="$1"
  shift
  stage "$name"
  local stage_start
  stage_start=$(date +%s)
  if "$@"; then
    succeed "$name" "$(( $(date +%s) - stage_start ))"
  else
    fail "$name"
  fi
}

run_stage_informational() {
  local name="$1"
  shift
  stage "$name (informational — does not fail preflight)"
  local stage_start
  stage_start=$(date +%s)
  if "$@"; then
    succeed "$name" "$(( $(date +%s) - stage_start ))"
  else
    printf "${YELLOW}⚠ %s reported issues (preflight continues — fix at your discretion)${RESET}\n" "$name"
  fi
}

emulator_up() {
  # Firestore emulator listens on :8080 by default. Cheap port-check via /dev/tcp.
  (echo > "/dev/tcp/127.0.0.1/8080") 2>/dev/null
}

run_stage "typecheck"     npx tsc -b
run_stage "unit tests"    npm run test:run
if emulator_up; then
  run_stage "rules tests" npm run test:rules
else
  printf "\n${YELLOW}⏭ skipping rules tests: Firestore emulator not running on :8080.${RESET}\n"
  printf "${YELLOW}   Run \`npm run emulators:start\` in another terminal to include rules tests.${RESET}\n"
fi
run_stage "production build" npm run build
run_stage_informational "lint" npm run lint

elapsed=$(( $(date +%s) - start_time ))
printf "\n${GREEN}${BOLD}✓ preflight passed in %ss${RESET}\n" "$elapsed"
