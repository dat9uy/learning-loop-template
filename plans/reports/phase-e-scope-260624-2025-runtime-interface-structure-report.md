# Phase E Scope Report: Runtime Interface Structure (3-Layer Architecture Locked)

**Type:** phase-e-scope (advisory; problem-solving inversion applied)
**Date:** 2026-06-24 19:25 (revised 2026-06-24 21:30 — 4 corrections applied; revised 2026-06-24 22:10 — plan split added; revised 2026-06-25 — Plan 1 (Foundation) shipped via PR #15; revised 2026-06-26 — Plan 2 (Interface spec) shipped via PR #17 + Plan 6 (Mastra shell restructure) added per operator observation; revised 2026-06-26 (Rev 6) — Plan 3 (Housekeeping) expanded with 2 follow-ups from Plan 6 code review; revised 2026-06-26 (Rev 7) — Plan 6 status flipped to DONE (code review approved; merge to main pending); see "Revision notes" at end)
**Slug:** runtime-interface-structure
**Status:** partially executed — Plan 1 (Foundation) shipped 2026-06-25 via PR #15; Plan 2 (Interface spec) shipped 2026-06-25 via PR #17 (per journal `docs/journals/260625-phase-e-plan-2-interface-spec-shipped.md`; git merge commit dated 2026-06-26 local); Plan 6 (Mastra shell restructure) shipped 2026-06-26 on `phase-e/plan-6-shell-restructure` branch (commit 28e3618; journal `docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md`; code review APPROVE WITH FOLLOW-UPS; merge to main pending operator approval). Plan 3 (Housekeeping) expanded with 2 follow-ups from Plan 6 code review (Rev 6). Plans 3/4 still pending.
**Aligned to:** `plans/reports/predict-260624-2025-phase-e-domain-driven-architecture-report.md` (CAUTION verdict) + `plans/reports/productization-260612-1530-master-tracker.md` Phase E
**Technique applied:** Inversion Exercise (per `/problem-solving` skill) — flipped the assumption that "the shim pattern IS the runtime interface" to reveal the missing first-class structure.

---

## The gap I missed in the predict report

My predict report treated the shim pattern as the "runtime interface." That was wrong. **The shim pattern is HOW a runtime satisfies the interface; the interface itself is a separate, first-class concept that does not exist yet as a structure.**

**Evidence of the gap:**

| Today | What it is | What it is NOT |
|---|---|---|
| `.claude/coordination/hooks/{bash,write,inbound}-coordination-gate.cjs` | Claude Code's *implementation* of hook shims | The interface *contract* |
| `.factory/coordination/hooks/{bash,write,inbound}-coordination-gate.cjs` | Droid CLI's *implementation* of hook shims | The interface *contract* |
| (future) `.mastracode/coordination/hooks/*.cjs` | Mastra Code's *implementation* of hook shims | The interface *contract* |
| `runtime-agnostic-checklist.js` (the 6-item gate) | A *validator* that runs against implementations | The interface *spec* (no written spec; the validator IS the spec by example) |

**What is missing:** a place where the operator (or a future runtime implementer) can read "here is what a runtime MUST provide to integrate with the learning loop." Today, the only way to discover the contract is to:
1. Read the `runtime-agnostic-checklist.js` source and infer the 6 items.
2. Read AGENTS.md §2 Hook Matrix and infer the pattern.
3. Read both shim dirs and reverse-engineer the common shape.

This is implicit, fragile, and creates a **structural gap**: the "interface" is a real concept, but it lives only in code, not in spec.

**The inversion applied:** if the shim pattern is the *implementation*, then there must be a *spec* somewhere. The spec does not exist. The work is to create it.

---

## Proposed structure: `interface/` as a first-class concept

**Location:** `tools/learning-loop-mastra/interface/`

**Contents (minimum viable, ~150 LoC + 1 test):**

```
tools/learning-loop-mastra/interface/
├── README.md                  # What "interface" means; why it exists; how it relates to Core and Mastra shell
├── CONTRACT.md                # The 5 requirements a runtime MUST satisfy + verification steps
├── contract.js                # JS module: `validate(runtimeId) → { ok, missing: [], path_map: {} }`
├── RUNTIME_ONBOARDING.md      # Step-by-step: "How to add a new runtime" (checklist + worked example for Mastra Code)
└── __tests__/
    └── contract.test.js       # Validates existing runtimes (claude-code, droid) pass; verifies failure modes
```

**The 5 requirements in the contract** (derived from inverting the existing pattern):

| # | Requirement | What it means | How to verify |
|---|-------------|---------------|---------------|
| 1 | **Hook shim set** | Runtime must provide `coordination/hooks/{bash,write,inbound-state,recurrence-check-on-start}-*.cjs` (or equivalent), each delegating to the universal scripts in `tools/learning-loop-mastra/hooks/legacy/`. (4 shims in current runtimes: `bash-coordination-gate.cjs`, `write-coordination-gate.cjs`, `inbound-state-gate.cjs`, `recurrence-check-on-start.cjs`.) | All 4 shim files exist in the runtime's coordination dir; SHA-256 of each matches the universal script's expected dispatch shape. |
| 2 | **MCP client config** | Runtime must register the loop's `MCPServer` (via `.mcp.json` / `.claude/settings.json` / `.factory/mcp.json` / Mastra Code's `configDir` / etc.). | The config file contains an `mcpServers.learning-loop` entry pointing to `tools/learning-loop-mastra/server.js` (or a future renamed entry). |
| 3 | **Skill spec** | Runtime must provide a `skills/learning-loop/SKILL.md` (or equivalent) describing how to use the loop's MCP tools. | File exists; contains a `tools:` block with at least the `loop_describe` and `meta_state_list` references. |
| 4 | **Identity marker (PROPOSED)** | Runtime SHOULD set a `RUNTIME_ID` env var (or session marker) so the loop can attribute actions and the future write-gate can enforce R2 ownership. **This is the target convention from the hardening plan (LIM-3 caller identity); not yet adopted by `claude-code` or `droid`.** | Validator returns `missing: []` with `note: 'identity-marker-not-adopted'` when `RUNTIME_ID` is unset. Once adopted, the marker enables R2 ownership in the write-gate. The contract spec documents the target so future runtimes ship the marker from day 1. |
| 5 | **Settings integration** | Runtime must configure hook integration in its own settings file (`.claude/settings.json` / `.factory/settings.json` / Mastra Code config). | The settings file references the 4 hook shim paths. |

**Relationship to the 3-layer architecture:**

```
┌──────────────────────────────────────────────────────────────────────┐
│  Runtime (Claude Code / Droid CLI / Mastra Code / future)           │
│  └─ Implements the 5 requirements in CONTRACT.md                    │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ satisfies
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Runtime Interface (FIRST-CLASS STRUCTURE — NEW)                    │
│  tools/learning-loop-mastra/interface/                              │
│  - README.md: what the interface IS                                  │
│  - CONTRACT.md: the 5 requirements                                  │
│  - contract.js: the validator                                       │
│  - RUNTIME_ONBOARDING.md: how to add a runtime                      │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ defines contract for
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Mastra Shell (imperative)                                          │
│  tools/learning-loop-mastra/                                        │
│  - server.js: MCPServer entry                                       │
│  - create-loop-{tool,workflow,agent}.js: factories                  │
│  - workflows/ + agents/: tool/workflow/agent definitions            │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ wraps
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Core (functional)                                                  │
│  tools/learning-loop-mastra/core/                                   │
│  - meta-state.js, gate-logic.js, schemas, etc.                      │
│  - FCIS invariant: zero @mastra/* imports                           │
└──────────────────────────────────────────────────────────────────────┘
```

**Relationship to the existing shim dirs:**

- The shim dirs at `.claude/coordination/hooks/` and `.factory/coordination/hooks/` are the **Claude Code and Droid implementations of Requirement #1 (Hook shim set)**. They stay where they are; the new `interface/` directory does not move them.
- The shim dirs and the new `interface/CONTRACT.md` are linked: the contract says "Requirement #1 = these 4 files exist and have this shape." The shim dirs are the proof that the requirement is met.
- A future Mastra Code integration will satisfy Requirement #1 by creating `.mastracode/coordination/hooks/*.cjs` (or equivalent) — same pattern, new location.

**Why the interface is a separate concept, not a directory under Core or Mastra shell:**

- **Core** = pure logic, zero Mastra imports. The interface spec mentions "MCP server" and "hook shims," which are not pure logic.
- **Mastra shell** = the factories (`createTool` / `createWorkflow` / `createAgent`) and the `MCPServer` entry. The interface spec is *what a runtime must provide to consume* the Mastra shell; it is not the shell itself.
- **Interface** = the contract that runtimes sign by satisfying the 5 requirements. It is the layer between "what we ship" (Core + Mastra shell) and "who runs it" (Runtimes).

This is the missing first-class structure.

---

## Revised Phase E scope (incorporating E.1b: interface structure)

