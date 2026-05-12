---
phase: 3
title: "Migration"
status: completed
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Migration

## Overview

Replace every import of `tools/validate-records/simple-yaml-parser.js` across 6 caller files with `yaml` package equivalents. Five callers swap `parseYaml` 1:1. One caller (`verify-claim.js`) uses `parseValue` as a round-trip safety guard and needs a semantically equivalent swap.

## Requirements

- Functional: all 6 caller files import from `"yaml"` instead of `./simple-yaml-parser.js`.
- Functional: `pnpm validate:records` still passes after the swap (regression diff happens in Phase 4; this phase just confirms parse-ability).
- Non-functional: no behavior change in calling code beyond the parser swap. No refactoring, no error-message tweaks, no DRYing.

## Architecture

### 1:1 swaps (5 files)

`parseYaml(text)` → `YAML.parse(text)`. Identical contract: input is a YAML 1.2 string, output is the parsed JS object/array/scalar.

| File | Imports today | Imports after |
|---|---|---|
| `tools/validate-records/record-loader.js` | `import { parseYaml } from "./simple-yaml-parser.js";` | `import { parse as parseYaml } from "yaml";` |
| `tools/validate-records/pack-source-validation.js` | same | same |
| `tools/validate-records/publication-gate-validation.js` | same | same |
| `tools/validate-records/use-case-fixture-validation.js` | same | same |
| `tools/generate-docs/pack-summary.js` | `from "../validate-records/simple-yaml-parser.js";` | `from "yaml";` |

Aliasing `parse as parseYaml` minimizes the diff: only the import line changes, all call sites are untouched.

### Special case: `verify-claim.js` (`parseValue` guard)

`verify-claim.js:7` imports `parseValue` (not `parseYaml`). Used only at line 84 in `assertWritablePlainString`:

```js
if (parseValue(value) !== value) throw new Error(`${label} must avoid YAML-special scalar syntax`);
```

This is a round-trip guard: "does this scalar, parsed as YAML, equal itself as a literal string?" Fails for `"true"`, `"42"`, `"[a,b]"`, etc. — anything YAML would coerce. With `yaml` package: `YAML.parse(value)` returns the same coerced types, so the guard's semantics carry over.

**Migration**: `import { parse as parseValue } from "yaml";` and leave line 84 unchanged. The alias preserves the name for readability.

**Catch**: `YAML.parse` of multi-line text or commented text would parse to objects; the existing checks at lines 82-83 already reject multi-line and leading/trailing whitespace, so the guard's input is always a clean single-line scalar. Behavior preserved.

## Related Code Files

- Modify: `tools/validate-records/record-loader.js`
- Modify: `tools/validate-records/pack-source-validation.js`
- Modify: `tools/validate-records/publication-gate-validation.js`
- Modify: `tools/validate-records/use-case-fixture-validation.js`
- Modify: `tools/generate-docs/pack-summary.js`
- Modify: `tools/claim-verification/verify-claim.js`
- Read (unchanged): `tools/validate-records/simple-yaml-parser.js` (still on disk; deleted in Phase 5)

## Implementation Steps

1. Edit `record-loader.js` line 3: replace import. Confirm `parseYaml(...)` calls at lines 16 and 30 unchanged.
2. Edit `pack-source-validation.js` line 3: replace import. Confirm `parseYaml(...)` call at line 75 unchanged.
3. Edit `publication-gate-validation.js` line 3: replace import. Confirm `parseYaml(...)` calls at lines 25, 31, 36, 45 unchanged.
4. Edit `use-case-fixture-validation.js` line 3: replace import. Confirm `parseYaml(...)` call at line 26 unchanged.
5. Edit `pack-summary.js` line 3: replace import. Confirm `parseYaml(...)` calls at lines 10, 13 unchanged.
6. Edit `verify-claim.js` line 7: replace import (aliased as `parseValue`). Confirm call at line 84 unchanged.
7. Run `pnpm validate:records`. Expect exit 0. If it errors, do NOT proceed — diagnose. Most likely causes: a record has YAML that the hand-rolled parser silently mis-parsed and the library now parses correctly (or stricter — e.g., duplicate keys). Either fix the record or revert and discuss.
8. Run `pnpm check`. Expect exit 0 (same script).

## Success Criteria

- [ ] All 6 files import from `"yaml"`; zero remaining imports of `simple-yaml-parser.js` outside of the file itself.
- [ ] `pnpm validate:records` exit 0.
- [ ] `pnpm check` exit 0.
- [ ] Diff in caller files limited to import lines only (one line per file, six lines total).

## Risk Assessment

- **Risk**: library is stricter on duplicate keys / implicit coercion than the hand-rolled parser (called out in decision draft tradeoff #4). **Mitigation**: Phase 4 captures the diff; if a real record trips, the error surfaces here. Fix the record (it was always wrong) or skip the swap and reopen the decision.
- **Risk**: `verify-claim.js` guard subtly diverges (e.g., `YAML.parse` accepts something the hand-rolled `parseValue` rejected, or vice versa). **Mitigation**: this guard is exercised only by `pnpm verify:claim` writes, not by the validator. Will be smoke-tested manually as part of Phase 4 if relevant; otherwise the guard is dormant for the regression baseline (no writes happen during `pnpm validate:records`).
- **Risk**: import-line typo that compiles but mis-aliases. **Low**; ESM imports throw at module-load time, so a typo surfaces on first `pnpm validate:records`.

## Notes

- `simple-yaml-parser.js` stays on disk after this phase; deletion is gated on Phase 4 success.
- No call-site edits — if a call site needs touching, the migration scope expanded silently and the assumption "library is drop-in" failed. STOP and re-plan.
