---
phase: 1
title: "TDD red — CLI argv payload regression tests"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: TDD red — CLI argv payload regression tests

## Overview

Write the regression test suite **first** and watch it fail red on the contract
tests. The suite pins: inline JSON argv of a canonical `loop.mjs <tool>
<quoted>` segment is data and must not satisfy `rule-no-raw-stdout-vitest`
(cases 4/4b → ok); `$(...)` double-quoted args stay a real violation (case 7 →
escalate); spoofed recognition (non-canonical `loop.mjs`, trailing token) stays
escalate; real pipes, the locked echo limitation, and real violations stay
enforceable.

## Requirements

- Functional: a new test file proves the case matrix below via
  `applyPromotedRules` with an inline synthetic rule (same idiom as
  `gate-logic-data-command-quotes.test.js`), not a seeded meta-state file.
- Non-functional: tests must be quote-style-agnostic (single AND double quoted
  JSON), cover the compound case (4d) proving segment-scoped blanking, cover the
  `$(...)` case (7) proving no bypass, and cover negative recognition cases
  proving the helper does not over-match.
- Constraint (red-team Finding 3): the file is ESM (`"type": "module"`); a
  static `import` of a not-yet-existing named export hard-errors the whole file
  at link time. **Phase 1 imports ONLY existing exports** (`applyPromotedRules`,
  `matchConstraintPattern`). `stripCliArgvPayload` unit tests move to Phase 2.

## Architecture

Mirror `gate-logic-data-command-quotes.test.js`:
- `import { applyPromotedRules } from "../../core/gate-logic.js";` (existing
  export only — no `stripCliArgvPayload` import in Phase 1).
- One `VITEST_RULE` fixture using the **live** pattern
  `(vitest run|pnpm test\b).*\| *(tail|head|grep)\b` (matches the existing
  fixture convention).
- Also add a static guard test (green from start): assert no file under
  `tools/handlers/` imports `child_process` or calls `execSync`/`spawnSync` —
  grounds the bypass-free claim (red-team Finding 13). This passes immediately.

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-cli-argv-payload.test.js`
- Reference (idiom): `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-data-command-quotes.test.js`
- Guard test target (read-only scan): `tools/learning-loop-mastra/tools/handlers/` (or `core/` — wherever `CLI_TOOLS` handlers live; confirm via `core/cli-tools.js`)

## Implementation Steps

1. Create `gate-logic-cli-argv-payload.test.js` with the `VITEST_RULE` fixture
   and four `describe` blocks: "false-positive cases (must NOT match)",
   "real violations and locked limitations (must match)", "spoofed recognition
   (must match — no over-blanking)", "static bypass guard (green from start)".
2. False-positive block — assert `applyPromotedRules` returns `decision: "ok"`:
   - case 4: `node tools/learning-loop-mastra/bin/loop.mjs meta_state_resolve "<json: pnpm test 2>&1 | tail>"` (double-quoted, no `$(`)
   - case 4b: same with single-quoted JSON
   - case 4c: `--args-file /tmp/x.json` form (already ok; lock it)
   - case 3: `node -e "console.log(pnpm test | tail)"` (already ok via `stripNodeEvalBody`; lock it)
3. Must-match block — assert `decision: "escalate"`:
   - case 1: `pnpm test 2>&1 | head -50` (real pipe to head — live pattern includes head)
   - case 7: `node tools/learning-loop-mastra/bin/loop.mjs meta_state_resolve "$(pnpm test 2>&1 | tail)"` (**`$(...)` is executed — must stay escalate**)
   - case 4d: `node .../loop.mjs meta_state_list '{}' ; pnpm test 2>&1 | tail` (real pipe in sibling segment)
   - case 5: `echo "pnpm test | grep foo"` (locked echo limitation)
   - case 6: `pnpm exec vitest run 2>&1 | tail` (real violation)
4. Spoofed-recognition block — assert `decision: "escalate"` (the helper must
   NOT blank these; banned tokens stay visible):
   - `node ./loop.mjs meta_state_resolve 'pnpm test 2>&1 | tail'` (non-canonical relative path — not the repo loop.mjs)
   - `node evil.mjs 'pnpm test 2>&1 | tail' loop.mjs` (loop.mjs is a trailing token, not the script)
   - `node /some/other/runner.mjs --name "loop.mjs" --cmd 'pnpm test 2>&1 | tail'` (loop.mjs inside a different script's arg)
   - (Verb-normalization positive case for Phase 2: `nodejs tools/learning-loop-mastra/bin/loop.mjs meta_state_resolve '<json: pnpm test | tail>'` → ok. Mark `test.todo` in Phase 1 if `nodejs` recognition is not yet implemented, OR assert ok if the implementer opts to normalize in Phase 2 — keep it red/green honest.)
5. Static guard block — scan `tools/handlers/` (and `core/`) for
   `child_process` imports / `execSync`/`spawnSync` calls; assert none exist
   with argv-derived input. Passes from start (locks the bypass-free precondition).
6. Run `pnpm test tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-cli-argv-payload.test.js`
   and confirm red: cases 4/4b escalate (fail — expected ok); cases 1/7/4d/5/6
   and the spoofed-recognition cases pass already (regression guards green from
   the start); the static guard passes from start.

## Success Criteria

- [ ] Test file exists and is discovered by vitest
- [ ] Cases 4/4b fail red (currently escalate, expected ok)
- [ ] Case 7 passes from start (escalate — proves `$(...)` is not blanket-blanked today; guards the bypass before the fix lands)
- [ ] Cases 1/4c/3/4d/5/6 pass already (regression guards green from the start)
- [ ] Spoofed-recognition cases pass from start (escalate — the helper doesn't exist yet so nothing is blanked; locks the contract that Phase 2 must not over-match)
- [ ] Static guard passes from start
- [ ] No existing test file edited or weakened; no `stripCliArgvPayload` static import

## Risk Assessment

- **ESM missing-export crash (red-team Finding 3):** avoided by importing only
  existing exports. The Phase 1 red signal is the `applyPromotedRules` assertion
  failures on cases 4/4b — the contract that matters.
- **Case-7 false green:** if case 7 (`$(...)`) is written with a single-quoted
  arg it would be inert data, not a real execution — the test must use
  DOUBLE-quoted `"$(...)"` so it represents a real shell expansion. Verify the
  fixture uses double quotes.