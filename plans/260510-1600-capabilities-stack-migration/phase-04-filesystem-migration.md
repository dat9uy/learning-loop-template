---
phase: 4
title: "Filesystem Migration"
status: pending
priority: P1
effort: "3h"
dependencies: [3]
---

# Phase 4: Filesystem Migration

## Overview

Move capability scripts and Python stack manifest into the per-stack layout. Recreate the Python venv at `product/api/.venv/`. Verify capability-00 runs in the new location.

## Requirements

- Functional: `product/api/capabilities/vnstock-data/*.py` exists and runs. `product/web/capabilities/README.md` exists.
- Non-functional: Old `product/.venv` is not moved (pyvenv.cfg embeds absolute path); clean recreate via `uv sync`.

## Architecture

New layout:

```
product/
├── README.md
├── api/
│   ├── pyproject.toml     (moved from product/)
│   ├── .venv/             (recreated via uv sync)
│   ├── .vnstock/          (copied from product/.vnstock)
│   └── capabilities/
│       └── vnstock-data/  (moved from product/capabilities/)
└── web/
    └── capabilities/
        └── README.md      (new placeholder)
```

## Related Code Files

- Move: `product/capabilities/` → `product/api/capabilities/`
- Move: `product/pyproject.toml` → `product/api/pyproject.toml`
- Copy: `product/.vnstock/` → `product/api/.vnstock/`
- Create: `product/api/.venv/` (via `uv venv` + `uv sync`)
- Create: `product/web/capabilities/README.md`
- Delete (after verification): `product/{.venv,.cache,.local,.vnstock,pyproject.toml}`
- Modify: `.gitignore`

## Implementation Steps

1. `git mv product/capabilities product/api/capabilities`
2. `git mv product/pyproject.toml product/api/pyproject.toml`
3. `cp -r product/.vnstock product/api/.vnstock`
4. `cd product/api && uv venv .venv && uv sync --extra vendor`
5. Run `product/api/.venv/bin/python product/api/capabilities/vnstock-data/capability-00-discovery.py`
   - Verify it prints metadata-only output matching `records/evidence/vnstock-data/capability-runtime-output.md` shape.
6. Create `product/web/capabilities/README.md` (empty-convention placeholder):
   - Name the stack (TanStack Start / TypeScript).
   - List probe types that belong (frontend integration, route loader feasibility, etc.).
   - Point to `docs/operator-guide.md` "Stacks and Capability Locations".
7. Update `.gitignore`:
   - Replace `product/.cache/`, `product/.local/`, `product/.vnstock/` with `product/*/.cache/`, `product/*/.local/`, `product/*/.vnstock/`.
   - Keep global `.venv/` rule.
8. Delete old paths only after step 5 succeeds:
   - `rm -rf product/.venv product/.cache product/.local product/.vnstock`
   - `git rm -r product/.venv product/.cache product/.local product/.vnstock` (if tracked)
   - `git rm product/pyproject.toml`
9. Run `git status` to verify clean index.
10. Run `pnpm validate:records` and `pnpm check`.

## Prompt Block (Code + Shell)

```text
Task: Execute the filesystem migration for per-stack capability layout.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- product/README.md
- product/pyproject.toml
- .gitignore
- plans/reports/brainstorm-20260510-capabilities-stack-migration.md (Final Solution → New layout)

Goal:
- git mv capabilities and pyproject.toml into product/api/.
- Copy .vnstock preserve.
- Recreate .venv via uv sync.
- Verify capability-00-discovery.py runs.
- Create product/web/capabilities/README.md placeholder.
- Update .gitignore.
- Delete old paths only after verification.

Constraints:
- Do NOT mv .venv (pyvenv.cfg has absolute path).
- Do NOT delete old paths until capability-00 runs successfully.
- Do NOT modify frozen historical records.
- Preserve .vnstock via cp -r, not mv.

Validation:
- Run pnpm validate:records.
- Run pnpm check.
- Run git status.

Stop and ask before:
- Any step that deletes files.
- If capability-00 fails to import vnstock_data.
- If uv sync requires credentials or re-triggers device limits.
```

## Success Criteria

- Process: 10/10 steps complete.
- Experiment outcome: `supports` (capability-00 runs successfully in new location).
- `product/api/capabilities/vnstock-data/capability-00-discovery.py` runs and prints expected metadata.
- `git ls-files product/` shows no entries under old `product/capabilities/` path.
- `.gitignore` updated with globbed product/* patterns.

## Risk Assessment

- Risk: recreated venv fails to import `vnstock_data`. Mitigation: `product/api/.vnstock/` preserves device fingerprint; wheel is on PyPI. If failure persists, investigate `$HOME/.vnstock/` vs CWD-relative `.vnstock/` before assuming migration cause.
- Risk: `uv sync --extra vendor` re-triggers device limit. Mitigation: the wheel is cached on PyPI under `uv` installer; no Makeself re-run needed. Monitor for auth prompts.
- Risk: old paths deleted before verification. Mitigation: step 8 is explicitly gated on step 5 success.

## Approval Gate

**Operator approval REQUIRED before this phase executes.**
Confirm:
1. Layout migration plan is understood (`product/api/` for Python, `product/web/` for TS).
2. `.vnstock` preservation strategy accepted (`cp -r`, not `mv`; old copy deleted after verification).
3. Venv recreation strategy accepted (`uv sync`, not `mv`).
