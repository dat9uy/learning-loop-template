# Research: runtime-state writer path + inbound-gate surface (for delivery-classifier + inbound-gate always-emit plan)

Date: 2026-07-20 19:21 | Scope: read-only scout | Repo: learning-loop-template worktree `meta-260719T2120Z-...`

## 0. Plan-brief corrections (say plainly)

- **runtime-state.jsonl lives at REPO ROOT** (`<root>/runtime-state.jsonl`), NOT `.loop/runtime-state.jsonl`. `.loop/` contains only `r2-allowlist.json`. `appendLedgerEvent` writes `join(root, "runtime-state.jsonl")` — core/runtime-state.js:47,115.
- The inbound hook does NOT read `registry-table.sh` / meta-state.jsonl. It reads **runtime-state.jsonl** (staleness) + a cross-surface suppress token. registry-table.sh is operator-facing prose inside the warning message only.

## 1. appendLedgerEvent (core writer)

- File: `tools/learning-loop-mastra/core/runtime-state.js`
  - `appendLedgerEvent(root, row)` — L110-118. Pure append: fills `fingerprint` via `computeFingerprint`, `appendFileSync(join(root, "runtime-state.jsonl"), JSON.stringify(withFingerprint)+"\n")`. Returns row with fingerprint. **No preflight check, no schema validation** — header comment L9-14: "Keep the helper gating-free so callers can apply the appropriate gate upstream."
  - `computeFingerprint(row)` — L79-83. v2 = `"sha256:" + sha256(`${affected_system}|${kind}|${id}|${source_ref}|${value}|${delta}|${timestamp}|${canonicalJson(metadata)}`)`. Canonicalize (L56-62): recursive sorted object keys; arrays keep order.
  - `verifyRow(row)` — L95-98. Recompute + string-compare; false on null/non-string fingerprint or mutated fields.
  - `readRuntimeStateRows(root)` — L27-38. JSONL read, malformed lines skipped.
- Existing core-level caller (the "dispatch-commit" path): `tools/learning-loop-mastra/tools/handlers/meta-state-dispatch-finding-tool.js`
  - import L3: `import { appendLedgerEvent, readRuntimeStateRows, verifyRow } from "../../core/runtime-state.js";`
  - row build L244-263 (`fingerprint: null`, `status: "active"`, flat metadata); append L266 `appendLedgerEvent(root, row)`; idempotency scan `findDispatchRow` L45-50 (match `id` + `kind==="ledger-event"`); existing-row `verifyRow` guard before trusting (prepare L120, commit L203) — the bc39002/meta-260719T2144Z fail-closed pattern the classifier must copy.
  - Gated on `LOOP_SESSION_MODE==="live"` (L182), NOT preflight — orthogonal-gate design (runtime-state.js L9-14).
- Other caller: `runtime-state-record-tool.js` L6, L98 (preflight-gated MCP path).
- Script import precedent (`seed-file-index.mjs` L15-17):
  ```js
  import { readRegistry, ... } from "../../../core/meta-state.js";       // relative from tools/handlers/scripts/
  import { resolveRoot } from "#lib/resolve-root.js";                     // root package.json "imports": "#lib/*": "./tools/lib/*"
  ```
  For the new `tools/scripts/delivery-classify.mjs` (one level shallower than handlers/scripts/): `../../learning-loop-mastra/core/runtime-state.js` or `#mastra/core/runtime-state.js` (root package.json maps `"#mastra/*": "./tools/learning-loop-mastra/*"`, package.json:6-9). `resolveRoot` = `tools/lib/resolve-root.js`; DEFAULT_ROOT = 3 dirs up from that file = repo root; GATE_ROOT env override for tests (containment-checked).

## 2. Ledger-event schema constraints

