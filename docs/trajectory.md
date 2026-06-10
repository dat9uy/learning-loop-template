# Trajectory

The long-term direction of the learning loop. This document states the destination, not the route. It is intentionally separate from `charter.md` (present-tense system description) and `philosophy.md` (how to reason with the current loop), because aspirational content in either of those weakens their role as canaries for "what the system actually is right now."

## Destination

A self-referential learning loop with two stacked dimensions:

1. **Verification autonomy (in progress).** Vendor documentation flows into candidate assertions, candidates become planned experiments, experiments run inside class-level approval gates and budget bounds, validated assertions land in the index, and product consumes only validated assertions. The human operator approves classes of work, not individual experiments, and stays in the loop for judgment calls (product scope, irreversible operations, gate definitions).
2. **Self-referential memory (active, growing).** The loop maintains a self-model of its own correctness through the meta-state registry. Loop modifications are logged as change-log entries paired with their code changes. Drift between recorded state and actual state is detected mechanically. Findings promote to rules; rules enforce invariants. A real substrate (e.g. vnstock) provokes findings; the findings shape the loop; the loop runs against the substrate.

**The product is not the template. The product is the loop's self-model — what it knows about itself, how that knowledge is structured, and how it influences future behavior.** The template is the static rules of the game. The substrate is the surface the loop operates against. The meta-state is what the loop learns from doing so.

The destination also means **docs are not operational dependencies**. Anything an agent must read from `docs/` to execute correctly is a gap the loop has not yet closed. The gradient moves knowledge from docs into records, from records into tools, from tools into self-driving workflow — and from self-driving workflow into a self-modeling system that improves the workflow it runs.

## Why This Is the Natural Endpoint

The redesigns already shipped point this way. Atomicity (machine-extracted index, brainstorm 2026-05-18) was the precondition — a bundled-claim system cannot ingest hundreds of vendor assertions without collapsing. The N=1/N>1 rule was the precondition for deciding which candidates are worth formalizing. The observations + budgets layer was the precondition for bounding autonomous resource consumption. Each move was load-bearing for autonomy even when autonomy was not the proximate goal.

## The Gradient

Autonomy is incremental. Each future plan moves one bridge from human-driven to machine-driven. There is no date and no flag-day. The system gets less human-paced one mechanism at a time.

## Milestone: Observation-Driven Gate Enforcement

Crossed 2026-05-20. The constraint enforcement layer evolved from hardcoded rules to stateful observation-driven gates.

Before this milestone, the write gate blocked paths mechanically (`records/evidence/**`) with no override mechanism. Operator approval was conversational — the agent asked, the operator said yes, the agent tried again, the gate blocked again. The agent fell back to `Bash` heredocs, bypassing the gate entirely.

After this milestone, all `records/**` writes are blocked by default. The write gate reads `write-path` observations and uses the same staleness logic (`checkObservationStaleness`) as the bash gate. Operator approval is recorded via the `tools/learning-loop-mcp/` MCP server as an observation YAML. The gate reads that observation on the next tool call and allows the write. The bash gate also checks path-write patterns, closing the heredoc bypass.

What changed:
- **Approval became mechanical.** Conversational yes/no is not enough. The MCP server must record an observation.
- **Gates became stateful.** They read `records/observations/` on every tool call, same as the bash gate reads constraint observations.
- **The loop became self-referential.** The loop's state machine (observations) controls the loop's own execution gates.
- **Staleness is unified.** The inbound gate's `.last-operator-message` marker invalidates observations for both bash constraints and write paths.

This milestone is load-bearing for autonomy. A loop that cannot control its own execution boundaries cannot safely run unsupervised experiments. Observation-driven gates make the enforcement layer programmable by the operator rather than hardcoded by the system designer.

**Clarification:** The gate enforces observation *existence* (pattern matched → observation present? → pass/block). Budget enforcement is the *agent's* responsibility: the agent reads the budget observation, checks context (fingerprint, container, idempotency), and decides whether to proceed. The meta-state registry captures this reasoning for future sessions. See `docs/observation-vs-meta-state.md` for the full separation.

