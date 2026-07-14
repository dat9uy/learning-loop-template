# PR Body — Deterministic jq parse of vitest results

Resolves `meta-260714T1334Z-the-test-result-parsing-procedure-is-not-surfaced-to-the-age`.

## Summary

A pure `bash + jq` parser (`tools/scripts/vitest-failures.sh`) consumes `.test-logs/vitest-results.json` with one `jq` invocation per exit-class branch, and the parse path is now surfaced through PROCESS_HINTS row #1 (canonical + `.factory` mirror).

## Registry deltas (per `rule-pr-body-registry-deltas`)

```json
{
  "version": 1,
  "items": [
    {
      "id": "swept-entries",
      "description": "Sweep entries by id + reason (status=stale)",
      "entries": []
    },
    {
      "id": "resolved-entries",
      "description": "Resolved entries by id + resolution note",
      "entries": [
        {
          "id": "meta-260714T1334Z-the-test-result-parsing-procedure-is-not-surfaced-to-the-age",
          "resolution": "Shipped deterministic jq parse path: (1) tools/scripts/vitest-failures.sh — pure bash+jq parser (exit 0 green / 1 failed / 2 missing-or-invalid; truncates failureMessages to ~500 chars + …), covered by 7 hermetic vitest tests under tools/scripts/__tests__/vitest-failures.test.js plus a failed fixture at tools/scripts/__fixtures__/vitest-results-failed.json; (2) PROCESS_HINTS row #1 in tools/learning-loop-mastra/core/loop-introspect.js rewritten to surface fast-feedback run flags (vitest run --bail=1 / vitest run <path> / vitest --changed) + parse-once via the script + jq fallback + explicit Do-NOT hand-parse clause + retained same-file-read Rule 2, mirrored byte-for-byte to .factory/hooks/loop-surface-inject.cjs LOCAL_PROCESS_HINTS row #1 (cold-session-discoverability.test.cjs parity enforced); (3) loop-describe-warm-tier.test.js substring assertions updated to lock in the new contract (vitest-failures.sh + Do NOT instead of the removed silent-command Rule 1); (4) file-index re-grounded for tools/learning-loop-mastra/core/loop-introspect.js (2 findings re-grounded) since row #1 SHA changed. Acceptance: pnpm test green (1893 tests + 1 skipped); bash tools/scripts/vitest-failures.sh on green tree prints 'all green: 1894 tests / 381 suites passed', exit 0; cold-session-discoverability 11/11; no new python-c/node-e parse of vitest-results.json introduced."
        }
      ]
    },
    {
      "id": "new-entries",
      "description": "New entries by id + initial status",
      "entries": []
    },
    {
      "id": "promoted-rules",
      "description": "Promoted rules by finding_id + rule_id",
      "entries": []
    },
    {
      "id": "superseded-entries",
      "description": "Superseded entries by id + consolidated_into",
      "entries": []
    },
    {
      "id": "archived-entries",
      "description": "Archived entries by id + archived_reason",
      "entries": []
    }
  ]
}
```

## Files

- New: `tools/scripts/vitest-failures.sh` (pure bash+jq; 4-way exit contract).
- New: `tools/scripts/__fixtures__/vitest-results-failed.json` (minimal failed fixture mirroring vitest JSON shape).
- New: `tools/scripts/__tests__/vitest-failures.test.js` (7 hermetic tests).
- Modified: `tools/learning-loop-mastra/core/loop-introspect.js` (PROCESS_HINTS row #1).
- Modified: `.factory/hooks/loop-surface-inject.cjs` (LOCAL_PROCESS_HINTS row #1, byte-identical mirror).
- Modified: `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-warm-tier.test.js` (substring assertions updated).
- Registry: 1 finding resolved via `meta_state_resolve`.

## Verification

- `pnpm test`: 1893 passed + 1 skipped, 0 failed (212 test files).
- `pnpm test:cold-session`: 11/11 (parity strict-equal).
- `bash tools/scripts/vitest-failures.sh` on green tree: `all green: 1894 tests / 381 suites passed`, exit 0.
- Failed fixture path: prints `1 failing assertion(s):` + `fullName` + truncated message, exit 1.
- Missing path / invalid JSON: exit 2 + stderr guidance.
- `grep -rnE "python -c|node -e" tools/learning-loop-mastra tools/scripts .factory/hooks` filtered for `vitest-results|test-logs`: only the Do-NOT clause references them — no new adhoc parse introduced.

## Deferred

`meta-260714T1704Z-the-meta-state-refresh-workflow-forces-n-trial-and-error-mcp` (meta-state refresh N+ round-trips + batch refresh tool) is the meta-state half of the same UX gap. Out of scope for this PR — landed in `loop-design-meta-state-batch-refresh-and-reground-drift`.
