---
phase: 2
title: "verify-claim scalar regression test"
status: complete
priority: P2
effort: "30m"
dependencies: [1]
---

# Phase 2: verify-claim scalar regression test

## Overview

Commit a regression test that pins the `assertWritablePlainString` contract: plain text accepted, YAML-special values rejected via project-owned wording. Wire it into `pnpm check` so the next refactor cannot silently re-leak `yaml` library text into the CLI surface.

## Context

- Predecessor journal: `docs/journals/260512-yaml-parser-library-swap.md` (Q1)
- Review fix being protected: `tools/claim-verification/verify-claim.js:80-93` catches `parseValue` exceptions and throws project-owned `"<label> must avoid YAML-special scalar syntax"` — without a committed test, this guarantee is invisible to future code.
- Depends on Phase 1: this test asserts project-owned wording. Phase 1's wrapper establishes the precedent for that convention across the codebase.

## Requirements

- Functional:
  - Test asserts plain ASCII text passes `assertWritablePlainString` without throwing.
  - Test asserts YAML-special values (e.g., `"&anchor"`, `"*ref"`, `"!!str"`, `"[bracket]"`, `"{brace}"`, `": colon-space"`, `"# hash"`) throw with the project-owned message `"<label> must avoid YAML-special scalar syntax"` or the project-owned whitespace/format messages.
  - Test does NOT assert against `yaml` library exception text.
  - Test is hooked into `pnpm check`.
- Non-functional:
  - No new test framework dependency. Use Node's built-in `node:test` + `node:assert`.
  - Runs in <2s on a clean clone.

## Architecture

```
tools/claim-verification/
├── verify-claim.js                       (export assertWritablePlainString)
└── verify-claim-scalar-rules.test.js     (NEW: node:test runner)

package.json
└── scripts.check = "pnpm validate:records && pnpm test"
└── scripts.test  = "node --test tools/**/*.test.js"
```

## Related Code Files

- Modify: `tools/claim-verification/verify-claim.js` (export `assertWritablePlainString` if not already exported; current file shows `export function assertWritablePlainString` — verify export is already public)
- Create: `tools/claim-verification/verify-claim-scalar-rules.test.js`
- Modify: `package.json` (add `test` script, extend `check` to chain it)
- Modify: `docs/journals/260512-yaml-parser-library-swap.md` (mark Unresolved Questions as resolved with link to this plan)

## Implementation Steps

1. Confirm `assertWritablePlainString` is exported from `verify-claim.js` (it already is per current source).
2. Create `tools/claim-verification/verify-claim-scalar-rules.test.js`:
   - Import `assertWritablePlainString` and `node:test` / `node:assert/strict`.
   - **Accepts** group: `"hello world"`, `"plain ascii"`, `"with-dashes_and.dots"`, `"123 numeric prefix ok"` → no throw.
   - **Rejects (project-owned wording)** group: each input asserts the thrown message **contains** `"must avoid YAML-special scalar syntax"` (or the matching whitespace/single-line/colon/hash message for cases that hit those guards first):
     - `"&anchor"`, `"*ref"`, `"!!str"`, `"[bracket]"`, `"{brace}"`, `"- list item"`, `"key: value"` (hits `": "` guard), `"# comment"` (hits `"#"` guard), `"  leading-whitespace"` (hits whitespace guard), `"line1\nline2"` (hits single-line guard).
   - **Negative assertion:** for at least one YAML-special input, assert the error message does **NOT** contain `"Nested"`, `"compact mappings"`, or other `yaml@2.x` phrasing — guards against accidental re-leak.
3. Update `package.json`:
   - Add `"test": "node --test tools/**/*.test.js"`.
   - Change `"check": "pnpm validate:records"` to `"check": "pnpm validate:records && pnpm test"`.
4. Run `pnpm test` — must pass.
5. Run `pnpm check` — must pass (both validate-records and test).
6. Update `docs/journals/260512-yaml-parser-library-swap.md`:
   - Convert "Unresolved Questions" section to "Resolution" with a one-line note pointing to this plan directory.

## Todo List

- [x] Verify `assertWritablePlainString` export
- [x] Create `verify-claim-scalar-rules.test.js` with accepts/rejects/negative-assertion groups
- [x] Add `test` script and chain into `check` in `package.json`
- [x] `pnpm test` passes
- [x] `pnpm check` passes
- [x] Update journal's Unresolved Questions section

## Success Criteria

- [x] `pnpm test` exits 0 and runs the new test file.
- [x] `pnpm check` runs validate-records AND test, both green.
- [x] Test file does not assert that thrown errors contain `yaml` library exception text.
- [x] Test file contains an explicit negative assertion that library wording does NOT appear in errors.
- [x] Journal updated; Unresolved Questions converted to Resolution with plan link.

## Risk Assessment

- **Risk:** `node --test` glob `tools/**/*.test.js` not supported by shell on all platforms. **Mitigation:** Node 20+ resolves the glob natively via `--test`'s file discovery; if not, fall back to explicit path `node --test tools/claim-verification/verify-claim-scalar-rules.test.js`.
- **Risk:** Test fragile if `assertWritablePlainString` is later refactored to throw different messages. **Mitigation:** Test asserts on substring `"must avoid YAML-special scalar syntax"` (the contract), not exact message. If the contract changes, the test failing is the correct signal.
- **Risk:** Adding `&&` to `check` script masks `validate-records` failure on Windows shells. **Mitigation:** `pnpm` normalizes script invocation; both halves run via `pnpm run`. POSIX semantics apply.

## Out of Scope

- Adding a test framework (mocha, vitest, jest).
- Wider coverage of `verify-claim`'s flag-parsing or write-path logic — only the scalar rules are pinned here.
- Refactoring `assertWritablePlainString` itself.