## The Four Bridges

Each bridge moves knowledge from human-readable docs into machine-driven loop mechanics. The current system stops at the first bridge.

1. **Doc → candidate assertion.** Vendor markdown is parsed (structured extraction or LLM-assisted) into atomic candidate assertions. Today: humans hand-author evidence from doc reading. Gap: no candidate-extraction tool, and vendor docs do not author to `## Findings` convention. *This bridge closes the gap between "read docs" and "encode knowledge."*
2. **Candidate → experiment plan.** Each candidate maps to a runnable verification (call, expected shape, success criterion). Today: humans design experiment YAMLs from scratch. Gap: no mapping convention from "vendor says X" to "experiment Y proves X." *This bridge closes the gap between "know what to test" and "know how to test it."*
3. **Class-level experiment approval.** A pre-approved pattern (e.g., "read-only sandbox calls to capability Z under N-call budget") lets the loop run experiments without per-experiment operator approval. Today: every experiment gates on `status: approved`. Gap: schema has no class-pattern field; approval is per-record. *This bridge closes the gap between "ask permission every time" and "pre-authorize safe patterns."*
4. **Candidate-vs-validated status.** Index entries carry a status before experimental proof (`candidate`) distinct from after (`active`). Product reads only `active`. Today: status enum is `active | superseded | pending_approval` — no slot for "vendor-asserted, not yet verified." *This bridge closes the gap between "vendor claims" and "proven assertions."*

Each bridge reduces doc dependency. Bridge 1 removes the need to re-read vendor docs. Bridge 2 removes the need to manually author experiment plans. Bridge 3 removes the need for per-experiment operator approval. Bridge 4 removes ambiguity about what is proven vs what is merely claimed.

## The Fifth Bridge: Schema as Source of Truth (the big leap)

Bridges 1-4 move *content* from human-readable docs into machine-actionable records. They shrink operator cognitive load. The fifth bridge is different: it moves the loop's *own code* from hand-written to schema-derived. It shrinks operator maintenance load.

Today, for every record type, four parallel "field catalogues" exist:

1. The JSON schema in `schemas/<type>.schema.json`.
2. The tool's zod input schema in `tools/create-<type>-record-tool.js` and `tools/update-<type>-record-tool.js`.
3. The writer's output shape in `core/<type>-writer.js#build<Type>Yaml`.
4. The semantic validator's read paths in `core/claim-verification-rules.js` and `core/record-validation-rules.js`.

Each is hand-written. None of them is cross-checked. They drift. The SP2 cook session hit this: the writer never bridged top-level `assertion_refs` to `verification.assertion_refs`; the bridge-2 unit test only checked the top level; the record was rejected by validation. Three of the four layers were correct in isolation; the system as a whole produced an invalid record. Eleven drift cells exist across the four hand-written record types (8 in experiment, 3 in risk; decision and observation are clean).

The fifth bridge replaces this with "write the schema; the code derives":

- **Tool zod schemas** are generated from the JSON schema by a new `core/schema-to-zod.js` module. The 8 hand-written tool zod files become one-liners. Drift between the schema and the tool surface becomes impossible by construction.
- **Record builders** are generated from the schema's `properties`, `required`, and a small `x-writer` extension for defaults. The four hand-written writers (`experiment-writer.js`, `risk-writer.js`, `decision-writer.js`, `observation-writer.js`) collapse into thin wrappers.
- **Semantic validators** consume the schema's "required-derived-fields" annotations. New semantic rules are declared in the schema, not in JS.

This is the big leap because it is **self-maintaining**: when a new field is added to a schema, every dependent layer updates without human action. The hand-maintenance surface shrinks from "four files per record type" to "one file per record type" (the schema). The class of bug the SP2 cook hit becomes structurally impossible. Future field additions no longer require coordinated edits across schema + 2 tool files + writer + validator + test fixtures.

