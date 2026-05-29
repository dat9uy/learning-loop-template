---
date: "2026-05-29T17:00:00Z"
tags: [gate, bug-fix, pattern-matching, tdd]
---

# Fixed: Quoted-String False Positives in Bash Gate

## The Problem

The bash gate's `matchConstraintPattern` function matched constraint keywords inside quoted strings. A `git commit -m "fix pnpm add issue"` would trigger the `package-manager` pattern because `pnpm add` matched inside the quoted message text. The gate had no mechanism to distinguish between executable commands and non-executable text inside commit messages, PR titles, or other message flags.

## The Fix

Implemented a `stripMessageFlags` function that strips message flags (`-m`, `--message`, `--title`, `--description`, `--body`) and their values before pattern matching. The flag list is configurable in `patterns.json`, keeping the constraint configuration in a single source of truth.

The key insight was that `split(/\s+/)` breaks quoted strings into individual tokens, so a simple `skipNext` that skipped one token was insufficient. The fix handles both single-token values (unquoted) and multi-token quoted blocks (e.g., `"fix pnpm add issue"`) by detecting the opening quote and skipping until the closing quote.

## Key Behaviors

- `git commit -m "fix pnpm add issue"` → allowed (no false positive)
- `bash -c "docker run ubuntu"` → still blocked (wrapper commands preserved)
- `ssh -t user@host "npm install"` → still blocked (no `-t` collision)
- Unquoted multi-word messages like `git commit -m fix pnpm add issue` → still blocks (documented expected behavior)

## Files Changed

- `tools/learning-loop-mcp/core/patterns.json` — added `message_flags` array
- `tools/learning-loop-mcp/core/gate-logic.js` — added `stripMessageFlags` and wired it into `matchConstraintPattern`
- `tools/learning-loop-mcp/__tests__/gate-logic-quoted-strings.test.js` — 17 test cases covering false positives, wrapper commands, and edge cases
- `docs/observation-vs-meta-state.md` — added note about message-flag stripping
- `plans/260529-quoted-string-false-positives/` — all 3 phases completed

## Verification

All 290 tests pass (0 failures). The fix was implemented TDD-style: wrote failing tests first, then implemented the fix, then watched all 17 new tests turn green.
