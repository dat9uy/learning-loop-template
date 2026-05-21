---
capability: meta
dimension: static
scope: meta-tooling
validation_status: passed
---

# Evidence Truth Status Mechanism

## Findings

- [truth-status] Evidence files do not self-advertise truth status; structural prevention required.
- [claims-first-scanning] Orient through claims/index entries, never browse evidence standalone for truth-status discovery.
- [supersedes-pattern] Disproving evidence uses `## Superseded By` or `## Supersedes` block linking to canonical replacement.
- [schema-deferred] Claim-side status block vs computed-view debate deferred until N=2 disproof events or N=1 direct-browse failure.
- [q4e-canonized] Claims-first scanning canonized as Agent Intake Flow step 2 (Q4 E).

## Observation

## Observation

Evidence files do not self-advertise truth status. `records/evidence/vnstock-data/installer-prior-notes.md` claimed the installer reads `~/.vnstock/user.json`; `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md` empirically disproved that claim, but the older file remains on disk.

## Evidence

- `local:records/evidence/vnstock-data/installer-prior-notes.md`
- `local:records/evidence/vnstock-data/experiment-install-20260508T101723Z.md`
- `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md`

## Captured Candidate Mechanisms

- Claim-side status block listing each cited evidence file with current truth state.
- Computed view from validation tooling that emits a truth-state report.

## Rejected Mechanisms

- Evidence frontmatter status field.
- Per-file redirect on disproved files.
- Per-scope index file.
- Moving disproved files into a separate directory.

## Trigger

- Event class: disproof-event or human-direct-browse-failure
- Threshold: N=2 disproof events or N=1 direct-browse failure
- Action when triggered: reopen the claim-side status block vs computed-view debate with the new evidence.

## Deferral

The structural rule is claim-first scanning plus `## Supersedes` in disproving evidence. A schema or tooling choice is premature until repeated disproof cases or a direct-browse failure prove the need.

## Superseded By

- `docs/operator-guide.md` Agent Intake Flow step 2 (commit `4e42853`) - Claims-first scanning for evidence truth-status is canon at the operator-guide level.
- `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md` `## Supersedes` block - The disproving-evidence pattern is in active use for vnstock-data installer-prior-notes.

Partial only. The schema-vs-tooling debate remains deferred. `tools/list-verified/list-verified.sh` (commit `bfc9b2f`) is one run away from being a candidate computed-view: it surfaces verified-claim and supporting-evidence joins via yq frontmatter parsing but does not emit disproof or falsification state. Extending it to include disproof is gated by the original trigger above: N=2 disproof events or N=1 direct-browse failure. Currently 1 disproof event exists (`installer-prior-notes` superseded by `experiment-install-20260508T171112Z`); a second disproof event or one direct-browse failure unlocks the extension.