The destination sentence reads even more clearly with this bridge in place: knowledge moves "from docs into records, from records into tools, **from hand-written tools into self-deriving tools, and from self-deriving tools into self-driving workflow.**" The loop's own code joins the same gradient the content was already on.

### Why this leap is sequenced after SP3

SP3 introduces 1+ new tools to the manifest, a new drift-aggregation query, and likely a new dimension or two. Adding code-generation now would entangle the codegen with SP3's emerging schemas. The two-phase rollout described in `plans/reports/brainstorm-260603-field-coverage.md` (Approach 2 then Approach 3) is the right sequencing: ship the tool-zod codegen + coverage test first to prove the pattern, then generalize to writers and validators after SP3's schemas stabilize. SP3 should not inherit a half-finished codegen migration.

### Risk

- Codegen is harder to read than hand-written code. The `core/schema-to-zod.js` module will need clear error messages and a debugging story ("how do I see what the tool surface looks like for an experiment?"). The pattern of `x-writer` extension fields is itself a small DSL that can drift — keep the extension set minimal and audit it in the same field-coverage test.
- `additionalProperties: false` is not currently set on most schemas, so codegen may accept fields the schema did not enumerate. The new `field-coverage.test.js` should set `additionalProperties: false` in its coverage matrix checks before the codegen lands.
- The 183 existing records must keep validating. AJV's strict mode (already in `record-validation-rules.js`) is the test surface.
- A field-coverage test that catches drift can itself be skipped or weakened. The test must be wired into the same negative-fixture runner that already gates `validate:records` in CI, not a separate opt-in check.

## The Sixth Bridge: Self-Model as Product

Bridges 1–4 move *content* from docs into machine-actionable records. Bridge 5 moves the loop's own code from hand-written to schema-derived. The sixth bridge moves the loop's own *runtime state* from operator-memory to a machine-queryable self-model: the meta-state registry.

**The product is not the template. The product is the loop's self-model — what it knows about itself, how that knowledge is structured, and how it influences future behavior.** Bridges 1–5 reduce the *content* the operator must author. Bridge 6 reduces the *cognition* the operator must hold — the operator stops remembering "which gate changed when" because the registry remembers, and stops reasoning "is this finding still valid" because `meta_state_derive_status` reasons instead.

Substrate vs. product vs. template:

| Layer | Role | Lifespan | Lives in |
|---|---|---|---|
| **Template** | Static rules of the game — gates, hooks, schemas, MCP tools | Frozen-ish; evolves through formal change-log entries | `tools/learning-loop-mcp/`, `schemas/`, `.claude/coordination/` |
| **Self-model (product)** | The loop's learning about itself — findings, rules, drift, lifecycle | Grows continuously per operator; change-log tier is durable | `meta-state.jsonl` + 11 `meta_state_*` MCP tools |
| **Substrate** | Real surface area the loop operates against so it generates real findings. Replaceable. | Disposable — exists to provoke learning, not to be learned *about* | `records/vnstock/`, `product/api/` |

The substrate exists to provoke learning; the learning is not *about* the substrate. A recent example: `meta-260606T2106Z-agent-called-meta-state-log-change-mcp-tool-5-times-in-succe` (category `loop-anti-pattern`, subtype `tool-retry-loop`) is the loop noticing its own retry pathology. That finding has no relationship to vnstock. It is the loop learning about the loop.

### Why this is sequenced after Bridge 5

Schema-derived code (Bridge 5) and self-model queryability (Bridge 6) share an assumption: the schema of the loop's own state is stable. If schemas are still being hand-edited, the meta-state tools that read them will drift. Bridge 5 stabilizes the loop's static rules; Bridge 6 turns the dynamic state into a first-class product.

### The loss function question

Self-referential learning needs a target. Proposed composite (not yet measured):

- **Drift recovery rate** — findings caught + resolved vs. drifted. Direct measure of self-correction.
- **Findings-per-promoted-rule ratio** — efficiency of the finding → rule → enforced-invariant pipeline. A high ratio of findings that never promote is noise; a high ratio of findings that do promote is learning.

