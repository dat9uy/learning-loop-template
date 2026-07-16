#!/usr/bin/env bash
# test-one.sh — focused single-file test runner. Canonical path for one-file runs.
#
# vitest's json reporter (configured in vitest.config.mjs) writes
# .test-logs/vitest-results.json on every run, independent of where stdout is
# sent. We discard raw stdout (the bash gate blocks piping it to tail/grep;
# the JSON is the source of truth) and print the deterministic parsed summary
# from vitest-failures.sh instead. This is the per-file analog of `pnpm test:iter`
# and exists so there is a ONE-command path for focused runs — removing the
# incentive to redirect to a /tmp log and grep it (which evades the gate).
#
# Usage: pnpm test:one <path/to/test.js>   (or: bash tools/scripts/test-one.sh <path>)
# Exit: 0 green / 1 failed / 2 missing-or-invalid JSON (mirrors vitest-failures.sh).
set -uo pipefail
vitest run --bail=1 "$@" 1>/dev/null
bash "$(dirname "$0")/vitest-failures.sh"
