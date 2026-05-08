---
title: "vnstock Install Knowledge Encoding"
description: "Encode verified vnstock install method into the learning loop via claim, experiment, and knowledge pack. Capture meta-observations for future loop improvement."
status: pending
priority: P1
branch: "main"
tags: [vnstock, install, knowledge-pack, experiment]
blockedBy: []
blocks: []
created: "2026-05-08T08:51:20.071Z"
createdBy: "ck:plan"
source: skill
---

# vnstock Install Knowledge Encoding

## Overview

Encode the verified vnstock install method so future cleared-context agents can install without re-exploring, and the learning loop treats this as settled knowledge. Non-standard install (download Makeself .run installer from vnstocks.com, execute with --non-interactive, installer reads pre-existing API key from ~/.vnstock/user.json) requires an approved install experiment in a temp directory with metadata-only output.

Meta-loop improvements are deferred (Option A). Observations are captured as evidence during implementation for a future self-improvement cycle.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Setup Records](./phase-01-setup-records.md) | Pending |
| 2 | [Execute Install Experiment](./phase-02-execute-install-experiment.md) | Pending |
| 3 | [Create Experiment and Verify Claim](./phase-03-create-experiment-and-verify-claim.md) | Pending |
| 4 | [Build Knowledge Pack](./phase-04-build-knowledge-pack.md) | Pending |
| 5 | [Validate and Capture Meta Evidence](./phase-05-validate-and-capture-meta-evidence.md) | Pending |

## Dependencies

```
Phase 1 (Setup Records)
  └──→ Phase 2 (Execute Experiment)

Phase 2 (Execute Experiment)
  └──→ Phase 3 (Create Experiment Record + Verify Claim)

Phase 3 (Verify Claim)
  └──→ Phase 4 (Build Knowledge Pack)

Phase 4 (Build Pack)
  └──→ Phase 5 (Validate + Meta Evidence)
```

## Key Decisions

- **Scope:** Sandbox install only. Production scope requires separate decision.
- **Output:** Metadata-only. No raw data, credentials, or live API calls.
- **Meta-loop:** Capture-and-defer. No canonical loop changes in this session.
- **Artifact:** Knowledge pack `vnstock-data` is the process-side artifact for cleared-context agents.

## Success Criteria

- [ ] `pnpm validate:records` passes with all new records
- [ ] Install experiment executed with approved human gate
- [ ] Temp directory created and deleted
- [ ] Evidence envelope captures allowed metadata only
- [ ] Knowledge pack `vnstock-data` created with manifest, facts, capabilities
- [ ] Future agent reading pack knows install steps without re-exploring
- [ ] Meta evidence files created in `records/evidence/meta/`

## Source

- Brainstorm report: `plans/reports/260508-1545-vnstock-install-knowledge-encoding.md`
- Evidence: `records/evidence/vnstock-data/installer-prior-notes.md`
