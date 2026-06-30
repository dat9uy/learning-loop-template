# Red-Team Review: Phase E Plan 4 (Mastra Code Validation) — SECURITY ADVERSARY Lens

**Reviewer lens:** Security Adversary (hostile reviewer of `/ck:plan`)
**Plan path:** `plans/260630-2012-phase-e-plan-4-mastra-code-validation/`
**Review date:** 2026-06-30
**Reviewer:** general-purpose (security adversary persona)
**Reviewer frame:** assume every input is attacker-controlled; assume the vendor package, the runtime config, the file system, and the operator's environment are all potentially weaponized. Score exploitability, not just theoretical risk.

---

## Acceptance verdict

**APPROVE-WITH-FIXES**

The plan faithfully documents the integration mechanics (declarative hooks, `MASTRA_RESOURCE_ID` as identity, hybrid MCP+programmatic model). The Phase 3 contract amendments are TDD-first and scoped correctly. None of the discovered issues is a blocker for shipping the **scope** of "validate Mastra Code as a third runtime". However, **the plan leaves three exploitable gaps open that an adversary can leverage the moment Mastra Code ships**, and these gaps should be hardened either in this plan or explicitly deferred with a tracked Plan 5 ticket. The plan currently acknowledges Plan 5 will harden LIM-3 / LIM-4 / R2 — that deferral is acceptable IF the deferral is explicit, scoped, and gated on the gates not silently regressing. Right now the deferral is implicit: contract Req #4 stays advisory for everyone, and a hostile Mastra Code session can inherit the new `MASTRA_RESOURCE_ID` identity and write to anything not gated by the missing R2.

---

## Findings (numbered, severity-ordered)

### Finding 1 — CRITICAL: `MASTRA_RESOURCE_ID` is spoofable; R2 write-gate is not enforced
**Severity:** CRITICAL
**Exploitability:** HIGH (no special conditions; works on first install)
**Location:** `phase-03-phase-03-contract-amendments.md` §"Step 4 — Update `interface/contract.js`" (new `checkIdentityMarker` alternative); `plan.md` Q4/R5

**Threat model.** The plan adds `MASTRA_RESOURCE_ID` as an additional identity marker for Mastra Code, alongside `RUNTIME_ID`. The new `checkIdentityMarker` will accept EITHER `process.env.MASTRA_RESOURCE_ID === runtimeId` OR `process.env.RUNTIME_ID === runtimeId`. The `interface/contract.js` `checkIdentityMarker` is itself **non-blocking today** (`ok: true` always, only emits notes); the gate that would ENFORCE it (R2 write-gate, LIM-3 caller identity) is deferred to Plan 5.

Concrete attack: an attacker who lands a Mastra Code session with default settings on this project can `export MASTRA_RESOURCE_ID=mastra-code` and inherit the canonical Mastra Code identity. Combined with Finding 6 (`shellPassthrough: true` would short-circuit shell gate policy), the attacker can run any unblocked tool call framed as a legitimate Mastra Code session. The validator today sees the env var and emits the "match" note — but the note is **advisory only**, so it grants no protection, only the illusion of one. The validator has no way to attest that the value originated from the harness rather than from a manual shell export.

**Recommendation.** Two coordinated fixes:

1. **Phase 3 contract amendment** should mark `MASTRA_RESOURCE_ID` as advisory AND note in `CONTRACT.md` that any env-var-based identity is spoofable. Cite Finding 1 as the evidence.
2. **Phase 5 docs** (`docs/agents/mastra-code.md`) must NOT advertise `MASTRA_RESOURCE_ID` as a "trusted" identity. Document it as a hint, not an attestation.

**Mitigation (already-deferred).** LIM-3 caller identity gate + R2 write-gate (Plan 5). MUST be tracked as a blocker for any release that uses `MASTRA_RESOURCE_ID` for authorization decisions. Until LIM-3 ships, **no code path should treat the env var as a non-repudiable identity** — including any gate logic that the plan's Phase 4 smoke test might exercise.

**Deferred to Plan 5?** Yes — but only if Plan 5 is tracked as an explicit, scope-locked follow-up and the journal entry cites this finding by id.

