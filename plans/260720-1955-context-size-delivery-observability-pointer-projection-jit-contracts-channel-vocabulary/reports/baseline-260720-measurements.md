# Context-surface baseline

Measured: 2026-07-21T01:20:19.839Z
Command: `node tools/scripts/measure-context-surfaces.mjs`

## MCP tools/list

- Live registered tools: 44
- Serialized `tools/list.tools` bytes: 79,588
- Largest definitions:

| Tool | Bytes |
|---|---:|
| `mastra_meta_state_patch` | 19,817 |
| `mastra_meta_state_report` | 7,367 |
| `mastra_meta_state_log_change` | 4,871 |
| `mastra_meta_state_list` | 3,450 |
| `mastra_meta_state_batch` | 2,904 |
| `mastra_meta_state_promote_rule` | 2,315 |
| `mastra_runtime_state_read` | 2,170 |
| `mastra_meta_state_propose_design` | 1,945 |
| `mastra_meta_state_resolve` | 1,858 |
| `mastra_runtime_state_record` | 1,753 |

The Phase 2 budget applies to the manifest-tool portion; this baseline captures the complete live list and preserves the per-tool table in the JSON measurement output.

## SessionStart hooks

| Hook | Chars | UTF-8 bytes |
|---|---:|---:|
| `session-start-inject-discoverability.cjs` | 5,134 | 5,144 |
| `session-start-inject-process-hints.cjs` | 7,954 | 7,983 |
| **Combined** | **13,088** | **13,127** |

## Sidecar shape

- `.claude/session-context.json` keys: `change_log_gap_hints`, `discoverability_hints`, `discoverability_hints_error`, `discoverability_hints_source`, `injected_at`, `process_hints`, `process_hints_error`, `process_hints_source`, `registry_error`, `registry_source`, `stale_dispatch_hints`
- Shape hash (sorted key names): `12c595529c8760ecb3643b374d641ea7a89a6cca920b83b35bf4aec26ee41382`
- Source flags: `discoverability_hints_source=core`, `process_hints_source=core`, `registry_source=core`
- Full per-key byte sizes are emitted by the harness; `injected_at` is intentionally excluded from shape comparisons.

## Gate-log baseline

- File: `.claude/coordination/.gate-decision.log`
- Window: preceding 30 days
- `invalid_field` lines associated with `meta_state_patch`/`meta_state_batch`: **0**
- The harness conservatively retains lines without parseable timestamps.

## Guard suites

All Phase 1 guard suites were green at HEAD:

- `mcp-tools-list-parity.test.js`: 7 tests / 2 suites
- `session-start-inject-discoverability.test.cjs`: 11 tests / 1 suite
- `inbound-state-gate.test.cjs`: 1 test / 1 suite
- `runtime-state-metadata-validation.test.js`: 6 tests / 2 suites

Repeatability: rerun the measurement command; `measured_at` and `injected_at` vary, while tool ordering, sidecar key set, source flags, and structural sizes are the comparison fields.
