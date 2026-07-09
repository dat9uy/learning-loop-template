---
phase: 3
title: "Record keep-open set + report the code_ref_exists derivation flaw"
status: pending
priority: P2
dependencies: [1]
---

# Phase 3: Record keep-open set + report the derivation flaw

## Overview
Two outputs. (a) Report a **new finding** documenting — **accurately** — that `meta_state_derive_status`'s `mechanism-shipped` derivation gates on file-existence only (`code_ref_exists`, plus `test_file_exists` when `evidence_test` is set) with no content/semantics check, so it false-positives when `evidence_code_ref` points at a symptom file; and separately false-negatives to `code-missing` when `evidence_code_ref` carries a `:line-range` suffix. (b) Record, per KEEP-OPEN finding, *why* it is open — as an **idempotent** `meta_state_patch` appending a closeout note to each finding's `description`, **never** a status or `last_verified_at` flip.

## Requirements
- Functional: one new `meta_state_report` finding (derivation flaw); **7** `meta_state_patch` calls appending a keep-open reason to each KEEP-OPEN finding's `description` (transport-L1, EOF-conflict, log_change, supersede, unarchive, report-overwrite, taskUpdate-noop).
- Non-functional: patches **only touch `description`** (append a dated closeout-note line), and are **idempotent** — read current `description` first and skip the append if the closeout-note tag (`[closeout 2026-07-10]`) is already present (avoids double-append on retry). Do not flip `status`, do not stamp `last_verified_at` (it means "passing verification run" per `meta_state_re_verify`; we confirmed a *failing*/live state, not a pass — and sweep is read-only post-260707-0812 so a stale-but-open finding is not auto-closed; the rationale is semantic, not stale-view hygiene).
- The new finding must cite this plan + the 2 clearest false-positive examples (transport-L1 `.mcp.json`, EOF-conflict `.gitignore`) AND note the line-suffix false-negative (log_change/supersede `:line-range` → `code-missing`). **Do NOT** claim "all 10 / 7/10 false-positive" — only 7/10 derive `resolved-by-mechanism` at all, and the 3 escalates derive correctly non-resolved.

## Architecture
```
# (a) derivation flaw (accurate description)
meta_state_report({
  category: "loop-anti-pattern", severity: "warning",
  affected_system: "meta-state-tools",
  description: "derive_status mechanism-shipped gates on file-existence only (code_ref_exists; + test_file_exists when evidence_test set) — no content/semantics check. False-positives when evidence_code_ref is a SYMPTOM file (transport-L1 .mcp.json, EOF-conflict .gitignore both derived resolved-by-mechanism yet unresolved). Separately, a :line-range suffix on evidence_code_ref false-negatives to code-missing (log_change/supersede derived active-no-signal despite the file existing). Recommend a content-match or test_passed signal in computeKind. See plan 260710-0104-drift-driven-registry-closeout.",
  evidence_code_ref: "<derive_status computeKind path — Grep core/; likely loop-introspect.js or a derive-status module>",
})
# (b) keep-open reasons — IDEMPOTENT append
for id in Phase1.KEEP_OPEN_rows (7):
  existing = (await meta_state_list({id})).description
  if "[closeout 2026-07-10]" in existing: skip   # idempotency guard
  meta_state_patch({id, entry_kind:"finding", patch:{ description: existing + "\n\n[closeout 2026-07-10] KEEP-OPEN: <reason>. See plan 260710-0104-drift-driven-registry-closeout." }})
```

## Related Code Files
- Read-only: the `meta_state_derive_status` / drift implementation (locate via `Grep` in `tools/learning-loop-mastra/core/` — likely `loop-introspect.js` or a derive/drift module) to cite as `evidence_code_ref` for the new finding. Phase 3 modifies no source.

## Keep-open set (input from Phase 1)

