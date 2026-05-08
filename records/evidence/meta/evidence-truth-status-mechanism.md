# Evidence Truth Status Mechanism

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
