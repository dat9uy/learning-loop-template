# Scout Report — Phase D Plan 4 (Cutover) Closure Gaps

**Date:** 2026-06-24
**Slug:** phase-d-plan-4-cutover-scout
**Plan dir:** `plans/260624-1111-phase-d-plan-4-cutover/`
**Status:** scout only — no files modified
**Inputs:** `AGENTS.md`, `.claude/skills/learning-loop/SKILL.md`, `.factory/skills/learning-loop/SKILL.md`, `.claude/coordination/MASTRA_AGENT_MODEL.md`, `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md`, `docs/journals/260623-phase-d-plan-3-shipped.md`, `docs/journals/260624-phase-d-plan-3-post-review-hardened.md`, master tracker `plans/reports/productization-260612-1530-master-tracker.md`, research report `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10, `meta-state.jsonl` (183 lines), and `plans/260624-1111-phase-d-plan-4-cutover/plan.md` itself.

---

## 1. AGENTS.md §1 contract text

**Current text (§1 lines 9–26, verbatim relevant excerpt):**

> ## 1. The Meta-Surface (the only bound surface)
>
> The meta-surface is the loop's self-model. It is the **only contract** the loop writes. Everything else (the substrate, the product surface, the legacy `records/<vendor>/` content) is design exploration, archived for forensic continuity, and explicitly not a contract that constrains the loop.
>
> **The meta-surface lives in one place:** `meta-state.jsonl` at the project root. It is a 4-kind discriminated union:
>
> | Kind | Role | Lifespan |
> |---|---|---|
> | `finding` | A loop-self-diagnostic observation. Ephemeral; 24h TTL until acked. | 24h → ack → active → resolve |
> | `change-log` | An immutable audit record of a system change. No TTL. | Forever |
> | `rule` | A promoted invariant the loop enforces. Two enforcement classes: `gate` (hard-block) and `agent` (consult). | Forever (until superseded) |
> | `loop-design` | A deferred design that will create or modify rules, schemas, or tools. | Active → inactive (when shipped) → archived |
>
> **The product surface (decisions, experiments, risks, observations, capability records, vendor records, claim records, index entries, resource budgets) is unbound.** The Bridge 5 codegen engine has the ability to generate product-surface records; the loop has not committed to binding. ...

**Note:** §1 itself is unchanged by Phase D — Phase D **inherits** §1 (the meta-surface is still the only bound surface; the agents ship with `memory: false`). Phase D's effect on §1 is **observational**, not contractual.

**What Plan 4 needs to add to AGENTS.md** (per brainstorm §"Plan 4 (Cutover, blocked on Plans 1+2+3)" item 4.4, lines 383–385):

A one-line **trajectory/header note** indicating Phase D shipped. Concrete candidate insertion (placement: end of §10 or as a new "Phase D shipped" callout at the top of §1):

> "As of 2026-06-24, Phase D (Mastra Phase 2-3: workflows + agents + storage) shipped via `plans/260618-1911-phase-d-plan-1-workflows/`, `plans/260619-2246-phase-d-plan-2-storage/`, and `plans/260623-1619-phase-d-plan-3-agents/`. The MCP server is `tools/learning-loop-mastra/server.js` (canonical). The meta-surface remains the only bound surface; the agents ship with `memory: false` (Phase 3.5 / Phase 5 territory)."

Plan 4 phase-04 file `plans/260624-1111-phase-d-plan-4-cutover/phase-04-agents-md-contract-note.md` exists and is `status: pending`.

**Also relevant:** `AGENTS.md` §2 table line 51 currently reads "MCP server (`tools/learning-loop-mastra/server.js`) — 40 tools across 5 groups per `tools/learning-loop-mastra/agent-manifest.json` (verified 2026-06-17). Of these, ~21 are bound to the meta-surface; the remaining ~19 are workflow or unbound..." — this **is already out of date** (post-Plan 3 it's 6 groups with 44 tools; the journal `260623-phase-d-plan-3-shipped.md` line 106 says "31 tools, 10 workflows, 3 agents" but the agent-manifest.json currently shows **6 groups + 44 tools** per the manifest read; verify exact count during Plan 4 phase-02). Plan 4 phase-02 must reconcile §2's tool count in addition to phase-04's §1 contract note.

---

## 2. SKILL.md references

**`.claude/skills/learning-loop/SKILL.md` (97 lines)** and **`.factory/skills/learning-loop/SKILL.md` (97 lines)** are **byte-identical**.

Both files reference the legacy server in **References block, lines 91–97**:

```
91: - `tools/learning-loop-mcp/references/learning-loop-rules.md` — condensed repo rules from `docs/` and meta evidence.
92: - `tools/learning-loop-mcp/references/resource-budget-rules.md` — hard constraints for external systems with irreversible state.
93: - `tools/learning-loop-mcp/references/prompt-blueprints.md` — reusable prompt skeletons.
94: - `tools/learning-loop-mcp/references/prompt-blueprints-state-gated.md` — state-gated prompt templates for budget-constrained systems.
95: - `tools/learning-loop-mcp/references/prompt-blueprints-product-build.md` — product-build prompt skeletons.
96: - `tools/learning-loop-mcp/references/meta-evidence-self-improvement.md` — self-improvement and `meta` evidence rules.
97: - `tools/learning-loop-mcp/references/orchestration-patterns.md` — full-lifecycle experiment orchestration, claim update, and promotion rules.
```

**Findings:**
- Both SKILL.md files reference the **legacy** server name `tools/learning-loop-mcp/references/...` (7 paths each, identical).
- The two SKILL.md files themselves do NOT use the `learning-loop-mastra` string anywhere in their bodies — only `learning-loop-mcp` (legacy) is mentioned.
- The references/ subdir **still exists** at `tools/learning-loop-mcp/references/` (not deleted in any prior plan). Plan 4 phase-07 (C-9 cleanup) needs to decide whether to (a) keep references/ inside legacy/ or (b) move them under `tools/learning-loop-mastra/references/` first.
- **R4 (JSON rename) impact**: SKILL.md does not use the `learning-loop-mastra` MCP config key (only the legacy `learning-loop-mcp` reference paths). R4's key rename `learning-loop-mastra` → `learning-loop` affects `.mcp.json`, `.factory/mcp.json`, `.claude/settings.local.json`, and Droid/Claude Code state — **not the SKILL.md reference paths**.

**Phase D / Phase C references in SKILL.md:** neither file mentions "Phase D" or "Phase C" or "Mastra" by name. The skill is **vendor-agnostic** at the prose level — references the loop's MCP surface without naming the runtime. Plan 4 does not need to edit prose in either SKILL.md file for the phase-shipped note; the E3 sub-task (per master tracker Phase E row) is deferred to Phase E, not Phase D.

---

## 3. Direct path imports of `tools/learning-loop-mcp/` (C-9 cleanup targets)

### 3.1 `#mcp/*` alias imports OUTSIDE `tools/learning-loop-mcp/`

