---
title: "Universal Hooks Unification"
description: "Resolve meta-260726T1858Z: ship the missing half of universal-hooks unification — a combined hooks-lock.json manifest declaring which hooks each runtime SHOULD wire, a wiring-matrix parity test (skills-model), a manifest-aware shims-in-sync checklist item, dead .mastracode shim cleanup, and an adoption-path doc. TDD-structured; preserves existing runtime behavior."
status: pending
priority: P2
effort: "1.5d"
tags: [hooks, manifest, parity-test, runtime-agnostic, gate-logic, tdd]
created: 2026-07-28
---

# Universal Hooks Unification

## Overview

**Trigger:** `meta-260726T1858Z-universal-hooks-unification-is-half-shipped-tools-learning-l` (open, loop-anti-pattern, warning; evidence `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs`).

Universal-hooks unification is half-shipped. `tools/learning-loop-mastra/hooks/universal/` holds 6 canonical hook implementations, but adoption is per-runtime and ad hoc — **four** coexisting wiring patterns with no manifest declaring which hooks each runtime SHOULD wire:

- **Pattern A (direct universal):** `.claude/settings.json` wires `session-start-inject-{discoverability,process-hints}.cjs` directly; `.mastracode/hooks.json` wires all 4 gate hooks directly to `universal/*.js`.
- **Pattern B (shim):** `.claude` + `.factory` wire the 4 gate hooks via byte-identical `.cjs` shims in `<surface>/coordination/hooks/` that `execFileSync` the universal hook; byte-identity enforced by the `shims-in-sync` checklist item.
- **Pattern C (runtime-local adapter):** `.factory/hooks/loop-surface-inject.cjs` — Droid-only SessionStart adapter, single-source via direct core import (plans/260717-1826), NOT a shim.
- **Pattern D (pull-only):** `.mastracode` receives no session-start hint injection by decision (plans/260717-1826).

Skills by contrast have one declared mechanism: canonical source + `skills-lock.json` manifest + `pnpm skills:sync` fan-out + `skills-mirror-parity.test.js` (plans/260719-1428). Hooks got none — that plan explicitly deferred hooks centralization (`plan.md:20`), and no follow-up existed.

**Verified wiring matrix (ground truth for the manifest):**

| universal hook | event | .claude | .factory | .mastracode |
|---|---|---|---|---|
| `bash-gate.js` | PreToolUse | shim | shim | direct |
| `write-gate.js` | PreToolUse | shim (`Edit\|Write`) | shim (`Edit\|Create\|ApplyPatch`) | direct (×3 matchers: `write_file`,`string_replace_lsp`,`delete_file`) |
| `inbound-gate.js` | UserPromptSubmit | shim | shim | direct |
| `recurrence-check-on-start.js` | SessionStart | shim | shim | direct |
| `session-start-inject-discoverability.cjs` | SessionStart | direct | **adapter** (`.factory/hooks/loop-surface-inject.cjs`) | none (pull-only) |
| `session-start-inject-process-hints.cjs` | SessionStart | direct | **adapter** (same) | none (pull-only) |

**Consequences the plan closes:**
1. **Drift is invisible** — nothing verifies each runtime's `settings.json`/`hooks.json` wires the expected hook set. A runtime silently losing a hook (or a new universal hook never getting adopted) is undetectable. No `skills-mirror-parity.test.js` equivalent for hooks.
2. **Adoption path undocumented** — why session-start hooks use Pattern A while gate hooks use Pattern B is unexplained; a new hook has no defined path.
3. **`shims-in-sync` false-greens on dead shims** — `.mastracode/coordination/hooks/*.cjs` (4 shims) are byte-identical to `.claude`/`.factory` but **never referenced** (`.mastracode/hooks.json` wires universal directly). The checklist asserts their byte-identity but not that they are wired, so dead code passes.

**Scope decision (operator-locked 2026-07-28):** hooks manifest + per-runtime wiring matrix + parity test (skills-model). Keep existing runtime behavior; do NOT collapse wiring patterns or rip out the live shim tree. Reconcile the dead `.mastracode` shims (delete — they are unreferenced, so deletion is non-behavioral).

**Manifest shape (operator-locked 2026-07-28):** one combined `hooks-lock.json` at repo root; each hook entry carries its per-runtime wiring map inline (wiring is a property of the hook). No standalone matrix file.

**Source:** `plans/reports/research-260728-0650-hooks-manifest-schema-parity-test.md` + `plans/reports/research-260728-0650-hooks-checklist-reconciliation-docs.md`. **Mode:** `--deep --tdd` (2 researchers already ran; red-team + validate auto-run at handoff).

## Resolved open questions