- JSON schema: `schemas/runtime-state.schema.json` — **no code consumer** (comment at runtime-state-record-tool.js L63-67; "the only enforcement point" is the handler Zod refine). Required: `affected_system, kind, id, source_ref, timestamp, status`. `id` pattern `^[a-z0-9-]+$` (`delivery-<uuid>` is compliant: hex+dashes lowercase). `source_ref` pattern `^local:meta-state:.+$`. `status` enum `active|cleared|reconciled` (writers hardcode `"active"`). `fingerprint` pattern `^sha256:[a-f0-9]{64}$`.
- Zod enforcement: `tools/learning-loop-mastra/tools/handlers/runtime-state-record-tool.js` L47-71 (same enums/patterns), plus metadata refine L29-42 + L68-70: **reject any array containing an array element** (`hasNestedArray`); flat scalars and flat arrays of scalars OK. Nested plain objects pass the refine (dispatch row uses flat only).
- **Core appendLedgerEvent enforces NONE of this** — a mechanical script must self-validate (the classifier writes metadata `{first_call_input_tokens, recorded_attachment_bytes, model, classified_at}` — all flat scalars, fine).
- Preflight vs core path: `runtime_state_record` requires `.loop-preflight-runtime-state` marker in any surface's coordination/ (record-tool L12-16, L76-83). Dispatch-commit and seed-file-index bypass preflight by design (orthogonal-gate comment runtime-state.js L9-14; seed-file-index runs bare in `pnpm test`, root package.json "test" script). Mechanical-recompute posture = script imports core directly, no MCP, no marker.
- **Id uniqueness: nothing enforces it.** appendLedgerEvent blindly appends. bc39002 (commit `bc3900284e`, 2026-07-20): two corrupt same-id `npx-skills-mastra-roundtrip` rows had to be operator-struck by hand because no sanctioned delete path exists. Classifier MUST scan-then-skip: `readRuntimeStateRows(root)` → find `id === "delivery-<sessionId>" && kind === "ledger-event"` → `verifyRow(existing)` → skip on hit (mirror dispatch L113-138).

## 3. seed-file-index.mjs structure (template)

`tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` (86 lines):
- L15-17 imports from core (relative) + `#lib/resolve-root.js`.
- L32-34 CLI args: `process.argv.slice(2)`, scan for `--root=` prefix, fallback `resolveRoot()`.
- L38-41 env escape hatch (`SKIP_PRESEED=1` → exit 0).
- L43-66 read registry → compute distinct keys → per-key work via core write API (`upsertFileIndexEntry`), skip-class for missing files.
- Idempotency: overwrite-same-key upsert; re-run safe (header L10).
- L68-86 verify-after-write: re-read (`readFileIndex`), print counts, exit 1 on incompleteness. Plain `node` invocation (no vitest wrapper), wired into `pnpm test`.

## 4. Transcript JSONL facts (sampled)

Dir naming: `~/.claude/projects/<absolute-cwd-with-slashes-as-dashes>/`. This worktree → `-home-datguy-codingProjects-worktrees-learning-loop-template-meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent`. Sessions = `<sessionId>.jsonl` at top level. Sampled: `8d1a5750-da5f-409d-bd8b-92ab02d881c2.jsonl`, 149 lines / 572,238 B.

- One JSON object per line. Every event carries top-level `sessionId` (camelCase); some also `session_id` (snake). Other universal top keys: `uuid, parentUuid, timestamp, type, isSidechain, userType, entrypoint, cwd, version, gitBranch`.
- Event type census (sample): assistant 47, attachment 39, user 27, mode 9, last-prompt 8, relocated 7, worktree-state 7, system 3, file-history-snapshot 2.
- **API-call event**: `type==="assistant"` with `message.usage`. `message` keys: id, type, role, content, model, stop_reason, stop_sequence, usage, stop_details. `usage` = `{input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens, server_tool_use, service_tier, cache_creation, inference_geo, iterations, speed}`. Sample first call: input_tokens 55,036 / cache_read 12,032 (event line 20, 7,094 B).
- **First-call vs later-call**: first `assistant` event with `message.usage` in file order = first API call. Dedupe by `message.id` (sample: 47 assistant-with-usage events but 16 distinct message.id — repeated/chunked events share ids; first-seen message.id wins). All lines before it = pre-first-response injection (sample: 19 lines, 122,652 B).
- **Attachment events**: top keys incl. `attachment{type, hookName, toolUseID, hookEvent, content, stdout, stderr, exitCode, command, durationMs}`. Pre-first-call attachment.type census (sample): hook_success ×5, hook_additional_context ×1, agent_listing_delta ×1, skill_listing ×1, command_permissions ×1. SessionStart hook output rides `hook_success`/`hook_additional_context`; listings ride their own types.
- **user events**: `message.content` = string (prompts) or array (`text` / `tool_result` items); flags `isMeta` (system-reminder carriers; one sample isMeta user event = 27,285 B) and `toolUseResult`.
- **system events**: subtypes local_command, stop_hook_summary, turn_duration (not steering content).
- **Unknown class**: some sessions record NO usage fields at all (debug report: `0dc4d44a` post-/clear) → classifier's `unknown`.

## 5. inbound-gate.js — control-flow map

`tools/learning-loop-mastra/hooks/universal/inbound-gate.js` — 98 lines. Thin I/O adapter; policy in `core/evaluate-inbound-gate.js` (156-line test).

