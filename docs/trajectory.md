# Trajectory

The long-term direction of the learning loop. This document states the destination, not the route. It is intentionally separate from `charter.md` (present-tense system description) and `philosophy.md` (how to reason with the current loop), because aspirational content in either of those weakens their role as canaries for "what the system actually is right now."

## Destination

An autonomous verification loop: vendor documentation flows into candidate assertions, candidates become planned experiments, experiments run inside class-level approval gates and budget bounds, validated assertions land in the index, and product consumes only validated assertions. The human operator approves classes of work, not individual experiments, and stays in the loop for judgment calls (product scope, irreversible operations, gate definitions).

## Why This Is the Natural Endpoint

The redesigns already shipped point this way. Atomicity (machine-extracted index, brainstorm 2026-05-18) was the precondition — a bundled-claim system cannot ingest hundreds of vendor assertions without collapsing. The N=1/N>1 rule was the precondition for deciding which candidates are worth formalizing. The observations + budgets layer was the precondition for bounding autonomous resource consumption. Each move was load-bearing for autonomy even when autonomy was not the proximate goal.

## The Gradient

Autonomy is incremental. Each future plan moves one bridge from human-driven to machine-driven. There is no date and no flag-day. The system gets less human-paced one mechanism at a time.

## The Four Bridges

Each bridge is work that does not exist yet. The current system stops at the first bridge.

1. **Doc → candidate assertion.** Vendor markdown is parsed (structured extraction or LLM-assisted) into atomic candidate assertions. Today: humans hand-author evidence from doc reading. Gap: no candidate-extraction tool, and vendor docs do not author to `## Findings` convention.
2. **Candidate → experiment plan.** Each candidate maps to a runnable verification (call, expected shape, success criterion). Today: humans design experiment YAMLs from scratch. Gap: no mapping convention from "vendor says X" to "experiment Y proves X."
3. **Class-level experiment approval.** A pre-approved pattern (e.g., "read-only sandbox calls to capability Z under N-call budget") lets the loop run experiments without per-experiment operator approval. Today: every experiment gates on `status: approved`. Gap: schema has no class-pattern field; approval is per-record.
4. **Candidate-vs-validated status.** Index entries carry a status before experimental proof (`candidate`) distinct from after (`active`). Product reads only `active`. Today: status enum is `active | superseded | pending_approval` — no slot for "vendor-asserted, not yet verified."

## What Stays Human Forever

Autonomy is on the verification axis, not the judgment axis. The destination keeps humans in the loop for:

- **Product scope.** What capability gets built, what gets cut, what ships to whom.
- **Irreversible operations.** Anything the constraint enforcement layer gates today stays gated. The auto-loop earns no exemption from device-slot ledgers, budget exhaustion, or scope-bounded observations.
- **Class-approval definitions.** Operators write the pre-approval patterns. The loop does not propose its own expansion of authority.
- **Decisions and risks.** Both record types remain human-authored.

Vision documents that do not name their limits get cited to justify removing safety gates the author never meant to remove. These limits are the limits.

## Cross-References

- Present-tense system description: `charter.md`.
- How to reason with the current loop: `philosophy.md`.
- Current artifact model (claim deprecation, index entries): `record-system-architecture.md`, `artifact-reference.md`.
- The brainstorm that made atomicity load-bearing: `plans/reports/brainstorm-20260518-machine-extracted-index.md`.