| # | Question | Resolution | Evidence / Rationale |
|---|----------|------------|----------------------|
| Q1 | Need a `sync-hooks` materializer (skills analog)? | **No.** | Skills fan out **content** (SKILL.md → 3 surface dirs); hooks fan out **nothing** — the universal file lives at one path and each runtime's static config points at it. A materializer would duplicate `shims-in-sync` and risk clobbering runtime-owned `settings.json`/`hooks.json`. Manifest is declarative; the parity test is the enforcement. (KISS/YAGNI) |
| Q2 | `hash` field per hook entry (skills analog)? | **No.** | `skills-lock.json` hashes exist for the **external npx round-trip** trust anchor. Hooks are internal + git-tracked + already write-gated. A hash adds maintenance burden (re-hash on every universal edit) for no gain. (YAGNI) |
| Q3 | `.mastracode` write-gate triple-wire encoding? | **Array of matchers** in one wiring entry: `matcher: ["write_file","string_replace_lsp","delete_file"]`. | One entry per hook is the invariant; multiple matchers for one hook on one surface is a list, not three entries. |
| Q4 | Where does Pattern C live in the manifest? | **Inline `kind:"adapter"`** on the two affected entries (discoverability + process-hints), `.factory` only, `ref` → `.factory/hooks/loop-surface-inject.cjs`. | Preserves "one entry per universal hook"; no separate `adapters` section. Parity covers existence + wiring, NOT byte-identity (single-source, no mirror to drift). |
| Q5 | Pattern C + CHANGE_LOG_BOUND_PATHS? | **No action for `.factory/hooks/**`.** | Already resolved 2026-07-26 (finding `meta-260714T1248Z` v2); `.factory/hooks/**` IS in `core/change-log-bound-paths.js:55`. Do NOT re-add it. (Red-team: `hooks-lock.json` itself is a separate trust anchor — see Q8.) |
| Q6 | Dead `.mastracode` shims? | **Delete.** | `.mastracode/hooks.json` wires universal directly; the 4 shims in `.mastracode/coordination/hooks/` are unreferenced **by any runtime config**. (They are referenced in `surfaces.js:24` JSDoc and `surfaces.test.js:44` — doc/test only, no runtime behavior.) Deletion is non-behavioral at runtime but **does** require updating 4 existing tests in `legacy-mcp/runtime-agnostic.test.js` (see Phase 3, red-team finding F1). Make `shims-in-sync` manifest-aware first so it only asserts shim parity where `kind=="shim"`. |
| Q7 | New `hooks-wiring-coverage` CHECKLIST item (researcher rec)? | **No — defer.** | Skills parity uses a standalone vitest test only (`skills-mirror-parity.test.js`), no checklist item. Mirror that: the vitest `hooks-wiring-parity.test.js` is the backstop. Instead, **fix** the existing `shims-in-sync` item to be manifest-aware so the MCP audit surface stops false-greening. Adding a second wiring-coverage item duplicates the vitest test (DRY). |
| Q8 | `hooks-lock.json` itself as a change-log bound path? | **Add it in this plan (Phase 4).** | Red-team: the manifest is a load-bearing trust anchor for the parity test — unlogged edits silently redefine "correct wiring" with no meta-state trace. One-line addition to `core/change-log-bound-paths.js`; cheap trust-boundary hardening, in-scope. (Promoted from "defer" per red-team F6.) |
| Q9 | Self-heal normalizer for v1 (skills analog)? | **No.** | No npx-style external mutation path for hooks. (YAGNI) |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | One combined `hooks-lock.json` at repo root declares the 6 universal hooks + per-runtime wiring (kind ∈ {shim, direct, adapter, none}, ref, matcher) | P2 |
| 2 | `hooks-wiring-parity.test.js` asserts each runtime's `settings.json`/`hooks.json` matches the manifest: declared-wired ARE wired; declared-"none" are NOT wired (catches silent adoption); canonical paths exist | P2 |
| 3 | `shims-in-sync` checklist item becomes manifest-aware: asserts shim byte-identity only across surfaces where the manifest declares `kind=="shim"`, so dead `.mastracode` shims drop out and the MCP audit surface stops false-greening | P2 |
| 4 | Delete the 4 dead `.mastracode/coordination/hooks/*.cjs` shims (unreferenced; non-behavioral) | P2 |
| 5 | `docs/architecture.md` gains a "Hooks Wiring Manifest" section: the 6 hooks, the 4 wiring patterns, the matrix, the manifest as source of truth, and the "adding a new hook" adoption path | P2 |
| 6 | Finding resolved with `meta_state_derive_status` → `meta_state_resolve` + change-log citing this plan | P2 |

## Non-goals

