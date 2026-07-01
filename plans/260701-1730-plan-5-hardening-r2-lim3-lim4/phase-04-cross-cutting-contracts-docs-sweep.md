---
phase: 4
title: "Cross-Cutting (contracts + docs + sweep)"
status: pending
priority: P1
dependencies: ["phase-01-lim-3-identity-ed25519", "phase-02-r2-write-gate-per-runtime-allowlist", "phase-03-lim-4-path-containment-realpath"]
effort: "0.5d"
---

# Phase 4: Cross-Cutting (contracts + docs + sweep)

## Overview

Wrap Phases 1-3 with the contract amendments, operator-facing documentation, code-review/registry sweep, and journal entry that make Plan 5 shippable as a single PR. Phase 4 has zero new behavioral code; it surfaces Plan 5's changes to the contract validator, AGENTS.md, `docs/agents/`, and the meta-state registry.

## Requirements

### Functional

- **F1.** `interface/CONTRACT.md` updated:
  - Req #4 (`identity-marker`): document the Ed25519 signed capability token requirement; cite `~/.claude/runtime-private-key.bin` etc. as the key storage location. **TWO MODES** (per red-team Finding 2): `--ci-mode` keeps Req #4 ADVISORY (CI runners don't have a SessionStart; current behavior is OK); interactive mode (`node interface/contract.js claude-code` from operator's shell) is STRICT — requires valid token file.
  - **NEW Req #9** (`r2-allowlist-present`): `.loop/r2-allowlist.json` MUST exist at the project root with `version: 1` + `runtimes` + `universal` + `protected_paths` keys.
  - **NEW Req #10** (`r2-allowlist-coverage`): every registered runtime id MUST have an entry in `runtimes`. `unknown` is NOT a valid entry.
- **F2.** `interface/RUNTIME_ONBOARDING.md` updated with:
  - LIM-3 key generation flow per harness.
  - R2 allowlist example (3-runtime config).
  - LIM-4 path containment contract (paths outside project root are refused with `path_containment: "outside_root"`).
- **F3.** `AGENTS.md §11` (R2 ownership): update the "Enforcement" line from "Git branch protection + PR review" to "Per-runtime write allowlist via `.loop/r2-allowlist.json` enforced by the createLoopTool R2 gate (Plan 5). Branch protection + PR review remain for non-critical paths."
- **F4.** `docs/agents/mastra-code.md`: document that `MASTRA_RESOURCE_ID` is now ADVISORY (replaced by the Ed25519 token). **The `MASTRA_RESOURCE_ID` fallback lives in `interface/contract.js` ONLY — for onboarding permissiveness. The MCP server verifier (Phase 1) is Ed25519-only; `MASTRA_RESOURCE_ID` is NOT accepted by `verifyRuntimeToken`.** (Red-team Finding 17: if the fallback lived in both, an attacker who sets `MASTRA_RESOURCE_ID=droid` in a Claude Code session would defeat F1 closure.)
- **F5.** `docs/security/plan-5-hardening.md` (NEW): 1-page operator-facing summary of the 3 security items + how to verify + how to recover from a key rotation. **Includes (per Validation D3):** the deny-edit window section — "Deny edits to `.loop/r2-allowlist.json` take effect on the next MCP server restart. Restart all clients within X minutes of the edit. Pending deny is logged in the gate log; check the `gate_log` to see if your deny is in effect." Cite this document from `AGENTS.md` and the project README.
- **F6.** `meta_state_log_change` entries filed for:
  - Phase 1 (LIM-3 identity primitive shipped).
  - Phase 2 (R2 write-gate shipped).
  - Phase 3 (LIM-4 path containment shipped).
  - Plan 5 closure (all 3 LIMs resolved).
- **F7.** `meta_state_resolve` filed for LIM-3, LIM-4, R2 entries (per master tracker § "Known Limitations from B1-B2"). Each resolution cites the phase file + commit hash.
- **F8.** `meta_state_report` (finding, optional) for any residual LIMs (LIM-5 test harness, LIM-6 idempotency cache, LIM-8 passthroughs) — already tracked in master tracker § Phase B LIMs; no new findings needed.
- **F9.** Journal entry `docs/journals/260701-phase-5-plan-5-shipped.md` summarizing the ship; cite the 3 phase files + the 2 researcher reports + the Plan 4 red-team review's F1/F11/R2 deferral context.

### Non-functional

- **NF1.** All doc + contract + journal changes are NON-BEHAVIORAL. `pnpm test` must pass without any test changes.
- **NF2.** No new test files in Phase 4 (the lock-step regression guards already exist from Phases 1-3).

## Architecture

### Doc tree changes

