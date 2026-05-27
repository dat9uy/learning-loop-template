---
phase: 4
title: "Integration Validation and Cleanup"
status: pending
priority: P1
effort: "1h"
dependencies: [3]
---

# Phase 4: Integration Validation and Cleanup

## Overview

Final integration validation: run all migrated CLIs, verify `pnpm check` passes, delete the disabled `generate-docs` CLI and its script, audit for orphaned references.

## Requirements

- Functional: All 9 package.json scripts work. `pnpm check` exits 0.
- Non-functional: No stale references to deleted directories.

## Related Code Files

- Delete: `tools/generate-docs/` (entire directory)
- Modify: `package.json` (remove `generate:docs` script)

## Implementation Steps

1. **Delete `generate-docs` CLI.**
   ```bash
   rm -rf tools/generate-docs/
   ```
   Remove `generate:docs` from `package.json` scripts.

2. **Audit for stale references.**
   ```bash
   rg "tools/(search-index|list-verified|list-probes|generate-capabilities|extract-index|claim-verification|validate-plan-loop|check-budget|generate-docs)/" --type js --type json --type md .
   ```
   Should return zero matches in active code. Update any docs/plans that still reference old paths.

3. **Run all migrated CLIs individually.**
   ```bash
   pnpm validate:records
   pnpm validate:plan-loop
   pnpm verify:claim -- --claim claim-test --dimension static --status verified --reason test
   pnpm generate:capabilities --dry-run
   pnpm extract:index --dry-run
   pnpm search:index
   pnpm list:verified
   pnpm list:probes --stack api
   pnpm check:budget -- --system vnstock --resource device-slots
   ```
   All must exit 0 (or 1 where expected for dry-run drift).

4. **Run full test suite.**
   ```bash
   pnpm test
   ```
   Must pass.

5. **Run `pnpm check` (the full pipeline).**
   ```bash
   pnpm check
   ```
   Must exit 0.

6. **Commit all changes.**

## Success Criteria

- [ ] `tools/generate-docs/` does not exist.
- [ ] `generate:docs` script removed from `package.json`.
- [ ] All 9 migrated scripts run correctly.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.
- [ ] `rg` audit returns zero active-code references to deleted directories.
- [ ] `node --test` for all moved test files passes.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `pnpm check` fails due to hidden dependency | High | Run after each phase; isolate failures |
| Docs reference deleted paths | Low | `rg` audit; historical docs may keep references |
| `generate-docs` was referenced in CI or Makefile | Medium | Search all build files |