- Collapsing to one wiring pattern / deleting the live `.claude`+`.factory` shim tree.
- A `sync-hooks` materializer or self-heal normalizer.
- Per-hook `hash` fields.
- A new `hooks-wiring-coverage` CHECKLIST item (the vitest test + manifest-aware `shims-in-sync` cover it).
- Changing any runtime's actual hook behavior.

## Phases

| # | Phase | Status | Risk |
|---|-------|--------|------|
| 1 | [Hooks wiring manifest](./phase-01-hooks-wiring-manifest.md) | Pending | Low (new declarative file; no consumers yet) |
| 2 | [Hooks wiring parity test](./phase-02-hooks-wiring-parity-test.md) | Pending | Medium (first reader of the manifest; 3 runtime config shapes) |
| 3 | [Checklist manifest-aware + dead shim cleanup](./phase-03-checklist-manifest-aware-dead-shim-cleanup.md) | Pending | Medium (mutates a shared CHECKLIST item; deletes files) |
| 4 | [Docs, adoption path, resolve finding](./phase-04-docs-adoption-path-resolve-finding.md) | Pending | Low (docs + meta-state resolution) |

## Architecture

`hooks-lock.json` (repo root, sibling of `skills-lock.json`) is a **declarative** source of truth — no code consumes it at runtime; the parity test and the `shims-in-sync` checklist item read it. Each of the 6 entries is keyed by the **universal basename without extension, kebab-case** (e.g. `bash-gate`, `recurrence-check-on-start`, `session-start-inject-discoverability`) — this is the key `shimNameToHookKey` (Phase 3) maps shim filenames onto:

```json
{
  "hooks": {
    "bash-gate": {
      "path": "tools/learning-loop-mastra/hooks/universal/bash-gate.js",
      "event": "PreToolUse",
      "wiring": {
        ".claude":     { "kind": "shim",   "ref": ".claude/coordination/hooks/bash-coordination-gate.cjs",     "matcher": "Bash" },
        ".factory":    { "kind": "shim",   "ref": ".factory/coordination/hooks/bash-coordination-gate.cjs",  "matcher": "Execute" },
        ".mastracode": { "kind": "direct", "ref": "node tools/learning-loop-mastra/hooks/universal/bash-gate.js", "matcher": { "tool_name": "execute_command" } }
      }
    },
    "recurrence-check-on-start": {
      "path": "tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js",
      "event": "SessionStart",
      "wiring": {
        ".claude":     { "kind": "shim",   "ref": ".claude/coordination/hooks/recurrence-check-on-start.cjs" },
        ".factory":    { "kind": "shim",   "ref": ".factory/coordination/hooks/recurrence-check-on-start.cjs" },
        ".mastracode": { "kind": "direct", "ref": "node tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js" }
      }
    },
    "session-start-inject-discoverability": {
      "path": "tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs",
      "event": "SessionStart",
      "wiring": {
        ".claude":     { "kind": "direct",  "ref": "node tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs" },
        ".factory":    { "kind": "adapter", "ref": ".factory/hooks/loop-surface-inject.cjs", "matcher": "startup" },
        ".mastracode": { "kind": "none" }
      }
    }
  }
}
```

`kind` ∈ `{shim, direct, adapter, none}`. `matcher` is: string (`.claude`/`.factory` PreToolUse), object (`.mastracode` PreToolUse), array (`.mastracode` write-gate triple-wire: `["write_file","string_replace_lsp","delete_file"]`), or a SessionStart matcher where present (`.factory` adapter carries `"startup"`). It is absent only when the runtime's config has no matcher for that entry. The parity test resolves the right config file per runtime (`.claude` → `settings.json`; `.factory` → `settings.json` + `hooks.json`; `.mastracode` → `hooks.json`) and **canonicalizes env-token prefixes** (`$FACTORY_PROJECT_DIR`/`$CLAUDE_PROJECT_DIR` → surface-relative path) before comparing `command` against `ref`.

The `shims-in-sync` checklist item (`core/runtime-agnostic-checklist.js`) changes from "every surface's `coordination/hooks/` has the same byte-identical .cjs shims" to "every surface where the manifest declares `kind:"shim"` for a hook has that hook's shim, byte-identical across those surfaces." `buildShimMaps` is retained; the manifest filters which surfaces participate per hook.

## Success Criteria

- [ ] `hooks-lock.json` exists at repo root with 6 entries; every entry has `path`, `event`, and a `wiring` map keyed by all 3 `SURFACES`.
- [ ] `hooks-wiring-parity.test.js` passes: every declared-wired hook is wired with the declared kind on every surface; every `kind:"none"` hook is NOT wired; every canonical `path` existsSync.
- [ ] `shims-in-sync` is manifest-aware: `.mastracode` (wired `direct`) no longer required to carry shims; shim byte-identity still asserted across `.claude`+`.factory` (the `kind:"shim"` surfaces).
- [ ] `.mastracode/coordination/hooks/*.cjs` (4 files) deleted; `node .mastracode/hooks.json` behavior unchanged.
- [ ] `docs/architecture.md` "Hooks Wiring Manifest" section documents the matrix + adoption path.
- [ ] Finding `meta-260726T1858Z` resolved (status `resolved`) with a change-log entry citing this plan.
- [ ] `pnpm test` green; `check_runtime_agnostic` clean.

