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

After this milestone, all `records/**` writes are blocked by default. The write gate reads `write-path` observations and uses the same staleness logic (`checkObservationStaleness`) as the bash gate. Operator approval is recorded via the constraint-gate MCP server as an observation YAML. The gate reads that observation on the next tool call and allows the write. The bash gate also checks path-write patterns, closing the heredoc bypass.

What changed:
- **Approval became mechanical.** Conversational yes/no is not enough. The MCP server must record an observation.
- **Gates became stateful.** They read `records/observations/` on every tool call, same as the bash gate reads constraint observations.
- **The loop became self-referential.** The loop's state machine (observations) controls the loop's own execution gates.
- **Staleness is unified.** The inbound gate's `.last-operator-message` marker invalidates observations for both bash constraints and write paths.

This milestone is load-bearing for autonomy. A loop that cannot control its own execution boundaries cannot safely run unsupervised experiments. Observation-driven gates make the enforcement layer programmable by the operator rather than hardcoded by the system designer.

## The Four Bridges

Each bridge moves knowledge from human-readable docs into machine-driven loop mechanics. The current system stops at the first bridge.

1. **Doc → candidate assertion.** Vendor markdown is parsed (structured extraction or LLM-assisted) into atomic candidate assertions. Today: humans hand-author evidence from doc reading. Gap: no candidate-extraction tool, and vendor docs do not author to `## Findings` convention. *This bridge closes the gap between "read docs" and "encode knowledge."*
2. **Candidate → experiment plan.** Each candidate maps to a runnable verification (call, expected shape, success criterion). Today: humans design experiment YAMLs from scratch. Gap: no mapping convention from "vendor says X" to "experiment Y proves X." *This bridge closes the gap between "know what to test" and "know how to test it."*
3. **Class-level experiment approval.** A pre-approved pattern (e.g., "read-only sandbox calls to capability Z under N-call budget") lets the loop run experiments without per-experiment operator approval. Today: every experiment gates on `status: approved`. Gap: schema has no class-pattern field; approval is per-record. *This bridge closes the gap between "ask permission every time" and "pre-authorize safe patterns."*
4. **Candidate-vs-validated status.** Index entries carry a status before experimental proof (`candidate`) distinct from after (`active`). Product reads only `active`. Today: status enum is `active | superseded | pending_approval` — no slot for "vendor-asserted, not yet verified." *This bridge closes the gap between "vendor claims" and "proven assertions."*

Each bridge reduces doc dependency. Bridge 1 removes the need to re-read vendor docs. Bridge 2 removes the need to manually author experiment plans. Bridge 3 removes the need for per-experiment operator approval. Bridge 4 removes ambiguity about what is proven vs what is merely claimed.

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
- Current artifact model (claim deprecation, index entries): `record-system-architecture.md`, `artifact-reference.md`.
- The brainstorm that made atomicity load-bearing: `plans/reports/brainstorm-20260518-machine-extracted-index.md`.