A loop with no stated loss function optimizes whatever is easiest to measure. Better to state the target and let the metric be approximate than to leave it implicit.

### The operator-capture guard

When the operator's corrections shape what the loop learns, and the loop's gates shape what the operator sees, they co-adapt. The meta-state becomes a record of operator preferences, not system truths. Charter rule #1 ("operator is final authority") makes this worse — it cedes truth to the operator.

Proposed mitigation: a `loop_discovered` vs `operator_ack` annotation on change-log entries. The ratio of these over time is the "operator-capture index." A high ratio means the operator is the system's brain, not the loop. This is not yet implemented; the schema decision is open.

## What Stays Human Forever

Autonomy is on the verification axis, not the judgment axis. The destination keeps humans in the loop for:

- **Product scope.** What capability gets built, what gets cut, what ships to whom.
- **Irreversible operations.** Anything the constraint enforcement layer gates today stays gated. The auto-loop earns no exemption from device-slot ledgers, budget exhaustion, or scope-bounded observations.
- **Class-approval definitions.** Operators write the pre-approval patterns. The loop does not propose its own expansion of authority.
- **Decisions and risks.** Both record types remain human-authored.
- **Philosophy.** The "why" behind loop design stays in docs. The "what" and "how" move to the loop.
- **The loop's self-model boundaries.** The operator decides what counts as a "loss function" and what counts as "operator capture." The loop may surface signals; it does not redefine its own success criteria without operator sign-off. This is the limit that prevents the self-referential system from optimizing itself out of alignment with the operator's intent. The meta-state system is the most dangerous component to give full autonomy to, because it is the one that decides what the rest of the loop learns. The operator remains the authority on what the loop is allowed to learn about itself.

Vision documents that do not name their limits get cited to justify removing safety gates the author never meant to remove. These limits are the limits.

What stays in `docs/` is irreducible judgment. What moves to `records/` is procedural knowledge. The operator guide shrinks as the loop encodes its contents. The philosophy doc endures because judgment cannot be proceduralized.

## Cross-References

- Present-tense system description: `charter.md`.
- How to reason with the current loop: `philosophy.md`.
- Current artifact model (claim deprecation, index entries): `record-system-architecture.md`, `artifact-concepts.md`.

## What Has Happened Since (2026-06-05 update)

The meta-state agent-affordances decomposition (`plans/reports/brainstorm-260602-meta-state-agent-affordances.md`) is the precondition for "the loop's own code joins the same gradient the content was already on" (the destination sentence). As of 2026-06-05, all four sub-projects ship.

| Sub-project | Status | Tools | Tests |
|---|---|---|---|
| SP0 (Self-Modification Affordance) | SHIPPED | `meta_state_log_change` + `meta_state_sweep` | 475 (+25) |
| SP1 (Derivation Query) | SHIPPED | `meta_state_derive_status` | 511 (+36) |
| SP2 (Grounding Check) | SHIPPED | `meta_state_check_grounding` + `meta_state_refresh_fingerprint` | 552 (+41) |
| SP2 gap closure (discoverability + manifest backfill) | SHIPPED | (manifest backfill) | 557 (+1) |
| SP3 (Drift Query) | SHIPPED | `meta_state_query_drift` | 674 (+53) |
| **Field-coverage (Approach 2)** | SHIPPED | 4 record types schema-derived | 621 (+49) |

**The Fifth Bridge** (schema as source of truth) shipped for 4 record types (experiment, risk, decision, observation) via `core/schema-to-zod.js`. Tool zod schemas are now generated from JSON Schema at runtime, making schema-vs-tool drift impossible by construction. Approach 3 (full codegen for writers + validators) is sequenced after SP3 — SP3's schemas need to stabilize first.

