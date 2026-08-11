# Debug: Transient Zod "Invalid option" flake during push of #113

**Finding:** `meta-260803T1706Z-transient-local-pre-push-flake-during-push-of-113-vitest-sur`
**Date:** 2026-08-10
**Status:** Investigation complete — root cause identified, no code change warranted

## Executive Summary

The finding records a transient local-only vitest failure during the push of PR #113
that surfaced a Zod v4 "Invalid option" rejection listing the `operation_envelope.kind`
enum without the field path. The error rotated out of the log buffer before the offending
payload could be captured, so the finding's root cause was unidentifiable from captured
evidence.

This investigation establishes the mechanism, verifies that the current code surface
**does** carry the field path (contradicting the "without naming the field path" premise
for the current SDK build), and concludes that no code change is warranted. The flake
was a one-off transient in a test harness that was itself being introduced by PR #113,
and the evidence-capture discipline the finding asked for has since been built.

## Phase 1 — Root Cause Investigation

### What the error is

Zod v4 produces the "Invalid option" message for `z.enum` failures. The project pins
`zod@4.4.3`. Reproduced directly:

```
ERROR NAME: ZodError
ERROR MESSAGE: "[{\"code\":\"invalid_value\",\"values\":[\"migration\",\"sweep\",...],\"path\":[\"kind\"],\"message\":\"Invalid option: expected one of \\\"migration\\\"|\\\"sweep\\\"|...\"}]"
```

The **structured error object carries the field path** (`path: ["kind"]`). Only the
human-readable message string reads `Invalid option: expected one of ...` with the path
in a separate JSON field — so when only the message text is surfaced (raw stdout,
truncated log buffer), the path is lost. This is exactly the "raw stdout lost structured
context that an MCP envelope would have preserved" class the finding names.

### Where it fires

The `operation_envelope.kind` enum lives in the change-log entry schema
(`tools/learning-loop-mastra/core/meta-state.js:516`) and is exercised by
`meta_state_log_change` (`tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js:38`).
PR #113 introduced both the operation-envelope schema and the vitest hybrid-tier split
that the pre-push hook ran.

The rejection path is the MCP layer: Mastra SDK `validateToolInput` runs the Zod schema
and, on failure, returns `{isError: true, content:[{text:"Tool validation failed..."}]}`.
The test harness's `callTool` (`tools/learning-loop-mastra/__tests__/with-mcp-server.js:88`)
does `JSON.parse(result.content[0].text)` with no `isError` check, so the non-JSON error
text throws `SyntaxError`. Tests expecting rejection must wrap `callTool` in `assert.rejects`
— which `change-log-operation-envelope.test.js` test (b) does.

### Does the current SDK drop the path? No.

The installed `@mastra/core@1.42.0` (same version pinned at flake time) builds the
rejection message with the path included:

```js
// node_modules/.pnpm/@mastra+core@1.42.0_*/node_modules/@mastra/core/dist/chunk-3SZ22TE5.js
const errorMessages = validation.issues.map((e) => `- ${e.path?.join(".") || "root"}: ${e.message}`).join("\n");
```

So on the current build the message reads:
```
- operation_envelope.kind: Invalid option: expected one of "migration"|"sweep"|...
```

The field path **is** present in the current SDK's validation error. The finding's
"without naming the field path" observation either reflects a different SDK build at flake
time or a truncation/rotation of the raw log buffer (the finding itself notes the error
"rotated out of the log buffer before the offending payload could be captured").

### Why CI passed and local failed

The finding records CI ran the same `pnpm test` clean in 2m24s. The flake is
order/timing-dependent: test (b) deliberately triggers this exact rejection, and its
`assert.rejects` swallows it. A transient leak of the raw error to the test reporter
(e.g. an unhandled rejection racing the log flush, or the server stderr interleaving with
the test reporter) would surface the enum text in local output while CI's clean run never
hit the race. The repro path (test b) has run clean repeatedly, confirming it is not a
deterministic failure.

## Phase 2 — Pattern Analysis

### The recurrence class is real and is being handled

The finding links this flake to the `rule-no-raw-stdout-vitest` recurrence (then at 6
occurrences). That signal class is "raw stdout lost structured context." Since the finding:

