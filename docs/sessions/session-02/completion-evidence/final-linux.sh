#!/bin/bash
set -u
exec > >(tee /evidence/s02-final/linux-final.log) 2>&1
run() { printf '\nCOMMAND:'; printf '%q ' "$@"; printf '\nSTART:'; date -u +%FT%TZ; "$@"; code=$?; printf '\nEXIT_CODE:%s\nEND:' "$code"; date -u +%FT%TZ; return "$code"; }
cd /workspace/desktop-control || exit 1
run git fetch origin || exit $?
run git switch feat/s02-local-mcp-core || exit $?
run git pull --ff-only || exit $?
run git rev-parse HEAD
run git status --short --branch
run node --version
run npm --version
run id
run npm ci --ignore-scripts || exit $?
run npm run verify || exit $?
run npm ls --all || exit $?
run npm audit --json || exit $?
run git diff --check || exit $?
run git status --short --branch