```
docs/
├── agents/
│   └── mastra-code.md             # update: MASTRA_RESOURCE_ID advisory; cite LIM-3
├── security/
│   └── plan-5-hardening.md        # NEW: operator-facing summary
└── journals/
    └── 260701-phase-5-plan-5-shipped.md  # NEW: journal entry

interface/
├── CONTRACT.md                    # update: Req #4 + new Reqs #9 + #10
└── RUNTIME_ONBOARDING.md          # update: key gen + allowlist + containment

AGENTS.md                          # update: §11 enforcement line
```

### Contract amendments (Req #9 + #10)

```yaml
# New requirements added to interface/CONTRACT.md (Reqs #9 + #10)
- id: r2-allowlist-present
  description: |
    The project MUST have a `.loop/r2-allowlist.json` file declaring the per-runtime
    writable surfaces. Required keys: `version: 1`, `runtimes`, `universal`.
  verification: |
    fs.existsSync(<root>/.loop/r2-allowlist.json) &&
    JSON.parse(content).version === 1 &&
    JSON.parse(content).runtimes !== undefined &&
    JSON.parse(content).universal !== undefined

- id: r2-allowlist-coverage
  description: |
    Every registered runtime id (per `interface/contract.js` runtime registry) MUST
    have a matching entry in `runtimes`. `unknown` is NOT a valid entry.
  verification: |
    for runtime_id in registeredRuntimes:
      assert allowlist.runtimes[runtime_id]?.identity === runtime_id
```

### `interface/contract.js` updates

The contract validator adds 2 new check functions:

```js
// New check functions (interface/contract.js)
function checkR2AllowlistPresent(rootPath) {
  const allowlistPath = join(rootPath, ".loop", "r2-allowlist.json");
  if (!existsSync(allowlistPath)) {
    return { id: "r2-allowlist-present", ok: false, path: allowlistPath };
  }
  try {
    const data = JSON.parse(readFileSync(allowlistPath, "utf8"));
    return {
      id: "r2-allowlist-present",
      ok: data.version === 1 && data.runtimes && data.universal,
      path: allowlistPath,
      version: data.version,
    };
  } catch (err) {
    return { id: "r2-allowlist-present", ok: false, path: allowlistPath, parse_error: err.message };
  }
}

function checkR2AllowlistCoverage(runtimeId, rootPath) {
  const allowlistPath = join(rootPath, ".loop", "r2-allowlist.json");
  if (!existsSync(allowlistPath)) return { id: "r2-allowlist-coverage", ok: true, note: "no-allowlist" };
  try {
    const data = JSON.parse(readFileSync(allowlistPath, "utf8"));
    const entry = data.runtimes?.[runtimeId];
    return {
      id: "r2-allowlist-coverage",
      ok: entry?.identity === runtimeId,
      expected: runtimeId,
      found: entry?.identity ?? null,
    };
  } catch {
    return { id: "r2-allowlist-coverage", ok: false, note: "parse-error" };
  }
}
```

The existing `validate(runtimeId, rootPath)` calls both for each runtime; results are added to the `missing` array when `ok: false`.

### AGENTS.md §11 update

```diff
- **Enforcement:** Git branch protection + PR review. The bundled hardening plan (`hardening-r2-lim3-lim4`) ships the write-gate (LIM-3 caller identity + R2 write-gate + LIM-4 path traversal) for security-critical enforcement.
+ **Enforcement:** Per-runtime write allowlist via `.loop/r2-allowlist.json` enforced by the createLoopTool R2 gate (Plan 5, shipped 2026-07-01). Branch protection + PR review remain for non-critical paths. The R2 gate keys on the Ed25519 verified runtime identity (LIM-3); path containment (LIM-4) is applied BEFORE the ownership check so symlink-escape attempts are refused with `path_containment: "outside_root"`. See `docs/security/plan-5-hardening.md` for the operator-facing summary.
```

### `docs/security/plan-5-hardening.md` outline

