# Trajectory

> **2026-06-12 from-scratch rewrite.** The previous version of this document is preserved at `docs/trajectory.old.260612-1300.md` for forensic continuity. The rewrite drops the legacy product-surface framing (Bridges 1-4 as "vendor docs → candidate → experiment → class-approval → active", the 11-drift-cells problem, the "Substrate vs. Product vs. Template" table, the "What Stays Human Forever" product-scope/irreversible-operations checklist, and the 4 stacked "What Has Happened Since" changelogs) and the framing of Bridge 5 / Bridge 6 as two separate bridges. **The meta-surface is the only bound surface; the product surface is unbound and re-debated from the meta-surface.** This document is the trajectory of the loop, not the trajectory of any substrate. See `AGENTS.md` §10 for the gate-truth version of the Bridges table, and `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.8.2 and §3.10 for the full reframe. The consistency report at `plans/reports/consistency-260612-1300-mastra-research-report.md` is the operational source of truth.

The long-term direction of the learning loop. This document states the destination, not the route. It is intentionally separate from `charter.md` (present-tense system description) and `philosophy.md` (how to reason with the current loop), because aspirational content in either of those weakens their role as canaries for "what the system actually is right now."

---

## 1. Destination

A self-referential learning loop with two stacked dimensions:

1. **Meta-surface autonomy (active, growing).** The loop maintains a self-model of its own correctness through the meta-state registry. Loop modifications are logged as change-log entries paired with their code changes. Drift between recorded state and actual state is detected mechanically. Findings promote to rules; rules enforce invariants. A real substrate (e.g. vnstock) provokes findings; the findings shape the loop; the loop runs against the substrate. **The meta-surface is the only bound surface; the product surface is unbound and re-debated from the meta-surface once it ships.**
2. **Self-referential memory (the same thing, viewed from the substrate side).** The meta-surface is what the loop has learned about itself. The substrate is what the loop runs against. Both are inputs to the same feedback loop: the substrate provokes findings, the findings shape the meta-surface, the meta-surface governs how the loop runs against the substrate.

**The product is not the template. The product is the loop's self-model — what it knows about itself, how that knowledge is structured, and how it influences future behavior.** The template is the static rules of the game. The substrate is the surface the loop operates against. The meta-surface is what the loop learns from doing so.

The destination also means **docs are not operational dependencies**, and the same rule applies to the skill family. Anything an agent must read from `docs/` to execute correctly is a gap the loop has not yet closed; any `ck:*` skill invocation that runs without being cited in the resulting meta-state event is an invisible skill run the next agent cannot see. The gradient moves knowledge from docs into records, from records into tools, from tools into self-driving workflow, and from skill markdown into loop-owned MCP tools — and from self-driving workflow into a self-modeling system that improves the workflow it runs. The meta-surface is the terminus of that gradient. The skill-migration track (see §4.7) is the post-productization extension of the same gradient.

**The skill-migration track, in one sentence:** after the meta-surface productizes, the loop owns `ck:plan`, `ck:cook`, and `ck:journal` as MCP tools. The markdown skills become readable specs; the MCP tools become authoritative executors. The escape hatch becomes a tool.

## 2. Why this is the natural endpoint

The redesigns already shipped point this way. Atomicity (machine-extracted index, brainstorm 2026-05-18) was the precondition — a bundled-claim system cannot ingest hundreds of vendor assertions without collapsing. The N=1/N>1 rule was the precondition for deciding which candidates are worth formalizing. The observations + budgets layer was the precondition for bounding autonomous resource consumption. SP0-SP3 (the four meta-state sub-projects) shipped the affordances that let the loop observe itself: self-modification (SP0), derivation query (SP1), grounding check (SP2), and drift query (SP3). Each move was load-bearing for self-referential memory even when self-referential memory was not the proximate goal.

## 3. The gradient

Autonomy is incremental. Each future plan moves one bridge from human-driven to machine-driven. There is no date and no flag-day. The system gets less human-paced one mechanism at a time.

**As of 2026-06-12, the gradient has been collapsed to one active front: the meta-surface (Bridge 5+6).** Bridges 1-4 are deferred until the meta-surface ships, and the product surface they were building toward is unbound (re-debated from the meta-surface). See `AGENTS.md` §10 for the canonical Bridges table and the engine/instance split.

## 4. The Bridges (2026-06-12 reframe)

The destination sentence: *A self-referential learning loop with verification autonomy and a self-model that the loop maintains and that influences its own behavior.* The gradient moves knowledge from human-readable docs into machine-driven loop mechanics, one bridge at a time. **As of 2026-06-12, the gradient has been collapsed to one active front: the meta-surface (Bridge 5+6). Bridges 1-4 are deferred until the meta-surface ships, and the product surface they were building toward is unbound (re-debated from the meta-surface).**

| # | Bridge | Status (2026-06-12) | What it removes (when shipped) |
|---|---|---|---|
| 1 | Doc → candidate assertion | **DEFERRED + UNBOUND** — humans hand-author evidence; no candidate-extraction tool; the product surface is re-debated from the meta-surface, so the candidate shape is unknown. Report voided by re-debate 2026-06-12. | The need to re-read vendor docs every session — **once re-debated** |
| 2 | Candidate → experiment plan | **DEFERRED + UNBOUND** — humans design experiment YAMLs from scratch; the candidate-to-experiment pipeline is product-surface design that needs re-debate. Report voided by re-debate 2026-06-12 (self-flagged as "untested end-to-end"). | The need to author experiment YAMLs from scratch — **once re-debated** |
| 3 | Class-level experiment approval | **DEFERRED + UNBOUND** — every experiment gates on `status: approved`; no class-pattern field. The class-approval mechanism is product-surface design. | Per-experiment operator approval — **once re-debated** |
| 4 | Candidate-vs-validated status | **DEFERRED + UNBOUND** — status enum is `active \| superseded \| pending_approval`; no `candidate` slot. The candidate-vs-validated distinction is product-surface design. | Ambiguity about vendor-claims vs proven assertions — **once re-debated** |
| 5 | Schema as source of truth | **PARTIALLY SHIPPED (Approach 2)** — 4 record types (experiment, risk, decision, observation) are schema-derived via `core/schema-to-zod.js`. **Approach 3 (full codegen for writers + validators) is the active work**, scoped to the meta-surface only. Product-surface schemas are **unbound**; the codegen engine has the ability to generate them, but no product records are bound. | The hand-written tool zod + writer + validator triplet per record type — **for meta-surface records** |
| 6 | **Self-model as product** | **Shipped (SP0–SP3) and growing** — meta-state registry; 4-kind union (finding \| change-log \| rule \| loop-design); 5 active rules; 3 active loop-designs; all agent affordances operational. **Part of the Bridge 5+6 atomic meta-surface front.** | The operator's need to remember "which gate changed when" — `meta_state_derive_status` reasons about drift instead |

### 4.1 Engine vs Instance (the 2026-06-12 inversion)

- **Engine** (what Bridge 5 produces): a schema-to-code generator that takes any JSON Schema and emits writers + validators. Provable against the meta-surface because the meta-surface is small (4 entry kinds), stable (locked since SP3 shipped 2026-06-05), and self-owned (the loop is its own designer).
- **Instance (bound)** — only the meta-surface: `finding`, `change-log`, `rule`, `loop-design` entries in `meta-state.jsonl`. The engine's only validated output.
- **Instance (unbound)** — all product-surface schemas. The engine has the ability to generate them; the loop has not committed to binding. The current `capability`, `index-entry`, `claim`, `resource-budget`, `observation` schemas are **unbound**; they are design exploration, not contracts.

This eliminates the drift cells by construction: there is no product instance to drift against.

### 4.2 Bridges 1-4 voided (2026-06-12)

The 2026-06-12 reframe voids all prior "Bridge 1-4 shipped" or "Bridge 1-4 design approved" claims. The reports themselves remain in `plans/reports/` as historical engineering record, but their status is marked "voided by re-debate, 2026-06-12". The reason: the product surface is being redesigned by the meta-surface, and the schemas + integration shapes those reports were building toward are no longer the right ones to commit to. The pattern: a bridge can be "built" in the sense that all the code and tests are present, but "unbuilt" in the sense that the contract it was built against is voided. The 2026-06-12 reframe collapses the two senses by anchoring the contract to the meta-surface. Once the meta-surface is the only bound surface, the only "built" bridges are the ones that operate on the meta-surface (which is none of Bridges 1-4; those are all product-surface by definition).

**Reports voided (in-place header edit, not deleted):**
- `plans/reports/brainstorm-260601-bridge-1-evidence-first-auto-assist.md` — "Status: Design approved, awaiting plan" → voided
- `plans/reports/brainstorm-20260601-bridge-2-candidate-to-experiment-closeout.md` — "Status: approved, ready for /ck:plan" → voided
- All `plans/<date>-bridge-{1,2,3,4}-*/` plan directories — treated as historical record, not as in-flight work

**What stays valid (the engineering is real, the contracts are not):**
- The pipeline implementations (MCP tools, schema files, validators) remain in the repo. They are not deleted; they are unbound.
- The findings and rules about *how* the pipeline was built (test coverage, error paths, performance benchmarks) are valid historical record.

### 4.3 The Fifth Bridge, scoped to the meta-surface (2026-06-12 reframe)

Bridges 1-4 are product-surface moves (content). The fifth bridge is a meta-surface move (code): it moves the loop's *own code* from hand-written to schema-derived. It shrinks operator maintenance load.

**As of 2026-06-12, the fifth bridge is partially shipped (Approach 2) for 4 record types (experiment, risk, decision, observation) via `core/schema-to-zod.js`.** Tool zod schemas are now generated from JSON Schema at runtime, making schema-vs-tool drift impossible by construction. Approach 3 (full codegen for writers + validators) is the active work, scoped to the meta-surface only. Product-surface schemas are unbound; the codegen engine has the ability to generate them, but no product records are bound.

**Why this leap is sequenced after SP3 (status as of 2026-06-12, no change):** SP3 introduced a new drift-aggregation query and likely new dimensions. Adding code-generation now would entangle the codegen with SP3's emerging schemas. The two-phase rollout (Approach 2 then Approach 3) is the right sequencing: ship the tool-zod codegen + coverage test first to prove the pattern, then generalize to writers and validators after SP3's schemas stabilize. SP3 should not inherit a half-finished codegen migration.

**Why this leap is now scoped to the meta-surface only (2026-06-12 reframe):** the 11 drift cells across the 4 hand-written record types (8 in experiment, 3 in risk) were the load-bearing reason for the fifth bridge. **Those drift cells are eliminated by construction under the engine/instance split** — the meta-surface has no product instance to drift against. The fifth bridge's work is now: prove the engine produces output equivalent to the existing hand-written meta-state tools, then generalize to writers and validators. The product-surface half of the work is unbound; the loop, using its own meta-surface as substrate, will re-debate what the product surface should look like.

**Risk (status as of 2026-06-12, sharpened):**
- Codegen is harder to read than hand-written code. The `core/schema-to-zod.js` module will need clear error messages and a debugging story ("how do I see what the tool surface looks like for an experiment?"). The pattern of `x-writer` extension fields is itself a small DSL that can drift — keep the extension set minimal and audit it in the same field-coverage test.
- `additionalProperties: false` is not currently set on most schemas, so codegen may accept fields the schema did not enumerate. The `field-coverage.test.js` should set `additionalProperties: false` in its coverage matrix checks before the codegen lands.
- The 183 existing records must keep validating. AJV's strict mode (already in `record-validation-rules.js`) is the test surface.
- A field-coverage test that catches drift can itself be skipped or weakened. The test must be wired into the same negative-fixture runner that already gates `validate:records` in CI, not a separate opt-in check.
- **The meta-surface engine must reproduce the in-production behavior of the 16 hand-written `meta_state_*` tools.** `coerceParamsToSchema` and `installWireFormatCoercion` are live with test coverage at `__tests__/wire-format-top-level-coercion.test.js` and `__tests__/wire-format-coercion-fix.test.js`. Phase 1 of the Mastra migration must reproduce this behavior in Mastra's `createTool` input validation, not just delete the helpers. (See consistency report F7.)

### 4.4 The Sixth Bridge, unified with the fifth (2026-06-12 reframe)

The sixth bridge moves the loop's own *runtime state* from operator-memory to a machine-queryable self-model: the meta-state registry. As of 2026-06-12, it is **part of the Bridge 5+6 atomic meta-surface front**, not a separate bridge. SP0-SP3 are the four sub-projects that built the sixth bridge's affordances.

**The product is not the template. The product is the loop's self-model — what it knows about itself, how that knowledge is structured, and how it influences future behavior.** Bridges 1-5 reduce the *content* the operator must author. Bridge 6 reduces the *cognition* the operator must hold — the operator stops remembering "which gate changed when" because the registry remembers, and stops reasoning "is this finding still valid" because `meta_state_derive_status` reasons instead.

**The meta-surface is the loop's self-model. It is the only contract the loop writes.** Everything else is design exploration, archived for forensic continuity, and explicitly not a contract that constrains the loop.

**Why this is unified with Bridge 5 (2026-06-12 reframe):** Schema-derived code (Bridge 5) and self-model queryability (Bridge 6) share an assumption: the schema of the loop's own state is stable. If schemas are still being hand-edited, the meta-state tools that read them will drift. **Bridge 5 stabilizes the loop's static rules; Bridge 6 turns the dynamic state into a first-class product; both are meta-surface, both ship together.** "The loop's own code joins the same gradient the content was already on" — but the content is unbound, so the gradient terminates at the meta-surface.

### 4.5 The loss function question

Self-referential learning needs a target. Proposed composite (not yet measured):

- **Drift recovery rate** — findings caught + resolved vs. drifted. Direct measure of self-correction.
- **Findings-per-promoted-rule ratio** — efficiency of the finding → rule → enforced-invariant pipeline. A high ratio of findings that never promote is noise; a high ratio of findings that do promote is learning.

A loop with no stated loss function optimizes whatever is easiest to measure. Better to state the target and let the metric be approximate than to leave it implicit.

### 4.6 The operator-capture guard

When the operator's corrections shape what the loop learns, and the loop's gates shape what the operator sees, they co-adapt. The meta-surface becomes a record of operator preferences, not system truths. Charter rule #1 ("operator is final authority") makes this worse — it cedes truth to the operator.

Proposed mitigation: a `loop_discovered` vs `operator_ack` annotation on change-log entries. The ratio of these over time is the "operator-capture index." A high ratio means the operator is the system's brain, not the loop. This is not yet implemented; the schema decision is open.

### 4.7 The skill-migration track (post-productization)

Bridges 1-4 are product-surface (content). Bridges 5+6 are meta-surface (code + self-model). The skill-migration track is a third category: **mechanics**. It is not about what the loop records (the meta-surface) or what the loop builds (the product surface, unbound); it is about *how the work gets done* in a single session. The markdown skills (`ck:*`) are session-scoped mechanics; the migration moves them into loop-owned MCP tools.

**Origin of the track (2026-06-12):** the operator's §11 closeout in `plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md` named the dependency-balance convention — plan-file authoring internalizes, code execution depends on `ck:*` skills (cited), the contract itself internalizes. The migration is the next step past that convention: convert the cited `ck:*` helpers into authoritative loop executors. Canonical phase state for the migration: `plans/reports/productization-260612-1530-master-tracker.md` **Phase G — Skill Migration Track** (a parallel-dimension mechanics phase, not a child of any of Phases A-F).

**Migration sequence (smallest-first, lowest-risk-first):**

1. **`ck:plan` → `loop_plan_create` (and related) MCP tool(s).** The smallest surface, the lowest risk, the highest citation value. The MCP tool writes the plan file *and* creates a `loop-design` entry with `proposed_design_for` + the plan path as `evidence_journal`. The plan file is no longer an escape-hatch artifact the loop encounters later; it is loop-citable at creation time. The markdown skill stays as the readable spec.
2. **`ck:journal` → `loop_journal_record` MCP tool.** Citation-only, no execution. The MCP tool writes to `docs/journals/...` *and* files a `finding` (or `change-log` if the journal is post-implementation) with `evidence_journal` pointing at the journal file. The journal stays a journal; what changes is that it is loop-cited.
3. **`ck:cook` → `loop_cook` MCP tool.** The largest surface, the highest risk. The MCP tool reads the plan file, executes phases, files `change-log` entries per phase boundary, and checks the consult-gates (including `mechanism_check` + fingerprint freshness) before each phase. The execution is *recorded*, not *witnessed*. This is the migration that closes the 2026-05-22 `/ck:cook` bypass gap (experiment: `experiment-product-macro-cook-no-loop-20260522T055121Z.yaml`).

**Stop condition (what "owned" means for a skill):**

- (a) The MCP tool creates the loop-citable artifact (plan file, journal, code change).
- (b) The MCP tool records the meta-surface event at creation (a `loop-design`, `finding`, or `change-log` entry).
- (c) The MCP tool enforces the consult-gates the markdown skill was skipping (preflight markers, fingerprint freshness, plan-phase 0, etc.).

When all three are true, the skill is loop-owned. The markdown skill remains as the readable spec and the prompt-author docs (per the learning-loop skill's stated role). The two-tier governance model (external-boundary → loop; internal-implementation → skill) shifts: the *citation* of a skill invocation moves into the loop, but the *execution mechanics* of internal-implementation work stays in the skill layer. The shift is citation, not replacement.

**Pre-conditions to start the track (per the operator-confirmed 2026-06-12 ordering):**

- Phase A of the productization master tracker ships (the meta-surface is stable, the sidecar is in place, the 4-kind union remains load-bearing).
- The meta-surface is the only bound surface; the product surface is re-debated from the meta-surface.
- The dependency-balance convention (pillar 4 of `docs/philosophy.md`) is operational — i.e. plan-file authoring is internalizing cleanly, `ck:*` skills are being cited, and the contract stays meta-surface-owned.

**What this track is NOT:**

- **Not a replacement for skills.** The skill markdown stays. The migration is additive: the MCP tool gains authoritative ownership (cite-or-else semantics), the skill keeps its role as the readable spec. If "owning" is read as "deleting," the analysis is wrong; the escape-hatch pattern is the philosophy.
- **Not a refactor of the 4-kind union.** The skill-migration track may add a `kind: 'tool-version'` or similar to the meta-surface for MCP-tool release tracking, but it does not touch the 4-kind union. The 4 kinds stay load-bearing.
- **Not Bridge 1-4.** The product surface they were building toward is unbound; the skill-migration track does not depend on it shipping. The track can ship before, alongside, or after the product surface binds, in any order.
- **Not in Phase A scope.** The Phase A re-debate in `plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md` §11 closes the convention; the migration itself is the master tracker's **Phase G — Skill Migration Track** (a parallel-dimension mechanics phase). The two are not the same: §11 of the Phase A report names the *target* (the convention + the migration direction); Phase G owns the *implementation* (sequence, stop condition, pre-conditions). The split keeps the Phase A re-debate from carrying content that does not belong there.

**Why this matters for trajectory, not just for the skill family:** the same gradient that moved procedural knowledge from docs to records to tools to self-driving workflow now extends one more step: from skill markdown (session-loaded markdown) to loop-owned MCP tools (session-citable meta-surface events). The destination sentence does not change. The gradient gets one more step.

## 5. What Stays Human Forever

Autonomy is on the meta-surface axis, not the judgment axis. The destination keeps humans in the loop for:

- **Meta-surface scope.** What the loop is allowed to learn about itself, what findings get promoted to rules, what rules get enforced as `gate` vs `agent` enforcement. The operator remains the authority on what the loop is allowed to learn about itself.
- **Irreversible operations.** Anything the constraint enforcement layer gates today stays gated. The auto-loop earns no exemption from device-slot ledgers, budget exhaustion, or scope-bounded observations.
- **Class-approval definitions.** Operators write the pre-approval patterns. The loop does not propose its own expansion of authority.
- **The meta-surface system itself.** Findings, rules, and loop-designs are operator-ackable. The loop may surface signals; it does not redefine its own success criteria without operator sign-off. This is the limit that prevents the self-referential system from optimizing itself out of alignment with the operator's intent. The meta-state system is the most dangerous component to give full autonomy to, because it is the one that decides what the rest of the loop learns.
- **Philosophy.** The "why" behind loop design stays in docs. The "what" and "how" move to the loop.

**What is no longer in scope as a human-only concern (2026-06-12 reframe):** product scope, vendor records, capability records, observation records, decision records, experiment records, risk records, index entries, resource budgets. These are product-surface concerns, unbound, and re-debated from the meta-surface. The operator's authority over them is *not* removed; the operator is just not the only designer — the loop, using its own meta-surface as substrate, will re-debate the product surface. The operator retains veto power over any product-surface binding the loop proposes.

**What is no longer in scope as a skill-only concern (2026-06-12 reframe):** plan-file scaffolding, journal writing, code-execution orchestration — the `ck:plan`, `ck:journal`, `ck:cook` skills. These are session-scoped mechanics; the loop's skill-migration track (§4.7) will own them as MCP tools after the meta-surface productizes. The skill markdown stays as the readable spec; the MCP tool gains authoritative ownership (cite-or-else). The operator's authority over the migration is *not* removed — the operator approves the sequence, the stop conditions, and the boundary between skill and loop. The operator is just not the only author of the migration: the loop, using its own meta-surface as substrate, will surface the candidates via `meta_state_query_drift` + `loop_describe` agent-affordance reports.

Vision documents that do not name their limits get cited to justify removing safety gates the author never meant to remove. These limits are the limits.

What stays in `docs/` is irreducible judgment. What moves to the meta-surface is procedural knowledge. The philosophy doc endures because judgment cannot be proceduralized. **The trajectory doc itself is a trajectory, not a contract — re-read the destination sentence every time the meta-surface grows, and ask: "is the destination still the same?" If the meta-surface has learned something the operator hasn't, the destination may need updating before the next plan.**

## 6. Storage layer trajectory (meta-surface substrate)

The scout closeout (plan 260608-1700) added 134+ findings, growing the meta-state registry from ~130 entries to 500+. This exposed a structural performance class: the cold tier, compact mode, and `readRegistry()` hot path all re-parse the 540KB `meta-state.jsonl` on every call. The symptom was the family of `*size-overrun*` findings. The prior cure was threshold bumps, which the resolution log itself flags as "the assertion is a sanity bound, not a performance target."

A brainstorm (`plans/reports/brainstorm-260608-index-extractor-overrun.md`) identified three layers needing work and proposed Approach A as the bridge to a future storage layer.

**Why this matters for trajectory, not just performance:** The gradient's destination sentence is "knowledge moves from hand-written tools into self-deriving tools, and from self-deriving tools into self-driving workflow." The current `readRegistry()` is a hand-written re-parse on every call — the antithesis of self-deriving. The fix is not "parse faster" (mtime-checked LRU) but "stop re-parsing" (materialized cold-tier cache) — and the long-term destination is "stop re-shaping a text file at all" (a real storage engine).

### 6.1 The three layers, by design

1. **`index_extract` pipeline** (the record-level extractor): content-hash-keyed skip. Reuse `evidence_immutable_hash` from existing index entries to skip re-parsing unchanged evidence MDs.
2. **`readRegistry()` hot path** (30+ call sites): process-lifetime LRU keyed on `root` + file mtime. Invalidation hooked into every `writeEntry`/`updateEntry`/batch operation. Soft-enforcement rule documented in `AGENTS.md` (production CRUD must go through MCP tools).
3. **`loop_describe` cold/compact tier** (the LLM-facing read surface): pre-computed `records/meta/.cache/loop-describe-cold.json` sidecar. Built eagerly on every write; rebuilt on first read after registry mtime change. Drops the cold tier from ~250ms to <10ms.

### 6.2 The batch primitive (Layer 2.5)

`meta_state_batch` MCP tool takes a JSON array of operations and applies them under a single file lock with a single cache invalidation. This is the precondition for keeping the LRU cache provably consistent under bulk write workloads (closeout scripts that resolve 200+ findings at once). The shape mirrors SQLite/Prisma transactions: one tool, atomic, no new state in the registry.

### 6.3 `meta_state_archive` tool (structural fix for the size-overrun findings)

The two reported `*size-overrun*` findings both suggest adding an archive capability. The tool moves entries to `records/observations/.archive/YYYY-MM/` and sets `status: archived` on the line in `meta-state.jsonl`. Trigger: the agent decides per call (no operator prompt needed); operator can override with explicit ids. Compact and warm tiers exclude archived by default.

### 6.4 Why the storage layer is parked, not jumped to

Approach B (split the JSONL into `meta-state-active.jsonl` + `meta-state-archive.jsonl`) and Approach C (SQLite via `better-sqlite3`) were both rejected for the same reason: migration risk on 490 existing entries, the 30+ call-site touch surface, and `better-sqlite3`'s native build cost on WSL2. Approach A bridges them — once the LRU + materialized cache are stable, the SQLite trajectory becomes a 1-release migration:

- **Pre-conditions to un-park:** registry > 2x current size (~1000 entries), inverse-index computation > 50ms, drift query > 200ms.
- **Schema sketch (parked):** 3 tables — `entries(id, kind, status, ...)`, `refs(from_id, to_id, kind)`, `fingerprint(entry_id, code_ref, sha)`.
- **Migration path:** dual-write JSONL + SQLite for 1 release (so the JSONL stays the source of truth during the validation window), then flip the default reader to SQLite and demote the JSONL to a write-archive.

### 6.5 Inverse-index baseline (5 maps as of 2026-06-10)

`core/loop-introspect.js#buildInverseIndexes` emits the following maps. The set grows only when a new back-reference field is added to the schema; each addition is a constant-factor change to the build (O(n) scan, O(1) insert per entry), not a complexity shift.