**7 imports** in non-legacy directories use the `#mcp/*` import alias (which resolves to `tools/learning-loop-mcp/*` per `package.json:7`):

| File | Import | Used by |
|---|---|---|
| `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/schemas.js:9-11` | `import { metaStateProposeDesignTool } from "#mcp/tools/meta-state-propose-design-tool.js"` + 2 more | Re-export shim for legacy meta-state tool schemas |
| `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/create-loop-workflow.js:5` | `import { stripMcpContentEnvelope } from "#mcp/core/envelope-stripper.js"` | Workflow factory |
| `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/agents/run-scout-tool.js:9` | `import { runScout } from "#mcp/scout/run-scout.js"` | Scout agent tool wrapper |
| `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/workflows/workflow-intake-plan.js:3` | `import { stripEnvelope } from "#mcp/core/envelope-stripper.js"` | Workflow wrapper |
| `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/workflows/workflow-self-improvement.js:3` | `import { stripEnvelope } from "#mcp/core/envelope-stripper.js"` | Workflow wrapper |

### 3.2 Direct path imports of `tools/learning-loop-mcp/` (NOT via `#mcp`)

**2 imports** in the mastra side use direct relative paths:

| File | Import |
|---|---|
| `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:4` | `import { stripEnvelope } from "../../learning-loop-mcp/core/envelope-stripper.js"` |
| `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:5` | `import { strictBooleanGuard } from "../../learning-loop-mcp/core/strict-boolean-guard.js"` |

### 3.3 Direct references to legacy paths in non-code artifacts

These reference the legacy path in **descriptions / comments / instructions** but not as import statements — they should still be reviewed in Phase 4 phase-07 for consistency:

| File | Reference |
|---|---|
| `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/agents/instructions/scout-agent.js:2,11,16` | 3 references to `tools/learning-loop-mcp/scout/run-scout.js` in the agent's locked instruction string |
| `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/agents/run-scout-tool.js:2,14` | 2 references in the JSDoc + description string |
| `/home/datguy/codingProjects/learning-loop-template/tools/scripts/run-pnpm-test-namespaced.mjs:19` | 1 comment reference in a build/test script |

### 3.4 C-9 cleanup impact summary

**Plan 4 phase-07 (C-9 cleanup) must handle:**