```markdown
# Plan 5: Bundled Hardening — Operator Summary

**Ship date:** 2026-07-01
**Plan dir:** `plans/260701-1730-plan-5-hardening-r2-lim3-lim4/`
**Resolves:** LIM-3, LIM-4, R2 (per master tracker § Phase B LIMs)

## What this ships

3 security-critical items bundled into 1 PR:

1. **LIM-3 caller identity** — Ed25519 signed capability tokens replace the
   spoofable `RUNTIME_ID` env var. Each runtime signs a 60-min token; the MCP
   server verifies signature + expiry + runtime_id match before honoring any
   tool call.

2. **R2 write-gate** — per-runtime allowlist (`.loop/r2-allowlist.json`) enforces
   that each runtime can only write to its own surface + universal patterns.
   Cross-runtime writes denied with structured error + gate_log entry.

3. **LIM-4 path containment** — `core/path-containment.js` `resolveInsideRoot`
   helper replaces the `isAbsolute(s) ? s : join(root, s)` pattern at 6 audit
   sites. Symlink-aware; refuses paths outside project root with
   `path_containment: "outside_root"`.

## How to verify

### LIM-3

```bash
# After opening a Claude Code / Droid / Mastra Code session:
ls -la ~/.claude/runtime-private-key.bin
# Expected: -rw------- 1 user user 32 ... (0600 perms, 32 bytes)
cat .claude/coordination/runtime-id-token.json
# Expected: valid JSON envelope with v, runtime_id, sig, etc.
node tools/learning-loop-mastra/interface/contract.js claude-code
# Expected: {ok: true, missing: [], notes: []}
```

### R2

```bash
# Edit `.loop/r2-allowlist.json` to add a deny pattern for a runtime.
# Try a meta_state_report call from that runtime to the denied path.
# Expected: { error: "cross_runtime_write_denied", ... }
cat .claude/coordination/hooks/.loop-gate-log.jsonl | tail -3
# Expected: cross_runtime_write_denied entry
```

### LIM-4

```bash
# Try meta_state_refresh_fingerprint against an entry with /etc/passwd as evidence_code_ref.
# Expected: { error: "code_missing", path_containment: "outside_root" }
```

## How to rotate a runtime key

```bash
# 1. Delete the runtime's private key (forces regeneration on next SessionStart).
rm ~/.claude/runtime-private-key.bin
# 2. Open a new session; SessionStart regenerates and writes a fresh key + token.
# 3. Server detects fingerprint change; refreshes pubkey cache; logs rotation.
```

## Rollback

If a critical regression is found post-ship:

1. Revert the PR (`git revert <merge-commit>`).
2. Restore `core/legacy/runtime-agnostic-checklist.js` from git history.
3. Re-open LIM-3, LIM-4, R2 in meta-state; status back to `active`.

## See also

- `interface/CONTRACT.md` Reqs #4, #9, #10.
- `interface/RUNTIME_ONBOARDING.md` (updated with key gen + allowlist).
- `AGENTS.md §11` (updated with new enforcement line).
- `docs/agents/mastra-code.md` (updated with MASTRA_RESOURCE_ID advisory note).
```

## Related Code Files

### Create

- `docs/security/plan-5-hardening.md` (~150 lines: operator summary)
- `docs/journals/260701-phase-5-plan-5-shipped.md` (~150 lines: journal entry)
- `meta-state.jsonl` entries: 4 change-logs (Phase 1, 2, 3, Plan 5 closure) + 3 resolves (LIM-3, LIM-4, R2)

### Modify

