# Fix C2 / C3 / H3 — core meta-state guards

## Summary
Three code-review findings fixed in `tools/learning-loop-mastra`: touch handler
tolerates historical `superseded` fixtures, `acceptEntry` no longer revives
archived findings, and `meta_state_patch` / F-1 forbid forging `accepted_*`
stamps.

## C2 — touch on historical `superseded`
- **Root cause:** the touch handler already classifies any terminal status
  (including historical `superseded`) as `wrong_status` via
  `isOpen` (`core/constants.js#TERMINAL_STATUSES` keeps `superseded` for
  historical tolerance; `readRegistry` parses via `JSON.parse`, no zod
  re-validation). The break was in the test fixture: `setupEntry` routes
  through `writeEntry`'s zod union, which rejects `superseded` (removed from
  the canonical enum) at setup time, throwing before the handler runs.
- **Fix:** seed the `superseded` fixture via the existing `writeRawLine` helper
  (raw JSONL append, bypassing `writeEntry`'s union validation) — mirrors the
  `wrong_kind` fixtures. Handler code unchanged. Assertion kept
  `{touched:false, reason:"wrong_status"}` and extended to assert
  `current_status:"superseded"`.
- **Enum preserved:** `z.enum(["open","resolved","accepted","archived"])`
  unchanged. `superseded` is NOT re-added.

## C3 — acceptEntry revives archived findings
- **Root cause:** `acceptEntry`'s `assertAcceptable` wraps
  `!TERMINAL_STATUSES.has(status)` against the module-local
  `TERMINAL_STATUSES = {resolved, accepted}` (line 294), which intentionally
  omits `archived`. There was an `already_accepted` early-return but no
  `archived` branch, so `acceptEntry` flipped `archived → accepted`.
- **Fix:** added an explicit early-return for `archived` mirroring the
  `already_accepted` shape, returning
  `{accepted:false, reason:"already_terminal", current_status:"archived",
  current_version}`. `restoreEntry` remains the only revival path.
- **Test:** split the existing "rejects already-terminal finding
  (resolved/archived)" test — the original only seeded `resolved`; added a
  dedicated `archived` test that seeds an archived finding with audit stamps
  and asserts rejection plus no new `accepted` version line appended.

## H3 — accepted_* stamps missing from patch deny-list
- **Root cause:** `accepted_at`/`accepted_by`/`accepted_reason` were absent
  from `IMMUTABLE_PATCH_FIELDS` and F-1's `forbid` list. A patch could forge
  the accept audit stamps on an open finding (status stays open →
  contradictory state). `status` itself was already denied.
- **Fix:** added `accepted_at`, `accepted_by`, `accepted_reason` to
  `IMMUTABLE_PATCH_FIELDS` (`core/meta-state.js`) and to F-1's `forbid` list
  (`core/consistency-check.js`). The patch handler rejects denied keys with
  `reason:"immutable_field"` (verified: it rejects, does not silently strip).
- **Tests:** added C-10b (F-1 flags open finding carrying `accepted_*` stamps)
  and C-17 (asserts `IMMUTABLE_PATCH_FIELDS` membership for `accepted_*` and
  F-1 forbid-list inclusion).

## Files modified
- `tools/learning-loop-mastra/core/meta-state.js` — `acceptEntry` archived
  guard; `IMMUTABLE_PATCH_FIELDS` additions.
- `tools/learning-loop-mastra/core/consistency-check.js` — F-1 forbid list;
  comment cleanup.
- `tools/learning-loop-mastra/tools/handlers/meta-state-touch-tool.js` —
  unchanged (already correct).
- `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-touch-tool.test.js`
  — superseded fixture via raw append.
- `tools/learning-loop-mastra/core/__tests__/meta-state-accepted-status.test.js`
  — archived-rejection test; header comment cleanup.
- `tools/learning-loop-mastra/core/__tests__/consistency-check.test.js` —
  C-10b and C-17 tests; comment cleanup.

## Tests
- `vitest run` on the three targeted files: 43/43 passed
  (consistency-check 17, touch 12, accepted-status 14).
- No full-suite run (per constraint — concurrent agents).

## Notes
- Stripped `Phase N` / plan-id references in comments of files I modified
  where they appeared in the touched comment blocks. Left deep historical
  `Phase 3`/`Phase 4` descriptors in unrelated comment blocks of
  `core/meta-state.js` (rule schema descriptions etc.) alone to avoid
  scope creep on a 3-finding bugfix.

Status: DONE
Summary: Fixed C2 (superseded touch fixture via raw append), C3 (acceptEntry
rejects archived via explicit early-return), and H3 (accepted_* stamps added
to IMMUTABLE_PATCH_FIELDS and F-1 forbid list). All 43 targeted tests pass.
Concerns/Blockers: none