**The "self-referential" milestone has been crossed.** The loop's state machine (`meta-state.jsonl`) now controls the loop's own audit trail. The agent can:
- Log its own modifications via `meta_state_log_change` (SP0)
- Compute the effective status of any finding via `meta_state_derive_status` (SP1)
- Verify the file/code/test surface of any finding via `meta_state_check_grounding` (SP2)
- Aggregate drift events across the entire registry via `meta_state_query_drift` (SP3)
- The 4-phase TDD plan for SP3 was extended with a Phase 4 (docs-update phase, added 2026-06-05 per operator request) to keep the user-facing docs aligned with the loop's actual state. SP3 closed the drift-surfacing gap: the agent can now ask "which entries disagree with their derived/grounded state?" and get a flat list of drift events.
- The brainstorm that made atomicity load-bearing: `plans/reports/brainstorm-20260518-machine-extracted-index.md`.
- The design for schema-derived code generation (the fifth bridge): `plans/reports/brainstorm-260603-field-coverage.md`.

## What Has Happened Since (2026-06-08 revision)

The trajectory document was revised to reflect a corrected understanding surfaced in `plans/reports/predict-revised-loop-memory-correction-260608-1012-vnstock-as-substrate-meta-state-as-product-report.md`: the meta-state registry is the product, not the template's bookkeeping. The substrate (currently vnstock) is replaceable; what makes it valuable is its non-determinism, not its identity.

Three structural decisions identified but not yet implemented:

1. **Tiered meta-state migration (Model C).** Template ships clean. Findings stay operator-local. Promoted rules can be exported as a YAML bundle and PR'd back to the template. The template itself becomes a snapshot of "rules the loop has learned are worth enforcing." Implementation: a new `meta_state_export_rules` MCP tool that emits a template-importable YAML bundle of promoted rules.
2. **Composite loss function for self-referential learning.** Drift recovery rate + findings-per-promoted-rule ratio. The point is not to optimize; it is to make the learning trajectory visible. Extension target: surface these metrics through `meta_state_query_drift`.
3. **Operator-capture guard.** A `loop_discovered` vs `operator_ack` annotation on change-log entries. The ratio is the operator-capture index. Schema decision is open; the question is whether the annotation lives in the change-log entry, in a derived metric, or both.

The destination sentence now reads: "A self-referential learning loop with verification autonomy *and* a self-model that the loop maintains and that influences its own behavior." The fifth bridge (schema as source of truth) is unchanged; the sixth bridge (self-model as product) is added above.

Open questions filed from the revised finding:

- A `LIVE.md` declaration in the repo root distinguishing template content from substrate work, so future operators (and future selves) have a clean handoff path.
- A "substrate properties" document specifying the three required properties (irreversible operations to gate, non-deterministic failure modes, evidence files the loop can fingerprint) so the substrate can be rotated when vnstock stabilizes.
- A "findings-per-week" trend to answer: "is vnstock still generating novel findings, or has the loop learned enough about it that findings have dried up?"
- A "learning trajectory" reflection written periodically by the operator from the meta-state — outside the loop — to catch the operator-capture signal early.

## What Has Happened Since (2026-06-08 — index-extractor optimization, Approaching the Storage Layer)

The scout closeout (plan 260608-1700) added 134+ findings, growing the meta-state registry from ~130 entries to 500+. This exposed a structural performance class: the cold tier, compact mode, and `readRegistry()` hot path all re-parse the 540KB `meta-state.jsonl` on every call. The symptom was the family of `*size-overrun*` findings (subtypes: `cold-tier-size-overrun`, `registry-size-overrun`, `test-failure-size-sensitive`). The prior cure was threshold bumps (30KB → 350KB, 90KB → 1MB), which the resolution log itself flags as "the assertion is a sanity bound, not a performance target."

A brainstorm (`plans/reports/brainstorm-260608-index-extractor-overrun.md`) identified three layers needing work and proposed Approach A as the bridge to a future storage layer.

**Why this matters for trajectory, not just performance:** The gradient's destination sentence is "knowledge moves from hand-written tools into self-deriving tools, and from self-deriving tools into self-driving workflow." The current `readRegistry()` is a hand-written re-parse on every call — the antithesis of self-deriving. The fix is not "parse faster" (mtime-checked LRU) but "stop re-parsing" (materialized cold-tier cache) — and the long-term destination is "stop re-shaping a text file at all" (a real storage engine).