- `interface/CONTRACT.md` (~50 lines added: Req #4 update + new Reqs #9 + #10)
- `interface/RUNTIME_ONBOARDING.md` (~60 lines added: key gen + allowlist + containment sections)
- `interface/contract.js` (~40 LoC added: 2 new check functions + integration into `validate()`)
- `interface/__tests__/contract.test.js` (~80 LoC added: tests for Reqs #9 + #10)
- `AGENTS.md` §11 (~3 lines modified: enforcement line update)
- `docs/agents/mastra-code.md` (~5 lines modified: MASTRA_RESOURCE_ID advisory note)
- `plans/reports/productization-260612-1530-master-tracker.md` (~10 lines: PE-5 row flipped to ✅ DONE; LIM-3/4 resolved; R2 added to resolved list)

### Delete

- None.

## Implementation Steps

### Step 1: Update interface contract

- Add Reqs #9 (`r2-allowlist-present`) + #10 (`r2-allowlist-coverage`) to `interface/CONTRACT.md`.
- Update Req #4 description with Ed25519 token requirement. **TWO MODES** (red-team Finding 2): `--ci-mode` flag (default in `pnpm test`) keeps Req #4 ADVISORY (CI runners don't have SessionStart); interactive mode (no flag) is STRICT. Implemented as `validate(runtimeId, rootPath, opts={ciMode: false})`.
- Add `checkR2AllowlistPresent` + `checkR2AllowlistCoverage` to `interface/contract.js`.
- Wire both into `validate()`.

### Step 2: Write contract tests (TDD)

- Add tests in `interface/__tests__/contract.test.js`:
  - Req #9: missing `.loop/r2-allowlist.json` → `{ok: false, missing: ["r2-allowlist-present"]}`.
  - Req #9: present + valid → `{ok: true}`.
  - Req #10: runtime id without entry → `{ok: false}`.
  - Req #4 (interactive mode, no token file): `ok: false, missing: ["identity-marker"]` (strict).
  - Req #4 (CI mode, no token file): `ok: true, notes: ["identity-marker-not-adopted"]` (advisory).
- Run all contract tests; pass.

### Step 3: Update AGENTS.md + docs

- Update `AGENTS.md §11` enforcement line.
- Update `docs/agents/mastra-code.md` with MASTRA_RESOURCE_ID advisory note.
- Create `docs/security/plan-5-hardening.md`.

### Step 4: Update onboarding doc + appendGateLog on allowlist edits (REVISED per Validation Session 1 D3)

- Update `interface/RUNTIME_ONBOARDING.md`:
  - LIM-3 section: "How to generate a runtime key" with `~/.claude/runtime-private-key.bin` etc.
  - R2 section: "How to extend the allowlist" with example.
  - LIM-4 section: "How paths are contained" with edge-case matrix.
  - **NEW (Validation D3):** R2 deny-edit window section — explain that operator deny takes effect on next MCP server restart; reference the gate-log entry shape.

### Step 5: File registry entries + appendGateLog on allowlist edits (REVISED per Validation Session 1 D3)

- **NEW (Validation D3):** Add `appendGateLog` integration in `initR2Gate()` (Phase 2): when the allowlist is loaded at server boot, if its mtime is recent (within last hour), log a `r2_allowlist_reloaded` entry to surface operator edits that are pending restart. The actual allowlist edit watcher is deferred (no file-watcher in v1).
- File 4 `meta_state_log_change` entries via the MCP tool (not raw write):
  - Phase 1: `change_dimension: "surface"`, `change_target: "core/identity/"`, `reason: "LIM-3 caller identity primitive shipped"`.
  - Phase 2: `change_dimension: "surface"`, `change_target: "core/r2/"`, `reason: "R2 per-runtime write allowlist shipped"`.
  - Phase 3: `change_dimension: "surface"`, `change_target: "core/path-containment.js"`, `reason: "LIM-4 realpath containment shipped"`.
  - Plan 5 closure: `change_target: "plans/260701-1730-plan-5-hardening-r2-lim3-lim4/plan.md"`, `reason: "Plan 5 bundled hardening shipped; LIM-3, LIM-4, R2 all resolved"`.
- File 3 `meta_state_resolve` entries for LIM-3, LIM-4, R2 in meta-state.

### Step 6: Update master tracker

- Update `plans/reports/productization-260612-1530-master-tracker.md`:
  - State Snapshot: PE-5 row → ✅ DONE.
  - LIM table: LIM-3, LIM-4 → Resolved (cite this plan).
  - Deferred Items: PE-5 row → ✅ DONE with closure ref.
  - Resolved section: add PE-5 row.
- Update "Recommended next move" → reflect Plan 5 closure; surface Phase F (Bridge 7) as next.

### Step 7: Journal entry

- Write `docs/journals/260701-phase-5-plan-5-shipped.md` summarizing the ship.
- Cite: 3 phase files, 2 researcher reports, Plan 4 red-team review's F1/F11/R2 deferrals, master tracker PE-5 row.

## Success Criteria

- [ ] `interface/contract.js claude-code` returns `{ok: true}` (passes Reqs #1-10).
- [ ] All contract tests pass (Reqs #1-10).
- [ ] `AGENTS.md §11` enforcement line updated.
- [ ] `docs/security/plan-5-hardening.md` exists + is linked from AGENTS.md + project README.
- [ ] 4 change-logs + 3 resolves filed in meta-state.
- [ ] Master tracker updated: PE-5 → DONE; LIM-3/4 → Resolved.
- [ ] Journal entry exists at `docs/journals/260701-phase-5-plan-5-shipped.md`.
- [ ] `pnpm test` passes with no regressions (Phases 1-3 already locked this).

## Risk Assessment

- **R1 (HIGH, REVISED — red-team Finding 2):** Contract Req #4 tightening (removing advisory note) breaks `claude-code` and `droid` contract validations in CI today (no SessionStart in CI runner → no token file → `missing: ["identity-marker"]` → CI fails). **Mitigation:** `validate(runtimeId, rootPath, opts={ciMode: false})` — `--ci-mode` flag (default in `pnpm test` via pre-commit hook) keeps Req #4 ADVISORY. CI passes; interactive operator sessions are STRICT.
- **R2 (LOW):** Doc updates (`AGENTS.md`, `RUNTIME_ONBOARDING.md`, `mastra-code.md`) may conflict with concurrent doc changes. Mitigation: Phase 4 is non-behavioral; doc-only changes rarely conflict with code-only PRs.
- **R3 (LOW):** `meta_state_log_change` / `meta_state_resolve` calls are gated by the new R2 gate; the calls themselves (from the operator's session) must be authorized by a valid token. Mitigation: operator's session has a valid token; the calls succeed.
- **R4 (LOW):** Master tracker update is the last step; if a Phase 1-3 implementation reveals an open question that changes Plan 5's scope, the tracker update is stale. Mitigation: update the tracker AFTER all phases ship; cite the actual closure dates + commit hashes.