1. **5 `#mcp/*` imports** in mastra code that point at legacy core/scouts/schemas — must either (a) replace with direct relative paths into `tools/learning-loop-mastra/...` after moving those files, OR (b) keep `#mcp/*` alias until all consumers move (Plan 4 atomic decision).
2. **2 direct `../../learning-loop-mcp/core/...` imports** in `__tests__/coerce-correctness.test.js` — test depends on legacy core helpers.
3. **5 prose references** in agent instructions + scout tool descriptions — these are LOCKED instruction markers (per Plan 3 hardening review C3 / I3 / agent-prompt-content test) and **cannot be edited** without updating the prompt-content test fixtures.
4. **45 total `#mcp/*` import statements** exist repo-wide; **38 of them** are inside `tools/learning-loop-mcp/` itself (legitimate self-imports) and **7** are cross-package (above).
5. **Plan 4 phase-07's contract**: "Move `tools/learning-loop-mcp/tools/` → `tools/learning-loop-mastra/tools/legacy/` (or merge into existing `tools/learning-loop-mastra/tools/`); delete `#mcp/*` import alias" (master tracker line 330). The cleanup is **larger than just `tools/`**: `#mcp/*` also resolves to `tools/learning-loop-mcp/core/*`, `tools/learning-loop-mcp/scout/*`, `tools/learning-loop-mcp/tools/*`. **Recommend**: delete `#mcp/*` alias LAST, after all 5 mastra-side consumers are migrated. Plan 4 phase-07 needs a per-consumer migration table.

---

## 4. Active findings about Plan 4 / Phase D closeout

**Searched:** meta-state.jsonl (183 lines; all active + reported entries via `meta_state_list({status: "active", compact: true})` → 127 entries returned; all reported → 1 entry).

### 4.1 Findings directly relevant to Plan 4

| Finding ID | Status | Relevance |
|---|---|---|
| `meta-260623T0223Z-plan-1b-phase-2-path-b-reverted-plan-1a-s-mastra-task-update` | active (escalate) | "Scope: Claude Code sessions only — Mastra Agents have no path to Claude Code's native TaskUpdate." Out of Plan 4 scope by construction; documented for Phase F traceability. **No Plan 4 action.** |
| `meta-260623T1126Z-meta-state-relationships-graph-is-unidirectional-on-reopens` | active (warning, mcp-tool-missing) | `meta_state_relationships` does not include `reopens` in its 1-hop inverse traversal. Pre-existing; unrelated to Phase D cutover. **No Plan 4 action required** but worth flagging if Plan 4 phase-06 cold-session enumeration discovers related gaps. |
| `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` | active (warning, schema-drift) | `tools/learning-loop-mastra/create-loop-tool.js` parity-shim drift guard. Pre-existing; **not Plan 4 scope**. |
| `meta-260623T1542Z-the-pr-body-registry-deltas-advisory-github-workflows-meta-s` | reported (warning, advisory-only) | Expires 2026-06-24T08:42:43Z (today). The PR-body advisory workflow is advisory-only. Plan 4 may want to **ack this finding** (since Plan 4 will produce a PR) so the registry tracks the cutover. |

### 4.2 Change-logs documenting Phase D plans (for traceability)

Recent change-logs (status: active) document prior Phase D plans and will receive parallel log-change entries when Plan 4 ships:

- `meta-260619T1320Z-plans-reports-productization-260612-1530-master-tracker-md` (Plan 1 flip)
- `meta-260619T2229Z-plans-reports-productization-260612-1530-master-tracker-md` (Plan 2 storage flip, lines 204-208 cited)
- `meta-260620T1950Z-plans-reports-productization-260612-1530-master-tracker-md` (Plan 2 closeout)
- `meta-260622T1951Z-plans-260622-1810-phase-d-plan-1a-parity-tightening-plan-md` (Plan 1a flip)
- `meta-260623T0223Z-plan-1b-phase-2-...` (Plan 1b flip)
- `meta-260623T1039Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md` (Plan 1b fixups)
- `meta-260623T1450Z-plans-260623-1237-meta-state-pr-quality-and-hints-split-plan` (PR-quality work)
- `meta-260623T1534Z-tools-learning-loop-mcp-core-loop-introspect-js-tools-learni` (introspect edits)
- `meta-260623T2302Z-claude-coordination-mastra-agent-model-md` (MASTRA_AGENT_MODEL.md shipped in Plan 3)
- `meta-260623T2345Z-plans-reports-productization-260612-1530-master-tracker-md` (D4 + D7 + D-11 flip — Plan 3 closeout)

