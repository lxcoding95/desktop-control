#!/bin/bash
set -u
mkdir -p /evidence/s02-extension3
exec > >(tee /evidence/s02-extension3/linux-verify.log) 2>&1
run() { printf '\nCOMMAND: '; printf '%q ' "$@"; printf '\nSTART: '; date -u +%FT%TZ; "$@"; rc=$?; printf '\nEXIT_CODE: %s\nEND: ' "$rc"; date -u +%FT%TZ; return "$rc"; }
cd /workspace/desktop-control || exit 1
run git fetch origin || exit $?
run git pull --ff-only || exit $?
run git status --short --branch
run git rev-parse HEAD
run git ls-remote origin refs/heads/feat/s02-local-mcp-core
run uname -a
run node --version
run npm --version
run id
run npm ci --ignore-scripts || exit $?
run npm run verify
rc=$?
run git status --short --branch
exit "$rc"