### The three layers, by design

1. **`index_extract` pipeline** (the record-level extractor): content-hash-keyed skip. Reuse `evidence_immutable_hash` from existing index entries to skip re-parsing unchanged evidence MDs.
2. **`readRegistry()` hot path** (30+ call sites): process-lifetime LRU keyed on `root` + file mtime. Invalidation hooked into every `writeEntry`/`updateEntry`/batch operation. Soft-enforcement rule documented in `AGENTS.md` (production CRUD must go through MCP tools).
3. **`loop_describe` cold/compact tier** (the LLM-facing read surface): pre-computed `records/meta/.cache/loop-describe-cold.json` sidecar. Built eagerly on every write; rebuilt on first read after registry mtime change. Drops the cold tier from ~250ms to <10ms.

### The batch primitive (Layer 2.5)

`meta_state_batch` MCP tool takes a JSON array of operations and applies them under a single file lock with a single cache invalidation. This is the precondition for keeping the LRU cache provably consistent under bulk write workloads (closeout scripts that resolve 200+ findings at once). The shape mirrors SQLite/Prisma transactions: one tool, atomic, no new state in the registry.

### `meta_state_archive` tool (structural fix for the size-overrun findings)

The two reported `*size-overrun*` findings both suggest adding an archive capability. The tool moves entries to `records/observations/.archive/YYYY-MM/` and sets `status: archived` on the line in `meta-state.jsonl`. Trigger: the agent decides per call (no operator prompt needed); operator can override with explicit ids. Compact and warm tiers exclude archived by default.

### Why the storage layer is parked, not jumped to

Approach B (split the JSONL into `meta-state-active.jsonl` + `meta-state-archive.jsonl`) and Approach C (SQLite via `better-sqlite3`) were both rejected for the same reason: migration risk on 490 existing entries, the 30+ call-site touch surface, and `better-sqlite3`'s native build cost on WSL2. Approach A bridges them — once the LRU + materialized cache are stable, the SQLite trajectory becomes a 1-release migration:

- **Pre-conditions to un-park:** registry > 2x current size (~1000 entries), inverse-index computation > 50ms, drift query > 200ms.
- **Schema sketch (parked):** 3 tables — `entries(id, kind, status, ...)`, `refs(from_id, to_id, kind)`, `fingerprint(entry_id, code_ref, sha)`.
- **Migration path:** dual-write JSONL + SQLite for 1 release (so the JSONL stays the source of truth during the validation window), then flip the default reader to SQLite and demote the JSONL to a write-archive.

### Inverse-index baseline (5 maps as of 2026-06-10)

`core/loop-introspect.js#buildInverseIndexes` emits the following maps. The set grows only when a new back-reference field is added to the schema; each addition is a constant-factor change to the build (O(n) scan, O(1) insert per entry), not a complexity shift.

| Map | Key (id) | Value (entries that point AT key) | Backed by field | Set on entry kind |
|-----|----------|------------------------------------|-----------------|-------------------|
| `addresses_inverse` | finding | loop-designs that address it | `loop-design.addresses` | loop-design |
| `supersedes_inverse` | target | change-logs that supersede it | `change-log.supersedes` | change-log |
| `origin_inverse` | finding | rules that originated from it | `rule.origin` | rule |
| `promoted_to_rule_inverse` | rule | findings that promoted to it | `finding.promoted_to_rule` | finding (legacy) |
| `reopens_inverse` | expired finding | reopen findings that re-surface it | `finding.reopens` | finding |

The 5th map (`reopens_inverse`) is the result of plan `260610-1535-meta-state-reopen-path`. Pre-conditions for SQLite remain un-tripped: ~500 entries, 5 maps, build <1ms.

This is structurally consistent with Bridge 5 (schema as source of truth) and Bridge 6 (self-model as product): the storage layer is the *substrate of the self-model*. Replacing it is a substrate rotation, not a redesign.