**Plan 4 will need to file its own change-log with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'`** (per master tracker Update Protocol §"Update Protocol" step 4, line 380) for the D1–D7 + D-9 + D-11 + D-15 final flip.

### 4.3 Rules in force during Plan 4

5 active rules with gates that may fire during Plan 4:

| Rule ID | Enforcement | Pattern | Impact on Plan 4 |
|---|---|---|---|
| `rule-no-new-artifact-types` | gate (regex) | `(propose\|design\|create)\s+(a\|an\|new\|separate\|own\|the)?\s*(schema\|artifact\|directory\|convention)\|new\s+(schema\|artifact\|directory\|convention)` | Plan 4 phase-07 (legacy cleanup) and phase-08 (JSON rename) involve renaming + moving + deleting artifacts. The pattern matches "new directory" / "new artifact" — **Plan 4 phase prose must avoid triggering it**. Use "consolidate" / "remove" / "merge" wording instead of "new directory" / "new schema". |
| `rule-project-skill-boundary` | gate (glob) | `.factory/skills/{use-mcp,find-skills}/**` | No impact — Plan 4 does not touch cross-project skill invocations. |
| `rule-cold-session-test-must-pass-before-resolution` | gate (resolution-evidence-required) | `mcp-protocol-e2e-test` | No impact — Plan 4 does not resolve findings; the cold-session test gate is about `meta_state_resolve`. |
| `rule-no-orphaned-evidence` | agent (resolution-evidence-required) | `*` | No impact on Plan 4. |
| `rule-pr-body-registry-deltas` | agent (consult-checklist) | registry-delta sweep/resolved/new/promoted/superseded/archived | **Applies to Plan 4 PR** — when Plan 4 lands, its PR body must enumerate the registry-deltas (per checklist in rule pattern). |

`rule-import-chain-analysis-after-tool-deletion` (active, agent, regex: `rm\s+...\s+-tool\.js|git\s+rm\s+...\s+-tool\.js`) — Plan 4 phase-07 (C-9 cleanup) involves deleting tool files; **Plan 4 PR body should reference the legacy-cleanup review chain** to satisfy this rule's consult pattern.

---

## 5. Deferred items from tracker still open

Per master tracker `plans/reports/productization-260612-1530-master-tracker.md` "Deferred Items Backlog" section (lines 274-353):

### 5.1 Phase C continuation (mostly closed; D-11 done)

| ID | Task | Status | Plan 4 action |
|---|---|---|---|
| D-8 | C6 cut-over | ✅ Done 2026-06-17 | None |
| D-9 | C7 manifest update 5-group structure | ⚠️ Tracker still says "READY (Plan 3)"; actual: **Plan 3 added 6th group (`agent`)**, so D-9 is partially closed. **Plan 4 phase-02 finalizes the 6-group structure.** |
| D-10 | F4 peer MCP server 29-tool gate bypass | ✅ Done 2026-06-17 | None |
| D-11 | 4-tool reconciliation | ✅ Done 2026-06-23 (Plan 3 Phase 4) | None |
| D-13 | F4 PR security note | ⚠️ Status unknown; Plan 4 PR body should reference F4 resolution | Plan 4 PR body |
| H-2 | `quickstart.meta_state_query` injection surface | 🔵 OPEN (medium, security) | Not Plan 4 scope; Plan 4 may want to flag for Phase G |

### 5.2 Phase D (workflow + agent + storage migration)

| ID | Task | Status | Plan 4 action |
|---|---|---|---|
| D-14 | Phase D Plan 1+2+3 | ✅ Done | None |
| D-15 | Workflow-tool migration (D1-D3) | 🔵 OPEN per tracker line 295 — but **Plan 1 closed D1/D2/D3** (tracker line 204 shows `[x]`). **Tracker entry is stale.** Plan 4 phase-05 must flip D-15 from 🔵 OPEN to ✅ Done. |
| D-12 | Mode 1 vs Mode 2 decision | ⚪ DEFERRED to Phase E | None for Plan 4 |

### 5.3 Phase E (cut-over + Mastra Code Mode 1)

| ID | Task | Status | Plan 4 action |
|---|---|---|---|
| E1 | Replace legacy `learning-loop-mcp` server with Mastra-based one | ⚠️ "🟡 RESOLVED-BY-PLAN-3" — note that **Plan 4 phase-07 (C-9) is the actual cut-over** (legacy becomes `legacy/`). E1 semantics need to flip from "🟡 RESOLVED-BY-PLAN-3 (deferred to Plan 3 = D-8)" to ✅ Done-by-Plan-4. |
| E2-E6 | Mark old server `legacy`; update skills; update agent-manifest.json; Mode 1; hook confirm | 🔵 OPEN (Phase E scope) | **E2 is partially addressed by Plan 4 phase-07 (move to `legacy/`) but the SKILL.md updates are explicitly NOT in Plan 4 scope** (per master tracker line 217 `E3`); Plan 4 phase-07 does only the file move. E4 (agent-manifest.json group rename) IS in Plan 4 phase-02. |
| E7 | Mode 2 decision | ⚪ DEFERRED (= D-12) | None |

