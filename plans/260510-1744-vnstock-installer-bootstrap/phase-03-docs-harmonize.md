---
phase: 3
title: "Docs Harmonize"
status: completed
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: Docs Harmonize

## Context Links

- `docs/operator-guide.md`
- `product/README.md`
- `product/api/capabilities/vnstock-data/README.md`
- `plans/reports/brainstorm-260510-1706-vnstock-installer-bootstrap.md`

## Overview

Replace misleading setup guidance with the two-stage bootstrap contract in living docs. Keep historical records and journals unchanged.

## Requirements

- Functional: document `pnpm bootstrap:api` as the API stack bootstrap path.
- Functional: explain that stage 2 is explicit because vendor install needs approval and may consume a device slot.
- Non-functional: concise docs, no duplicate long protocol text.

## Architecture

Docs should point to one command for operators and one policy source for approval boundaries:

```text
product README -> operator guide stack bootstrap section
capability README -> product/api venv + pnpm bootstrap:api
operator guide -> two-stage API bootstrap + human gate
```

## Related Code Files

- Modify: `docs/operator-guide.md`
- Modify: `product/README.md`
- Modify: `product/api/capabilities/vnstock-data/README.md`
- Read/search: `.claude/skills/learning-loop/` for stale `uv sync --extra vendor` references if present.

## Implementation Steps

1. Add a short "API Stack Bootstrap" subsection under the operator guide's stack/capability area.
2. Update `product/README.md` with one pointer to `pnpm bootstrap:api`.
3. Update the vnstock capability README environment note to name `product/api/.venv` and the bootstrap command.
4. Search living docs, skills, and product files for `uv sync --extra vendor`; replace or qualify stale guidance.
5. Leave frozen evidence and journals untouched even if they mention old paths.

## Success Criteria

- [x] `rg "uv sync --extra vendor" docs product .claude package.json` returns no living guidance that recommends the old command.
- [x] Docs state that vendor stage requires explicit approval and `VNSTOCK_API_KEY`.
- [x] Frozen records and journals remain unchanged.

## Risk Assessment

Risk: operator guide grows too large.
Mitigation: add a concise subsection only; defer larger docs split unless the file becomes hard to scan.
