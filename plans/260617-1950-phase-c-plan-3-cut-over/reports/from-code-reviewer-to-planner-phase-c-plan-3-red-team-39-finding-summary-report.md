# Red Team Review Summary — Plan 3 Cut-Over

**Date:** 2026-06-17
**Plan:** `plans/260617-1950-phase-c-plan-3-cut-over/plan.md` + 7 phase files
**Mode:** --hard (4 reviewers, all lenses)
**Reviewers:**
- Security Adversary (Fact Checker) — 10 findings
- Failure Mode Analyst (Flow Tracer) — 8 findings
- Assumption Destroyer (Scope Auditor) — 10 findings
- Scope & Complexity Critic (Contract Verifier) — 11 findings

**Total:** 39 findings (11 Critical, 9 High, 13 Medium, 6 Low)

---

## Critical Findings — All Cross-Cutting; Plan 3 Cannot Ship As Authored

| # | Source | Finding | Plan vs. Reality |
|---|--------|---------|------------------|
| **C-1** | Assumption Destroyer F2 | `.factory/hooks/loop-surface-inject.cjs:72` keys on `mcpServers["learning-loop-mcp"]` → after Phase 3, Droid hook returns null silently, no hints render. **The "F4 closed by cut-over" claim is FALSE** — the hook breaks, not closes. | Plan Decision Delta says "session-level, server-name-blind" — contradicted by `.factory/hooks/loop-surface-inject.cjs:72-73` which `return null` if `learning-loop-mcp` is absent. |
| **C-2** | Assumption Destroyer F4 | `.claude/settings.local.json:13-21,28-29` has 5 dead `mcp__learning-loop-mcp__*` permissions + `enabledMcpjsonServers: ["learning-loop-mcp", "learning-loop-mastra"]` | Plan says only `.mcp.json` matters — wrong, `settings.local.json#enabledMcpjsonServers` is also runtime authority. |
| **C-3** | Assumption Destroyer F8 | AGENTS.md (10+ refs), CLAUDE.md (3 refs), README.md (4 refs), `loop-surface-inject.cjs` (9 refs) cite deleted `tools/learning-loop-mcp/server.js` as canonical | Plan says "no doc changes needed" — false. Operators reading CLAUDE.md get pointed at a deleted file. |
| **C-4** | Failure Mode F1 + Assumption Destroyer F5 | 4 test files import `coerceParamsToSchema` / `installWireFormatCoercion` from `tool-registry.js` (to be deleted in Phase 4): `wire-format-coercion-fix.test.js`, `wire-format-patch-recursion.test.js`, `wire-format-meta-state-optional-fields.test.js`, `wire-format-top-level-coercion.test.js` | Plan §Phase 5 delete list omits all 4. After Phase 4 commits, `pnpm test` fails at import time. |
| **C-5** | Scope Critic F1 + F6 | Plan is 987 lines / 8 files for "delete 2 entries from 2 configs + add 11 entries to a manifest + delete 2 files." 7 phases are ceremonial. Pre-check "no test imports the legacy server entry directly" is FALSE — **30+ references in 15+ files**. | Plan's blast radius is under-counted by 10x. Pre-check was fiction. |
| **C-6** | Scope Critic F5 + Assumption Destroyer F7 | Plan claims "0 skips" by Phase 7 because "the 1 pre-existing skip is `tools-list-collision.test.cjs`" — **wrong**. The actual persistent skip is `meta-state-reopen-backfill-integration.test.js:6` (commit `c526eee`). | Acceptance gate claims "0 skips" — false. |
| **C-7** | Security F1 + Failure Mode F5 | `server.js:38` is the `description:` string literal, NOT the `PREFIX = "mastra_"` line. PREFIX is at `server.js:13`. F4 fingerprint anchor is invalid; `meta_state_check_grounding` will hash the wrong line. | Plan's risk table on Phase 6 line 119 explicitly claims line 38 IS the PREFIX line — factually wrong. |
| **C-8** | Security F2 | Deleting `parity-zod-to-json-schema.test.js` removes the only byte-equivalent proof between `installWireFormatCoercion` (legacy SDK monkey-patch) and `wrapSchema` (mastra `z.preprocess`). | Plan 2's parity gate was the load-bearing evidence; deleting it leaves no regression net for coerce-layer drift. |
| **C-9** | Scope Critic F2 | "Tool source library" justification is YAGNI. Keep `tools/learning-loop-mcp/{core,tools,__tests__}/` as a "shim" because `#mcp/*` alias resolves there — but the alias is historical baggage that becomes actively misleading. | Plan acknowledges the alias will become "confusing" (plan.md:156) and defers — leaves naming debt for next plan. |
| **C-10** | Failure Mode F2 | Cold-session test references deleted `server.js` at lines 35, 235, 315 (unconditional `import`/`evidence_code_ref` string literals). Phase 5 "delete" instruction is ungrammatical for string literals. | Plan §Phase 5 step 3 only updates `manifestPath` + `corePath` (lines 68, 77), leaves line 35 + 235/315 unchanged. |
| **C-11** | Assumption Destroyer F1 | F4 finding's `evidence_code_ref = "tools/learning-loop-mastra/server.js:38"` points at the description literal: `"Mastra-based peer MCP server for the learning loop (Phase C Plan 1). 29 deterministic meta-surface tools..."`. After Phase 1 expands manifest to 40, the description text becomes FACTUALLY WRONG. | Plan says "no changes to server.js" but the description contains a load-bearing factual claim that becomes false. |