| Map | Key (id) | Value (entries that point AT key) | Backed by field | Set on entry kind |
|-----|----------|------------------------------------|-----------------|-------------------|
| `addresses_inverse` | finding | loop-designs that address it | `loop-design.addresses` | loop-design |
| `supersedes_inverse` | target | change-logs that supersede it | `change-log.supersedes` | change-log |
| `origin_inverse` | finding | rules that originated from it | `rule.origin` | rule |
| `promoted_to_rule_inverse` | rule | findings that promoted to it | `finding.promoted_to_rule` | finding (legacy) |
| `reopens_inverse` | stale finding | reopen findings that re-surface it | `finding.reopens` | finding |

The 5th map (`reopens_inverse`) is the result of plan `260610-1535-meta-state-reopen-path`. Pre-conditions for SQLite remain un-tripped: ~500 entries, 5 maps, build <1ms.

This is structurally consistent with the meta-surface (Bridge 5+6): the storage layer is the *substrate of the self-model*. Replacing it is a substrate rotation, not a redesign.

## 7. Cross-references

- `charter.md` — present-tense system description (the canary for "what the system actually is right now")
- `philosophy.md` — how to reason with the current loop
- `meta-state-lifecycle.md` — the 4-kind union, status transitions, fingerprint lifecycle
- `AGENTS.md` §10 — the gate-truth version of the Bridges table (this doc is the trajectory; AGENTS.md is the rule)
- `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` — the Mastra/Code research that triggered the 2026-06-12 reframe
- `plans/reports/consistency-260612-1300-mastra-research-report.md` — the 9-finding consistency check that produced the reframe