| # | Phase | Scope | Effort | Risk | Resolves open item |
|---|-------|-------|--------|------|-------------------|
| **E.0** | **E3 (close open doc drift)** | Update `.claude/skills/learning-loop/SKILL.md` + `.factory/skills/learning-loop/SKILL.md` to point at the current 44-tool manifest + 6 groups + the new 3-layer architecture + the interface contract. | 1h | None | master tracker E3 |
| **E.1** | **Rename + discipline doc (the actual Phase E work)** | (a) Rename `core/legacy/` → `core/`. (b) Add `core/README.md` with the FCIS invariant: "Core has zero `@mastra/*` imports; the shell may import core." (c) Add `tools/learning-loop-mastra/docs/schemas.md` (the schema doc): 4 meta-state entry kinds, runtime-state shape, wire envelope format, parity contract. (d) Update `AGENTS.md §1` to name the 3 layers explicitly: Core / Mastra shell / Runtime interface. | 0.5 day | Low — no functional change; all 1189 tests continue to pass | user's #2 concern (no schema doc) |
| **E.1b** | **NEW: Define the runtime interface structure (the gap I missed)** | (a) Create `tools/learning-loop-mastra/interface/` directory. (b) Add `interface/README.md` — what "interface" means; why it exists; how it relates to Core and Mastra shell. (c) Add `interface/CONTRACT.md` — the 5 requirements + verification steps. (d) Add `interface/contract.js` — the validator function. (e) Add `interface/RUNTIME_ONBOARDING.md` — step-by-step checklist for adding a new runtime (worked example: Mastra Code). (f) Add `interface/__tests__/contract.test.js` — validates existing runtimes (claude-code, droid) pass the 5 requirements; locks the contract against silent regression. | 1 day | Low — doc + small validator; no behavioral change to existing runtimes | **the gap the user identified in this turn** |
| **E.2** | **R2 as process norm** | Add `AGENTS.md §11` "Runtime interface ownership": "Runtime interface code (`.claude/coordination/hooks/`, `.factory/coordination/hooks/`, future `.mastracode/coordination/hooks/`) is owned by the corresponding runtime agent. Cross-runtime edits require operator approval." Enforce via PR review + branch protection. **Defer the write-gate to a hardening plan that bundles LIM-3 (caller identity).** | 0.5h | None | user's R2 (strict recommendation #2) |
| **E.3** | **Parity-pin label + legacy-pins doc** | (a) Add a one-line comment to `workflows/workflow-intentional-skip.js` flagging it as a parity-test pin (not legacy). (b) Create `tools/learning-loop-mastra/docs/legacy-pins.md` listing all parity-test pins that must not be moved to `legacy/`. | 0.5h | None | user's #1 concern (legacy code) — REFRAMED as "parity-pin, not legacy" |
| **E.4** | **Schema rot cleanup** | Delete `core/legacy/schema-descriptions.yaml` (12 LoC, references Phase-A-deleted records) OR rewrite it to reference the 4 meta-state kinds only. The new `docs/schemas.md` from E.1 is authoritative. | 0.5h | None | prerequisite for any schema-centralization work |
| **E.5** | **E5 + E6: Mastra Code Mode 1 peer MCP, validated against the new contract** | (a) Smoke-test `createMastraCode({ configDir })` from npm `mastracode` against our `MCPServer` over stdio. (b) Satisfy the 5 contract requirements for Mastra Code: create `.mastracode/coordination/hooks/*.cjs`, register MCP client in `configDir`, write `skills/learning-loop/SKILL.md`, set `RUNTIME_ID=mastra-code`, configure settings. (c) Run `interface/contract.js` against the new runtime; expect all 5 requirements met. (d) Confirm the hook layer (`.claude/`, `.factory/`) does not need changes (per `§3.9 Mode 1` — no hook changes). (e) Document Mastra Code hook surface in `docs/agents/mastra-code.md`. | 1–2 days | Low — config + smoke test + contract validation | user's #3 concern (Claude Code ↔ Mastra agent interaction) — REFRAMED as "Mastra Code satisfies the contract" |
| **DEFER (BUNDLED)** | **Hardening plan: LIM-3 caller identity + R2 write-gate + LIM-4 path traversal** | One dedicated hardening plan that bundles the 3 security/identity items. The plan's gate pattern will enforce R2 ownership: per-runtime write allowlist keyed on `RUNTIME_ID` env var. **Phase E ships the process norm (E.2); the hardening plan ships the gate.** | 1–2 weeks | Medium — new gate infrastructure; LIM-3 is high-effort | user confirmed "Bundle" in this turn |

**Total Phase E (E.0–E.5) effort: ~4–5 days.** Replaces the original Phase E scope (~1.5–2 weeks) at ~30% the cost. The bundled hardening plan is parallel — can be authored + shipped alongside Phase E or after, per operator preference.

**Order of operations (locked, per user "E.1 first"):**

```
E.0  →  E.1  →  E.1b  →  E.2  →  E.3  →  E.4  →  E.5
└─┬─┘   └─┬─┘   └──┬──┘   └─┬─┘   └─┬─┘   └─┬─┘   └─┬─┘
  │       │        │        │       │       │       │
  1h     0.5d     1d      0.5h    0.5h    0.5h   1-2d
```

Hardening plan (LIM-3 + R2 gate + LIM-4) is **parallel** — does not block E.0–E.5.

---

## Plan split for execution (meta-pattern: 5 clusters)

The 7 phase items (E.0–E.5) cluster naturally into **4 shippable plans** based on what they touch, what depends on what, and review focus. Plus the 1 deferred hardening plan. **Total: 5 plans.**

**Meta-pattern applied:** the items fall into 5 clusters by *kind of work* (rename, new spec, housekeeping, validation, hardening) — not by the original phase order. Each cluster has a single review focus, ships in its own PR, and has clear preconditions. Meta-pattern recognition: every "phase item" is either *foundation* (sets an invariant), *structure* (creates new first-class), *housekeeping* (closes minor doc debt), *validation* (proves the structure works), or *hardening* (security/identity). One cluster per plan.

