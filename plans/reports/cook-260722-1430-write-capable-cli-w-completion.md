---
title: "Cook completion: write-capable CLI (W) — full record transport landed on .claude"
date: 2026-07-22
branch: plan-260722-1343-write-capable-cli-w
plan: plans/260722-1343-write-capable-cli-w-complete-the-cli-record-transport/plan.md
status: shipped
---

# Cook completion: write-capable CLI (W)

Plan `260722-1343` shipped. The CLI is now a complete transport for the record surface on `.claude`: `bin/loop.mjs` carries every CLI-portable mutation tool (`meta_state_report`, `meta_state_resolve`, `meta_state_promote_rule`, `meta_state_log_change`, `meta_state_patch`, `meta_state_batch`, `meta_state_archive`, `meta_state_supersede`, `meta_state_propose_design`, `meta_state_ship_loop_design`, `meta_state_dispatch_finding` both stages, `meta_state_re_verify`, `meta_state_refresh_file_index`, `runtime_state_record`, `gate_mark_preflight`, `gate_override`) on top of the existing 7 read tools, reusing the same handler / R2-gate / lock code path as MCP. `LOOP_RECORDS_VIA_CLI=1` in `.mcp.json` drops every CLI_TOOLS member from the MCP surface; MCP keeps the irreducible residue (workflow / storage / allowlist / audit + auxiliary read-ish tools).

## What landed

| Layer | Change | Files |
|-------|--------|-------|
| Self-footgun guard | Activation branch of `meta_state_promote_rule` rejects regex patterns matching canonical CLI invocation shapes (`node bin/loop.mjs ...`); also closes a pre-existing ReDoS gap by adding `isSafeRegexPattern` to the activation branch. | `tools/handlers/meta-state-promote-rule-tool.js`, new `core/cli-self-match.js` |
| CLI write tool set | `CLI_WRITE_TOOLS` (16 handlers) + `CLI_TOOLS = CLI_READ_TOOLS ∪ CLI_WRITE_TOOLS`. Single source of truth shared by CLI allowlist + MCP exclusion set. Drift test guards against silent additions. | `core/cli-tools.js`, new `__tests__/cli-write-tool-set.test.js`, `__tests__/cli-write-tool-set-drift.test.js` |
| MCP records opt-out | `LOOP_RECORDS_VIA_CLI=1` excludes every `CLI_TOOLS` member from MCP. `LOOP_READS_VIA_CLI` (reads-only) kept for R's backward compat. | `mastra/server.js`, `__tests__/cli-mcp-subset-registration.test.js` |
| Structured stderr | `classifyCliError` splits non-usage errors into recognized-rejection JSON (`{error, code, reason}` — agent retries by arg-fixing) vs `InternalError` JSON (`{error: "InternalError", internal: true}` — agent files a bug). `UsageError` + identity-pin stay on the exit-2 human-readable path. | new `core/cli-stderr.js`, `bin/loop.mjs` |
| `--schema` flag | `loop.mjs <tool> --schema` prints the normalized JSON Schema (draft-7). Pin-exempt (mirrors `list`); works for read + write tools; non-CLI tools exit 2. | `bin/loop.mjs`, new `__tests__/cli-schema-flag.test.js` |
| Write-hint sketches | SessionStart banner surfaces one-line arg sketches per write tool; full shape pulled on demand via `--schema`. Records-via-cli state adds recovery-policy prose (recognized-rejection vs InternalError). | `hooks/universal/session-start-inject-discoverability.cjs`, `__tests__/cli-sessionstart-banner.test.js` |
| Write parity | CLI writes produce byte-structural parity with direct handler call AND MCP server for `meta_state_report` (independent-tmpdir seeded comparison; non-deterministic fields stripped: timestamps, fingerprints, `version`). | new `__tests__/cli-write-parity.test.js` |
| Bash-gate guard | Extended with write-shape `ok` case (`node bin/loop.mjs meta_state_report '{}'`); locks the invariant that future blocking regexes cannot break the write channel. | `__tests__/cli-bash-gate-guard.test.js` |
| Contract activation | `docs/runtime-contract.md` L24/L26/L42 now names the write-capable CLI as a wired transport, framed as an example realization of Capability 3 on a non-MCP transport so L5 transport-agnostic framing stays intact. | `docs/runtime-contract.md` |
| Dogfood | `.claude` migrated from `LOOP_READS_VIA_CLI=1` to `LOOP_RECORDS_VIA_CLI=1` after T2 write-path evidence accrued (write-parity tests green; change-log entry `meta-260722T1433Z` recorded via the CLI itself; exit-code contract verified end-to-end). | `.mcp.json` |
| Closure | Finding `meta-260721T0809Z-transport-diversification-to-a-cli-is-a-deferred-decision-no` resolved via the CLI write path. Resolution claims `.claude` only; `.factory` / `.mastracode` generalize by setting the same flag after their own dogfood — separate evidence gate. | registry |

## Tests

| Suite | Result |
|-------|--------|
| `pnpm test` (full) | **2413 passed / 1 skipped / 0 failed** across 265 test files |
| New Phase 1-3 tests | 28 added (self-footgun, write tool-set, drift, exit-codes, stderr-format, write-parity, schema, banner) |
| Phase 4 evidence | Recorded via CLI: change-log `meta-260722T1433Z-tools-learning-loop-mastra-bin-loop-mjs` + resolve of `meta-260721T0809Z-...` |
| Runtime-agnostic audit | `cli-self-match.js` / `cli-tools.js` / `bin/loop.mjs` all pass `check_runtime_agnostic` (6/6 items each) |

## Pre-existing regressions fixed en route

- `cli-optout-wiring.test.js`, `mcp-config.test.js`, `cli-sessionstart-banner.test.js`: updated expectations from `LOOP_READS_VIA_CLI=1` to `LOOP_RECORDS_VIA_CLI=1`; banner test now checks records-via-cli prose.
- `integration-promoted-rule.test.js`: changed the recovery-flow fixture pattern from `.*` (now self-bricks via the guard) to `^forbidden-test-pattern$`.
- `placement.yaml`: registered new files (`cli-self-match.js`, `cli-stderr.js`) with correct role taxonomy (primitive / facade — the latter because `cli-stderr.js` imports `identity-pin.js`, a facade).

## Out of scope (forward)

- `.factory` / `.mastracode` generalize via the same flag after their own dogfood.
- Auxiliary read-ish tools (`gate_check`, `gate_check_recurrence`, `meta_state_sweep`, `meta_state_query_drift`, `meta_state_relationship_validate`) stay MCP until a follow-up adds them to `CLI_READ_TOOLS` if a runtime wants the full surface.
- Write-parity matrix is anchored on `meta_state_report`; extending to `meta_state_resolve` / `meta_state_log_change` / `meta_state_batch` / `meta_state_patch` / `meta_state_dispatch_finding` follows the same pattern (the strip set is documented in the test header).