### 5.4 Hardening / quality (NOT Plan 4 scope)

| ID | Status | Notes |
|---|---|---|
| D-16 | 🔵 OPEN (low, CI test-drift check) | Out of Phase D; not Plan 4 |
| D-17 | 🔵 OPEN (low, fail-fast on manifest errors) | Out of Phase D; not Plan 4 |
| D-19 | 🔵 OPEN (high, security) — LIM-3, 4, 5, 6, 8, 9 | Out of Phase D; separate security/quality audit |
| H-2 | 🔵 OPEN (medium, security) | Out of Phase D |
| H-1/H-7 | 🔵 OPEN (low) | Out of Phase D |
| COERCE | 🔵 OPEN (low, debt) | Out of Phase D |

### 5.5 Phase G (skill migration)

All open. Plan 4 does NOT touch Phase G.

### 5.6 Cross-cutting (Plan 4 scope items)

| ID | Task | Status | Plan 4 action |
|---|---|---|---|
| R4 | JSON key rename `learning-loop-mastra` → `learning-loop` in `.mcp.json` + `.factory/mcp.json` — cascades to AGENTS.md, Droid state, Claude Code state | 🔵 OPEN | **Plan 4 phase-08 owns this.** |
| C-9 | Move `tools/learning-loop-mcp/tools/` → `tools/learning-loop-mastra/tools/legacy/`; delete `#mcp/*` import alias | 🔵 OPEN | **Plan 4 phase-07 owns this.** |

**Plan 4 also flips the stale D-15 entry** (which says 🔵 OPEN despite Plan 1 having closed it) — Plan 4 phase-05 master-tracker reconciliation.

---

## 6. Post-Plan-3 verification status

**Critical finding:** the operator-filled journal `docs/journals/260623-post-plan-3-verification.md` **DOES NOT EXIST** in `docs/journals/`.

`ls /home/datguy/codingProjects/learning-loop-template/docs/journals/` shows no file matching `*260623-post-plan-3*` or `*verification*`. Recent journals are:

- `260623-meta-state-pr-quality-and-hints-split-shipped.md`
- `260623-phase-d-plan-3-shipped.md`
- `260624-phase-d-plan-3-post-review-hardened.md`

**Post Plan 3 acceptance gate text (verbatim from brainstorm lines 158-160, 173):**

> "Acceptance criteria for Post Plan 3 to be 'complete': Journal entry exists with non-empty output for each of the 3 agents AND conditional e2e test either passes (when run with `KIMI_API_KEY`) or is properly skipped (when run without). Plan 4's pre-flight requires this completion."

> "Post Plan 3 | All 3 agents produce expected output with real LLM | `docs/journals/260623-post-plan-3-verification.md` has non-empty output for all 3 agents; `agent-e2e-integration.test.cjs` passes (when run with `KIMI_API_KEY`) or is properly skipped (when run without)"

The journal `260624-phase-d-plan-3-post-review-hardened.md` (line 53, "Forward-looking" section) confirms:

> "**Post-Plan-3 verification** (per plan §'Post Plan 3 prerequisites for Plan 4') still required before Plan 4 starts: operator runs `pnpm test:debug` with a real `KIMI_API_KEY` and journals the agent outputs at `docs/journals/260623-post-plan-3-verification.md`. This is the gating step that proves the agents actually follow the loop (not just the mocked machinery)."

**Status:** Post Plan 3 verification is the explicit **gating step** before Plan 4 starts. It is **NOT complete** as of scout date 2026-06-24.

**Implications for Plan 4:**

1. Plan 4 **cannot start** until the operator runs `pnpm test:debug` with `KIMI_API_KEY` set and files the journal.
2. The conditional e2e test `tools/learning-loop-mastra/__tests__/agent-e2e-integration.test.cjs` exists (verified in Plan 3 closeout journal line 38). Without `KIMI_API_KEY`, it skips cleanly.
3. Plan 4 phase-01 ("post-plan-3-verification") is the **first** phase in the plan directory — its `status: pending` correctly reflects that the gating step is incomplete.