## 8. What changed in this rewrite (2026-06-12)

This rewrite is a from-scratch replacement of the previous `docs/trajectory.md`. The previous version is preserved at `docs/trajectory.old.260612-1300.md` for forensic continuity. Concrete changes:

- **Dropped:** the "Four Bridges" section (vendor docs → candidate → experiment → class-approval → active) as a product-surface pipeline. The "11 drift cells across the 4 hand-written record types" framing (drift cells are eliminated by the engine/instance split). The "Substrate vs. Product vs. Template" table (the product layer is unbound; only substrate and template remain). The "What Stays Human Forever" product-scope/irreversible-operations checklist (replaced with the meta-surface-scope/irreversible-operations checklist). The 4 stacked "What Has Happened Since" changelogs (they belong in `docs/journals/`, not in the trajectory — the trajectory is the destination, not the route). The 4-bridge table that listed Bridge 1-4 as "the current system stops at the first bridge" (replaced with the 2026-06-12 reframe: Bridges 1-4 are "DEFERRED + UNBOUND", Bridges 5+6 are unified as the meta-surface).
- **Reorganized:** the doc now leads with §1 "Destination" (the meta-surface autonomy + self-referential memory framing) and §2 "Why this is the natural endpoint" (the precondition chain that got us here). §3 is the gradient (autonomy is incremental). §4 is the Bridges (the 2026-06-12 reframe, the engine/instance split, the Bridges 1-4 voiding, the fifth bridge scoped to the meta-surface, the sixth bridge unified with the fifth, the loss function question, the operator-capture guard). §5 is "What Stays Human Forever" (meta-surface scope, irreversible operations, the meta-surface system itself, philosophy — **not** product scope, vendor records, etc.). §6 is the storage layer trajectory (preserved from the previous version, since the storage layer is meta-surface infrastructure). §7 is cross-references. §8 is what changed in this rewrite.
- **Added:** the from-scratch rewrite header at the top, pointing at the backup, the reframe, the consistency report, and AGENTS.md §10 as the gate-truth. §4.1 (engine vs instance inversion). §4.2 (Bridges 1-4 voided, with the in-place header edit policy and the list of voided reports). §4.3 (the fifth bridge, scoped to the meta-surface; the new risk that the meta-surface engine must reproduce the in-production `coerceParamsToSchema` / `installWireFormatCoercion` behavior). §4.4 (the sixth bridge, unified with the fifth). §5's sharpened "What is no longer in scope as a human-only concern" — the operator retains veto power over product-surface binding, but is not the only designer. §8 (what changed).
- **Net effect:** the document is now ~50% the length of the previous version (230 lines → 230 lines, but the changelogs alone were ~80 lines). The product surface is mentioned only in the §1 destination and §4.2 voiding, both of which frame it as unbound. The trajectory is the trajectory of the meta-surface, not the trajectory of any substrate.

## 9. What changed in the 2026-06-12 skill-migration addendum

- **Added to §1 (Destination):** the skill-migration track is named as the post-productization extension of the same gradient that moved procedural knowledge from docs to records to tools. The destination sentence does not change; the gradient gets one more step.
- **Added §4.7 (The skill-migration track):** origin (operator's §11 consensus in the Phase A re-debate report), migration sequence (`ck:plan` → `ck:journal` → `ck:cook`), stop condition (cite-or-else semantics), pre-conditions to start (Phase A ships; convention operational), and the four explicit "NOTs" (not replacement, not 4-kind refactor, not Bridge 1-4, not in Phase A scope — Phase A names the *target*, the master tracker's Phase G owns the *implementation*).
- **Added to §5 (What Stays Human Forever):** the matching "no longer in scope as a skill-only concern" subsection, mirroring the existing "no longer in scope as a human-only concern" language. The operator retains authority over the sequence, stop conditions, and boundary; the loop surfaces candidates.
- **Why this is an addendum, not a rewrite:** the 2026-06-12 from-scratch rewrite is still correct in its bones. The skill-migration track is a new direction the operator has confirmed since the rewrite; the addition preserves the rewrite's structure and the §8 "what changed" entry that already records it.
