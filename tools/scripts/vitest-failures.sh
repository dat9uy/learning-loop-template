#!/usr/bin/env bash
# vitest-failures.sh — deterministic parse of `.test-logs/vitest-results.json`.
#
# Contract:
#   - green (numFailedTests==0): print one-line summary, exit 0.
#   - failures (numFailedTests>0): print header + per-failure fullName +
#     failureMessages (each truncated to ~500 chars with trailing "…"), exit 1.
#   - missing/invalid file: print guidance to stderr, exit 2.
#
# Path is overridable via $1 (default `.test-logs/vitest-results.json`).
# Read-only: no side effects, no gate preflight required.

set -euo pipefail

PATH_ARG="${1:-.test-logs/vitest-results.json}"

if [[ ! -f "$PATH_ARG" ]]; then
  echo "vitest-failures.sh: file not found: $PATH_ARG" >&2
  echo "  hint: run \`pnpm test\` first, or pass the path as \$1" >&2
  exit 2
fi

# jq -er: returns 0 if green summary is non-empty, 1 otherwise (failures or invalid JSON).
GREEN_SUMMARY=$(jq -er '
  if .numFailedTests == 0 then
    "all green: \(.numTotalTests) tests / \(.numTotalTestSuites) suites passed"
  else
    empty
  end
' "$PATH_ARG" 2>/dev/null) || GREEN_SUMMARY=""

if [[ -n "$GREEN_SUMMARY" ]]; then
  printf '%s\n' "$GREEN_SUMMARY"
  exit 0
fi

# Green branch failed — either JSON is invalid or tests failed. Validate first.
if ! jq -e . "$PATH_ARG" >/dev/null 2>&1; then
  echo "vitest-failures.sh: invalid JSON in $PATH_ARG" >&2
  # Sniff human vitest stdout (the raw reporter, not JSON). The common cause:
  # the caller redirected `vitest run > X` then passed X here, instead of using
  # the canonical runners which read the JSON vitest writes alongside stdout.
  # Match vitest's human format (Test Files / Tests / "RUN v" banner / ⎯⎯⎯).
  if grep -Eq 'Test Files|RUN v|⎯⎯⎯' "$PATH_ARG" 2>/dev/null; then
    echo "  this looks like vitest human stdout, not JSON results." >&2
    echo "  hint: run \`pnpm test:iter\` (full) or \`pnpm test:one <path>\` (one file)" >&2
    echo "        — both read .test-logs/vitest-results.json; do not redirect raw stdout." >&2
  else
    echo "  hint: regenerate via \`pnpm test\` (vitest json reporter writes this file)" >&2
  fi
  exit 2
fi

jq -r '
  (.numFailedTests | tostring) + " failing assertion(s):" as $header
  | [($header)] + [
      (.testResults[].assertionResults[] | select(.status == "failed")
       | "  - " + .fullName
       + ((.failureMessages
            | map(if length > 500 then .[0:500] + "…" else . end)
            | join("\n      "))
          | if length > 0 then "\n      " + . else "" end))
    ]
  | join("\n")
' "$PATH_ARG"
exit 1