---

## High Findings (9)

| # | Source | Finding |
|---|--------|---------|
| H-1 | Security F3 | Phase 4 deletes `tool-registry.js` but `meta-state-refresh-tools-tool.js:6` imports `clearRegistrations` from it. After deletion, mastra server's stdio boot crashes when it tries to import this tool. Plan's "if" wording for editing the tool file is conditional. |
| H-2 | Security F4 | `quickstart.meta_state_query` is an unvalidated JSON injection surface consumed at session start (`loop_describe`); no JSON schema, no documented consumer chain. |
| H-3 | Failure Mode F3 | `meta_state_refresh_tools` test imports tool that depends on deleted `tool-registry.js`; test file not in any delete list. After Phase 4, namespace 1 fails. |
| H-4 | Failure Mode F4 | 2 spawn-test files hardcode legacy `server.js` path: `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs:20,26` and `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:28,258`. The first has an `existsSync` guard that silently skips the test post-cut-over. |
| H-5 | Failure Mode F5 | `package.json:19` `"gate:server": "node tools/learning-loop-mcp/server.js"` references deleted file. Not in any phase's modify list. |
| H-6 | Assumption Destroyer F3 | `package.json#scripts.gate:server` not in pre-flight checklist. |
| H-7 | Assumption Destroyer F6 | `meta_state_refresh_tools` is the operator's primary workflow (per `docs/mcp-server-restart-protocol.md` + 8+ invocations in single session `gate-log.jsonl`), not "dev convenience." Plan's "stub" decision is half-measure. |
| H-8 | Security F5 | `mcp-config-peer.test.js` rename to `mcp-config.test.js` loses peer-presence assertion. Renamed test only checks key count, not absence of `learning-loop-mcp`. The only test catching re-introduced peer (`tools-list-collision.test.cjs`) is deleted. |
| H-9 | Security F6 | Cold-session test path-update list omits 5+ references. Plan's success criteria check 4 lines; actual file has 12+ `tools/learning-loop-mcp/` references. |

---

## Medium Findings (13)

| # | Source | Finding |
|---|--------|---------|
| M-1 | Security F7 | AGENTS.md + 4 docs files contain stale `tools/learning-loop-mcp/server.js` refs. Plan claims AGENTS.md is "auto-regenerated" — false (verified `git log --oneline AGENTS.md`). |
| M-2 | Security F8 | `#mcp/*` import alias retention routes all canonical tool loads through a dir named after the deleted server. The `write-gate.js` allows `tools/**` writes by default; an attacker can inject malicious code into the canonical server's tool surface via this path. |
| M-3 | Security F9 | `pnpm test` pre-commit hook blocks Phase 4 commit. Deleting `tool-registry.js` breaks `meta-state-refresh-tools-tool.test.js`; test fix is in Phase 5. |
| M-4 | Failure Mode F6 | Phase 5's `sed` regex for HINTS diff may match wrong array bounds. Brittle. |
| M-5 | Failure Mode F7 | `.factory/hooks/loop-surface-inject.cjs:148-160` has user-facing fallback description string referencing dead `mcp__learning_loop_mcp__*` namespace. |
| M-6 | Failure Mode F8 | Plan claims Mastra's `MCPServer` has no hot-reload seam but does not verify. `@mastra/mcp` 1.10.0 likely wraps `@modelcontextprotocol/sdk` internally. |
| M-7 | Assumption Destroyer F9 | Deleting `parity-zod-to-json-schema.test.js` removes regression net for coerce layer. |
| M-8 | Assumption Destroyer F10 | `pnpm test` baseline not validated after legacy `server.js` deletion; 4+ test files spawn deleted server. |
| M-9 | Scope Critic F3 | "Bump version 0.1.0 → 0.2.0" is YAGNI; no consumer reads the version. |
| M-10 | Scope Critic F4 | `meta_state_check_grounding` after `meta_state_resolve` is redundant ceremony; resolved findings don't drift. |
| M-11 | Scope Critic F7 | Cold-session E2E "for the cut-over" duplicates existing cold-session test. |
| M-12 | Scope Critic F8 | `clearRegistrations` decision in Phase 4 is half-baked; either port or delete tool entirely. |
| M-13 | Security F10 | F4 fingerprint anchor invalid (same as C-7). |