**What Plan 4 phase-01 must do** (when it executes):
- Run `KIMI_API_KEY=<key> node --test tools/learning-loop-mastra/__tests__/agent-e2e-integration.test.cjs`
- File `docs/journals/260623-post-plan-3-verification.md` with non-empty output for each of the 3 agents (`ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`)
- File 1 `meta_state_log_change` with `change_target: 'docs/journals/260623-post-plan-3-verification.md'` (per brainstorm line 154)

---

## 7. Phase 1a/1b/3 review items deferred to Plan 4

Per `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` §"Plan 4 (cutover, blocked on Plans 1+2+3)" lines 377-385:

| # | Item | Source line | Current status (scouted) | File paths |
|---|---|---|---|---|
| 4.1 | `agent-manifest.json` final 5-group reconciliation (5→6 with agent group added in Plan 3) | plan §"Phases" | **PARTIALLY DONE.** Plan 3 added the `agent` group (3 tools: `ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`). The current `tools/learning-loop-mastra/agent-manifest.json` has **6 groups**: `gate` (5 tools), `workflow` (11 tools), `meta_state` (19 tools), `introspection` (3 tools), `runtime_agnostic` (1 tool), `agent` (3 tools) = **42 tools total**. Plan 4 phase-02 reconciles any final drift. **Note:** Plan 3's closeout journal claims "44 tools total" but the manifest shows 42; verify exact count during phase-02. | `tools/learning-loop-mastra/agent-manifest.json` |
| 4.2 | Cold-session discoverability enumeration update for new 8 `run_workflow_*` + 3 `ask_*` tools (was 31, should be 39-42) | review-260619-1429 finding #10 + unresolved question #5 | **NOT DONE.** `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` still asserts against `tools/learning-loop-mcp/tools/manifest.json` (the legacy 31-entry manifest). Plan 4 phase-06 must update it to enumerate the mastra manifest. | `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:68` (manifest path), `tools/learning-loop-mastra/agent-manifest.json`, `tools/learning-loop-mastra/tools/manifest.json`, `tools/learning-loop-mastra/workflows-manifest.json` |
| 4.3 | §3.10 reconciliation in `research-260611-2216-mastra-runtime-model-agnostic-productization.md` | brainstorm Q5 resolution | **NOT DONE.** §3.10 still has the 2026-06-12 reframe table at lines 622-637 showing the pre-Phase-D "Today: 56, post-reframe: ~36 bound" math. Plan 4 phase-03 edits §3.10 in-place to reflect the post-Phase-D tool surface (workflow group + agent group). Per Q5 protocol (brainstorm line 264): file `meta_state_log_change` first. | `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md:622-637` (§3.10 table) |
| 4.4 | AGENTS.md §1 contract note that Phase D shipped | brainstorm Touchpoints Plan 4 | **NOT DONE.** See section 1 above. | `AGENTS.md` §1 + §2 line 51 (tool count is stale) |

**Also from brainstorm §"Plan 1 Execution: Process Learnings" deferred to Plan 3 (item 3.3 — line 373):**

> "D-11 (master tracker line 287): Reconcile 4 tools missing from legacy `agent-manifest.json` (`propose_design`, `relationships`, `re_verify`, `supersede`)."

**Status:** ✅ **DONE** in Plan 3 Phase 4 (per journal `260623-phase-d-plan-3-shipped.md` line 30-33; tracker line 287 confirms ✅ DONE).

---

## 8. Cross-plan dependencies (other plans in flight)

Scanned `/home/datguy/codingProjects/learning-loop-template/plans/` for non-completed plans that might interact with Plan 4.

### 8.1 Recent plans (status: completed per journal existence)

| Plan dir | Status | Plan 4 interaction |
|---|---|---|
| `260618-1911-phase-d-plan-1-workflows/` | ✅ Closed | Plan 4 phase-07 (C-9) may want to inspect phase-01-file-move-precondition for the file-move pattern (already done for workflows). |
| `260619-2246-phase-d-plan-2-storage/` | ✅ Closed | Plan 4 no interaction (storage is in `tools/learning-loop-mastra/data/`, not `tools/learning-loop-mcp/`). |
| `260622-1810-phase-d-plan-1a-parity-tightening/` | ✅ Closed | Plan 4 no interaction. |
| `260622-2119-phase-d-plan-1b-review-fixups/` | ✅ Closed | Plan 4 no interaction. |
| `260623-1237-meta-state-pr-quality-and-hints-split/` | ✅ Closed | Plan 4 PR body must satisfy `rule-pr-body-registry-deltas` (per Plan 3 hardening). |
| `260623-1619-phase-d-plan-3-agents/` | ✅ Closed | Plan 4 phase-01 unblocks from this plan's Post Plan 3 step. |