---

### Finding 2 — HIGH: `defaultModelId: 'anthropic/claude-sonnet-4-6'` in `modes[]` is a hallucination, not a real identity
**Severity:** HIGH (docs lie about identity; downstream trust assumptions follow)
**Exploitability:** MEDIUM (requires an operator or future doc to believe the model is the runtime)
**Location:** `plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md` §7 (example block)

**Threat model.** The research report quotes an example showing `defaultModelId: 'anthropic/claude-sonnet-4-6'` attached to a custom mode. The model id is semantic, not authoritative — Mastra Code can swap the model at runtime via `harness.switchModel({modelId})` (`harness.d.ts:152`), and a future operator or attacker config could substitute a different model (cheaper, weaker, hostile) while keeping the mode name. Any contract amendment that uses `defaultModelId` as an identity witness is broken.

The plan does NOT use model ids as identity (good), but `docs/agents/mastra-code.md` Phase 5 must not propagate the "model id = runtime identity" intuition from the research example. Threat model: an LLM operator reads the worked example, sees the model id, and later uses it in a security-sensitive comparison.

**Recommendation.** Phase 5 docs should explicitly state that `defaultModelId` is not an identity witness, only a routing hint. Add a sidebar to the worked example calling out the distinction.

**Mitigation.** Reuse the existing AGENTS.md §1.1 3-layer model: model id is layer-2 (Mastra shell), identity is layer-3 (runtime interface).

---

### Finding 3 — HIGH: `execute_command` matcher is a single point of bypass for hostile MCP tool registration
**Severity:** HIGH
**Exploitability:** MEDIUM (requires the operator to install or co-host a tool with that name)
**Location:** `phase-02-phase-02-config-files.md` §"Step 2 — Create `.mastracode/hooks.json`"; `research-260626-2314-phase-e-plan-4-mastracode-prep-report.md` §4