Flow (`main()` L74-96):
1. L75-77 stdin → `parseInput` → `extractPrompt` (hooks/universal/lib/protocol-adapter.js).
2. L79 `findProjectRoot()` (core/gate-logic.js).
3. L80 `readSuppressToken(root)` → `readFromAllSurfaces(root, ".inbound-stale-surfaced", {first:true})` (L28-37).
4. L81-86 `evaluateInboundGate({prompt, root, priorSignature, priorTs})` → `{decision:"ok"}` or `{decision:"warn", context_message, stale_signature, observations_stale}`.
5. L89-93 **only on warn**: `writeSuppressToken` (L90), `writeOperatorMessageMarker` (L91, per-session `.last-operator-message-<sessionId>` via `writeToAllSurfaces`; `GATE_MARKER_PATH` env single-path test override L55-61), `console.log(formatSoftWarning(context_message))` (L92).
6. L95 `process.exit(0)` — ALWAYS exit 0 (soft warning, never blocks).

- Output channel: stdout JSON `{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext: <msg>}}` via `formatSoftWarning` (protocol-adapter.js L78-85). **Silent path = zero stdout** when decision is ok.
- Registry/state reads: evaluator → `readRuntimeObservations` (core/file-readers.js, reads `<root>/runtime-state.jsonl`) → filter status active → `findStaleObservations` (core/gate-logic.js). State-change regexes: STATE_CHANGE_PATTERNS (evaluate-inbound-gate.js L25-37); suppress window 30 min (L21).
- **Insertion points for always-emit pointer line (~15-20 tok)**:
  - Restructure L89-95: build `output = pointerLine` always; on warn, keep L90-91 side effects and append/prepend `decision.context_message` to the same additionalContext string; single `console.log(formatSoftWarning(output))` before `process.exit(0)`. Keep one stdout write (harness parses one JSON object).
  - Pointer builder should live in core (e.g. alongside evaluate-inbound-gate.js) for testability; hook stays thin.
- Shims (byte-identical, md5 302719b4… ×3): `.claude/coordination/hooks/inbound-state-gate.cjs`, `.factory/coordination/hooks/inbound-state-gate.cjs`, `.mastracode/coordination/hooks/inbound-state-gate.cjs`. Shim = execFileSync node → universal hook, stdin passthrough, exit-code passthrough (25 lines). **Shims need no edit** — behavior change lands in the single universal file. Registered in `.claude/settings.json`, `.factory/settings.json`, `.mastracode/hooks.json`.
- Parity enforcement: CHECKLIST item `shims-in-sync` (core/runtime-agnostic-checklist.js L195-232 — same .cjs name set + sha256 byte-identity across SURFACES) + tests in `__tests__/legacy-mcp/runtime-agnostic.test.js` L124-136 (name sets), L188-192 (real-repo byte-identical), plus L253-262 pinning inbound-gate.js's `writeToAllSurfaces` + `GATE_MARKER_PATH`.

## 6. Test impact list

(A) delivery-classifier:
- `tools/learning-loop-mastra/__tests__/runtime-state-fingerprint.test.js` — covers appendLedgerEvent→verifyRow round-trip, v2 collision fixtures (prod rows 9/10, 8/11), migration idempotency. Classifier rows must be v2-clean.
- `tools/learning-loop-mastra/__tests__/runtime-state-metadata-validation.test.js` — **scans the REAL repo-root runtime-state.jsonl** and validates every stored row (post-bc39002: no floor count, no exclusions; strictly stronger). Any classifier row that lands in the repo sidecar must pass the nested-array refine + shape checks or this test goes red.
- `tools/learning-loop-mastra/tools/handlers/runtime-state-record-tool.test.js` (preflight gate), `runtime-state-read-tool.test.js` (fingerprint_valid per row) — unaffected but adjacent.
- bc39002 regression: no dedicated "same-id" test file; the lesson lives in the tightened backward-compat test above + dispatch tool's verifyRow guards.
- New tests needed (per brainstorm L114): classifier idempotency (second run = 0 new rows), full/lean/unknown classification against fixture transcripts.