### 8.2 Plans that might still be in flight

| Plan dir | Status check | Notes |
|---|---|---|
| `260623-meta-state-pr-quality-and-hints-split-shipped.md` (journal) | Closed | No interaction |
| `260624-1111-phase-d-plan-4-cutover/` (Plan 4 itself) | **9 phases, all `status: pending`** | This is the active plan. |

### 8.3 Plans/reports mentioning Plan 4 or Phase D

Per `grep -rn "Plan 4\|phase-d-plan-4"` (mental scan from the brainstorm + master tracker):
- `brainstorm-260618-1538-phase-d-plan-split-report.md` — origin (Plan 4 is item 4 in Approach A)
- `productization-260612-1530-master-tracker.md` — D-15 tracker entry (stale)
- `plans/260624-1111-phase-d-plan-4-cutover/plan.md` — Plan 4 itself (just created)

### 8.4 No conflict with prior plans

No in-flight plan (other than Plan 4 itself) references the mastra server rename or the C-9 cleanup. Plan 4 has **no merge conflicts** with active plan work.

---

## 9. Anomalies / surprises

### 9.1 Post Plan 3 verification is **NOT YET COMPLETE** despite Plan 3 shipping

The single most critical finding for Plan 4: the gating step (`docs/journals/260623-post-plan-3-verification.md`) is absent. The Plan 3 ship journal (line 102) is explicit:

> "Plan 4 pre-flight requires Post Plan 3 verification."

The hardening journal (line 53) reiterates:

> "**Post-Plan-3 verification** ... still required before Plan 4 starts."

**Plan 4 phase-01 must either (a) execute the verification itself or (b) confirm the operator has already run it externally.** If neither has happened, Plan 4 phases 2-9 should not start.

### 9.2 AGENTS.md §2 tool-count statement is stale

`AGENTS.md` line 51 says: "MCP server (`tools/learning-loop-mastra/server.js`) — 40 tools across 5 groups per `tools/learning-loop-mastra/agent-manifest.json` (verified 2026-06-17)."

Current state (verified 2026-06-24): **6 groups, 42 tools** in `tools/learning-loop-mastra/agent-manifest.json` (5 + 11 + 19 + 3 + 1 + 3 = 42). Plan 3's journal line 106 says "31 tools, 10 workflows, 3 agents" but that doesn't match the agent-manifest.json which lists `mastra_workflow_generate_prompt` + `mastra_workflow_notify_artifact` + `mastra_workflow_trigger` as workflow-group tools (3 of 11 are not "createWorkflow" outputs). **Recommend**: Plan 4 phase-02 reconciles this count with a direct count of the agent-manifest.json + server registration log.

### 9.3 `meta_state_log_change` with `evidence_journal` pointing to an absent file

`docs/journals/260623-phase-d-plan-3-shipped.md:102` cites the upcoming verification journal as a gate:

> "Plan 4 pre-flight requires Post Plan 3 verification."

But the journal referenced does not exist. **The contract is in the journal but the artifact is missing.** Plan 4 phase-01 is the only path to remediate.

### 9.4 The 8 `run_workflow_*` tools in agent-manifest.json are counted but the `tools/manifest.json` (legacy 31-entry) is still the cold-session-test target