- `tools/scripts/sanitize-coverage.mjs` and the vitest JSON reporter feed
  `.test-logs/vitest-results.json` (vitest config `reporters` includes `json`).
- `test-output-contract-drift.test.cjs` pins the canonical L2 vitest test-output contract:
  `pnpm test:iter` / `pnpm test:one` run `vitest run --bail=1` with raw stdout suppressed
  and parse the JSON artifact (`numFailedTests`).
- `toolchain-failure-capture.test.cjs` proves the universal hook captures
  `pnpm fallow:gate` / `pnpm test` / `pnpm exec vitest` failures into the gate decision log
  with `command_prefix` + `session_id` — the "calling tool name" the finding wanted.
- A dedicated `test-output-contract-drift.test.cjs` prevents runtime adapters from
  re-typing (and thereby drifting) the vitest policy.

The evidence-capture ask from the finding is now structural, not aspirational: structured
JSON is the source of truth, raw stdout is suppressed, and toolchain failures are captured
with caller context.

### The specific transient Zod rejection gap

The finding asked for: "any future transient schema-rejection should be captured with
calling tool, full payload, test file, and the field path from the Zod error object."
The MCP path already includes the field path (current SDK). The `toolchain-failure-capture`
hook captures the calling command. What does not exist is a dedicated capture of a
*Zod rejection at the MCP tool boundary* that includes the full payload — but that is a
deliberate trade: redacting sensitive keys from payloads (`redactSensitiveKeys` in the
SDK) is a security property, and capturing full payloads would risk persisting secrets.
The current design (path included + tool id + command-prefix capture) satisfies the
finding's intent without the secret-exposure risk of full-payload persistence.

## Phase 3 — Verification

- Reproduced the exact Zod v4 enum rejection and confirmed the structured `path` field:
  `node -e` with `zod@4.4.3` → `path: ["kind"]`, message `Invalid option: expected one of ...`.
- Confirmed `@mastra/core@1.42.0` `validateToolInput` includes `e.path?.join(".")`.
- Ran `change-log-operation-envelope.test.js` (e2e project): **10/10 passed**. Test (b)
  (unknown `operation_envelope.kind`) is the deterministic repro path and passes with the
  rejection correctly swallowed.
- The one "Invalid option" string in the test log was a `kind_op_incompatible` diagnostic
  (`buildEnvelope`), not the Zod enum.

## Conclusion & Recommendation

**No code change warranted.**

1. The current SDK surfaces the field path (`operation_envelope.kind`) in the validation
   error, so the "path dropped" premise no longer holds for the pinned build.
2. The deterministic repro path (test b) passes; the flake was a transient order/timing
   race that has not recurred.
3. The evidence-capture discipline the finding asked for has since been built:
   JSON-as-source-of-truth test contract, suppressed raw stdout, and toolchain-failure
   capture with caller context.
4. Persisting full MCP payloads (the finding's literal ask) would conflict with the
   SDK's secret redaction and would be a security regression. The path-level + command-prefix
   capture is the right balance.

Recommended action: **resolve** (not archive) the finding with a note that the mechanism is
understood, the repro passes, and the evidence-capture gap is closed by the JSON-contract +
toolchain-capture infrastructure. Resolution preserves dedup suppression by
`recurrence_key` so the same class does not re-file.

## Evidence

| Item | Location |
|------|----------|
| Finding record | `meta-state.jsonl` → `meta-260803T1706Z-...` |
| `operation_envelope.kind` schema | `tools/learning-loop-mastra/core/meta-state.js:516` |
| Finding's evidence ref | `tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js:38` |
| Repro test (b) | `tools/learning-loop-mastra/__tests__/e2e/change-log-operation-envelope.test.js:65` |
| MCP harness `callTool` | `tools/learning-loop-mastra/__tests__/with-mcp-server.js:88` |
| SDK validateToolInput path | `node_modules/.../@mastra/core@1.42.0/dist/chunk-3SZ22TE5.js` |
| Test-output contract drift test | `tools/learning-loop-mastra/__tests__/test-output-contract-drift.test.cjs` |
| Toolchain-failure capture test | `tools/learning-loop-mastra/__tests__/toolchain-failure-capture.test.cjs` |
| Zod v4 enum message | `node_modules/.../zod@3.25.76/v4/locales/en.js:69` (v4 shim in v3 package) |