## Red Team Review

### Session — 2026-07-28
**Reviewers:** Security Adversary (Fact Checker), Failure Mode Analyst (Contract Verifier), Assumption Destroyer (Scope Auditor)
**Findings:** 12 (10 accepted, 2 merged/rejected as duplicates)
**Severity breakdown:** 2 Critical, 5 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|------------|------------|
| F1 | Phase 3 breaks 4 existing tests in `legacy-mcp/runtime-agnostic.test.js` that read `SHIM_DIRS` directly / assert the old `shims-in-sync` invariant (`:124` name-set parity, `:154` content-diff fixture, `:171` missing-.mastracode, `:188` real-repo name) | Critical | Accept | Phase 3 |
| F2 | `loadHooksManifest` no-manifest + `shimNameToHookKey` unknown-name behavior unspecified; existing temp-dir fixtures depend on it | Critical | Accept | Phase 3 |
| F3 | `.factory` write-gate matcher mis-transcribed (`Create\|ApplyPatch` vs actual `Edit\|Create\|ApplyPatch`) | High | Accept | plan.md matrix, Phase 1 |
| F4 | Phase 3 cites wrong test path (`__tests__/` vs `__tests__/legacy-mcp/`) | High | Accept | Phase 3 |
| F5 | Manifest-shape test hard-codes "6 keys" without cross-validating against `universal/` dir — "new hook undetectable" goal left open | High | Accept | Phase 1 |
| F6 | `.factory` `$FACTORY_PROJECT_DIR` env-token normalization unspecified in parity helper | High | Accept | Phase 2 |
| F7 | `.factory` SessionStart adapter carries `matcher:"startup"` the schema declared absent | High | Accept | plan.md schema, Phase 1/2 |
| F8 | `.mastracode` array-matcher: parity must assert 3 distinct wires, not one | Medium | Accept | Phase 2 |
| F9 | Phase 3 `protocol-adapter-i-o` risk-note rationale wrong (item audits single featurePath file, never scans SHIM_DIRS) | Medium | Accept | Phase 3 |
| F10 | `hooks-lock.json` not a change-log bound path — unlogged edits (promoted Q8 from defer to in-plan) | Medium | Accept | Phase 4 |
| F11 | Manifest key convention not stated; example omits `recurrence-check-on-start` (`.js`-direct vs `.cjs`-shim split) | Medium | Accept | plan.md schema |
| F12 | Q6 "unreferenced" overclaim (shims appear in `surfaces.js:24` JSDoc + `surfaces.test.js:44`) | Medium | Accept | plan.md Q6 |

**Rejected:** none on merit (all reviewer findings carried codebase evidence; duplicates merged — the three reviewers independently surfaced F1/F3/F4/F6/F7, counted once each).

### Whole-Plan Consistency Sweep
Post-edit re-read of `plan.md` + all 4 `phase-*.md` confirmed: matrix matcher fixed (`Edit|Create|ApplyPatch`); Q6 narrowed; Q8 promoted to Phase 4; manifest key convention + `recurrence-check-on-start` example added; SessionStart `startup` matcher + env-token canonicalization documented. Phase 1/2/3/4 step lists updated to reflect F1, F2, F5, F6, F8, F9, F10. No stale "6 keys" / "go green immediately" / "non-behavioral deletion" claims remain in the phase bodies (corrected inline). Zero unresolved contradictions.

## Validation Log

### Session — 2026-07-28
**Verification:** skipped (red-team served as Fact Checker + Contract Verifier; all findings carried codebase evidence and were applied — see Red Team Review).
**Interview:** 3 questions, all answered (recommended option confirmed).

| # | Question | Decision | Propagated to |
|---|----------|----------|--------------|
| V1 | `:124` name-set test on .mastracode deletion | **Rewrite manifest-aware** (assert name-set parity only across `kind:"shim"` surfaces) | Phase 3 step 1 |
| V2 | `hooks-lock.json` in CHANGE_LOG_BOUND_PATHS | **Add in this plan (Phase 4)** (load-bearing trust anchor; unlogged edits) | Phase 4 step 3 |
| V3 | `.factory` SessionStart `matcher:"startup"` | **Encode in manifest + assert in parity** | plan.md schema, Phase 1 step 2, Phase 2 specs |

All three decisions match the plan as already written post-red-team; no further edits required.