# update_observation MCP Tool Implementation

**Date**: 2026-05-21
**Severity**: Medium
**Component**: constraint-gate MCP server
**Status**: Resolved

## What Happened

Implemented `update_observation` MCP tool to close the gap where `record_observation` only creates new observations and rejects duplicates. Agents previously had to leave the MCP protocol to toggle observation status, forcing Bash workarounds or manual file edits.

Changes committed as `20ac1fa`:

- **`tools/constraint-gate/observation-writer.js`**: Added `updateObservation({ root, observation_id, status, reason })` with:
  - Symlink skip (`lstatSync.isSymbolicLink()`)
  - Path re-validation before read and before atomic rename
  - Atomic write with unique temp suffix (`tmp-${randomBytes(4).toString("hex")}`)
  - Immutable field preservation (`id`, `schema_version`, `type`, `created_at`, `source_refs`, `constraint_type`, `constraint`)
  - Status enum guard (`active` / `inactive` / `archived`)
  - Timestamp bounds-check (rejects `updated_at` older than `created_at`)
  - Notes append with `[update reason]: ${reason}`

- **`tools/constraint-gate/server.js`**: Registered `update_observation` tool with Zod schema `z.string().refine()` for status validation.

- **Tests**: 7 unit tests in `observation-writer.test.js` (invalid status, not found, symlink skip, immutability, atomic write, timestamp bounds, notes append). 4 integration tests in `server.test.js` (success path, bad status, missing id, round-trip read-after-update). All TDD — red first, then green.

- **Decision record**: `records/decisions/decision-add-update-observation-to-mcp-server.yaml` documenting rationale, alternatives rejected, and tradeoffs accepted.

## The Brutal Truth

This was a clean implementation, which almost feels suspicious. The gap was discovered during evidence-file authoring for the fundamental capability closeout — the write gate blocked `records/evidence/**`, and the operator needed to inactivate a temporary observation after verification. There was no MCP-native way to do it. The whole point of the coordination system is to keep agents inside the protocol, yet the protocol itself was missing a basic maintenance operation.

The real frustration is that this should have been obvious when `record_observation` was first built. A CRUD surface with only "create" and no "update" is half-finished. We got away with it because observations were treated as write-once, but the moment we needed a temporary observation for e2e testing, the hole became visible.

## Technical Details

**End-to-end verification flow (confirmed working):**
1. Create temp observation via `record_observation` → write gate allows `records/evidence/**` because observation is active.
2. Inactivate temp observation via `update_observation` → write gate blocks `records/evidence/**` because observation is inactive.
3. Re-activate temp observation via `update_observation` → write gate allows again.

**Test results:**
- 175 total tests pass (including 11 new tests for update observation)
- `pnpm check`: pass
- `pnpm validate:records`: 85 records pass
- Code review: 1 non-blocking concern flagged

**Code review concern:**
The `updated_at` bounds-check (`updatedTime < createdTime`) guards against a future-timestamp regression that is practically impossible on any sane system clock. Reviewer flagged it as dead logic — a bounds-check that can never trigger. Rather than remove it, I tightened the condition to also guard against `isNaN(createdTime)` and documented it as defense-in-depth against clock skew or test mocking. The check stays; the concern is addressed.

## What We Tried

Straight TDD. Wrote failing tests for each guard (symlink, path traversal, immutability, atomicity), then implemented the guards one by one. No backtracking. The one wrinkle was the integration test for round-trip read-after-update, which required exporting `updateObservation` from `observation-writer.js` before the server test could import it. The TDD sequence caught the missing export immediately.

## Root Cause Analysis

Why was this missing in the first place? Two reasons:

1. **Initial observation design assumed immutability.** The first implementation treated observations as permanent attestations — once created, they never change. Temporary observations for testing or validation windows were not part of the original mental model.

2. **No operational exercise until now.** The coordination system had theoretical coverage but no real operational workflow that required status toggling. The fundamental capability closeout was the first end-to-end use case that created and then needed to clean up a temporary observation.

## Lessons Learned

- **Every write surface needs a maintenance operation.** If you build a creation tool, plan the update and deletion tools at the same time. Even if you think the data is immutable, operational reality will prove otherwise.
- **Defense-in-depth checks are cheap.** The symlink skip, path re-validation, and atomic write add maybe 10 lines of code total. They prevent entire classes of filesystem attacks. Worth it even if the threat model says "MCP clients are trusted."
- **TDD catches export/import mismatches immediately.** Writing the server test before exporting `updateObservation` failed with a clear import error. Fixing the export was trivial because the failure was immediate and isolated.

## Next Steps

- Monitor for MCP clients needing bulk status updates. Current API is single-observation; a batch operation may be needed if observation counts grow.
- Evaluate whether `delete_observation` is needed. Archiving covers most use cases, but true deletion may be required for GDPR or operator preference.
- Document `update_observation` in `./docs/system-architecture.md` under MCP tool inventory.