**Threat model.** The plan pins the bash-gate matcher to `tool_name: "execute_command"` (Mastra Code's built-in shell tool). Three bypasses are possible:

1. **Future rename.** Mastra Code renames the built-in tool from `execute_command` to e.g. `run_shell`. The `hooks.json` matcher silently misses every shell call. No runtime warning. The contract validator passes (it only checks `.hooks.json` exists, not that the matcher matches real tool names today).
2. **Malicious MCP server registers `execute_command`.** An attacker with write access to `.mastracode/mcp.json` (or a config-shipping attack via `pnpm postinstall`) registers an MCP server whose tool is named `execute_command`. The hook fires against that tool, blocks it — BUT the bash-gate evaluates `tool_input.command`, which the attacker controls. They can craft a `command` that passes `matchConstraintPattern` (no obvious vendor/docker/sudo strings) but performs a write through a side channel (e.g., a heredoc to `tools/learning-loop-mastra/data/mastra-memory.db` evaluated by a downstream sqlite consumer).
3. **`createMastraCode({ extraTools: { execute_command: ... } })` injection.** If Phase 4 passes a tool factory named `execute_command` (or any tool the matcher targets), the hook will gate the user-supplied tool, not the framework's. Same matcher miss as #1 in the opposite direction.

**Recommendation.**

- For #1 (rename): ship the matcher as a list (e.g., `["execute_command", "run_shell"]`) and add a runtime probe in Phase 4 that asserts the matcher actually fires on a real shell call. Add a regression test that fails if the hook does not receive a `tool_start` event for a synthetic shell call.
- For #2 (#3 #6 #7): the bash-gate's `evaluateBashGate` already inspects the command string — but only against a fixed constraint pattern list. Add a test asserting that **any** tool matching the `execute_command` matcher, regardless of which tool registered it, gets evaluated. This is currently the case but is not asserted.
- For #3 (`extraTools` injection): Plan 4 should NOT pass a tool named `execute_command`. Document the constraint. Add a probe assertion: `extraTools` keys MUST NOT collide with hook matcher targets.

**Mitigation.** Add to Phase 4 smoke test: for each `matcher.tool_name` in `.mastracode/hooks.json`, the probe must (a) identify which tool(s) match today, (b) assert at least one match, (c) record the list for docs.

---

### Finding 4 — HIGH: Contract validator's new "OR declarative hooks.json" branch has a failsafe-default-wrong-direction bug
**Severity:** HIGH
**Exploitability:** HIGH (silent acceptance)
**Location:** `phase-03-phase-03-contract-amendments.md` §"Step 4 — Update `interface/contract.js`" (new `checkHookShimSet` alternative + `checkSettingsIntegration` alternative)

**Threat model.** The plan adds "OR" branches for Req #1 + Req #5. The risk is that the alternative path can satisfy the requirement with a `hooks.json` that is present, well-formed JSON, but missing one of the 4 required event entries — or with the right events but with `command` strings that point at NOTHING (e.g., a typo, or a moved script). The contract currently passes by "the file exists + parses"; the new alternative must also pass on "the right events exist + point at the right commands".

Walk-through of the proposed new branches per the plan:

| New branch | What "pass" means in the plan | Failsafe default | Bug |
|---|---|---|---|
| `checkHookShimSet` declarative alternative | `.mastracode/hooks.json` exists + parses + has 4 required event entries with valid commands | If `.mastracode/hooks.json` exists but lacks, say, the `SessionStart` event, does it pass or fail? Plan says "4 required event entries" — so fail. Good. | If the file is MALFORMED JSON, the function falls back to `readJsonSafe` which returns `{ok:false}`. The branch likely treats that as "no declarative config → fall back to shim check → shim check fails because no shims either" → fail. Correct. |
| `checkIdentityMarker` alternative | `MASTRA_RESOURCE_ID === runtimeId` OR `RUNTIME_ID === runtimeId` | If env var is empty string `""`, `actual === null` check fails (env var is set), `actual === expected` check fails (`"" !== "mastra-code"`), so `status = "mismatch"`. Currently the validator returns `notes: ["identity-marker-mismatch"]`. Advisory. | No bug; advisory only. |
| `checkSettingsIntegration` alternative | All 4 universal-hook commands in `.mastracode/hooks.json` | The plan says "all 4 universal-hook commands present (bash-gate, write-gate, inbound-gate, recurrence-check-on-start)". | **BUG**: the plan does NOT say the commands must point at EXISTING files. If the hook entry says `"command": "node tools/learning-loop-mastra/hooks/legacy/bash-gate.js"` AND that file exists today, OK. If a future refactor moves the file (e.g., `legacy/` → `v1/`), the contract still passes — but the actual hook invocation fails at runtime. The contract would lie. |
| `checkSkillSpec` for Mastra Code | Discover `.claude/skills/learning-loop/SKILL.md` OR `.mastracode/skills/learning-loop/SKILL.md` | Both paths discovered | **BUG**: what if `.mastracode/skills/learning-loop/SKILL.md` exists AND points at MCP tools that no longer exist (e.g., `meta_state_resolve` was renamed)? The contract would pass. The current Claude Code path checks `tools_referenced` against `REQUIRED_TOOL_REFS` — but does the new alternative apply the same check to `.mastracode/skills/learning-loop/SKILL.md`? Plan is silent. |

**Recommendation.** Phase 3 amendment must:

1. Add `existsSync` check for the resolved `command` paths in `checkSettingsIntegration` (analogous to how the existing `checkHookShimSet` checks `universal_exists` for documentation — but gate this on actual existence, not as a note).
2. Specify that `checkSkillSpec` for Mastra Code applies the same `REQUIRED_TOOL_REFS` content check to BOTH `.claude/skills/learning-loop/SKILL.md` and `.mastracode/skills/learning-loop/SKILL.md` (whichever exists).
3. Add TDD tests asserting the negative cases: a hooks.json missing `SessionStart`, a hooks.json pointing at a moved file, a SKILL.md missing `loop_describe` reference.

**Mitigation.** Lock the contract semantics with regression tests BEFORE the amendment, per the plan's TDD-first strategy. The plan is TDD-first; ensure the negative tests are also written.

---

### Finding 5 — MEDIUM: LibSQL storage conflict unresolved; race condition risk
**Severity:** MEDIUM
**Exploitability:** MEDIUM (depends on deployment shape)
**Location:** `plan.md` R3; `phase-01-phase-01-preflight-prereqs.md` §"Implementation Steps 4-5"

**Threat model.** The plan acknowledges that Mastra Code uses LibSQL by default and so does the loop (`@libsql/client 0.17.4`, `@mastra/libsql 1.13.0`). R3 says "probe in Phase 1; if conflict, configure `.mastracode/database.json` to a sibling path". The probe script does NOT have an explicit test for concurrent writes (it only reads).

If both processes (Mastra Code via `mcpManager.connectAll()` AND the loop's own internal usage of `meta-state.jsonl` which is NOT LibSQL but is still in the same filesystem) open write handles to the same LibSQL database, worst case:
- SQLite write contention (SQLITE_BUSY) cascading into MCP timeouts
- Read-after-write inconsistency: `meta_state_*` reads from the loop registry could return stale data if Mastra Code's LibSQL session hasn't synced
- `meta_state_refresh_fingerprint` (LIM-4, deferred to Plan 5) reads the file → writes the file → Mastra Code's LibSQL session also touches the same path → TOCTOU on the SHA-256 fingerprint record

The plan addresses the file path (sibling `.mastracode/data/mastra-code-memory.db`) but NOT the LOCK contention when the loop's tooling opens the database. This is partially mitigated by the loop not writing to the same DB via MCP — but the meta-state JSONL is in the SAME directory; not the same DB, but the same `coordination/` state.

**Recommendation.** Phase 1 probe must also verify: when a `harness.callTool('loop_describe', ...)` round-trips, the loop's own writes to `meta-state.jsonl` (e.g., `meta_state_log_change` from inside the tool) succeed without SQLite busy errors. Add a probe assertion: `{"libsql_writes_ok": true, "concurrent_meta_state_writes_ok": true}`.

**Mitigation.** Plan R3 is correct in spirit; tighten Phase 1 probe coverage to actually test concurrent access.

---

### Finding 6 — MEDIUM: `shellPassthrough: true` is a documented bypass vector
**Severity:** MEDIUM
**Exploitability:** MEDIUM (depends on operator config drift)
**Location:** `phase-02-phase-02-config-files.md` §"Step 3 — Create `.mastracode/settings.json`"; `research-260626-2314-phase-e-plan-4-mastracode-prep-report.md` §6

**Threat model.** The plan sets `shellPassthrough: false`. The docs at `code.mastra.ai/configuration.md` (referenced in research) say `shellPassthrough` controls whether shell commands bypass the runtime's own shell handling. If `shellPassthrough: true` is set later (operator drift, malicious `.mastracode/settings.json` overwrite, or a Mastra Code config UI flip), the bash-gate hook MAY still fire on the harness's hook system but the underlying shell semantics change — specifically, the gate sees `tool_name: "execute_command"` and the command string in `tool_input.command`, but if `shellPassthrough: true` causes the command to be executed with expanded shell semantics the gate did NOT evaluate (e.g., `eval`, `exec`, or environment-load chains), the gate passes but the runtime does more than the gate saw.

The plan sets it `false` (correct). The threat is operator drift, not the plan itself.

**Recommendation.**

1. Add a contract validation check that `.mastracode/settings.json` does NOT have `shellPassthrough: true`. Add a negative test.
2. Add a comment in `.mastracode/settings.json` explaining the security implication of flipping the flag.
3. Document in Phase 5 docs (`docs/agents/mastra-code.md`) that `shellPassthrough: true` MUST NOT be used while the bash-gate is the primary policy enforcer.

**Mitigation.** Add to Phase 3 contract validator (and Phase 3 test list): a check on `.mastracode/settings.json` that fails Req #5 if `shellPassthrough: true`.

---

### Finding 7 — MEDIUM: `extraTools` injection via `createMastraCode({ extraTools })`
**Severity:** MEDIUM
**Exploitability:** MEDIUM (requires Phase 4 to ship `extraTools` + an attacker to control one of those tool factories)
**Location:** `phase-04-phase-04-smoke-test.md` (Architecture block, `extraTools` example)

**Threat model.** Phase 4 calls `createMastraCode({ cwd, resourceId, extraTools: { 'loop_describe': buildLoopDescribeTool() } })`. The `extraTools` map is keyed by tool name. If the tool factory `buildLoopDescribeTool()` is compromised (typosquatted factory import, replaced via `pnpm` postinstall, modified via a write-gate bypass), the attacker now controls the canonical `loop_describe` tool that every operator of this project will invoke. The bash-gate sees the OUTER shell call (`extraTools['loop_describe']({tier:"warm"})`), not the inner JavaScript execution. The write-gate sees no file write. The contract validator passes.

The `HarnessConfig` allows `toolCategoryResolver` (per research) — an attacker who can register a resolver could mark the malicious tool as `'read'` category and bypass the permission system.

**Recommendation.**

1. Phase 4 smoke test should verify that `extraTools` keys do NOT collide with built-in Mastra Code tool names (Finding 3 mitigation also covers this).
2. Phase 5 docs must document the `extraTools` threat model and recommend audit trails (e.g., a hash of `buildLoopDescribeTool`'s source) for any production deployment.
3. Phase 4 probe must NOT ship in a way that can be loaded by a hostile runtime — keep it as a dev-time smoke test, not a runtime artifact.

**Mitigation.** Add to Phase 4 smoke test: assert the imported tool factory's source path resolves to `tools/learning-loop-mastra/mastra/tools/legacy/loop-describe-tool.js` (canonical path per the plan). If the import resolves to anything else, fail.

---

### Finding 8 — MEDIUM: Hook timeout race — `timeout: 5000` may silently allow by default
**Severity:** MEDIUM
**Exploitability:** MEDIUM (deterministic but timing-dependent)
**Location:** `phase-02-phase-02-config-files.md` §"Step 2 — Create `.mastracode/hooks.json`" (all 4 entries use `timeout: 5000` except SessionStart which uses `10000`)

**Threat model.** The Mastra Code docs say `timeout` is configurable per hook. The plan does NOT specify the failure mode if a hook times out (allow or deny). Looking at the Mastra Code source pattern (HookManager with timeout) the safer default is "deny on timeout for blocking events" — but the plan does not assert this.

If a hook times out:
- `bash-gate` (PreToolUse, blocking): if default is "allow", a hung gate silently lets the command through. Worst case: a 5-second hang in `findProjectRoot()` (e.g., slow filesystem on a CI runner) and a `git push` is silently allowed without policy evaluation.
- `write-gate` (PreToolUse, blocking): same risk. A hung `evaluateWriteGate` and a `Write` tool call to `meta-state.jsonl` is allowed.
- `inbound-gate` (UserPromptSubmit): advisory only, exits 0, no risk.
- `recurrence-check-on-start` (SessionStart): non-blocking (per Mastra docs), no risk.

The bash and write gates are synchronous (`process.exit(0)` or `process.exit(2)`). If they hang — which they shouldn't, but a tight loop or a `await` chain that misses a `process.exit` could — Mastra Code's timeout fires and the default behavior determines the security outcome.

**Recommendation.**

1. Phase 1 probe MUST run a synthetic tool call and assert the gate responds within the timeout. Add `{"hook_latency_ms": <number>}` to probe JSON output.
2. Phase 2 hook entries should explicitly comment the failure mode assumption (allow-on-timeout vs deny-on-timeout) per the research docs. If deny-on-timeout is the actual default, document that. If allow-on-timeout, the timeout should be reduced and the hooks should be profiled to never approach it.
3. The SessionStart `timeout: 10000` is asymmetric — why 10s when others are 5s? Document the rationale.

**Mitigation.** Add a probe assertion: each hook responds within `timeout - 1000` ms on a synthetic call. Fail the smoke test otherwise.

---

### Finding 9 — LOW: Probe script is an attack surface if loaded by a hostile CI environment
**Severity:** LOW
**Exploitability:** LOW (requires the attacker to control the project repo, which already implies they can ship anything)
**Location:** `phase-04-phase-04-smoke-test.md` (probe script full shape)

**Threat model.** `scripts/probe-mastracode.cjs` calls `createMastraCode({ cwd: process.cwd(), resourceId: 'mastra-code', extraTools: ... })`. It boots the harness, connects to MCP, fires a synthetic tool call, writes JSON to stdout. The script is in the project repo (git-tracked).

If a future attacker gains write access to the project (via any of the bypasses in Findings 1, 3, 5, 7), they can modify the probe script to do whatever they want and the CI smoke run will execute it. The script is small (~150 LoC per the plan), so audit is feasible — but there is no automated audit.

A specific sub-case: the probe imports tool factories from `tools/learning-loop-mastra/mastra/tools/legacy/loop-describe-tool.js`. If the attacker modifies that factory, the probe carries the malicious payload into the smoke run. The CI smoke run is local, not external, so the worst case is corrupted local state — but a malicious factory could `process.exit` after writing a side-effect, leaving a corrupted `meta-state.jsonl`.

**Recommendation.**

1. The probe script should assert that it is the FIRST code to load `createMastraCode` — no other code path should silently load it (defense against supply-chain via postinstall).
2. The probe script should print a checksum of the tool factory source it imports (defense against drift between probe and production).
3. The probe script should write its output to a temp file the CI then validates, not directly to stdout (so a malicious factory can't intercept stdout to hide its behavior).

**Mitigation.** This is a "nice to have" for a hostile-environment CI; the project's gate server already blocks direct `meta-state.jsonl` writes via PR #19. The risk is contained if the probe is dev-only.

---

### Finding 10 — MEDIUM: Conflict with existing write-gate extension (PR #19)
**Severity:** MEDIUM
**Exploitability:** LOW (depends on what Phase 4 probe actually writes)
**Location:** `phase-04-phase-04-smoke-test.md` §"Related Code Files" (probe script + `legacy-mcp/mastra-code-smoke.test.js`)

**Threat model.** PR #19 extended the write-gate to block Write/Edit/Create/ApplyPatch to `meta-state.jsonl`. Plan 4 ships:
- `scripts/probe-mastracode.cjs` (in `scripts/`, not gated)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/mastra-code-smoke.test.js` (test file, gated only if it tries to write)

The probe script writes JSON to stdout only (per Phase 4 architecture). It does NOT write to `meta-state.jsonl`. So the write-gate extension does not block the probe.

BUT: the probe calls `loop_describe` via the harness. The `loop_describe` MCP tool internally calls `meta_state_log_change` (which is the meta-surface path, gated via MCP, not Write/Edit). So no conflict — the probe exercises the canonical MCP path, which the write-gate extension is designed to leave open.

There is ONE potential conflict: if Phase 4 imports a tool factory that internally writes to `meta-state.jsonl` via a non-MCP path (e.g., direct file write via Node `fs`), the bash-gate would catch it (via `PATH_WRITE_PATTERNS`). But the write-gate extension (PR #19) specifically blocks Claude Code / Droid's Write/Edit tools. If Phase 4 ships a probe that runs `Write`-equivalent MCP tool calls, the bash-gate sees the tool call but the inner factory code is not gated by the write-gate extension.

**Recommendation.**

1. Phase 4 probe MUST route ALL meta-state mutations through the canonical MCP server (`tools/learning-loop-mastra/mastra/server.js`), not via direct file writes.
2. Add a regression test: the probe's stdout JSON must not contain a raw `meta-state.jsonl` mutation trace. If it does, the probe is bypassing the MCP gate.
3. Document in Phase 5 docs that the programmatic integration is "MCP-equivalent" — the contract Req #2 (`mcp-client-config`) holds.

**Mitigation.** Add an assertion to Phase 4 probe: count MCP tool calls vs direct shell calls; reject the smoke if direct writes to `meta-state.jsonl` are attempted.

---

### Finding 11 — MEDIUM: `MASTRA_RESOURCE_ID` is enumerable/spoofable AND the contract makes it look authoritative
**Severity:** MEDIUM
**Exploitability:** HIGH (no special conditions)
**Location:** `phase-03-phase-03-contract-amendments.md` §"Req #4 alternative"; `plan.md` Q4/R5

**Threat model.** This is a strict superset of Finding 1. The contract validator will accept EITHER `RUNTIME_ID` or `MASTRA_RESOURCE_ID` matching the runtime id, and return a "match" status. An operator reading the validator output will infer that the runtime has attested its identity. It has not — the env var could be set by any shell the operator runs in.

Specifically: `RUNTIME_ID` is set by Claude Code / Droid's settings integration (per AGENTS.md §2). It is set by the runtime, not the shell. `MASTRA_RESOURCE_ID` is set by `.mastracode/database.json` (file-based, controlled by the runtime) OR the harness internal call (`harness.setResourceId`). BUT the validator only checks `process.env.MASTRA_RESOURCE_ID` — which the harness MIGHT set on its own OR a shell export might set. The validator cannot distinguish.

The plan acknowledges "MASTRA_RESOURCE_ID represents the runtime instance (like RUNTIME_ID) or the resource scope (like a project name)?" as Q4 unresolved (Q4 from research, still open per the report).

**Recommendation.** Phase 3 amendment must clarify the validator only checks env var, not `.mastracode/database.json` or `HarnessConfig.resourceId`. If the plan claims the validator covers all three (per Phase 3 "OR" branches), the validator is OVER-promising — it only sees env var. Document this honestly in CONTRACT.md and RUNTIME_ONBOARDING.md.

**Mitigation.** Update Phase 3 implementation step "Add `checkIdentityMarker` alternative" to ONLY accept env vars (which is what the existing code does). Remove the claim that `HarnessConfig.resourceId` and `.mastracode/database.json` are checked. Cite this finding in the journal.

---

### Finding 12 — LOW: Phase 1 install brings in `mastracode` transitive deps; advisory feed risk
**Severity:** LOW
**Exploitability:** LOW (vendor CVE window)
**Location:** `phase-01-phase-01-preflight-prereqs.md` §"Step 2 — Install"

**Threat model.** `npm install mastracode` brings in transitive deps. `mastracode` itself is a new vendor package; advisory feeds are sparse for new packages. The plan's pre-flight (`mastra_gate_check`) covers installation constraint only, not CVE scanning. The current `@mastra/*` packages (already installed) are pinned to exact versions (`1.42.0`, `1.10.0`, `1.13.0`), so a future `mastracode` install that downgrades `@mastra/*` could break the existing harness.

**Recommendation.**

1. Use `pnpm add -D mastracode` with `--frozen-lockfile=false` for the install, then re-pin `@mastra/*` versions after.
2. Add a post-install assertion to Phase 1 probe: the installed `@mastra/core`, `@mastra/mcp`, `@mastra/libsql` versions must still match `package.json`.
3. Run `pnpm audit` post-install and surface results in the journal entry.

**Mitigation.** Plan R1 partially covers this (gate_check + `pnpm view` fallback). Tighten with explicit version-pinning assertions.

---

## Hardening recommendations explicitly deferred to Plan 5

The following defenses are **required for a secure Mastra Code integration** but are NOT in scope for Plan 4. They must be tracked as explicit follow-up items in the journal entry and the master tracker. Plan 5 is the named hardening plan; the journal MUST cite this report's Finding IDs so the hardening plan's scope is unambiguous.

| ID | Defense | Plan 5 scope? | Plan 4 dependency |
|----|---------|---------------|-------------------|
| F1 | LIM-3 caller identity gate (non-spoofable attestation, e.g., signed capability token from the harness) | YES | Without it, `MASTRA_RESOURCE_ID` is spoofable. Block Phase 4 smoke run from any real side effects until F1 ships. |
| F4 (negative tests) | Contract validator regression tests for negative cases of new "OR" branches | NO — fix in Phase 3 | Phase 3 is the implementation phase. |
| F5 (probe assertion) | Phase 1 probe must verify LibSQL concurrent access | NO — fix in Phase 1 | Phase 1 owns the probe. |
| F6 (validator check) | Contract validator must reject `shellPassthrough: true` | NO — fix in Phase 3 | Phase 3 owns validator. |
| F7 (probe assertion) | Phase 4 probe must verify `extraTools` import resolves to canonical path | NO — fix in Phase 4 | Phase 4 owns the smoke test. |
| F8 (probe assertion) | Phase 1 probe must verify each hook responds within timeout | NO — fix in Phase 1 | Phase 1 owns probe. |
| F10 (probe assertion) | Phase 4 probe must route all meta-state writes via MCP | NO — fix in Phase 4 | Phase 4 owns smoke. |
| F11 (doc honesty) | CONTRACT.md + RUNTIME_ONBOARDING.md must NOT claim `HarnessConfig.resourceId` is validated by `checkIdentityMarker` | NO — fix in Phase 3 | Phase 3 owns the docs. |
| F2 | LIM-4 path traversal in `meta_state_refresh_fingerprint` (deferred per master tracker) | YES | Without it, the deferred fingerprint-refresh attack is live. |
| R2 | Runtime-interface ownership write-gate (deferred per master tracker) | YES | Without it, any spoofed identity writes succeed. |

**Acceptance for Plan 4 ship:** all `NO` items must be implemented in this plan. All `YES` items must be tracked as Plan 5 blockers with Finding IDs cited in the journal.

---

## Out-of-scope observations (not findings; noted for context)

- **Hook I/O protocol mismatch risk:** Mastra Code's hook stdin/stdout JSON shape is documented as `{session_id, cwd, hook_event_name, tool_name, tool_input}` and the blocking response shape is `{decision: "block", reason: "..."}`. Our universal scripts' `parseInput` accepts `{command}` for bash and `{file_path}` for write — which is the Claude Code / Droid shape, not Mastra Code's documented shape. Phase 4 smoke test MUST verify the gate actually receives a parseable input and emits a parseable output; if the wire format differs, the gates silently no-op (Finding 8 covers this).

- **`disableBuiltinTools` not set.** The plan does not disable `ask_user`, `submit_plan`, `task_write`, etc. for the Mastra Code session. These built-ins can change tool flow in unexpected ways (e.g., `submit_plan` could short-circuit our own plan submission). Phase 5 docs should note this; consider disabling for the smoke run.

- **MCP namespacing regression risk.** Research Q6 is resolved as "no namespacing with programmatic invocation" — but the `.mastracode/mcp.json` fallback still uses namespacing (per `mcp.json` discovery). If a future operator runs a hybrid mode (programmatic + MCP fallback), the namespacing mismatch could confuse the write-gate hook matcher. Phase 5 docs should warn.

---

## Status

**Status:** DONE_WITH_CONCERNS

**Summary:** The plan is sound and ships in the proposed scope. No blocker requires Plan 4 to be REJECTED. However, the contract amendment as written has a failsafe-default-wrong-direction bug (Finding 4), the new identity marker is spoofable and the contract over-promises (Findings 1, 11), and several probe-assertion gaps leave actual security coverage unverified (Findings 5, 6, 7, 8, 10). All but the LIM-3/LIM-4/R2 deferrals (Findings 1, F2, R2) can be fixed inside Plan 4; the plan must explicitly defer the rest to Plan 5 with finding-id citations in the journal.

**Concerns/Blockers (must address before merge):**

1. Fix Finding 4 (contract validator negative tests) in Phase 3 — TDD-first already covers this; just add the negative test cases the plan currently omits.
2. Fix Finding 6 (`shellPassthrough: true` rejection in validator) in Phase 3 — add a contract check + test.
3. Fix Finding 11 (honest documentation of what `checkIdentityMarker` actually validates) in Phase 3 — update CONTRACT.md and RUNTIME_ONBOARDING.md to remove the false claim about `HarnessConfig.resourceId` and `.mastracode/database.json` being validated.
4. Fix Finding 5 (probe concurrent-write assertion) in Phase 1 — extend the probe script.
5. Fix Finding 7 (canonical-path assertion for `extraTools`) in Phase 4 — extend the smoke test.
6. Fix Finding 8 (hook-latency probe assertion) in Phase 1 — extend the probe.
7. Fix Finding 10 (MCP-only mutation assertion in smoke) in Phase 4 — extend the smoke.
8. Explicitly defer Findings 1, F2, R2 to Plan 5 with this report's Finding IDs cited in `docs/journals/260630-phase-e-plan-4-shipped.md`.

**Nice-to-have (not blockers):** Findings 2, 3, 9, 12 — tighten as scope allows.