`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:68` loads `tools/learning-loop-mcp/tools/manifest.json` (the legacy 31-entry manifest). The test currently asserts the **legacy** manifest's tools register correctly — it does not enumerate the **current** 42-tool surface. Plan 4 phase-06 must either:
- (a) Update the test to load `tools/learning-loop-mastra/agent-manifest.json` (with proper group traversal)
- (b) Add a second test that enumerates the mastra manifest
- (c) Move the test from `tools/learning-loop-mcp/` to `tools/learning-loop-mastra/` (since the test currently references `tools/learning-loop-mastra/server.js:35` already — it's testing the mastra server's manifest loading, not the legacy server's manifest)

**Test 1's actual current behavior** (verified from line 35 + line 68): it loads the **legacy** manifest from `tools/learning-loop-mcp/tools/manifest.json` and asserts those 31 legacy tool modules register — but the test's serverEntry is the mastra server (line 35). **The test is testing the wrong manifest.** This is the cold-session discovery gap that Plan 4 phase-06 must close.

### 9.5 Workflows-manifest.json has 10 entries but agent-manifest.json workflow group has 11 tools

`tools/learning-loop-mastra/workflows-manifest.json` (verified): **10 entries** (8 `run_workflow_*` + 2 storage workflows `workflow-storage-round-trip` + `workflow-storage-read`).

`tools/learning-loop-mastra/agent-manifest.json` workflow group (line 13): **11 tools** (`run_workflow_intake_orient`, `run_workflow_intake_plan`, `run_workflow_classify_prompt`, `run_workflow_prepare_runtime_request`, `mastra_workflow_generate_prompt`, `run_workflow_self_improvement`, `run_workflow_intentional_skip`, `run_workflow_report_phase_status`, `run_workflow_runtime_probe`, `mastra_workflow_notify_artifact`, `mastra_workflow_trigger`).

**3 of 11** in agent-manifest (`mastra_workflow_generate_prompt`, `mastra_workflow_notify_artifact`, `mastra_workflow_trigger`) are **not in `workflows-manifest.json`** — they are not `createWorkflow` outputs but rather legacy `createTool` workflow wrappers. The Plan 3 ship journal line 106 counted "10 workflows" (matching workflows-manifest.json) but the agent-manifest says 11. The 11th is a createTool — not a createWorkflow — so "10 workflows + 3 createTool workflow tools" is the actual surface.

**Plan 4 phase-02 must reconcile this arithmetic** between the 3 manifest files (`agent-manifest.json`, `tools/manifest.json`, `workflows-manifest.json`).

### 9.6 Test count gap from prior plan

Per `260624-phase-d-plan-3-post-review-hardened.md:54` (Forward-looking section): "Open test count math question. Plan estimated 1155 tests; actual was 1169 (1168 pass + 1 skip). Journal at `260623-phase-d-plan-3-shipped.md` reports 1162 — a 5-test gap is unaccounted (likely from an intervening Plan 2 addition that pushed the baseline from 1140 to 1145). Low priority; the count is documented in the journal breakdown."

**Plan 4's acceptance gate (per brainstorm §"Per-Plan Gates" line 174)**: "All 10 namespaces pass; legacy imports cleared; `pnpm test:cold-session` GREEN". Plan 4 should re-establish the test count baseline (currently 1169 per the hardening journal line 71) and confirm delta after each phase.

### 9.7 `rules/` rule-no-new-artifact-types may fire during Plan 4

The regex `rule-no-new-artifact-types` matches `(propose|design|create)\s+(a|an|new|separate|own|the)?\s*(schema|artifact|directory|convention)|new\s+(schema|artifact|directory|convention)`. Plan 4 phase-07 prose ("Move legacy to legacy/", "delete #mcp alias") should NOT trigger this rule. Plan 4 phase-08 ("Rename `learning-loop-mastra` to `learning-loop` in JSON keys") should also NOT trigger. But reviewer PR comments or the plan's own prose must avoid the trigger phrases. **Plan 4 phase-08 PR body needs wording care.**

---

## Summary of gaps Plan 4 must address

1. **CRITICAL GATE:** Post Plan 3 verification journal missing — phase-01 is the blocker.
2. **Manifest reconciliation** (phase-02): 6-group structure with 42 tools (was 5 groups / 40 tools per AGENTS.md line 51); reconcile the `tools/manifest.json` vs `workflows-manifest.json` vs `agent-manifest.json` arithmetic.
3. **§3.10 research report edit** (phase-03): update tool-surface table at lines 622-637 of research report.
4. **AGENTS.md §1 + §2 note** (phase-04): add Phase D shipped callout; fix stale 5-group/40-tools statement on line 51.
5. **Master tracker flip** (phase-05): D1-D7 already `[x]`; flip D-15 from 🔵 OPEN to ✅ DONE (stale entry); flip D-9 if still labeled 🟡 READY; add E2 partial closure note.
6. **Cold-session test** (phase-06): the test currently loads the wrong manifest — must enumerate the mastra manifest (was: legacy 31-entry manifest at `tools/learning-loop-mcp/tools/manifest.json`).
7. **Legacy cleanup** (phase-07): 5 `#mcp/*` cross-package imports + 2 direct `../../learning-loop-mcp/core/...` paths + 5 prose references in agent instructions + scout tool descriptions. Decide whether to keep `#mcp/*` alias until phase-08 ships, or migrate + alias-delete atomically.
8. **JSON rename R4** (phase-08): rename `learning-loop-mastra` → `learning-loop` in `.mcp.json`, `.factory/mcp.json`, `.claude/settings.local.json` (allowlist entries + `enabledMcpjsonServers`), Droid state, Claude Code state. Note: SKILL.md files do NOT reference the mastra name; only the 7 legacy `tools/learning-loop-mcp/references/...` paths.
9. **Acceptance gate** (phase-09): all 10 namespaces pass; cold-session 11/11 GREEN; legacy imports cleared; master tracker reconciled; 1 `meta_state_log_change` filed with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'`.

---

Scout complete.