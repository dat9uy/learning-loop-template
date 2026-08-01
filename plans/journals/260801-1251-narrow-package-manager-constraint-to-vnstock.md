# Narrowing the Package-Manager Gate That Blocked Every Install

**Date**: 2026-08-01 12:51
**Severity**: High
**Component**: bash-gate `package-manager` constraint (`tools/learning-loop-mastra/core/patterns.json`)
**Status**: Resolved

## What Happened

The `package-manager` constraint matched every `pip|npm|yarn|pnpm|uv` install command repo-wide, but its only unlock path is the vnstock observation (file-readers.js maps vnstock → [vendor-api, package-manager]) and vnstock's budget state is `stopped`. Net effect: the gate blocked ALL installs, including a routine `pnpm add -D fallow@3.10.0` devDependency bump that had nothing to do with vnstock. User decision: narrow the pattern to only match install commands containing the vnstock token. Shipped on branch `plan-260801-narrow-package-manager-constraint-to-vnstock`, commit 4fa4ee3, via TDD — tests flipped red first, then a one-line regex change, 126 gate tests green, full suite 2749 passed / 0 failed.

## The Brutal Truth

The gate was punishing us for a vendor we can't even use. A safety rail with a dead unlock path isn't a rail, it's a wall — and I only noticed because it tripped on a boring dependency bump, which means it had been silently blocking routine work before that. The real kick in the teeth: the narrowed pattern then blocked my own `meta_state_refresh_file_index` CLI call because my reason string contained a literal `pip install vnstock` example. The gate was working exactly as designed, on JSON args, against me. Working as intended is not the same as working well.

## Technical Details

- Old pattern: matched any `\b(pip|npm|yarn|pnpm|uv)\s+(install|add|sync|bootstrap|setup)\b`
- New pattern: same prefix plus `.*\bvnstock` token requirement
- Regression proof: `pnpm add -D fallow@3.10.0` completed with no gate block; `pnpm fallow:gate` and `fallow:brief` exit 0
- Downstream break: `.claude/coordination/__tests__/bash-coordination-gate.test.cjs` asserted the broad pattern (`pip install → denied`); split test 6 into 6a (non-vnstock allowed) / 6b (vnstock denied)
- Pre-existing failure: file-index hash drift on `session-start-inject-discoverability.cjs` was failing cold-tier-regression on clean HEAD; re-grounded via `meta_state_refresh_file_index`
- Review flags: pnpm-lock.yaml churn beyond fallow (peer-suffix/hash updates) — verified CI pins pnpm 11 matching local 11.18.0, accepted as repo-standard normalization. Over-match `pip install vnstockfoo` (prefix intent for `vnstock_data`) recorded as an explicit test so it's a decision, not an accident.

## Root Cause Analysis

Constraint written broader than its unlock path. The observation mapping grants exactly one escape hatch (vnstock), but the pattern guarded the entire package-manager surface. Nobody re-checked pattern breadth against the unlock graph when the constraint was authored, and the budget-stopped state turned an over-broad pattern into a total block.

## Lessons Learned

- Pattern breadth must be audited against the unlock graph, not just against intent. If the unlock path is a single token, the pattern should require that token.
- A constraint with a dead unlock is indistinguishable from a ban; treat budget-stopped states as a signal to review dependent constraints.
- Gate reasons containing literal command examples will self-trigger — reword or expect the block.

## Next Steps

- None blocking. Change-log entry meta-260801T1231Z recorded; fallow finding resolved as superseded. Future constraint authors: cross-check file-readers.js observation mappings before writing a broad regex.