(B) inbound-gate always-emit:
- `.claude/coordination/__tests__/inbound-state-gate.test.cjs` (611 lines, spawnSync against the shim, 11 categories incl. emission collapse + false-positive rate) — **will break**: asserts silent stdout on non-trigger paths. Must update to expect the pointer line on every invocation and still assert the warn payload only on trigger.
- `tools/learning-loop-mastra/core/evaluate-inbound-gate.test.js` (156 lines) — decision-contract tests; if pointer-building lands in core, add builder tests here.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/inbound-state-runtime-state.test.js` (312 lines, staleness) — unaffected.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js` — re-run; pointer must not introduce hard-coded surface paths (L253-262 assertions stay green).
- Runtime-agnostic 6-item checklist (core/runtime-agnostic-checklist.js L174-356; both work-items touch universal surfaces): 1 `core-in-universal-location` (impl under tools/learning-loop-mastra/{core,hooks,tools}), 2 `shims-in-sync` (byte-identical .cjs across .claude/.factory/.mastracode), 3 `protocol-adapter-i-o` (hook I/O via protocol-adapter), 4 `manifest-registered` (new MCP tools in agent-manifest.json — N/A for a script), 5 `cross-surface-iteration` (no for-of-SURFACES / join(root,".claude") — use surfaces.js helpers), 6 `parameterized-for-new-surfaces` (files touching surfaces must import SURFACES/surfaces.js). Auditable via `check_runtime_agnostic` MCP tool (tools/handlers/check-runtime-agnostic-tool.js).

## 7. Measurement-harness method (from plans/reports/debug-260719-1524-ak-cook-context-attribution.md)

- Ground truth = per-call `usage.input_tokens` from transcript assistant events ("API usage fields, not byte estimates").
- Two sessions contrasted: 7b63f076 (MiniMax-M3) first call 67,890 input tokens vs b96b96c3 (GLM-5.2) first call 9,322 (cache_read 0).
- Recorded injections measured as per-line byte sizes of the transcript's pre-first-response lines (7b63f076: first 19 lines = 108,927 B user-side; b96b96c3: ~101,260 B = SessionStart hooks 33,703 + skill_listing 32,417 + agent_listing 22,397 + UserPromptSubmit 7,030 + command 5,713).
- Token math: ~4 chars/byte.
- Delivery ratio: full path ~1:1 (recorded ≈ delivered); lean path ~1:0.37 — 101KB recorded (~25k tokens) cannot fit a 9,322-token first request → proves transcript presence ≠ wire delivery.
- Surface floors: SessionStart hint payload ~25,000 B rendered (~6k tokens; session state + 10 process hints + 16 discoverability hints, transcript lines 4-8); MCP tool defs 82,516 B (~20.6k tokens; 44 tools) measured via LIVE `tools/list` against `tools/learning-loop-mastra/mastra/server.js` with `LOOP_SURFACE=.claude`.
- Behavioral corroboration: lean session never referenced SessionStart hints (0 thinking mentions, no loop_describe call) but quoted the UserPromptSubmit hook line → UPS hook survives lean path.
- Config mechanism: CCS profile env (`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` in `~/.ccs/*.settings.json`) selects lean-request mode; silent at runtime, transcript-blind.
- Cross-checks: post-/clear baseline session (0dc4d44a) reproduces injection with no skill invoked; tool-call census via jq; grep for reference loads/subagent spawns.
- Classification precedent for the plan: full = first-call input_tokens ≥ recorded-injection floor sum; lean = input_tokens << floors; unknown = usage fields absent.
- Plan's harness re-run targets (brainstorm L108): MCP tools/list wire 82,516B → ≤45,000B; floors recomputed at run time from live tools/list.

## Key file paths

- `tools/learning-loop-mastra/core/runtime-state.js`
- `tools/learning-loop-mastra/tools/handlers/meta-state-dispatch-finding-tool.js`
- `tools/learning-loop-mastra/tools/handlers/runtime-state-record-tool.js`
- `tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs`
- `tools/learning-loop-mastra/hooks/universal/inbound-gate.js` + `core/evaluate-inbound-gate.js` + `hooks/universal/lib/protocol-adapter.js`
- `.claude|.factory|.mastracode/coordination/hooks/inbound-state-gate.cjs` (shims)
- `tools/learning-loop-mastra/core/runtime-agnostic-checklist.js`, `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js`
- `schemas/runtime-state.schema.json`, `runtime-state.jsonl` (repo root)
- `tools/lib/resolve-root.js`, root `package.json` (imports map, test script)

Status: DONE
Summary: All 7 items scouted with file:line precision; two plan-brief corrections (runtime-state.jsonl at repo root not .loop/; inbound hook reads runtime-state.jsonl not registry-table.sh) and full insertion-point map for the always-emit change delivered.
Concerns/Blockers: The real-repo sidecar backward-compat test means classifier rows must be schema-clean when landed in the repo's own runtime-state.jsonl; inbound-gate shim test (.claude/coordination/__tests__/inbound-state-gate.test.cjs) asserts silence on non-trigger and will need updating for always-emit.