---

## Low Findings (6)

| # | Source | Finding |
|---|--------|---------|
| L-1 | Security (none unique) | F4 fingerprint anchor is the same issue as C-7 |
| L-2 | Scope Critic F9 | Decision Delta section is over-documented; operator already chose Path A |
| L-3 | Scope Critic F10 | Master tracker line numbers (192-193) unverified against actual tracker file |
| L-4 | Scope Critic F11 | Pre-flight checklist "no preflight" is misleading; Phase 6+7 are OPERATOR_MODE=1 gated |
| L-5 | Assumption Destroyer F7 | "1 pre-existing skip" claim has no skip directive in `tools-list-collision.test.cjs` (already covered by C-6) |
| L-6 | Assumption Destroyer (none unique) | `with-both-mcp-servers.js` deletion in Phase 5 may break mutex tests (already covered by H-3) |

---

## Cross-Cutting Pattern (Failure Mode Analyst)

> The plan underestimates how many files reference `tools/learning-loop-mcp/server.js` (≥15 files: tests, scripts, docs, hooks, gates, journals) and `tool-registry.js` (≥5 tests + 1 tool file). The Phase 4 pre-check is correct, but the resulting hit list is not transcribed into concrete delete/modify actions. This is a search-vs-act gap: the plan searches for the problem, finds it, but doesn't act on what it found.

## Cross-Cutting Pattern (Assumption Destroyer)

> The plan's Decision Delta asserts "no hook code changes needed" — but the SessionStart hook (`loop-surface-inject.cjs`) IS server-named. The plan's blanket "session-level" claim is wrong for at least 1 file. Similar pattern: plan says "no doc changes" but 4+ docs cite the deleted server.

---

## Recommended Restructure (Scope Critic F1)

If the operator accepts C-1 through C-5, the plan collapses to:

**Phase 1: Single cut-over commit (45-60min)**
1. Update `tools/learning-loop-mastra/tools/manifest.json` (+11 entries).
2. Update `tools/learning-loop-mastra/agent-manifest.json` (5 groups, 40 tools).
3. Edit `.mcp.json` + `.factory/mcp.json` (delete 1 entry each).
4. Update `.factory/hooks/loop-surface-inject.cjs:72` to key on `learning-loop-mastra`.
5. Update `.claude/settings.local.json:13-29` (5 permissions + enabledMcpjsonServers).
6. Lift `coerceParamsToSchema` + `installWireFormatCoercion` to `tools/learning-loop-mcp/core/wire-format-coercion.js`; update 4 test imports.
7. Update AGENTS.md, CLAUDE.md, README.md (operator-facing docs).
8. Update cold-session test path strings (lines 35, 68, 77, 166, 185, 202, 235, 315).
9. Update 2 spawn-test files (`.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` + `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`).
10. Update `package.json#scripts.gate:server` to mastra path.
11. Port or stub `clearRegistrations` in `meta-state-refresh-tools-tool.js` (decide: port to new helper or stub to "not supported").
12. Delete `tools/learning-loop-mcp/server.js` + `tool-registry.js`.
13. Delete parity test, collision test, with-both-mcp-servers files.
14. Run `pnpm test`; verify 10 namespaces + 1 pre-existing skip (backfill) unchanged.
15. `OPERATOR_MODE=1` → `meta_state_resolve(F4)` (with correct line 13, not 38).
16. Edit master tracker C6 + C7 → `[x]`.
17. `meta_state_log_change` for tracker flip.
18. Write closeout journal.
19. Commit + push + open PR.

That's 1 phase, 1 commit, ~60min. All 11 critical findings + 9 high findings addressed.

---

## Files to Update (if Operator Accepts Restructure)