| full id | keep-open reason | reason class |
|---|---|---|
| …-close-flow-…transport-not-l1 | transport never promoted to L1; `.mcp.json` existence fooled derivation; live architectural debate | derivation-fooled + debate |
| …-parallel-prs-…append-only-eof-merge-conflict | no mitigation shipped (`.gitattributes union` / post-merge logging / PR sequencing all debated, relates `meta-260708T0355Z`); `.gitignore` fooled derivation | derivation-fooled + debate |
| …-log-change…silent-persistence-fail | LIVE: writeEntry return ignored at L87; unconditional `{logged:true}`; idempotency cache caches success; no test | LIVE bug |
| …-supersede-silent-persistence-fail-var | LIVE: `applyUpdateAndCheck` (#38) checks return value, not the post-write visibility re-read the finding requires; no test; root cause uninvestigated | LIVE bug |
| …-no-mcp-path-exists-to-unarchive… | LIVE: no first-class `meta_state_unarchive` tool / no audit-safe recovery path. (Correction: `IMMUTABLE_PATCH_FIELDS` does NOT block archived_*/status — the finding's "IMMUTABLE blocks" premise is stale; the gap is the missing sanctioned tool.) | LIVE bug (reason corrected) |
| …-report-mcp-tool-silently-overwrites-… | LIVE: `:14-25` no `id` in destructure; `:28` `generateId(slugify(description))` ignores caller id; finding's "honor or reject" demand unmet | LIVE bug (red-team found) |
| …-plan-1b-phase-2-…task-update | symptom-shaped `manifest.json` evidence + noop-undetection concern likely upstream of this repo; pending journal `260622-phase-d-plan-1b-shipped` | symptom-evidence / upstream |

Any Phase-1 downgrade from Group R joins this set with its reason.

## Verification matrix

| action | confirm | on failure |
|---|---|---|
| derivation-flaw report | `meta_state_list({id})` returns the new finding, `status: open`, `mechanism_check: true` (evidence_code_ref set); description is **accurate** (no "all 10 / 7/10" claim) | retry with corrected evidence_code_ref path / description |
| each keep-open patch | `meta_state_list({id, compact:true})` shows `description` updated with exactly ONE closeout-note, `status` unchanged (`open`), `last_verified_at` unchanged | if note already present → skip (idempotent); do not stamp last_verified_at |

## MCP-tool / interface checklist
- [ ] `Grep` `tools/learning-loop-mastra/core/` for the derive/drift implementation (`computeKind`) to cite `evidence_code_ref` on the new finding.
- [ ] `meta_state_report({...})` — one call, the derivation-flaw finding (accurate description). Capture the returned id.
- [ ] For each of 7 KEEP-OPEN findings: `meta_state_list({id})` → read `description`; **if `[closeout 2026-07-10]` already present, skip** (idempotency); else `meta_state_patch({id, entry_kind:"finding", patch:{description: existing + note}})` — **description append only**.
- [ ] **No** `last_verified_at` writes. **No** status flips. **No** `re_verify` (would run verification steps we have not executed).
- [ ] Wire the new derivation-flaw finding id → Phase 4's change-log reason.

## Dependency map
- Depends on: Phase 1 (KEEP-OPEN rows + reasons frozen).
- Blocks: Phase 4 (needs the new derivation-flaw finding id for the change-log).
- External: the derivation-flaw finding may, later, motivate a `meta_state_propose_design` or a fix plan — out of scope here (no code changes this closeout).

## Implementation Steps
1. `Grep`/`Read` to locate the `derive_status` `computeKind` implementation; confirm it gates on `code_ref_exists` (+ `test_file_exists`). Use that path as `evidence_code_ref`.
2. `meta_state_report` the derivation-flaw finding with the **accurate** description (file-existence gate + symptom false-positive + line-suffix false-negative; no "all 10" claim); capture its id.
3. For each of the 7 Phase-1 KEEP-OPEN findings: read current `description`; **skip if the closeout-note tag is already present** (idempotency); else append the dated note and `meta_state_patch` the `description` only.
4. Confirm via `meta_state_list` that each finding's `status` is still `open`, `last_verified_at` is untouched, and there is exactly one closeout-note (no double-append).
5. Record the new finding id + the patched ids in the phase report.

## Success Criteria
- [ ] Derivation-flaw finding created (id captured); description is accurate (file-existence gate, symptom false-positive, line-suffix false-negative; NO "all 10 / 7/10" overclaim).
- [ ] Each of 7 KEEP-OPEN findings has exactly one closeout-note in `description`; `status` and `last_verified_at` untouched.
- [ ] No live finding was fake-re-grounded (no `last_verified_at` stamp, no status flip).
- [ ] New finding id handed to Phase 4.

## Risk Assessment
- **Fake re-ground (HIGH)** — stamping `last_verified_at` on a LIVE bug falsely marks it verified (`meta_state_re_verify` semantics: it means a passing run). Mitigation: **description-only patches**; the phase explicitly forbids `last_verified_at`/status writes. (Note: sweep is read-only, so not stamping does NOT risk auto-closure — the rationale is semantic, not stale-view hygiene. Also: a `description` note does NOT stop future `derive_status` re-flagging since it ignores `description` — the derivation-flaw finding is what warns humans.)
- **Inaccurate new finding (MEDIUM)** — a false report about false reports misleads future agents. Mitigation: the description is grounded in the actual `derive_status` results (7/10 resolved-by-mechanism; 3 escalates derive non-resolved); no "7/10 false-positive" overclaim.
- **Double-append on retry (MEDIUM)** — re-running Phase 3 after partial failure appends a second closeout-note. Mitigation: idempotency guard (skip if tag present).
- **Wrong evidence_code_ref on new finding (LOW)** — if the derive/drift code moved. Mitigation: `Grep` to locate the live implementation before reporting.
- **Description append clobber (LOW)** — patching `description` must preserve the existing text. Mitigation: read current `description`, append (don't replace).
- **Scope creep (MEDIUM)** — temptation to fix the derivation here. Mitigation: this closeout is registry hygiene only; the derivation fix is a separate plan (the new finding is the handoff).