| # | Plan | Items | Scope | Effort | Review focus | Precondition | Status |
|---|------|-------|-------|--------|--------------|--------------|--------|
| **1** | **phase-e-foundation** | E.1 | Rename `core/legacy/` → `core/` + add `core/README.md` (FCIS invariant) + add `tools/learning-loop-mastra/docs/schemas.md` + update `AGENTS.md §1` to name the 3 layers. **Pure rename + discipline doc. No new code.** | 0.5d | Mechanical + invariant correctness | None (this is the foundation) | ✅ DONE 2026-06-25 (PR #15) |
| **2** | **phase-e-interface-spec** | E.0 + E.1b | (E.0) Update `.claude/skills/learning-loop/SKILL.md` + `.factory/skills/learning-loop/SKILL.md` to reference the new contract. (E.1b) Create `interface/` with README, CONTRACT.md, contract.js, RUNTIME_ONBOARDING.md, contract.test.js. **The new spec + the docs that point to it.** | ~1.25d | Spec correctness + validator behavior | Plan 1 (FCIS invariant) | ✅ DONE 2026-06-25 (PR #17; journal dated 2026-06-25; git merge 2026-06-26 02:37 local) |
| **3** | **phase-e-housekeeping** | E.2, E.3, E.4, **Rev 6: Plan 6 follow-ups I-1 + I-2** | (E.2) Add `AGENTS.md §11` for R2 ownership. (E.3) Parity-pin label on `workflow-intentional-skip.js` + `docs/legacy-pins.md`. (E.4) Delete or rewrite `core/legacy/schema-descriptions.yaml`. **(Rev 6 / I-1)** Fix `tools/learning-loop-mastra/core/README.md` lines 26/27/46 stale pre-move path references + extend `external-refs-updated.test.js` SEARCH_PATHS to include `tools/learning-loop-mastra/core/` + add `create-loop-\*\\.js` glob pattern to FORBIDDEN_PATH_PATTERNS (closes the regression guard gap surfaced in Plan 6 code review). **(Rev 6 / I-2)** Run `meta_state_re_verify` for entry `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` with `META_STATE_VERIFY_EXEC=1` to transition `stale → active` (the fingerprint is grounded; only the status lifecycle is open per Plan 6 code review). **3 small doc/process changes + 2 follow-ups bundled to avoid PR overhead.** | ~2h (was ~1.5h) | Doc accuracy + regression guard extension (low risk) | Plan 1 (FCIS invariant) | 🔵 OPEN (Plan 1 done; can run in parallel with Plan 2 + Plan 6) |
| **6** | **phase-e-shell-restructure** | **NEW (Rev 5): E.6** | Move `tools/learning-loop-mastra/{server.js, create-loop-{tool,workflow,agent}.js, legacy-handler-adapter.js, schema-parity.js, schemas.js, workflows/, agents/}` into `tools/learning-loop-mastra/mastra/`. Update `AGENTS.md §1.1` line 20-22 to reflect the new location. Update `interface/contract.js` Requirement #2 `args` check from `tools/learning-loop-mastra/server.js` → `tools/learning-loop-mastra/mastra/server.js`. Update ~10-15 import-bearing files + add 1 regression guard test. **Makes Layer 2 actually first-class.** | ~1-1.5d | Mechanical move + path invariant correctness | Plan 2 (interface spec must exist, so the contract `args` check is the path source-of-truth) | ✅ DONE 2026-06-26 (commit 28e3618 on `phase-e/plan-6-shell-restructure`; journal dated 2026-06-26; code review APPROVE WITH FOLLOW-UPS; merge to main pending operator approval — see Rev 7) |
| **4** | **phase-e-mastra-code-validation** | E.5 | Smoke-test `createMastraCode({ configDir })` from npm `mastracode` against the new MCPServer. Satisfy the 5 contract requirements for Mastra Code. Run `interface/contract.js mastra-code` → expect `{ok: true}`. Document in `docs/agents/mastra-code.md`. **The worked example that proves the onboarding flow works.** | 1–2d | Config + smoke test + contract validation | Plan 2 (interface spec) + Plan 6 (shell paths must be stable before the contract is exercised) | 🔵 OPEN (Plan 6 DONE; dependency satisfied; ready to start) |
| **5** | **hardening-r2-lim3-lim4 (DEFERRED)** | LIM-3 + R2 + LIM-4 | Bundled hardening plan: (1) `RUNTIME_ID` env var convention + runtime-marker reader. (2) R2 write-gate (per-runtime write allowlist). (3) Path traversal fix in `meta_state_refresh_fingerprint`. **Per user "Bundle" decision.** Parallel to Phase E. | 1–2w | Security + identity primitive correctness | None — can ship in parallel or after Phase E | 🔵 OPEN (parallel dimension) |

**Total Phase E (Plans 1–4 + Plan 6) effort: ~5–6 days** (was ~4–5 days; +~1d for Plan 6 shell restructure). **Total with hardening (Plans 1–6 + 5): ~3–4 weeks** if hardening is included.

**Updated order of operations (plan-level):**

```
Plan 1 (Foundation)         0.5d  [DONE]
  │
  ├──→ Plan 2 (Interface)   1.25d  [DONE]
  │       │
  │       └──→ Plan 6 (Shell restructure)  ~1-1.5d  [DONE — Rev 7; merge to main pending]
  │               │
  │               └──→ Plan 4 (Mastra Code)  1-2d
  │
  └──→ Plan 3 (Housekeeping)  ~2h (was 1.5h pre-Rev-6; +0.5h for Plan 6 follow-ups)  [parallel to Plan 2 + Plan 6]

Plan 5 (Hardening)          1-2w  [parallel to all of the above]
```

**Why this split and not alternatives:**

- **Why not 1 big Phase E plan?** A 4–5 day single-PR plan is hard to review and hard to roll back. Each plan is small enough to be reviewed in a single sitting (≤2 days of work, ≤300 LoC change).
- **Why not 7 plans (one per item)?** Overhead. E.0 + E.1b share the same review focus (the new spec) and E.0 is meaningless without E.1b (SKILL.md updates point to the new contract). E.2/E.3/E.4 are all <1h doc changes — bundling saves 2 PRs.
- **Why not bundle Plan 1 + Plan 2?** They have different review focus. Plan 1 is "rename + invariant" (mechanical); Plan 2 is "new spec + validator" (design). Splitting lets the Plan 2 reviewer focus on the interface contract without re-reviewing the rename.
- **Why is hardening a separate plan (not in Phase E)?** Per user "Bundle" decision. The hardening items are security/identity primitives; they belong in a dedicated review context, not mixed with the Phase E doc/structure work.
- **Why is Plan 6 (Shell restructure) between Plan 2 and Plan 4?** The interface contract (Plan 2) hardcodes the path `tools/learning-loop-mastra/server.js` in Requirement #2's `args` check. Plan 4 (Mastra Code validation) exercises the contract; if Plan 6 ships AFTER Plan 4, Plan 4 tests against the pre-move layout and the contract path becomes stale. If Plan 6 ships BEFORE Plan 4, Plan 6 also updates the contract `args` check, and Plan 4 exercises the post-move layout. **Forward path (Plan 6 → Plan 4) keeps the contract path source-of-truth in one PR.**

**Plan dir naming convention** (per project rule `plans/<timestamp>-<descriptive-slug>/`):

```
plans/260624-2335-phase-e-foundation/         [DONE 2026-06-25, PR #15]
plans/260625-1618-phase-e-interface-spec/     [DONE 2026-06-25, PR #17]
plans/260626-0302-phase-e-shell-restructure/  [DONE 2026-06-26, commit 28e3618; merge to main pending — Rev 7]
plans/260625-0930-phase-e-housekeeping/       [pending; parallel to Plan 6 + can start now]
plans/260625-0930-phase-e-mastra-code-validation/  [pending; depends on Plan 6 DONE — ready to start]
plans/260701-0930-hardening-r2-lim3-lim4/     (deferred; parallel)
```

(Dates are illustrative — actual plan dates set when each plan is authored.)

**Plan 3 (Housekeeping) can ship immediately after Plan 1** without waiting for Plan 2. This means a fast-feedback path: ~0.5d (Plan 1) + ~2h (Plan 3, parallelizable; was 1.5h pre-Rev-6, +0.5h for the 2 Plan 6 follow-ups) = the housekeeping items can land within a day of Plan 1. Plan 2 takes longer (1.25d) but unblocks Plan 4. Plan 4 (Mastra Code) is the slowest and may need `mastracode` npm install + smoke-test debugging.

---

## What shipped in Plan 1 (Foundation) — 2026-06-25

**Shipped via PR #15** (`phase-e/plan-1-foundation` → `main`, merged 2026-06-25). Plan dir: `plans/260624-2335-phase-e-foundation/`. Journal: `docs/journals/260625-phase-e-plan-1-review-fixes.md`. Master tracker: see the deferred-items table for the new `Plan-1/Plan-2/Plan-3/Plan-4` rows.

| What | Where | Commit |
|------|-------|--------|
| Plan + scope doc | `plans/260624-2335-phase-e-foundation/plan.md` | `08decb3` |
| Rename `core/legacy/` → `core/` (~129 import-bearing files) | `tools/learning-loop-mastra/core/` (new top-level) | `bb8af08` |
| FCIS invariant doc | `tools/learning-loop-mastra/core/README.md` | `66db796` |
| Schema doc (4 kinds + runtime-state + wire envelope + parity) | `tools/learning-loop-mastra/docs/schemas.md` | `6083959` |
| 3-layer AGENTS.md §1 (Core / Mastra shell / Runtime interface) | `AGENTS.md` §1.1 | `0f17814` |
| 7-fingerprint repoint (1 atomic batch op) | `meta-state.jsonl` (7 finding `evidence_code_ref` paths updated) | `49d6f7b` |
| Sibling existence test for the 7 repointed paths | `plans/260624-2335-phase-e-foundation/__tests__/fingerprint-repoint-existence.test.js` | `73f9ec5` (post-review fix) |
| 4 phase-e-foundation regression guards | `tools/learning-loop-mastra/__tests__/phase-e-foundation/{fcis-invariant,no-core-legacy-refs,schema-doc-exists,agents-section-1-layers}.test.js` | `66db796` + `0f17814` + `6083959` |
| 1 new finding filed (post-review) | `meta-260625T0255Z-the-meta-state-batch-mcp-tool-bypasses-the-immutable-patch-f` (`category: mcp-tool-missing`, `status: reported`) | `f5a28bb` (post-review fix) |
| 1 follow-up deny-list fix (PR #16) | `core/meta-state.js` (`IMMUTABLE_PATCH_FIELDS` moved to core + batch deny-list check); `tools/legacy/meta-state-patch-tool.js` (re-export for back-compat); 2 new tests in `__tests__/legacy-mcp/meta-state-batch-tool.test.js` | `7fa608a` (PR #16, post-Plan-1) |

**Net registry delta (PR #15 + #16):**
- 1 new finding filed (`meta-260625T0255Z-...`, `status: reported → active → resolved` across the two PRs)
- 9 fingerprints refreshed (7 repointed + 2 cold-tier drift from the deny-list fix)
- 0 entries archived, 0 superseded
- 7 new test files (4 phase-e-foundation regression guards + 1 fingerprint-repoint-existence + 2 batch deny-list tests; 1 of the 7 is plan-specific and run manually)
- 1 journal entry (review-fixes)
- 1 plan frontmatter field updated (`status: pending → done`)

**Net source delta:**
- 1 directory renamed (`core/legacy/` → `core/`)
- 1 doc added (`core/README.md`, 30 LoC)
- 1 doc added (`docs/schemas.md`, ~190 LoC)
- 1 section added to existing doc (`AGENTS.md §1.1`, 35 LoC)
- 1 deny-list enforcement added to `core/meta-state.js` + 1 re-export in `tools/legacy/meta-state-patch-tool.js`

**What this plan did NOT ship (deferred to Plan 2/3/4):**
- The `interface/` directory (Plan 2 / E.1b) — 5-requirement contract + validator + onboarding guide
- The skill spec update (Plan 2 / E.0) — `SKILL.md` files in `.claude/` and `.factory/`
- R2 ownership in `AGENTS.md §11` (Plan 3 / E.2) — process norm only; gate ships in hardening plan
- Parity-pin label on `workflow-intentional-skip.js` (Plan 3 / E.3) + `docs/legacy-pins.md`
- Schema rot cleanup (Plan 3 / E.4) — `core/legacy/schema-descriptions.yaml` still exists; E.4 will delete or rewrite
- Mastra Code onboarding (Plan 4 / E.5) — depends on Plan 2's contract
- Hardening (Plan 5, parallel) — LIM-3 + R2 write-gate + LIM-4
- **NEW Rev 5:** Mastra shell restructure (Plan 6 / E.6) — move shell files from top-level → `mastra/` subdir (added after operator observed inconsistency between report diagram and reality)

---

## What shipped in Plan 2 (Interface spec) — 2026-06-25

**Shipped via PR #17** (`phase-e/plan-2-interface-spec` → `main`, merged 2026-06-25 per journal `docs/journals/260625-phase-e-plan-2-interface-spec-shipped.md`; git merge commit dated 2026-06-26 02:37 local). Plan dir: `plans/260625-1618-phase-e-interface-spec/`. Status flipped to ✅ DONE.

| What | Where | Notes |
|------|-------|-------|
| `interface/` directory created | `tools/learning-loop-mastra/interface/` | First-class Runtime Interface layer (Layer 3) |
| `interface/README.md` (~120 LoC) | `interface/` | Layer description + 5-requirement at-a-glance + how-to-use |
| `interface/CONTRACT.md` | `interface/` | 5 requirements + verification predicates |
| `interface/contract.js` (~160 LoC) | `interface/` | `validate(runtimeId, rootPath?)` + `validateAll(ids)` + CLI mode + `--list` flag |
| `interface/RUNTIME_ONBOARDING.md` (~110 LoC) | `interface/` | 5-req checklist + Mastra Code worked example |
| `interface/__tests__/contract.test.js` (~140 LoC) | `interface/__tests__/` | 24 tests in 5 groups (structural, pass-mode, per-requirement, fail-mode, golden) |
| `__tests__/interface/runtimes-pass-contract.test.js` | `tools/learning-loop-mastra/__tests__/interface/` | 5 tests with deeper assertions on real `.claude/` and `.factory/` |
| 5 regression guard tests | `tools/learning-loop-mastra/__tests__/interface/*.test.js` | interface-dir-exists, contract-md-exists, contract-js-exports-validate, skill-md-references-tools, runtimes-pass-contract |
| SKILL.md updates | `.claude/skills/learning-loop/SKILL.md` + `.factory/skills/learning-loop/SKILL.md` | +13 LoC net each; references `loop_describe` + `meta_state_list` + `interface/CONTRACT.md` |
| 2 new test GLOB entries | `tools/scripts/run-pnpm-test-namespaced.mjs` | `interface-regression-guards` + `interface-contract-tests` namespaces |

**Net registry delta (PR #17):**
- 1 `meta_state_log_change` filed (per Plan 2 acceptance criteria)
- 0 new findings
- 0 archived, 0 superseded
- 7 new test files (5 regression guards + 1 contract test + 1 runtimes-pass-contract test)
- 0 journal entries (single change-log per ship-time convention; deviation notes via `meta_state_report`)

**Net source delta:**
- 1 new directory (`interface/`, ~530 LoC production + ~140 LoC tests)
- 2 SKILL.md updates (`.claude/` + `.factory/`)
- 1 test runner GLOB update (2 new namespaces)
- 0 core logic changes

**Verification at merge (PR #17):**
- All existing tests still pass; 29 new tests pass (5 regression guards + 24 contract tests)
- `node tools/learning-loop-mastra/interface/contract.js claude-code` → `{ok: true, missing: [], notes: ["identity-marker-not-adopted"]}` (exit 0)
- `node tools/learning-loop-mastra/interface/contract.js droid` → same shape (exit 0)
- `node tools/learning-loop-mastra/interface/contract.js mastra-code` → `{ok: false, missing: [4 — hook-shim-set, mcp-client-config, skill-spec, settings-integration], notes: ["identity-marker-not-adopted"]}` (exit 1)
- Red-team review (Failure Mode Analyst + Assumption Destroyer) → 18 findings (3 Critical, 4 High, 11 Medium); 11 applied + 7 accepted with notes; 0 rejected

**What this plan did NOT ship (deferred to Plan 3/4/6):**
- R2 ownership in `AGENTS.md §11` (Plan 3 / E.2) — process norm only; gate ships in hardening plan
- Parity-pin label on `workflow-intentional-skip.js` (Plan 3 / E.3) + `docs/legacy-pins.md`
- Schema rot cleanup (Plan 3 / E.4) — `core/legacy/schema-descriptions.yaml` still exists; E.4 will delete or rewrite
- **NEW Rev 5:** Mastra shell restructure (Plan 6 / E.6) — move shell files from top-level → `mastra/` subdir
- Mastra Code onboarding (Plan 4 / E.5) — depends on Plan 6 (shell restructure) for stable paths
- Hardening (Plan 5, parallel) — LIM-3 + R2 write-gate + LIM-4

**Verification at merge (PR #15):**
- All 10 test namespaces pass (~1188 tests, 0 fail, 1 skip; baseline preserved)
- `meta_state_check_grounding` on the 7 repointed findings → `status: grounded, hash match`
- `node --test plans/260624-2335-phase-e-foundation/__tests__/fingerprint-repoint-existence.test.js` → 3/3 pass
- Red-team review (3 hostile reviewers) → 5 critical findings applied; all resolved before merge

**Constraint addressed:** `meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each`. The plan's Phase 6 worked around the O(N) mechanism by using `meta_state_batch` to repoint 7 findings in 1 atomic call. The shared file-index design (the O(1) direction) is still parked as a `loop-design` entry; not in this plan.

---

## What shipped in Plan 6 (Mastra shell restructure) — 2026-06-26

**Shipped on `phase-e/plan-6-shell-restructure` branch (commit `28e3618`; merge to `main` pending operator approval per Rev 7).** Plan dir: `plans/260626-0302-phase-e-shell-restructure/`. Journal: `docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md`. Code review report: `plans/260626-0302-phase-e-shell-restructure/reports/code-reviewer-260626-0534-GH-6-phase-e-plan-6-shell-restructure-report.md`. Status flipped to ✅ DONE (Rev 7).

| What | Where | Commit |
|------|-------|--------|
| 11 shell file-groups moved (`git mv` preserves rename history) | `tools/learning-loop-mastra/{server.js, create-loop-{tool,workflow,agent}.js, legacy-handler-adapter.js, schema-parity.js, schemas.js} + workflows/ + agents/ + workflows-manifest.json + agents-manifest.json` → `tools/learning-loop-mastra/mastra/` | `28e3618` |
| 8 internal cross-layer imports updated for new relative paths | `mastra/server.js` → `../storage.js`; `mastra/schemas.js` → `../tools/legacy/...`; `mastra/agents/run-scout-tool.js` → `../../scout/legacy/run-scout.js`; etc. | `28e3618` |
| ~31 external path references updated | `.mcp.json`, `.factory/mcp.json`, `package.json:gate:server`, `interface/contract.js:94`, `interface/CONTRACT.md`, `interface/README.md`, `interface/RUNTIME_ONBOARDING.md`, `AGENTS.md §1.1`, `.claude/coordination/MASTRA_AGENT_MODEL.md`, `docs/mcp-server-restart-protocol.md`, `docs/mcp-tool-schema-architecture.md`, `docs/project-changelog.md`, `.claude/skills/coordination-gate/SKILL.md`, `.factory/skills/coordination-gate/SKILL.md`, etc. | `28e3618` |
| 12 test files updated for new paths | `workflow-direct-parity.test.js`, `agent-direct-parity.test.js`, `agent-prompt-content.test.cjs`, `storage-parity.test.cjs` (relative imports `../workflows/` → `../mastra/workflows/`, `../agents/` → `../mastra/agents/`); `SERVER_ENTRY` references in 4 tests; manifest-arithmetic + fixtures-shape + coerce-correctness + server-name-rename exclusion; create-loop-agent/workflow dynamic imports; inbound-state-gate + gate-integration + meta-state-list-id-stdio + refresh-fingerprints script | `28e3618` |
| `interface/contract.js:94` endsWith literal updated | `tools/learning-loop-mastra/server.js` → `tools/learning-loop-mastra/mastra/server.js` | `28e3618` |
| `AGENTS.md §1.1` lines 20-22 updated | Shell layer now says "Lives at `tools/learning-loop-mastra/mastra/`" (was "top level"); path-invariant sentence added (D9) | `28e3618` |
| 6 regression guards added | `__tests__/phase-e-shell-restructure/{shell-files-in-mastra-dir, no-top-level-shell-files, external-refs-updated, agents-md-layer-locations, meta-state-fingerprints-repointed, test-relative-imports}.test.js` (11 tests) | `28e3618` |
| 13th test GLOB added | `tools/scripts/run-pnpm-test-namespaced.mjs`: `phase-e-shell-restructure` namespace; header comment updated (H8 fix) | `28e3618` |
| 9 meta-state entries repointed via `meta_state_batch` (1 atomic call) | `meta-state.jsonl`: 9 entries' `evidence_code_ref` + `change_target` + `applies_to.schemas` fields updated (entry #6 preserves all 3 schema refs per F5 fix); 2 fingerprints refreshed for modified `run-pnpm-test-namespaced.mjs` entries | `28e3618` |
| `meta_state_log_change` filed | Entry `meta-260626T0523Z-plans-260626-0302-phase-e-shell-restructure-plan-md` | `28e3618` |
| Cold-cache deleted + regenerated | `records/meta/.cache/loop-describe-cold.json` deleted post-move; next cold-tier read regenerated with 25 post-move path strings (0 stale) | (regenerated) |
| Journal entry | `docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md` (4202 bytes) | (post-commit) |
| Code review report | `plans/260626-0302-phase-e-shell-restructure/reports/code-reviewer-260626-0534-GH-6-phase-e-plan-6-shell-restructure-report.md` (APPROVE WITH FOLLOW-UPS) | (post-commit) |

**Net registry delta (Plan 6):**
- 1 `meta_state_log_change` filed (`meta-260626T0523Z-...`)
- 0 new findings (the 2 follow-ups were folded into Plan 3 per Rev 6)
- 9 meta-state entries repointed; 2 fingerprints refreshed
- 6 new regression guards (11 new tests)
- 0 archived, 0 superseded

**Net source delta:**
- 1 new directory created (`mastra/`)
- 11 file-groups renamed (rename-only; no logic edits, no dependency updates)
- 8 internal import paths updated
- ~31 external path references updated across configs + tests + hooks + docs + skill MDs
- 1 section updated in `AGENTS.md §1.1` (lines 20-22 + path-invariant sentence)
- 1 literal updated in `interface/contract.js:94`
- 1 test GLOB added to `run-pnpm-test-namespaced.mjs`

**Verification at ship (Plan 6):**
- All 13 test namespaces GREEN (phase-e-shell-restructure: 11/11 pass; suite: `==> pass (13 globs, 26.22s)`)
- 3 contract smoke tests pass: `claude-code` → `{ok: true, missing: []}` (exit 0); `droid` → `{ok: true, missing: []}` (exit 0); `mastra-code` → `{ok: false, missing: [hook-shim-set, mcp-client-config, skill-spec, settings-integration]}` (exit 1)
- `meta_state_check_grounding` on the 9 repointed entries → `status: grounded, hash match` (verified by sha256sum for entry #9: `a4921a9418784b238b60fc94e2e1b5777934c0a5b308330eb4a405c0a498b8f7` matches the new file content — `git mv` preserves bytes)
- Code review verdict: **APPROVE WITH FOLLOW-UPS** (Stage 1 spec compliance: 16/17 PASS; Stage 2 code quality: APPROVE; 2 follow-ups folded into Plan 3 per Rev 6)

**What this plan did NOT ship (deferred to Plan 3 / Plan 4):**
- **`tools/learning-loop-mastra/core/README.md` lines 26/27/46 doc drift fix** (Plan 3 / Rev 6 I-1) — regression guard SEARCH_PATHS gap
- **Entry #9 `meta_state_re_verify` to `active`** (Plan 3 / Rev 6 I-2) — fingerprint is grounded; status lifecycle deferred per `META_STATE_VERIFY_EXEC=1` env var requirement
- Mastra Code onboarding (Plan 4 / E.5) — Plan 6's stable contract path unblocks Plan 4
- Hardening (Plan 5, parallel) — LIM-3 + R2 write-gate + LIM-4

**Cross-references (Plan 6):**
- Plan: `plans/260626-0302-phase-e-shell-restructure/plan.md` (status: pending → done on merge)
- Phase files: `phase-01-baselineandtests.md` through `phase-05-verifyandchangelog.md`
- Test files: `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js` (6 files)
- Production files: 11 file-groups renamed to `tools/learning-loop-mastra/mastra/`
- Code review report: `plans/260626-0302-phase-e-shell-restructure/reports/code-reviewer-260626-0534-GH-6-phase-e-plan-6-shell-restructure-report.md`
- Contract smoke reports: `plans/260626-0302-phase-e-shell-restructure/reports/contract-{claude-code,droid,mastra-code}.json`
- Pre-move baselines: `pre-move-baseline.json`, `pre-move-external-refs.txt`, `pre-repoint-meta-state-lines.txt`
- Journal: `docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md`

---

## The 3 resolved decisions (applied to the new scope)

### Decision 1: Git branches OK for now (R2 ownership)

**Per user this turn:** "Git branches is ok for now"

**Applied to Phase E:**

- R2 ownership is enforced via **PR review + branch protection** at the repository level. The convention: each runtime agent works on its own branch (e.g., `claude-code/interface-v2`, `mastra-code/interface-v1`); cross-runtime edits require operator approval.
- **No new write-gate in Phase E.** The gate ships in the bundled hardening plan (LIM-3 + R2 gate + LIM-4).
- **AGENTS.md §11** (E.2) codifies the branch convention: "Runtime interface code is owned by the corresponding runtime agent. Cross-runtime edits require operator approval." This is a process norm, not a gate.
- **Why defer the gate:** the gate requires LIM-3 (caller identity) to ship first. LIM-3 is a security/identity primitive that does not exist today; adding it is a 1–2 week hardening effort, separate from Phase E.

### Decision 2: Bundle LIM-3 + R2 write-gate (+ LIM-4 path traversal)

**Per user this turn:** "Bundle"

**Applied to Phase E:**

- One **bundled hardening plan** (post-Phase E) ships:
  1. **LIM-3**: caller identity primitive (`RUNTIME_ID` env var convention; runtime-marker reader in `core/legacy/`)
  2. **R2 write-gate**: per-runtime write allowlist in `write-gate.js`, keyed on `RUNTIME_ID`. Pattern: runtime X can write to `runtime/<X>/**` + the universal Core+Mastra shell (with operator approval for cross-runtime edits). Other runtimes' directories are blocked.
  3. **LIM-4**: path traversal fix in `meta_state_refresh_fingerprint` and other tools that use `join(root, user_path)`.
- The 3 items share infrastructure (env var reader + gate pattern + path-allowlist helper) — bundling saves ~30% effort vs 3 separate plans.
- The hardening plan is **parallel to Phase E**: it does not gate E.0–E.5; it can ship after Phase E or alongside it.
- **Why bundle:** the user's "Bundle" decision is correct because the 3 items share the runtime-identity primitive. Implementing LIM-3 alone gives caller identity; using it for the R2 gate is a small extension; using it for LIM-4's path-allowlist is a similar small extension. Three plans = three rounds of design+code+test+review; one plan = one round.

### Decision 3: E.1 first (rename + doc before everything else)

**Per user this turn:** "E.1 first"

**Applied to Phase E:**

- E.1 is the first step after E.0 (the doc-drift closeout). The order is: **E.0 (1h) → E.1 (0.5d) → E.1b (1d) → E.2 (0.5h) → E.3 (0.5h) → E.4 (0.5h) → E.5 (1–2d)**.
- **Why E.1 first:** E.1 codifies the FCIS invariant for Core and the schema doc. E.1b (the new interface structure) depends on E.1's discipline doc (FCIS for Core) to position the interface layer correctly. Without E.1, E.1b's `interface/README.md` would lack the 3-layer context.
- **Why E.0 first:** E.0 closes the open E3 item (skill doc drift) so that E.1's discipline doc and E.1b's interface spec reference up-to-date skills.

---

## What the 3-layer architecture looks like after Phase E (post-Plan-6)

```
tools/learning-loop-mastra/
├── core/                              # Layer 1: FUNCTIONAL CORE (FCIS) — ships in Plan 1
│   ├── README.md                      # FCIS invariant: zero @mastra/* imports
│   ├── meta-state.js
│   ├── gate-logic.js
│   ├── surfaces.js                    # the SURFACES source of truth
│   ├── runtime-agnostic-checklist.js  # the 6-item gate
│   ├── field-drift-exceptions.yaml    # SP2 drift exceptions
│   └── ...                            # pure logic; shell may import
│
├── mastra/                            # Layer 2: MASTRA SHELL (imperative) — ships in Plan 6 (NEW Rev 5)
│   ├── server.js                      # MCPServer entry
│   ├── create-loop-tool.js            # factory: wraps core logic in createTool
│   ├── create-loop-workflow.js        # factory: wraps core logic in createWorkflow
│   ├── create-loop-agent.js           # factory: wraps core logic in createAgent
│   ├── schemas.js                     # mastra-specific schema exports
│   ├── workflows/                     # workflow definitions (10 + 1 parity-pin)
│   ├── agents/                        # agent definitions (3)
│   ├── tools/legacy/                  # legacy tool files (30+; kept for parity; NOT core)
│   ├── legacy-handler-adapter.js      # legacy → Mastra adapter
│   ├── schema-parity.js               # wire-format parity contract
│   └── ...                            # the imperative shell
│
├── interface/                         # Layer 3: RUNTIME INTERFACE — ships in Plan 2 [DONE]
│   ├── README.md                      # what "interface" means
│   ├── CONTRACT.md                    # the 5 requirements
│   ├── contract.js                    # validator: validate(runtimeId) → {ok, missing[]}
│   ├── RUNTIME_ONBOARDING.md          # how to add a new runtime
│   └── __tests__/
│       └── contract.test.js           # locks existing runtimes; verifies failure modes
│
├── docs/
│   ├── schemas.md                     # NEW: the schema doc (4 kinds + wire envelope + parity) — Plan 1
│   ├── legacy-pins.md                 # NEW: parity-test pins that must not be moved — Plan 3
│   └── agents/
│       └── mastra-code.md             # NEW: Mastra Code hook surface + config — Plan 4
│
├── hooks/legacy/                      # Universal hook scripts (referenced by shim dirs)
│   ├── bash-gate.js
│   ├── write-gate.js
│   ├── inbound-gate.js
│   └── lib/protocol-adapter.js
│
└── data/                              # LibSQL storage (Mastra runtime substrate)
    └── mastra-memory.db
```

**Pre-Plan-6 (current actual) state — note the inconsistency:**

```
tools/learning-loop-mastra/
├── server.js                          # ⚠️ Shell code at TOP LEVEL (not in mastra/)
├── create-loop-{tool,workflow,agent}.js  # ⚠️ Shell code at TOP LEVEL
├── legacy-handler-adapter.js          # ⚠️ Shell code at TOP LEVEL
├── schema-parity.js                   # ⚠️ Shell code at TOP LEVEL
├── schemas.js                         # ⚠️ Shell code at TOP LEVEL
├── workflows/                         # ⚠️ Shell code at TOP LEVEL
├── agents/                            # ⚠️ Shell code at TOP LEVEL
├── core/                              # Layer 1
├── interface/                         # Layer 3 [DONE Plan 2]
├── docs/
├── hooks/legacy/
└── data/
```

**Pre-Plan-6 state was codified by AGENTS.md §1.1 line 20-22** (shipped in Plan 1): "Mastra shell (imperative). Lives at `tools/learning-loop-mastra/` (top level): `server.js`, `create-loop-{tool,workflow,agent}.js`, `workflows/`, `agents/`, `tools/`." This made Layer 2 *conceptually* first-class but *physically* mixed with non-shell files. **Plan 6 (Rev 5) physically moves shell code into `mastra/` to match the conceptual layer.**

**Runtime-specific code (unchanged location):**

```
.claude/                               # Claude Code's implementation of CONTRACT.md
├── coordination/hooks/*.cjs           # Requirement #1 (hook shim set)
├── settings.local.json                # Requirement #2 (MCP client config) + #5 (settings)
└── skills/learning-loop/SKILL.md      # Requirement #3 (skill spec)

.factory/                              # Droid CLI's implementation of CONTRACT.md
├── coordination/hooks/*.cjs
├── settings.json
├── mcp.json
└── skills/learning-loop/SKILL.md

.mastracode/                           # Mastra Code's implementation (NEW in E.5)
├── coordination/hooks/*.cjs
├── configDir/                         # createMastraCode({ configDir }) target
└── skills/learning-loop/SKILL.md

AGENTS.md                              # Operator-facing spec for all runtimes
├── §1 — meta-surface (canonical, all runtimes)
├── §2 — hook matrix (per-runtime implementation)
├── §11 — runtime interface ownership (NEW in E.2)
```

**Key insight:** the 3 layers (Core, Mastra shell, Runtime interface) are **all first-class**. The shim dirs are the *evidence* that the contract is met; the `interface/` directory is the *spec* of the contract. Without the spec, the contract is implicit and fragile.

---

## Risks and tradeoffs

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | The `interface/` directory adds a new top-level concept; future plans may under-use it or over-formalize it | Low | Keep E.1b to ~150 LoC + 1 test; resist the urge to add a registry, schema-validation, or auto-discovery. The contract is a doc, not a runtime enforcement (enforcement ships in the bundled hardening plan). |
| R2 | The 5 contract requirements may not be the right shape; future runtimes may need a 6th or 7th requirement | Low | The contract is a Markdown doc; amendments are PR-sized. The validator (`contract.js`) is a separate file; adding a 6th requirement is a 5-line change. |
| R3 | The bundled hardening plan is 1–2 weeks; the user may want Phase E to ship without waiting for it | Low (intentional) | Phase E ships the process norm (E.2); the bundled hardening plan is parallel and does not block E.0–E.5. |
| R4 | The `interface/contract.js` validator may become a load-bearing gate that, if buggy, blocks runtime onboarding | Medium | Validator is a pure function (no I/O); tests cover both pass and fail modes. If buggy, operators can bypass it manually with operator override (matches the existing `gate_override` MCP tool pattern). |
| R5 | R2 ownership via branch protection may be insufficient; a misconfigured branch protection allows cross-runtime edits | Low | AGENTS.md §11 (E.2) codifies the convention; PR review is the primary enforcement; the bundled hardening plan adds the gate for the security-critical case. |
| R6 | The "no dedicated structure for 'interface'" gap is bigger than the user described; there may be other missing first-class structures (e.g., storage, identity, observability) that I have not surfaced | Medium | **Open question for the user** — see below. The current report scopes Phase E to the 3 layers (Core / Mastra shell / Runtime interface). If other first-class structures are missing, they may need their own phases. |

---

## Open questions for the operator

1. **Is the 5-requirement contract complete?** The proposed contract has 5 requirements: (1) hook shim set, (2) MCP client config, (3) skill spec, (4) identity marker, (5) settings integration. Are there other requirements a runtime must satisfy? (Examples to consider: observability hook, error-reporting endpoint, license-attribution file.)
2. **Should `interface/contract.js` be enforced at hook-time (e.g., a `interface-validate` hook that runs on session start) or only at onboarding-time (one-shot check when adding a new runtime)?** Recommend: onboarding-time only; runtime check is a perf hit and the contract is stable.
3. **Should Phase E ship the bundled hardening plan as a follow-up, or in parallel with the 3-layer work?** Recommend: parallel; the hardening plan does not block E.0–E.5 and can ship in the next quarter.
4. **Are there other first-class structures missing?** The user identified the "interface" gap; the same inversion exercise may surface others (e.g., is there a dedicated structure for "the substrate" — the vendor APIs the loop operates against? is there a dedicated structure for "the audit trail" — beyond `meta-state.jsonl`?). Recommend: a separate `/problem-solving` session to surface any other missing first-class structures before Phase E begins.
5. **The "interface" rename collision:** the AGENTS.md already uses the word "interface" in §2 "Protocol Adapter" (a different concept — the I/O adapter for tool name differences). Should the new structure be named `interface/` (overloading) or `runtime-interface/` (more specific)? Recommend: `interface/` for KISS; document the distinction in `interface/README.md` ("`interface/` = the runtime-to-loop contract; `protocol-adapter` = the loop-to-tool-name I/O adapter — different concepts").
6. **E.5 (Mastra Code Mode 1) timing:** ship in Phase E, or as a follow-up after E.1b validates the contract shape? Recommend: ship in Phase E. E.1b's `RUNTIME_ONBOARDING.md` is most useful when there is a worked example (Mastra Code) — shipping E.5 in the same phase proves the onboarding flow works.
7. **NEW Rev 5: Plan 6 (Mastra shell restructure) sequencing.** Should Plan 6 ship BEFORE Plan 4 (Mastra Code validation) so the contract `args` path is updated in one place, or AFTER Plan 4 (so Plan 4 tests against the pre-move layout and Plan 6 becomes a cleanup PR)? **Recommend: Plan 6 BEFORE Plan 4.** Rationale: the `interface/contract.js` Requirement #2 `args` check hardcodes `tools/learning-loop-mastra/server.js`. If Plan 6 ships first, Plan 6 also updates the contract path to `tools/learning-loop-mastra/mastra/server.js` (one source-of-truth for the path). If Plan 6 ships after Plan 4, Plan 4 tests against a path that becomes stale the next day, and Plan 6 must re-update the contract. Plan 6 → Plan 4 is the cleaner dependency.
8. **NEW Rev 5: Plan 6 scope — `schemas.js` inclusion.** Should Plan 6 also move `tools/learning-loop-mastra/schemas.js` into `mastra/`? `schemas.js` is the Mastra-specific Zod schema re-exports (used by `server.js` to register tools). Moving it keeps `mastra/` self-contained for "what the shell needs to register" but adds ~5 LoC to the plan. **Recommend: include it.** The shell dir should contain everything the shell needs to start, including its schema surface.

---

## What I am NOT changing in the original predict report

The predict report's other 5 recommendations stand:
- A1–A5 (the 5 persona agreements) — unchanged.
- Risk table R1–R8 (excluding the new E.1b risk R6) — unchanged.
- Counter-arguments to the user's framing — unchanged (the user's R1/R2/R3 are addressed above; their 3 concerns are addressed above).
- The "deferred full extraction" recommendation — unchanged. The full extraction is YAGNI; the rename + interface spec is sufficient.

**What this report adds:** the dedicated `interface/` structure (E.1b) + the 3 resolved decisions (branches, bundle, E.1 first) + the revised execution order (E.0 → E.1 → E.1b → E.2 → E.3 → E.4 → E.5).

---

## Verification (how to test the change is right)

**After Phase E ships:**

1. **The 3 layers are first-class.** `ls tools/learning-loop-mastra/` shows `core/`, `mastra/`, `interface/`, `docs/`, `hooks/legacy/`, `data/`. AGENTS.md §1 names them explicitly. Future agents reading the codebase find the 3 layers documented in 30 seconds. **Post-Plan-6 (Rev 5):** shell code physically lives in `tools/learning-loop-mastra/mastra/` (not at the top level).
2. **The interface contract is enforceable.** `node tools/learning-loop-mastra/interface/contract.js claude-code` returns `{ok: true, missing: []}`. Same for `droid` and `mastra-code`. A test for a fake runtime returns `{ok: false, missing: ['hook-shim-set', 'mcp-client-config', ...]}`. **Post-Plan-6 (Rev 5):** `args` check is updated from `tools/learning-loop-mastra/server.js` → `tools/learning-loop-mastra/mastra/server.js`.
3. **Existing runtimes pass the contract.** The `interface/__tests__/contract.test.js` test file passes for `.claude/` and `.factory/` (existing shim dirs). This locks the contract against silent regression.
4. **Mastra Code can be onboarded in < 1 hour.** A new agent (or operator) reads `interface/RUNTIME_ONBOARDING.md`, follows the checklist, creates the 5 things, runs `contract.js mastra-code`, gets `{ok: true}`. The smoke test against `MCPServer` succeeds.
5. **R2 ownership is enforceable via PR review.** A PR that adds a new file under `.claude/coordination/hooks/` from a non-Claude-Code session requires operator approval (matches the AGENTS.md §11 convention).
6. **The schema doc answers the user's #2 concern.** `tools/learning-loop-mastra/docs/schemas.md` exists; a reader can answer "how many records are there, what fields do they have?" by reading 1 file.
7. **All existing tests still pass.** E.1 (rename), E.1b (interface spec), E.2 (doc), E.3 (parity-pin label), E.4 (schema rot cleanup), **E.6 (Plan 6 shell restructure)** are all non-functional changes. E.5 (Mastra Code) is config + smoke test. The only behavioral change is the new `interface/__tests__/contract.test.js` which adds ~30 tests.
8. **The bundled hardening plan is parallel.** LIM-3 + R2 gate + LIM-4 ship in a separate plan that does not block Phase E.
9. **NEW Rev 5 (Plan 6 shell restructure):** after Plan 6 ships, `find tools/learning-loop-mastra/ -maxdepth 1 -name "*.js"` returns 0 matches (no shell files at the top level); `ls tools/learning-loop-mastra/mastra/` shows `server.js` + `create-loop-*.js` + `workflows/` + `agents/` + `schemas.js` + `legacy-handler-adapter.js` + `schema-parity.js` + `tools/legacy/`; `grep -rn "tools/learning-loop-mastra/server.js" tools/learning-loop-mastra/` returns 0 matches outside `interface/contract.js` (the contract path is the source-of-truth); `AGENTS.md §1.1` line 20-22 updated to "Lives at `tools/learning-loop-mastra/mastra/`" (no longer "top level").

---

## Inversion closure (per `/problem-solving` skill)

| Normal assumption (my predict report) | Inverted (this report) | What it revealed |
|---------------------------------------|------------------------|------------------|
| "The shim pattern IS the runtime interface" | "The shim pattern is HOW a runtime satisfies the interface; the interface is a separate spec" | The interface was a real concept but not first-class; Phase E.1b creates the structure. |
| "The 3 layers are Core, Mastra, Runtime hooks" | "The 3 layers are Core, Mastra shell, Runtime interface (where interface = spec, not shim)" | The shim dirs are *implementations* of the interface, not the interface itself. The interface is the contract. |
| "Runtime onboarding = create a shim dir" | "Runtime onboarding = satisfy the 5 contract requirements" | Onboarding is a checklist (validate against `contract.js`), not a copy-paste exercise. |
| "Adding a new runtime = writing code in `.claude/` or `.factory/`" | "Adding a new runtime = writing code in `.mastracode/` (or your own dir) AND satisfying the contract" | The new runtime's location is *its own concern*; the contract is the loop's concern. |

**Validity of the inversion:** the inversion works in the concrete sense — by treating the interface as a separate spec, we get a first-class concept (the `interface/` directory), a validation tool (`contract.js`), and an onboarding flow (`RUNTIME_ONBOARDING.md`). None of these existed before. The inversion is *contextually* valid: at the current scale (2 runtimes + 1 planned), the spec is the right level of formalization; at 5+ runtimes, a registry may be warranted (and the inversion can be re-applied).

**What I learned:** the predict report was over-confident in calling the existing pattern "good enough." The shim pattern is *necessary* (the implementations must exist), but not *sufficient* (the spec must also exist). The user's feedback was correct: the structure was missing.

---

## References (verifiable)

- Predict report: `plans/reports/predict-260624-2025-phase-e-domain-driven-architecture-report.md` (the prior advisory this report builds on)
- Master tracker: `plans/reports/productization-260612-1530-master-tracker.md` § Phase E (lines 211–222)
- AGENTS.md §1 (meta-surface), §2 (hook matrix), §3 (meta-surface tools)
- Current Core dir: `tools/learning-loop-mastra/core/legacy/` (rename target → `core/`)
- Current shim dirs: `.claude/coordination/hooks/` + `.factory/coordination/hooks/` (implementations of Requirement #1)
- Existing runtime-agnostic validator: `tools/learning-loop-mastra/core/legacy/runtime-agnostic-checklist.js` (6-item gate; this report's 5-requirement contract is the spec the validator implicitly enforces)
- Stale schema doc: `tools/learning-loop-mastra/core/legacy/schema-descriptions.yaml` (E.4 cleanup target)
- Parity-test pin: `tools/learning-loop-mastra/workflows/workflow-intentional-skip.js` (E.3 label target)
- Mastra Code: npm `mastracode`; source at `mastra-ai/mastra/tree/main/mastracode`
- Open LIMs: LIM-3 (caller identity), LIM-4 (path traversal) — see master tracker § Phase B LIMs table (bundled hardening plan)
- Inversion technique: `/problem-solving` skill, `references/inversion-exercise.md`

---

## Revision notes

### Revision 5 (2026-06-26) — Plan 2 (Interface spec) shipped + Plan 6 (Mastra shell restructure) added

**Two changes this revision:**

**Change A — Plan 2 (Interface spec) shipped via PR #17 (2026-06-25 per journal):**

The Interface spec plan (`plans/260625-1618-phase-e-interface-spec/`, 5 phases) shipped 2026-06-25 via PR #17 (journal date; git merge commit timestamp 2026-06-26 02:37 local). The report's status moved from "Plan 1 done, awaiting operator approval to advance to Plan 2" to "Plan 1 + Plan 2 done; Plan 6 (NEW) and Plans 3/4 still pending."

**Concrete changes:**
- Header date stamp: added "revised 2026-06-26 — Plan 2 (Interface spec) shipped via PR #17 + Plan 6 (Mastra shell restructure) added per operator observation"
- Status line: flipped Plan 2 to DONE; added Plan 6 status
- Plan split table (line ~150): Plan 2 row flipped to `✅ DONE 2026-06-25 (PR #17)`; Plan 3 row kept `🔵 OPEN` with parallel-to-Plan-2-and-Plan-6 dependency note
- New "What shipped in Plan 2 (Interface spec) — 2026-06-25" section added (table of files + registry delta + source delta + deferred scope + verification at merge)
- Verification section updated to mention Plan 2's shipped scope
- References: Plan 2 dir = `plans/260625-1618-phase-e-interface-spec/plan.md` (status: completed); journal = `docs/journals/260625-phase-e-plan-2-interface-spec-shipped.md`

**Net registry delta (PR #17):**
- 1 `meta_state_log_change` filed
- 0 new findings, 0 archived, 0 superseded
- 7 new test files (5 regression guards + 1 contract test + 1 runtimes-pass-contract test)
- 0 journal entries

**Cross-references (Plan 2):**
- Plan: `plans/260625-1618-phase-e-interface-spec/plan.md` (status: completed)
- Phase files: `phase-01-baselineandtests.md` through `phase-05-verify.md`
- Test files: `tools/learning-loop-mastra/__tests__/interface/*.test.js` (5) + `tools/learning-loop-mastra/interface/__tests__/contract.test.js` (1)
- Production files: `tools/learning-loop-mastra/interface/{README.md, CONTRACT.md, contract.js, RUNTIME_ONBOARDING.md}` (4 docs + 1 validator)
- SKILL.md updates: `.claude/skills/learning-loop/SKILL.md` + `.factory/skills/learning-loop/SKILL.md`

---

**Change B — Plan 6 (Mastra shell restructure) ADDED per operator observation (2026-06-26):**

The operator observed an inconsistency between the report's "after Phase E" diagram (line 287-330) and the actual codebase. **The diagram showed shell code under a `mastra/` subdirectory, but Plan 1 (shipped) explicitly chose to leave shell files at the top level of `tools/learning-loop-mastra/`** (per `phase-02-renameandrefs.md` line 23: "The shell files at `tools/learning-loop-mastra/` (`server.js`, `create-loop-*.js`, `workflows/`, `agents/`, `tools/`) are unaffected — they are at the top level, not under `core/`"). **AGENTS.md §1.1 line 20-22 (codified by Plan 1) explicitly says:** "Mastra shell (imperative). Wraps core in Mastra framework primitives. Lives at `tools/learning-loop-mastra/` (top level)."

**The gap:** Layer 2 of the 3-layer architecture (Mastra shell) is **conceptually** first-class (AGENTS.md names it) but **physically** mixed with non-shell files at the top level of `tools/learning-loop-mastra/`. The report's diagram was forward-looking but no plan implemented the move.

**Remedy:** Plan 6 (`phase-e-shell-restructure`, ~1-1.5d) added between Plan 2 and Plan 4 in the dependency chain. The plan:
1. Moves `tools/learning-loop-mastra/{server.js, create-loop-{tool,workflow,agent}.js, schemas.js, legacy-handler-adapter.js, schema-parity.js, workflows/, agents/}` → `tools/learning-loop-mastra/mastra/`
2. Updates `AGENTS.md §1.1` line 20-22 from "Lives at `tools/learning-loop-mastra/` (top level)" → "Lives at `tools/learning-loop-mastra/mastra/`"
3. Updates `interface/contract.js` Requirement #2 `args` check from `tools/learning-loop-mastra/server.js` → `tools/learning-loop-mastra/mastra/server.js` (one source-of-truth for the path)
4. Updates all `import`/`require`/`pathToFileURL` references across ~10-15 files
5. Adds 1 regression guard test: `find tools/learning-loop-mastra/ -maxdepth 1 -name "*.js" -type f | wc -l` returns 0 (no shell files at the top level)

**Why Plan 6 ships BEFORE Plan 4 (not after):**

The interface contract (shipped in Plan 2) hardcodes the path `tools/learning-loop-mastra/server.js` in Requirement #2's `args` check. Plan 4 (Mastra Code validation) exercises the contract against a new runtime. If Plan 6 ships AFTER Plan 4, Plan 4 tests against the pre-move layout and the contract path becomes stale the next day. If Plan 6 ships BEFORE Plan 4, Plan 6 also updates the contract path, and Plan 4 exercises the post-move layout. **Plan 6 → Plan 4 is the cleaner dependency.**

**Concrete changes to this report (Rev 5, Change B):**
- Plan split table (line ~150): added Plan 6 row between Plan 3 and Plan 4; updated dependency chain (`Plan 2 → Plan 6 → Plan 4`)
- Total effort updated: `~4–5 days` → `~5–6 days` (+~1d for Plan 6)
- Plan dir naming convention (line ~182): added `plans/260625-0930-phase-e-shell-restructure/`
- Plan-level dependency diagram (line ~160): added Plan 6 between Plan 2 and Plan 4
- Post-Phase E tree diagram (line ~290): updated to show `mastra/` containing shell files (post-Plan-6 state); added pre-Plan-6 "current actual" state callout
- "Why this split and not alternatives" section (line ~175): added bullet explaining Plan 6 → Plan 4 forward path
- Open questions Q7 + Q8 added (Rev 5): Plan 6 sequencing (recommend: before Plan 4) + Plan 6 `schemas.js` inclusion (recommend: include)
- Verification section: added item 9 covering Plan 6 verification steps
- Plan 1 "What this plan did NOT ship" + Plan 2 "What this plan did NOT ship" bullets both got a new line: "Mastra shell restructure (Plan 6 / E.6)"

**What was NOT changed in this revision (Rev 5, Change B):**
- The 3-layer architecture (Core / Mastra shell / Runtime interface) — keep. Plan 6 implements Layer 2 physically.
- The 5-requirement contract for the runtime interface — keep. Plan 6 updates one path string; the contract shape is unchanged.
- The bundled hardening plan (LIM-3 + R2 write-gate + LIM-4) — keep. Parallel to Phase E.
- The risk table R1–R6 — keep. Plan 6 adds a new risk: "Mechanical file moves across ~10-15 files may regress imports if a path is missed." Mitigation: 1 regression guard test + grep pre/post.
- The "after Phase E" 3-layer ASCII diagram (line ~73-95 in the original) — keep. The conceptual layering is unchanged; Plan 6 only moves files.

### Revision 7 (2026-06-26) — Plan 6 (Mastra shell restructure) status flipped to DONE

Plan 6 shipped 2026-06-26 on the `phase-e/plan-6-shell-restructure` branch. Ship evidence: commit `28e3618` (single atomic commit per Plan 1 D1 precedent); `docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md` (4202 bytes); `meta_state_log_change` entry `meta-260626T0523Z-plans-260626-0302-phase-e-shell-restructure-plan-md`; 13 test namespaces GREEN (phase-e-shell-restructure 11/11); 3 contract smoke tests pass (claude-code=ok, droid=ok, mastra-code=ok:false with 4 missing); code review APPROVE WITH FOLLOW-UPS (`plans/260626-0302-phase-e-shell-restructure/reports/code-reviewer-260626-0534-GH-6-phase-e-plan-6-shell-restructure-report.md`).

**Merge to `main` is pending operator approval** (the journal entry's "PR:" field is TBD; the commit is on the feature branch but not yet merged). This matches the date-stamp pattern used for Plan 2 (journal dated 2026-06-25; git merge 2026-06-26 02:37 local) — ship-event and merge-event are tracked separately. Operator decides when to merge; once merged, Rev 7's "merge to main pending" caveat can be lifted in a future revision.

**Concrete changes to this report (Rev 7):**
- Header date stamp: added "revised 2026-06-26 (Rev 7) — Plan 6 status flipped to DONE (code review approved; merge to main pending)"
- Status line: Plan 6 status flipped from "added per operator observation" to "shipped 2026-06-26 with merge to main pending"
- Plan split table (line ~152): Plan 6 row flipped from `🔵 OPEN` to `✅ DONE 2026-06-26 (commit 28e3618 on phase-e/plan-6-shell-restructure; journal dated 2026-06-26; code review APPROVE WITH FOLLOW-UPS; merge to main pending operator approval — see Rev 7)`
- Plan 4 row: dependency note updated from "depends on Plan 6" to "Plan 6 DONE; dependency satisfied; ready to start"
- New "What shipped in Plan 6 (Mastra shell restructure) — 2026-06-26" section added (table of commits + registry delta + source delta + verification at ship + deferred scope + cross-references), mirroring Plan 1 and Plan 2 sections
- Status footer: Plan 6 removed from "still pending" list; recommended next move updated to Plan 3 + Plan 4

**What was NOT changed in this revision:**
- Plan 6's implementation — keep (shipped as-is; the 2 follow-ups remain in Plan 3 per Rev 6)
- The 3-layer architecture (Core / Mastra shell / Runtime interface) — keep. Plan 6 made Layer 2 physically first-class.
- The 5-requirement contract for the runtime interface — keep. Plan 6 updated one path string; the contract shape is unchanged.
- The bundled hardening plan (LIM-3 + R2 write-gate + LIM-4) — keep. Parallel to Phase E.
- The risk table R1–R6 — keep. Plan 6 did not surface new risks (the 2 follow-ups are doc drift + registry lifecycle, both already in the existing risk profile).

### Revision 6 (2026-06-26) — Plan 3 (Housekeeping) expanded with 2 follow-ups from Plan 6 code review

The Plan 6 code review (commit `28e3618`, see `plans/260626-0302-phase-e-shell-restructure/reports/code-reviewer-260626-0534-GH-6-phase-e-plan-6-shell-restructure-report.md`) flagged 2 follow-ups (1 docs drift + 1 registry lifecycle) that did not block merge but should land before Plan 6's `meta_state_log_change` change-target is queried by future runs of `meta_state_check_grounding`. Operator decision: fold both into Plan 3 (Housekeeping).

**I-1 (docs drift) — `tools/learning-loop-mastra/core/README.md`:**

The Plan 6 regression guard `external-refs-updated.test.js` does NOT include `tools/learning-loop-mastra/core/` in its SEARCH_PATHS list (lines 21-36). As a result, 3 lines in `core/README.md` slipped through the guard:

- Line 26: `- \`tools/learning-loop-mastra/create-loop-*.js\` (shell factories)` → must reference `mastra/create-loop-*.js`
- Line 27: `- Anything under \`tools/learning-loop-mastra/{workflows,agents,tools}/\`` → must reference `mastra/{workflows,agents}/` (note: `tools/legacy/` is separate)
- Line 46: `- **Mastra shell** (\`tools/learning-loop-mastra/\` top level) — the imperative shell` → must reference `tools/learning-loop-mastra/mastra/`

This contradicts AGENTS.md §1.1 path-invariant sentence added by Plan 6 and is a real regression risk for future readers.

**Plan 3 fix:**
1. Update `core/README.md` lines 26, 27, 46 with `mastra/` prefix
2. Extend `external-refs-updated.test.js` SEARCH_PATHS to include `tools/learning-loop-mastra/core/`
3. Add `tools/learning-loop-mastra/create-loop-\*\\.js` glob pattern to FORBIDDEN_PATH_PATTERNS (the current literal regex misses glob-style references like `create-loop-*.js`)

**I-2 (registry lifecycle) — entry #9 `meta_state_re_verify`:**

Entry `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` was repointed by Plan 6 (evidence_code_ref updated to `tools/learning-loop-mastra/mastra/create-loop-tool.js`) but the `status: stale → active` transition was deferred per Plan 6's journal (`docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md`, "What this plan did NOT ship (deferred)" section). The fingerprint itself IS grounded (verified by sha256sum match against the new file — `git mv` preserves content). Plan 6's acceptance criterion #15 called for `meta_state_re_verify` with `META_STATE_VERIFY_EXEC=1`; the journal documented the deferral but did not close the loop.

**Plan 3 fix:** run `meta_state_re_verify` for entry #9 with `META_STATE_VERIFY_EXEC=1` env var on the MCP server. The fingerprint is already valid; the tool will compute `last_verified_at` and transition `stale → active`. No fingerprint refresh needed.

**Concrete changes to this report (Rev 6):**
- Header date stamp: added "revised 2026-06-26 (Rev 6) — Plan 3 (Housekeeping) expanded with 2 follow-ups from Plan 6 code review"
- Status line: Plan 3 expanded note added
- Plan split table (line ~152): Plan 3 row expanded with "Rev 6: Plan 6 follow-ups I-1 + I-2" sub-items; effort updated 1.5h → 2h
- Recommended next move line: Plan 3 effort updated to reflect expansion

**What was NOT changed in this revision:**
- Plan 3's E.2/E.3/E.4 scope — keep (no logic change)
- Plan 6 implementation — keep (shipped as-is; the 2 follow-ups don't affect the approved diff)
- Plan 4 dependency on Plan 6 — keep (Plan 6 still unblocks Plan 4)
- Risk table — keep (I-1 is doc drift, low risk; I-2 is registry lifecycle, medium risk but mitigated by `meta_state_re_verify`)

### Revision 4 (2026-06-25) — Plan 1 (Foundation) shipped

The Foundation plan (`plans/260624-2335-phase-e-foundation/`, 6 phases) shipped 2026-06-25 via PR #15, with PR #16 landing the same day as a post-review follow-up to close the `meta_state_batch` bypass. The report's status moved from "advisory, awaiting operator approval to advance to plan authoring" to "partially executed, awaiting operator approval to advance to Plan 2."

**Concrete changes to this report:**

- Header date stamp: added "revised 2026-06-25 — Plan 1 (Foundation) shipped via PR #15"
- Status line: flipped to partially-executed; sub-bullet for "Plan 1 (Foundation) shipped 2026-06-25 via `plans/260624-2335-phase-e-foundation/` (PR #15 merged)"
- Plan split table (line ~148): added `Status` column; Plan 1 row flipped to `✅ DONE 2026-06-25 (PR #15)`; Plans 2/3/4/5 rows got `🔵 OPEN` markers with dependency notes
- New "What shipped in Plan 1 (Foundation) — 2026-06-25" section added (table of commits + journal + registry delta + source delta + deferred scope + verification at merge)
- Final status line: flipped from "advisory only" to "partially executed; awaiting operator approval to advance to Plan 2"

**Net registry delta (PR #15 + #16):**

- 1 finding filed (`meta-260625T0255Z-the-meta-state-batch-mcp-tool-bypasses-the-immutable-patch-f`), then resolved in PR #16
- 9 fingerprints refreshed (7 rename-repoint + 2 cold-tier drift from the deny-list fix)
- 0 archived, 0 superseded

**Cross-references:**

- Plan: `plans/260624-2335-phase-e-foundation/plan.md` (status: done)
- Phase files: `phase-01-baselineandtests.md` through `phase-06-fingerprintrepointandverify.md`
- Test files: `__tests__/fingerprint-repoint-existence.test.js` (1) + `__tests__/phase-e-foundation/*.test.js` (4)
- Reports: `plans/260624-2335-phase-e-foundation/reports/{pre-rename-baseline,fingerprint-repoint-manifest,red-team-260625-0046-phase-2-4-5-6-review-report,general-purpose-260625-0046-phase-6-red-team-report}.{json,md}`
- Journal: `docs/journals/260625-phase-e-plan-1-review-fixes.md` (post-review fixes: bypass finding filed + fingerprint-repoint-existence test created + 2 plan-status updates)
- Follow-up journal: `docs/journals/260626-fix-batch-bypass-deny-list.md` (PR #16: deny-list moved to core + batch handler consults it + 2 regression tests; the 1 finding from PR #15 resolved)

**What was NOT changed in this revision:**

- The 3-layer architecture (Core / Mastra shell / Runtime interface) — keep. Plan 1 codified it in `AGENTS.md §1.1`.
- The 5-requirement contract for the runtime interface — keep. Plan 2 (E.0 + E.1b) will create the `interface/` directory.
- The bundled hardening plan (LIM-3 + R2 write-gate + LIM-4) — keep. Parallel to Phase E.
- The order of operations (E.0 → E.1 → E.1b → E.2 → E.3 → E.4 → E.5) — keep. Plan 1 covered E.1; remaining items follow.
- The risk table R1–R6 — keep. Plan 1's shipped scope did not surface new risks.
- The open questions Q1–Q6 — keep. Q4 (other missing first-class structures) is still open; Plan 2 (E.1b) will surface the answer when the interface contract is exercised.
- The "post-E.1 / post-E.1b" tree diagram (line ~184) — keep. The post-Plan-1 state is now closer to the E.1 row (`core/` exists; `interface/` and `mastra/` do not yet); the post-E.1b shape is still forward-looking.

### Revision 3 (2026-06-24 22:10) — plan split added

The user's question "How many plans should we split Phase E into?" triggered a meta-pattern recognition pass over the 7 phase items. Result: **4 shippable plans for Phase E + 1 deferred hardening plan = 5 plans total.** New section "Plan split for execution" inserted with the 5-row plan table, plan-level ordering diagram, rationale, and plan-dir naming convention. Date stamp updated.

**Net change:** no scope change; only the execution grouping changed. Effort totals are the same (~4–5 days for Phase E).

### Revision 2 (2026-06-24 21:30) — 4 corrections

A cross-reference check against the actual codebase surfaced 4 factual gaps in the original 19:25 draft. All 4 are corrected in this revision:

| # | Original claim | Correction | Severity | Source |
|---|----------------|------------|----------|--------|
| C1 | Requirement #4 "Identity marker" presented `RUNTIME_ID` as a present-tense convention | Reframed as **PROPOSED — target convention from hardening plan (LIM-3 caller identity); not yet adopted by `claude-code` or `droid`.** Validator now returns `missing: []` with `note: 'identity-marker-not-adopted'` when unset. | **High** | `grep -r "RUNTIME_ID" tools/ .claude/ .factory/` returns 0 matches outside this report and the predict report |
| C2 | Requirement #1 listed 3 hook shims with wrong filenames | Corrected to **4 shims** (`bash-coordination-gate.cjs`, `write-coordination-gate.cjs`, `inbound-state-gate.cjs`, `recurrence-check-on-start.cjs`) | Medium | `.claude/coordination/hooks/` and `.factory/coordination/hooks/` each contain 4 files |
| C3 | Requirement #2 referenced `.claude/settings.local.json` | Corrected to **`.claude/settings.json`** (no `.local` suffix — that file does not exist) | Low | `.claude/settings.json` is the actual config file |
| C4 | MCP entry described as "an entry pointing to" | Clarified to **`mcpServers.learning-loop` entry** | Low | `.mcp.json` and `.factory/mcp.json` both use `mcpServers.learning-loop` namespace |

The "after Phase E" tree (line ~184) is **already labeled** as the post-E.1 / post-E.1b shape — no correction needed there, but readers should note the `mastra/` and `interface/` subdirs do not exist today; they are the target structure that Phase E creates.

**What was NOT changed:**

- The inversion insight (spec vs implementation) — keep.
- The 5-requirement shape — keep (with the #4 reframing).
- The 3-layer architecture (Core / Mastra shell / Runtime interface) — keep.
- The bundled hardening plan (LIM-3 + R2 write-gate + LIM-4) — keep.
- The order of operations (E.0 → E.1 → E.1b → E.2 → E.3 → E.4 → E.5) — keep.
- The risk table R1–R6 — keep.
- The open questions Q1–Q6 — keep (Q4 about "other missing first-class structures" is still open and worth a follow-up `/problem-solving` session).

---

**Status:** Partially executed — Plan 1 (Foundation) shipped 2026-06-25 via PR #15 + 1 follow-up (PR #16) for the deny-list bypass. Plan 2 (Interface spec) shipped 2026-06-25 via PR #17 (per journal; git merge 2026-06-26). Plan 6 (Mastra shell restructure, NEW Rev 5) shipped 2026-06-26 on `phase-e/plan-6-shell-restructure` branch (commit 28e3618; journal + code review filed; merge to main pending operator approval per Rev 7). Plan 3 (Housekeeping) expanded Rev 6 with 2 follow-ups from Plan 6 code review (core/README.md docs drift + entry #9 status lifecycle). Plan 3 (Housekeeping) and Plan 4 (Mastra Code validation) still pending. Plan 5 (Hardening) is the parallel dimension. **Recommended next move:** Plan 3 (Housekeeping, ~2h with Rev 6 follow-ups) — closes the 2 carryovers from Plan 6's code review; can ship in parallel with Plan 4. Plan 4 (Mastra Code validation, 1-2d) — Plan 6 dependency now satisfied; ready to start once Plan 3 lands (or in parallel).