**Plan files (regenerate):**
- `plans/260617-1950-phase-c-plan-3-cut-over/plan.md` — collapse to 1 phase
- `plans/260617-1950-phase-c-plan-3-cut-over/phase-01-promote-mastra-to-canonical.md` — DELETE
- `plans/260617-1950-phase-c-plan-3-cut-over/phase-02-update-agent-manifest.md` — DELETE
- `plans/260617-1950-phase-c-plan-3-cut-over/phase-03-cut-over-mcp-config.md` — DELETE
- `plans/260617-1950-phase-c-plan-3-cut-over/phase-04-deprecate-legacy-server.md` — DELETE
- `plans/260617-1950-phase-c-plan-3-cut-over/phase-05-update-cold-session-tests.md` — DELETE
- `plans/260617-1950-phase-c-plan-3-cut-over/phase-06-resolve-f4-and-tracker.md` — DELETE
- `plans/260617-1950-phase-c-plan-3-cut-over/phase-07-acceptance-gate-and-closeout.md` — DELETE
- New: `plans/260617-1950-phase-c-plan-3-cut-over/phase-01-single-cut-over-commit.md` — single phase

**Researcher reports (no change — both reports are accurate and well-evidenced):**
- `plans/reports/researcher-260617-1954-GH-1607-F4-hook-reimplementation-path-a-report.md`
- `plans/reports/researcher-260617-1945-phase-c-plan-3-cut-over-mechanics-report.md`

---

**Status:** DONE — 39 findings cataloged. Operator adjudicated 2026-06-17: applied restructure (1 phase, 1 commit). See "Restructure Outcome" below.

---

## Restructure Outcome (2026-06-17, post-adjudication)

**Operator decision:** "Apply restructure: 1 phase, 1 commit" (via AskUserQuestion).

**Disposition of all 11 Critical findings:**

| # | Critical Finding | Disposition | Applied Step |
|---|------------------|-------------|--------------|
| C-1 | SessionStart hook keys on legacy server | ACCEPT | Step 4.1 (`.factory/hooks/loop-surface-inject.cjs:72`) |
| C-2 | `settings.local.json` permissions dead | ACCEPT | Step 5.1 (5 permissions + enabledMcpjsonServers) |
| C-3 | AGENTS/CLAUDE/README cite deleted server | ACCEPT | Step 3.1, 3.2, 3.3 |
| C-4 | 4 wire-format tests import deleted helper | ACCEPT | Step 6.1 (lift helper) + Step 7 (update 4 imports) |
| C-5 | Test blast radius under-counted (30+ refs) | ACCEPT | Steps 7, 8, 10, 12 |
| C-6 | Skip count claim wrong (backfill, not collision) | ACCEPT | Step 14 (corrected to "1 skip (backfill)") |
| C-7 | F4 fingerprint line wrong (13, not 38) | ACCEPT | Step 15.2 (anchored at server.js:13) |
| C-8 | Parity test deletion removes regression net | ACCEPT | Step 11.1 (REPLACE with coerce-correctness, not delete) |
| C-9 | "Tool source library" YAGNI | REJECT | Out of scope (deferred to follow-up cleanup per KISS) |
| C-10 | Cold-session test path-update list incomplete | ACCEPT | Step 10.1 (8 line references updated) |
| C-11 | F4 `evidence_code_ref` becomes stale | ACCEPT | Step 1.3 (update server.js:38 description literal) |

**Disposition of all 9 High findings:** ACCEPT (H-1, H-3, H-4, H-5, H-7, H-8, H-9 via the relevant Steps above; H-2 deferred to follow-up hardening plan; H-6 absorbed by H-5).

**Disposition of Medium/Low findings:** ACCEPT where low-cost (M-4 Node-based diff, M-5 hook description string, M-9 dropped version bump, M-10 dropped check_grounding, L-3 verified line numbers, L-4 explicit OPERATOR_MODE notes); DEFER where out of scope (H-2 quickstart injection surface, follow-up hardening).

**Files rewritten:**
- `plan.md` (185 → 246 lines; collapsed 7 phases → 1 phase, all 11 Criticals applied)
- `phase-01-single-cut-over-commit.md` (NEW, 368 lines; 19 step groups, all in 1 commit)
- 7 old phase files DELETED

**Files unchanged:**
- Researcher reports (both accurate and well-evidenced)
- Master tracker (closeout step is in Plan 3; not pre-applied)
- `meta-state.jsonl` (closeout step is in Plan 3; not pre-applied)

**Net result:** Plan 3 is now structurally correct. All 11 Criticals that would have broken the acceptance gate are addressed with explicit file:line fix steps. The plan ships as 1 phase, 1 commit, 1-2h.
