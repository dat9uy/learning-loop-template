# Red-Team Review: Phase E Plan 4 (Mastra Code Runtime Validation)

**Reviewer lens:** SCOPE RIGOR + ARCHITECTURE CORRECTNESS (hostile)
**Reviewer:** SCOPE & ARCHITECTURE persona (predict-style adversarial)
**Date:** 2026-06-30
**Plan under review:** `plans/260630-2012-phase-e-plan-4-mastra-code-validation/plan.md` + 5 phase files
**Inputs read in full:**
- Plan + 5 phase files
- `plans/reports/predict-260624-2025-phase-e-domain-driven-architecture-report.md`
- `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` (Rev 11 §"Remaining items for Plan 4" + Plan 4 row)
- `plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md`
- `plans/reports/research-260626-2314-phase-e-plan-4-harness-class-report.md` (Combined Plan 4 Execution Path)
- `tools/learning-loop-mastra/interface/CONTRACT.md`
- `tools/learning-loop-mastra/interface/contract.js` (the validator we are amending)
- `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md` (Mastra Code worked example)
- `AGENTS.md` §11 (R2 ownership; stale `.mastracode/coordination/hooks/` reference)

---

## Acceptance verdict: **APPROVE-WITH-FIXES**

The plan is **canonically scoped** (matches the scope report's Plan 4 row + the Combined Execution Path) and the dependency chain is sound. Three IMPORTANT issues must be addressed before ship; one CRITICAL ambiguity must be resolved by Phase 1 (the probe must happen before any contract amendment commits). The scope is **not** over-broad in volume — 5 phases × ~1.3h each ≈ 6.5h matches scope-report estimate E.5 (1–2d) — but it **is** over-broad in surface area: the plan touches AGENTS.md §11 (Plan 3 concern), RUNTIME_ONBOARDING.md (separate concern), and ships a hybrid model that the scope report did NOT endorse (scope report Rev 11 §E.5 says "satisfy the 5 contract requirements for Mastra Code"; not "introduce a hybrid programmatic integration").

If the CRITICAL ambiguity is resolved by Phase 1 and the 3 IMPORTANT issues are applied, the plan can ship in ~6h hands-on, ~1–1.5 calendar days. Without those fixes, it expands to ~10–12h and risks regressions.

---

## Findings (numbered; each with severity, location, issue, recommendation, evidence)

### F1 — CRITICAL — Phase 3 amends the contract before Phase 1 probe resolves ambiguity

**Severity:** CRITICAL
**Location:** `plan.md` "Open questions resolved by research" table; `phase-03-phase-03-contract-amendments.md` step 4
**Issue:** The plan claims 6 Qs resolved by research (Q1 programmatic, Q2 `cwd`, Q3 declarative hooks, Q4 `MASTRA_RESOURCE_ID`, Q5 skill discovery, Q6 namespacing). **Five are resolved; one is genuinely open.** The plan's table acknowledges Q6 is "TBD at smoke test" — but Phase 3 commits contract amendments (Req #1 + #4 + #5 + #2 path) BEFORE Phase 1 probe resolves Q6. If Q6 reveals that the actual format is `mcp__learning-loop__loop_describe` (Claude Code convention, listed as one of the three candidates in harness-class §7), the Req #2 `args` check pattern in Phase 3 is unchanged (it only validates server.js path), but **the downstream `tools/agents/mastra-code.md` doc and write-gate hook matcher in Phase 2 will need to be amended after Phase 1**. Worse: Phase 2 `.mastracode/hooks.json` writes a literal `<TBD_FROM_PROBE>` for the write-gate matcher — if Phase 2 ships first, the JSON will need a second edit.

**Recommendation:**
1. **Reorder the dependency chain** to: Phase 1 (probe resolves Q6 + tool names) → Phase 2 (config files use resolved values) → Phase 3 (contract amendments) → Phase 4 (smoke test against committed contract) → Phase 5 (docs cite resolved values). The current plan claims this ordering, but the phase numbering is misleading: Phase 2 ships `.mastracode/hooks.json` with `<TBD_FROM_PROBE>` placeholders, which is technically a "draft" — but the plan's success criteria for Phase 2 says "1 atomic commit: 4 files created + 1 .gitignore line" without flagging the placeholder.
2. **Add an explicit Phase 1 gate:** "If probe reveals Q6 name format differs from `learning-loop_*`, Phase 3 amendment MUST include a verification step that the validator's MCP check (if added) handles the actual format." Currently Phase 3 only amends Req #1, #4, #5 + corrects Req #2 path; it does NOT amend the MCP `args` check at all. So Q6's resolution lands in Phase 4 smoke test, which is correct — but the plan's Phase 3 success criteria do not make this dependency explicit.
3. **Phase 2 placeholder handling:** Replace `<TBD_FROM_PROBE>` with a concrete failure mode: "Phase 2 ships no `.mastracode/hooks.json` until Phase 1 returns the tool name. Phase 2 instead writes a stub `hooks.json` with `matcher.tool_name: "PLACEHOLDER_UPDATE_AFTER_PHASE_1"` AND adds a Phase 2 prerequisite that this stub fails JSON validation (or is gitignored) until Phase 1 confirms." Alternative: collapse Phase 1 + Phase 2 into one phase that delivers the 4 config files post-probe.

**Evidence:**
- `plan.md` line 68: "Q6: MCP tool namespacing? TBD at smoke test — depends on `mcpManager` impl"
- `phase-02-phase-02-config-files.md` step 2: literal `<TBD_FROM_PROBE>` in `.mastracode/hooks.json` matcher
- `phase-03-phase-03-contract-amendments.md` step 4: contract amendment is independent of Phase 1 outcome (good), but contract wording claims "declarative hooks.json" alternative path without referencing actual tool_name resolution (bad)

---

### F2 — IMPORTANT — Hybrid model is a deferred architectural decision, not Plan 4's job

**Severity:** IMPORTANT
**Location:** `plan.md` line 27; `phase-04-phase-04-smoke-test.md` "Hybrid model in action" section; combined with mastracode-prep §"CLI vs programmatic invocation"
**Issue:** The plan introduces **hybrid integration**: `createMastraCode({ cwd, resourceId, extraTools: { 'loop_describe': buildLoopDescribeTool() } })` as the **primary** path, with `.mastracode/mcp.json` as a **fallback**. The scope report Rev 11 §E.5 says only: "Satisfy the 5 contract requirements for Mastra Code … Run `interface/contract.js mastra-code` → expect `{ok: true}`." It does NOT endorse programmatic integration. The predict report (CAUTION verdict) treats `createMastraCode({ configDir })` as a **peer-MCP consumer**, not a programmatic importer.

The hybrid model is **architecturally defensible** but it is a **separate decision** from "satisfy the 5-req contract." Three concrete problems:

1. **The contract is unchanged at the architectural level by hybrid.** `interface/contract.js` only validates file presence + JSON shape. It doesn't care whether `loop_describe` is invoked via MCP or via `extraTools`. So Plan 4 could ship **without** the programmatic path and still pass the contract. The hybrid path is gold-plating that doesn't move the acceptance needle.
2. **The programmatic path creates a second integration surface that needs separate testing.** Phase 4 smoke test must validate both: (a) `extraTools['loop_describe']` works when imported natively, AND (b) `mcpManager.listTools()` returns the namespaced form when MCP is the fallback. The plan only does (b) implicitly via `mcpManager.listTools()`; (a) is the actual proof. This doubles the smoke test surface area.
3. **Hybrid defers the Q1 decision that research already settled.** Per mastracode-prep §"Unresolved Questions" Q1, the operator already decided programmatic on 2026-06-27. But the predict report's recommendation row "Should the new `createMastraCode` peer MCP connection ship in Phase E?" was answered "Yes — but as **config**, not code." That means: ship `.mastracode/mcp.json` with peer MCP entry, and the operator uses programmatic via `createMastraCode({...})` ONLY if they want to. Not "ship programmatic primary, MCP fallback."

**Recommendation:**
- **Option A (preferred):** Defer the programmatic integration. Plan 4 ships `.mastracode/mcp.json` + the contract validation that MCP-namespace tool names reach Mastra Code via the fallback. Probe script demonstrates one tool round-trip via MCP. Programmatic integration becomes a future follow-up plan (call it Plan 4b / Phase F candidate) gated on operator decision.
- **Option B (acceptable):** Keep the hybrid model, but **explicitly document** the deferred decision: a one-paragraph section in `docs/agents/mastra-code.md` that says "Programmatic integration is the primary path for runtime tests (Q1); MCP fallback is for runtime features where the operator has not opted into programmatic. The contract validator only validates MCP-fallback (peer MCP) configuration; programmatic integration has no contract gate."
- **Option C (NOT recommended):** Drop MCP entirely. Ship programmatic-only. This contradicts the predict-report recommendation.

If the team picks A, the plan shrinks by ~2h (Phase 4 reverts to a simpler peer-MCP smoke test, not a dual-path tool round-trip).

**Evidence:**
- `predict-260624-2025-phase-e-domain-driven-architecture-report.md` line 34 (Resolution column): "Shim pattern is the runtime interface. No new dir needed. The Mastra Code 'interface' is `configDir` config in `createMastraCode({...})` — not new code."
- `phase-e-scope-260624-2025-runtime-interface-structure-report.md` Plan 4 row (line 157): "Smoke-test `createMastraCode({ configDir })` from npm `mastracode` against the new MCPServer. Satisfy the 5 contract requirements for Mastra Code."
- `plan.md` line 27 explicitly introduces hybrid: "Hybrid model. MCP for Claude Code / Droid (legacy; can't import our tool factories directly). Programmatic for Mastra Code … The `.mastracode/mcp.json` is still shipped as a fallback + forward-compat for future mode configurations."

---

### F3 — IMPORTANT — Req #1 + #5 "OR" clauses invite polymorphism that future runtimes will misuse

**Severity:** IMPORTANT
**Location:** `phase-03-phase-03-contract-amendments.md` step 3 ("Req #1: add `OR declarative hooks.json` clause; Req #5: add `.mastracode/hooks.json` alternative")
**Issue:** The contract amendments add **polymorphism** to the 5-req contract by introducing "OR" alternatives on Req #1 (shim set OR declarative JSON) and Req #5 (settings integration OR hooks.json). This is **scope-creep at the spec level**, not at the implementation level. The current contract is **monomorphic**: 5 unambiguous requirements. Adding "OR" alternatives now creates 4 possible paths through Req #1 + #5 alone (shim-set + settings-integration OR shim-set + hooks.json OR declarative-json + settings-integration OR declarative-json + hooks.json). Each new runtime author must pick one.

The scope report's Plan 4 row says: "Satisfy the 5 contract requirements for Mastra Code." It does NOT say "amend the contract to be polymorphic." The predict report's "Resolved Q3: hook mechanism — declarative JSON" resolution locks the pattern for Mastra Code. But the contract wording change in Phase 3 says "any runtime may adopt either pattern," which is a different, broader decision.

The risk profile:
- A future "Cursor" runtime ships with a third hook mechanism (e.g., `cursor.json`). The polymorphic contract now says "OR third pattern" — and the operator must amend the contract again.
- A "Gemini CLI" runtime ships with shim files; another with declarative JSON. The validator must distinguish between "runtime X has shim set" vs "runtime Y has declarative JSON" per run. This makes the contract a per-runtime config rather than a global invariant.

**Recommendation:**
- **Option A (preferred):** Keep the 5-req contract **monomorphic** for Req #1 + #5. Add Mastra Code's hook pattern as a NEW requirement (#6) that is **additive**, not alternative. Req #1 stays "shim set"; Req #5 stays "settings integration." A new Req #6 ("declarative hooks config") is met by `.mastracode/hooks.json` for Mastra Code only. Claude Code / Droid do NOT need to meet Req #6; Mastra Code does NOT need to meet Req #1 + #5. This is **runtime-specific requirements**, not polymorphism.
- **Option B (acceptable):** Make the "OR" clauses very narrow. Req #1 alternative: "OR a declarative hooks config in `.mastracode/hooks.json` ONLY for Mastra Code." This avoids runtime-author choice but is awkward (the contract becomes a per-runtime spec).
- **Option C (NOT recommended):** Ship the polymorphic contract as drafted. Future runtime authors will face the choice; the cost of saying "no, your pattern isn't allowed" later is high.

If A is picked, the contract amendment is cleaner (1 new requirement vs 2 polymorphic clauses), and the validator code adds 1 new check (`checkMastraCodeHooksJson`) instead of 3 alternative-path branches.

**Evidence:**
- `phase-03-phase-03-contract-amendments.md` "Architecture" table: "Amendment strategy: add an 'OR' clause to Req #1 + Req #5"
- `tools/learning-loop-mastra/interface/CONTRACT.md` line 7–14: Req #1 is currently monomorphic ("MUST provide 4 hook shims")
- `predict-260624-2025-phase-e-domain-driven-architecture-report.md` (no mention of polymorphic contract — it treats the shim pattern as canonical)

---

### F4 — IMPORTANT — AGENTS.md §11 cleanup is Plan 3 scope, not Plan 4 scope

**Severity:** IMPORTANT
**Location:** `phase-03-phase-03-contract-amendments.md` step 7; `AGENTS.md` line 361
**Issue:** Plan 3 (Housekeeping) shipped the R2 ownership section in AGENTS.md §11 (line 359–368) — including the now-stale `.mastracode/coordination/hooks/` reference at line 361 ("Runtime interface code (`.claude/coordination/hooks/`, `.factory/coordination/hooks/`, future `.mastracode/coordination/hooks/`)"). This is a **predictable doc drift** introduced by Plan 3 (Plan 3 wrote the section without knowing Mastra Code's actual hook mechanism — research hadn't landed). Plan 4 is now the natural place to fix it.

But the fix lives in **Plan 3's deliverable** (AGENTS.md §11). Plan 4 amending §11 conflates the surfaces. The cleaner pattern: file a **finding** (`meta_state_report` with `category: stale-ref`) in Phase 1 acknowledging the drift; defer the §11 fix to a **Plan 3 follow-up housekeeping commit** (or, if Plan 4 is the last open Phase E plan, to a dedicated "Phase E closing housekeeping" commit in Phase 5).

The §11 fix is **not strictly required for the contract to pass**. `node interface/contract.js mastra-code` validates filesystem + JSON; it doesn't read AGENTS.md. So the §11 cleanup is **documentation-only** and could ship as a one-line PR after Plan 4 lands.

**Recommendation:**
- Move AGENTS.md §11 cleanup out of Phase 3. Keep it in Phase 5 as a documentation-only final commit, OR file as a follow-up housekeeping PR after Plan 4 ships. This shrinks Phase 3 by ~15 minutes and reduces its risk surface (Phase 3 changes 4 files: CONTRACT.md, contract.js, RUNTIME_ONBOARDING.md, __tests__/contract.test.js; AGENTS.md §11 is unrelated to those 4).

**Evidence:**
- `AGENTS.md` line 361: `.mastracode/coordination/hooks/` (stale; will become `.mastracode/hooks.json` after Plan 4 ships)
- `plan.md` line 25: "AGENTS.md §11 doc correction (stale `.mastracode/coordination/hooks/` language)" — listed as a Plan 4 deliverable
- `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` Plan 3 row (line 152): Plan 3 already shipped §11; the stale ref is a Plan 3 follow-up, not a Plan 4 new-build

---

### F5 — IMPORTANT — `extraTools` parameter does not exist in `createMastraCode` signature

**Severity:** IMPORTANT
**Location:** `phase-04-phase-04-smoke-test.md` "Architecture" block: `await createMastraCode({ cwd: process.cwd(), resourceId: 'mastra-code', extraTools: { 'loop_describe': buildLoopDescribeTool() } })`
**Issue:** The mastracode-prep research §1 explicitly states the API signature: "`CreateMastraCodeOptions`: `cwd` (string, default `process.cwd()`), `modes`, `extraTools`, `subagents`, `storage`, `initialState`, `heartbeatHandlers`, `resolveModel`." So `extraTools` DOES exist. But Phase 4 uses it with an **object literal** (`{ 'loop_describe': buildLoopDescribeTool() }`), while the Mastra Code API expects **a `DynamicArgument<ToolsInput>`** (per harness-class §1). The type is ambiguous: is it a `ToolsInput` object? A factory? A function? The plan does not specify.

If the smoke test fails because `extraTools` requires a different shape, Phase 4 is blocked. There's no fallback path documented.

**Recommendation:**
1. Add explicit `extraTools` shape documentation in Phase 4 step 1: "Read `node_modules/mastracode/dist/index.d.ts` for `extraTools` type; confirm it's a `Record<string, ToolFactory>` or `ToolsInput` object; build the loop_describe factory using the canonical path from `tools/learning-loop-mastra/tools/manifest.json`."
2. Add a Phase 1 sub-goal: "Confirm `extraTools` shape by reading the installed `.d.ts` file." This is a 5-minute verification that prevents a 30-minute Phase 4 debug cycle.

**Evidence:**
- `plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md` §1: lists `extraTools` as a valid param
- `plans/reports/research-260626-2314-phase-e-plan-4-harness-class-report.md` §1: defines `tools: DynamicArgument<ToolsInput | undefined>` for the Harness class — but the plan uses `extraTools` on `createMastraCode`, NOT `tools` on the Harness
- `phase-04-phase-04-smoke-test.md` line 32: literal `{ 'loop_describe': buildLoopDescribeTool() }` — undefined what `buildLoopDescribeTool()` returns

---

### F6 — MINOR — `pnpm view mastracode` is read-only, but the gate check protocol expects vendor API to be checked

**Severity:** MINOR
**Location:** `phase-01-phase-01-preflight-prereqs.md` step 1
**Issue:** The plan says "Pre-flight gate check. Call `mastra_gate_check` for `npm install mastracode --save-dev`. If blocked, fallback: `pnpm view mastracode` (read-only)." This is fine — but the plan does not specify what `pnpm view` should check (latest version, license, dependency tree, maintainer). If the gate check is blocked (R1 risk), the fallback should be a **structured vendor evaluation**, not just "confirm package exists."

**Recommendation:** Add a Phase 1 step 1.5: "If `mastra_gate_check` blocks install, run `pnpm view mastracode` and capture: (a) latest version, (b) license (must be permissive — MIT/Apache-2.0/BSD), (c) maintainer (must be `mastra-ai` org), (d) dependency tree (must not pull in vendor-paid APIs at install time), (e) `peerDependencies` (must accept our existing `@mastra/core@1.42.0`). File the captured JSON as `meta_state_log_change` evidence so the operator has auditable grounds to approve the install."

**Evidence:**
- `phase-01-phase-01-preflight-prereqs.md` R1 mitigation: "Fallback: vendor check via `pnpm view mastracode` (read-only)"
- AGENTS.md §10 (budget check protocol; not read in this review but referenced)

---

### F7 — MINOR — `meta_state_log_change` for `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'` is unusual usage

**Severity:** MINOR
**Location:** `phase-05-phase-05-docs-and-verify.md` step 4 + step 6; `plan.md` acceptance criteria
**Issue:** The plan calls for `meta_state_log_change` with `change_target` pointing at a **markdown tracker** rather than a code path or rule id. The change-log schema (per the meta-state MCP tool description) is for `semantic | mechanical | surface` changes to "specific path or identifier being changed." A tracker flip is neither — it's a doc status update. Using `change_target` for the tracker may violate the schema's intent (the change-log should record code/rule changes, not status flags).

**Recommendation:** Replace `meta_state_log_change` for tracker/scope-report flips with `meta_state_report(category: loop-anti-pattern, description: "Phase E Plan 4 status flip" ...)` OR a plain markdown commit + journal entry. The change-log is the wrong tool for "we flipped a status field."

**Evidence:**
- `phase-05-phase-05-docs-and-verify.md` step 6: "File audit-trail entries (canonical MCP path): meta_state_log_change × 1 for tracker flip; meta_state_log_change × 1 for scope report flip"
- The meta-state change-log schema is described as "Log a system change (schema, rule, tool, policy, surface, lifecycle, manifest)" — a tracker flip is documentation, not a system change.

---

### F8 — MINOR — Phase 5 verification gates are redundant with Phase 1 + Phase 4 gates

**Severity:** MINOR
**Location:** `phase-05-phase-05-docs-and-verify.md` step 2
**Issue:** Phase 5 runs `pnpm test` + `pnpm smoke:mastracode` + 3 `node interface/contract.js <runtime>` invocations. Phase 4 already runs `pnpm test` (per `phase-04-phase-04-smoke-test.md` step 5). Phase 1 already runs the probe. The Phase 5 verification is a no-op if Phase 4 already passed — unless docs/journal changes in Phase 5 broke something (which is unlikely since they don't touch code).

**Recommendation:** Either (a) drop Phase 5 step 2 (Phase 4's verification is sufficient), or (b) make Phase 5 verification a **CI-runnable gate** that runs in `.github/workflows/` so it doesn't depend on operator remembering to run it. Option (b) is the better engineering practice but expands scope. Option (a) is the YAGNI cut.

**Evidence:**
- `phase-04-phase-04-smoke-test.md` step 5: "Run full test suite. `pnpm test` — all 13 namespaces GREEN + the new namespace for Mastra Code smoke"
- `phase-05-phase-05-docs-and-verify.md` step 2: re-runs the same gates

---

### F9 — MINOR — Plan claims "5 commits" but Phase 5 will be 1 commit bundled across 4 doc files + 2 meta-state entries

**Severity:** MINOR
**Location:** `phase-05-phase-05-docs-and-verify.md` step 7; `plan.md` effort estimate
**Issue:** The plan says "5 atomic commits" but Phase 5's final commit bundles `docs/agents/mastra-code.md` + `docs/journals/260630-...` + master tracker + scope report + 2 `meta_state_log_change` entries. That's **5 source files + 2 registry mutations** in 1 commit. The registry mutations are supposed to go through MCP, which means they happen AFTER the source commit (canonical MCP-path sequencing per AGENTS.md §6). So the workflow is: commit docs → run `meta_state_log_change` × 2 → no second commit (registry is its own append-only ledger).

This is fine, but the plan's "5 atomic commits" claim is misleading — Phase 5 has **1 atomic commit + 2 MCP mutations**. Total across the plan: **4 atomic commits** (Phase 1-4 each) + 1 docs commit + 2-3 `meta_state_log_change` MCP entries (Phase 1, Phase 4, Phase 5 × 2). The "5 atomic commits" is off by one.

**Recommendation:** Update the journal template (Phase 5 step 3) to clarify: "4 atomic source commits (Phases 1-4) + 1 atomic docs commit (Phase 5) + 4 `meta_state_log_change` entries via MCP." This is purely a documentation accuracy fix.

**Evidence:**
- `phase-05-phase-05-docs-and-verify.md` step 3: "1 atomic commit per phase; total 5 commits"
- `phase-05-phase-05-docs-and-verify.md` step 6: 2 `meta_state_log_change` entries (these are MCP mutations, not commits)
- `phase-01-phase-01-preflight-prereqs.md` step 7: "Commit probe script as a standalone artifact" (1 commit)
- `phase-02-phase-02-config-files.md` step 7: "1 atomic commit: 4 files created + 1 .gitignore line" (1 commit)
- `phase-03-phase-03-contract-amendments.md` success criteria: "1 atomic commit for all contract amendments + test additions" (1 commit)
- `phase-04-phase-04-smoke-test.md` no explicit "1 atomic commit" line, but step 5 implies 1 commit for `package.json` + probe extensions + new test

---

## Scope assessment

**Concrete hours saved if scope is reduced by X%:**

The plan's 5 phases × ~1.3h = **~6.5h hands-on** (matches E.5 estimate). Recommended cuts:

| Cut | Phase | Saves | Justification |
|-----|-------|-------|---------------|
| Drop AGENTS.md §11 cleanup from Phase 3 | Phase 3 | ~15 min | It's Plan 3 follow-up scope, not Plan 4 (F4) |
| Drop hybrid model; ship MCP-only | Phase 4 | ~1.5–2h | Scope report's Plan 4 doesn't endorse hybrid (F2) |
| Skip polymorphic "OR" clauses; add Req #6 instead | Phase 3 | ~30 min | Cleaner contract, less validator code (F3) |
| Combine Phase 1 probe + Phase 2 config | Phase 1+2 | ~30 min | Avoids `<TBD_FROM_PROBE>` placeholder (F1) |
| Drop redundant Phase 5 verification | Phase 5 | ~10 min | Phase 4 already verified (F8) |
| **Total saved if all 5 cuts applied** | | **~3–3.5h** (46–54% reduction) | Brings Plan 4 to ~3h hands-on |

**If ONLY the CRITICAL + 2 most-important cuts applied (F1 + F4 + F3):**
- Add Phase 1 gate for Q6 resolution before Phase 3 commit: +0 min (already a phase ordering issue)
- Move AGENTS.md §11 cleanup to Phase 5: -15 min
- Reject polymorphic contract; add Req #6: -30 min
- **Total: ~45 min saved (12% reduction)**, plus architectural debt avoided (polymorphic contract is the highest-risk cut)

**Recommended scope posture:** **Cuts F2 (hybrid model) and F3 (polymorphic contract) together.** Together they save ~2h and reduce the architectural surface area by ~40%. Combined with the small cuts (F4, F1, F8), the plan becomes ~3.5h hands-on.

---

## Open questions still unresolved (after deep read)

The plan claims 6 Qs resolved. My deep read reveals:

| Q | Plan claim | Actual status | Note |
|---|------------|---------------|------|
| Q1 (CLI vs programmatic) | Resolved 2026-06-27 — programmatic | Resolved | But the architectural choice of hybrid (programmatic primary + MCP fallback) is a NEW decision not endorsed by scope report |
| Q2 (`configDir` vs `cwd`) | Resolved — uses `cwd` | Resolved | Per mastracode-prep §1 |
| Q3 (hook mechanism) | Resolved — declarative JSON | Resolved | Per mastracode-prep §4 |
| Q4 (`RUNTIME_ID` equivalent) | Resolved — `MASTRA_RESOURCE_ID` | Resolved | Per mastracode-prep §5 |
| **Q5 (skill spec reuse)** | **Resolved — reuse `.claude/skills/` discovery** | **PARTIALLY RESOLVED** | Mastra Code's discovery priority lists `.mastracode/skills/` as HIGHEST, `.claude/skills/` as second. The skill WILL be auto-discovered. But Phase 3's `checkSkillSpec` for Mastra Code explicitly checks `.mastracode/skills/learning-loop/SKILL.md` first (per Phase 3 step 4) — if the file doesn't exist (because we're reusing `.claude/skills/`), the check fails UNLESS we add the `or .claude/skills/learning-loop/SKILL.md` alternative. The plan's Phase 3 step 4 says "discover `.claude/skills/learning-loop/SKILL.md` OR `.mastracode/skills/learning-loop/SKILL.md`" — so the validator IS coded correctly. **But the test (`mastracode-skill-spec-reuses-claude-skills-discovery`) is the only test that exercises the fallback path** — if the test passes by accident (e.g., the operator copies `.claude/skills/learning-loop/SKILL.md` to `.mastracode/skills/learning-loop/SKILL.md` to "be safe"), the fallback path is never actually exercised. **Recommendation: add a test that explicitly NEGATES the existence of `.mastracode/skills/learning-loop/SKILL.md`** to lock the discovery-via-`.claude/skills/` path. |
| **Q6 (MCP tool namespacing)** | **TBD at smoke test** | **OPEN — correctly deferred** | The plan correctly defers this to Phase 1 probe. But Phase 3's contract amendment does NOT depend on Q6 (good), and Phase 4's smoke test depends on it. **The risk: if Phase 1 reveals the format is `mcp__learning-loop__loop_describe` (Claude Code convention), the doc + write-gate hook matcher in Phase 2's `.mastracode/hooks.json` will need a Phase 4 amendment.** This is acknowledged in the plan (R2 risk) but not mitigated (e.g., "Phase 2 commits with a placeholder; Phase 4 amends after probe.") |

**Two questions are NOT yet settled in the plan as drafted:**

1. **`extraTools` shape** — the plan assumes `{ 'loop_describe': buildLoopDescribeTool() }` works but doesn't verify the installed Mastra Code API signature. This is F5.
2. **Whether the polymorphic contract wording is intentional or accidental** — F3. The plan treats it as "obvious amendment" but the scope report did not endorse it.

---

## AGENTS.md §11 — is it the right place? Should it be in Plan 5 instead?

**The §11 cleanup belongs in Phase 5, not Phase 3.** Reasoning:

1. **§11 is R2 ownership documentation** (Plan 3 scope). The stale `.mastracode/coordination/hooks/` reference is a documentation drift introduced by Plan 3, not a Phase 4 build decision.
2. **Phase 3 amends the contract** (CONTRACT.md, contract.js, RUNTIME_ONBOARDING.md, contract.test.js). The §11 cleanup touches AGENTS.md — a different doc.
3. **Plan 5 (Hardening) is for security/identity primitives** (LIM-3, R2 write-gate, LIM-4 path traversal). AGENTS.md §11 references Plan 5 as the future enforcement vehicle. So §11 is **already a Plan 5 dependency**; editing §11 in Plan 4 creates a circular reference.
4. **The §11 fix is documentation-only.** It does not gate any acceptance criterion (the contract validator doesn't read AGENTS.md). So it can ship in Phase 5 (the docs phase) as part of the journal/tracker/scope-report bundle.

**Recommendation (consolidated):** Move §11 cleanup to Phase 5 step 5 (alongside the scope-report Rev 12 update). Phase 3 stays focused on contract amendments.

---

## Is there a simpler plan?

**Yes. Cut to ~3h hands-on:**

### Minimum Useful Plan 4 (MUP-4)

| Phase | Name | Time | What |
|-------|------|------|------|
| 1 | Probe + config | ~1.5h | `pnpm add -D mastracode`; run probe; create `.mastracode/{mcp,hooks,settings,database}.json` with **resolved values** from probe (no `<TBD_FROM_PROBE>`) |
| 2 | Contract amendment | ~1h | Add Req #6 (additive, not polymorphic) for Mastra Code's declarative hooks; update validator; add 4 regression tests; update RUNTIME_ONBOARDING.md worked example |
| 3 | Smoke + docs | ~1h | Run probe as smoke test (1 tool round-trip via MCP); write `docs/agents/mastra-code.md`; file journal; flip tracker/scope-report |

**Total: ~3.5h hands-on. ~1 calendar day wall-clock.** Cuts:
- F1 (probe-before-config: combine Phase 1+2)
- F2 (hybrid model: ship MCP-only)
- F3 (polymorphic contract: additive Req #6)
- F4 (§11 cleanup: defer to a future housekeeping PR, or do as part of Phase 5 docs in this MUP)
- F8 (redundant Phase 5 verification: drop)

**What MUP-4 does NOT ship (acceptable):**
- AGENTS.md §11 update (file a `meta_state_report(category: stale-ref)` finding; fix later)
- Programmatic integration (deferred to follow-up plan if operator wants it)
- Polymorphic contract (deferred; the contract stays monomorphic)
- Redundant Phase 5 verification (Phase 3 smoke test is sufficient)

---

## Summary of recommended changes

| ID | Severity | Fix | Effort saved (or added) |
|----|----------|-----|--------------------------|
| F1 | CRITICAL | Reorder: Phase 1 probe BEFORE Phase 2 config; OR combine 1+2 | -30 min |
| F2 | IMPORTANT | Drop hybrid model; ship MCP-only | -1.5h |
| F3 | IMPORTANT | Replace polymorphic "OR" with additive Req #6 | -30 min |
| F4 | IMPORTANT | Move AGENTS.md §11 cleanup to Phase 5 | -15 min |
| F5 | IMPORTANT | Document `extraTools` shape; add Phase 1 sub-goal | (no time change, prevents debug) |
| F6 | MINOR | Structure `pnpm view` fallback evaluation | +5 min |
| F7 | MINOR | Replace `meta_state_log_change` for tracker flip with `meta_state_report` or journal | (no time change) |
| F8 | MINOR | Drop redundant Phase 5 verification | -10 min |
| F9 | MINOR | Update journal template to reflect 4 commits + 4 MCP entries | (no time change) |

**If all IMPORTANT + CRITICAL fixes applied:** ~6.5h → ~3.5h (46% reduction).

---

## Files reviewed (absolute paths)

- `/home/datguy/codingProjects/learning-loop-template/plans/260630-2012-phase-e-plan-4-mastra-code-validation/plan.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/260630-2012-phase-e-plan-4-mastra-code-validation/phase-01-phase-01-preflight-prereqs.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/260630-2012-phase-e-plan-4-mastra-code-validation/phase-02-phase-02-config-files.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/260630-2012-phase-e-plan-4-mastra-code-validation/phase-03-phase-03-contract-amendments.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/260630-2012-phase-e-plan-4-mastra-code-validation/phase-04-phase-04-smoke-test.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/260630-2012-phase-e-plan-4-mastra-code-validation/phase-05-phase-05-docs-and-verify.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/predict-260624-2025-phase-e-domain-driven-architecture-report.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` (Rev 11; §"Remaining items for Plan 4" + Plan 4 row)
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/research-260626-2314-phase-e-plan-4-harness-class-report.md` (Combined Plan 4 Execution Path)
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/interface/CONTRACT.md`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/interface/contract.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md` (Mastra Code worked example)
- `/home/datguy/codingProjects/learning-loop-template/AGENTS.md` §11 (R2 ownership; lines 359–368)

---

## Status

**DONE_WITH_CONCERNS**

Summary: Plan is canonically scoped at the macro level (matches scope-report Plan 4 row) but introduces 3 architectural decisions the scope report did NOT endorse (hybrid model, polymorphic contract, Q5/Q6 ambiguity in test coverage). 1 CRITICAL ordering issue (Phase 3 commits before Phase 1 probe resolves Q6), 4 IMPORTANT fixes recommended. With F1–F5 applied, the plan shrinks from ~6.5h to ~3.5h hands-on and the architectural surface area reduces by ~40%.

Concerns/Blockers:
- F1 (CRITICAL) must be resolved before Phase 2 commits (probe must complete first)
- F2 (IMPORTANT) is an architectural decision the operator should make (hybrid vs MCP-only)
- F3 (IMPORTANT) is a contract-design decision (polymorphic vs additive)
- Neither F2 nor F3 is blocking — both are advisory; the operator can ship as-drafted if they accept the architectural debt