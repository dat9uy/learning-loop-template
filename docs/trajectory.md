# Trajectory

The long-term direction of the learning loop. This document states the destination, not the route. It is intentionally separate from `charter.md` (present-tense system description) and `philosophy.md` (how to reason with the current loop), because aspirational content in either of those weakens their role as canaries for "what the system actually is right now."

## Destination

An autonomous verification loop: vendor documentation flows into candidate assertions, candidates become planned experiments, experiments run inside class-level approval gates and budget bounds, validated assertions land in the index, and product consumes only validated assertions. The human operator approves classes of work, not individual experiments, and stays in the loop for judgment calls (product scope, irreversible operations, gate definitions).

The destination also means **docs are not operational dependencies**. Anything an agent must read from `docs/` to execute correctly is a gap the loop has not yet closed. The gradient moves knowledge from docs into records, from records into tools, from tools into self-driving workflow.

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

## What Stays Human Forever

Autonomy is on the verification axis, not the judgment axis. The destination keeps humans in the loop for:

- **Product scope.** What capability gets built, what gets cut, what ships to whom.
- **Irreversible operations.** Anything the constraint enforcement layer gates today stays gated. The auto-loop earns no exemption from device-slot ledgers, budget exhaustion, or scope-bounded observations.
- **Class-approval definitions.** Operators write the pre-approval patterns. The loop does not propose its own expansion of authority.
- **Decisions and risks.** Both record types remain human-authored.
- **Philosophy.** The "why" behind loop design stays in docs. The "what" and "how" move to the loop.

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
