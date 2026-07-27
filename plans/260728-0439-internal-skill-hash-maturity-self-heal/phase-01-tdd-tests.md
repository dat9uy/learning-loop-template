---
phase: 1
title: "TDD: failing tests"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: TDD: failing tests

## Overview

Write the failing tests that lock the new contract before touching
implementation (tests-first). New tests must FAIL against current code; the
rescoped test keeps its consistent-fixture assertions and stays green.

## Requirements

- Functional: new unit + CLI tests exercise the internal self-heal path; rescoped
  test keeps its consistent-fixture assertions
- Non-functional: fixture style matches existing `buildClobberedFixture`
  (mkdtemp, cleanup in `finally`)

## Architecture

Fixture pattern: `buildClobberedFixture` already builds internal canonical
sources whose bytes match manifest entries. The self-heal fixture variant
diverges them (edit canonical content and/or maturity after building, or pass a
divergence option) so the manifest's stored `hash`/`maturity` are stale relative
to `canonicalSource`.

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/normalize-skills.test.js`
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/sync-skills.test.js`

## Implementation Steps

1. In `normalize-skills.test.js`, add a fixture variant where an internal
   canonical's content **and** maturity frontmatter diverge from the manifest's
   stored values (e.g. mutate `learning-loop` canonical to `maturity: state-2`
   with different bytes after fixture build).
2. **Add** unit test "internal self-heal: drifted canonical → manifest
   hash + maturity re-derived, `changed=true`, `restoredInternals=[name]`".
   Run `runNormalize(root)`; assert post-normalize manifest `hash` equals
   `sha256hex(canonical bytes)` and `maturity` equals canonical frontmatter —
   not the stale stored values; assert the normalized log line enumerates the
   internal name (`re-derived 1 internal: learning-loop`).
3. **Rescope** the test at `:230` — rename to "internal entries re-derived from
   canonical; unchanged when canonical matches manifest". Keep the existing
   consistent-fixture `deepStrictEqual` assertions verbatim (they now prove
   idempotence on the internal path, not preservation).
4. In `sync-skills.test.js`, **add** a CLI end-to-end test of the documented
   authoring path: build fixture → mutate an internal canonical (content +
   maturity) → run `sync-skills.mjs <fixture-root>` → assert
   `skills-lock.json` `hash` + `maturity` equal `sha256(canonical)` / canonical
   frontmatter, and the normalized log line enumerates the internal name.
5. Run both test files; confirm the new tests **fail** (re-derive branch and log
   line don't exist yet) and the rescoped test still passes.

## Success Criteria

- [ ] New unit test fails with stale `hash`/`maturity` observed in output
- [ ] New CLI test fails (log line absent; manifest not healed)
- [ ] Rescoped `:230` test passes against current code (consistent fixture)
- [ ] No implementation files modified in this phase

## Risk Assessment

Low — test-only phase. Risk: the new CLI test could pass accidentally if
`sync-skills` heals via a different path; mitigated by asserting the exact
`restoredInternals` log enumeration, which only the new branch produces.
