---
title: "Drift-Driven Registry Closeout"
date: 2026-07-10
status: not-started
mode: deep
trigger: "post #47 (84b2426); meta_state_query_drift returned 132 events; board not drift-checked since #38->#47"
blockedBy: []
blocks: []
---

# Plan — drift-driven registry closeout

**Status:** not started
**Mode:** deep (research + per-phase scout + red-team + validate)
**Trigger:** post #47 (`84b2426`); `meta_state_query_drift` returned 132 events; the actionable slice is open findings derived `resolved-by-mechanism`. The board has not been drift-checked since #38→#47 shipped substantial code; at least one escalate finding appeared fixed-in-code-but-open, which misled the next-move pick.

## Goal

Make the open-findings board **trustworthy** — not maximally empty. Resolve only findings whose shipped mechanism genuinely fixes them; keep the rest open with a recorded reason the derivation was fooled or the bug is live. Output: a clarified roadmap (is the transport-L1 / big architectural slate still open?) and a meta-finding explaining why the drift query misleads.

## Grounding corrections discovered during research (read these before executing)

The stub was substantively right (all 10 findings are open) but had three defects the real plan must fix:

1. **Stub ids are truncated.** The stub used bare timestamps (`meta-260613T0138Z`). The registry stores full ids `meta-YYMMDDTHHmmZ-slug`. An `id` filter on bare timestamps returns **0**. Use the full ids in the map below.
2. **Two timestamps are ambiguous.** `meta-260709T1017Z` is two findings — the **batch-wire-fix** (already **resolved**, commit `4b6402f`) AND the **parallel-PR EOF-conflict** (still open, the one in scope). `meta-260614T1236Z` is two findings — the **unarchive-path-missing** (in scope) AND a **registry-consistency-check** finding (not in scope). Disambiguate by slug.
3. **`derive_status` is NOT a reliable resolve signal.** Verified by running it on all 10: **only 7/10 derive `resolved-by-mechanism`** (the 2 surprising + 5 Group-R). The other 3 (the escalates) derive correctly NON-resolved — unarchive→`active-uncertain` (`code-only`, `test_file_exists:false` on a dead `tools/learning-loop-mcp/__tests/` path), log_change→`active-no-signal` (`code-missing`), supersede→`active-no-signal` (`code-missing`). So the escalates were never "fooled" — the stub correctly routed them to Group I. The real flaw is narrower: the `mechanism-shipped` derivation gates on **file-existence only** (`code_ref_exists`, and `test_file_exists` when `evidence_test` is set) — neither checks content/semantics — so it **false-positives when `evidence_code_ref` points at a symptom file** (`.mcp.json`, `.gitignore`, `manifest.json`). Separately observed: a **line-suffixed** `evidence_code_ref` (`…tool.js:102-113`) false-negatives to `code-missing` (log_change, supersede) — the `:line` range breaks the existence check. **Every resolution requires a manual evidence read confirming the cited mechanism genuinely addresses THIS finding's concern — `derive_status` is only a starting hint, and the derivation-flaw finding (Phase 3) must describe this accurately, not as "all 10 / 7/10 false-positive."**
4. **The stub's supersede=stale call was wrong.** `meta-260626T1419Z` is **LIVE**, not stale. PR #38 added `applyUpdateAndCheck`, but that helper (`update-entry-helpers.js:20-33`) checks `updateEntry`'s *return value* (`true`/`version_mismatch`/throw) — it does **not** re-read the registry to confirm the entry transitioned. The finding's own resolution criteria (root-cause investigation + a **post-write visibility re-read** + a regression test) are unmet; the finding cites **no `evidence_test`**. Keep open.
5. **The stub's report-overwrite=resolve call was also wrong (red-team found this).** `meta-260619T2237Z` is **LIVE**: `meta-state-report-tool.js:14-25` destructures the handler with **no `id`** param; `:28` does `const id = generateId(slugify(description))`, silently ignoring any caller-supplied id. The finding's demanded fix ("honor the operator-supplied id or reject") is unmet. Keep open — NOT a resolve candidate.

Net: the closeout resolves **fewer** findings than the stub hoped (~1–3 of Group R, after verification) and **keeps ≥7 open** with recorded reasons. That is the correct outcome — the goal is trustworthiness, not count reduction.

## Full-id map (10 findings, disambiguated, current `status: open`)

| stub ref | full id | sev | research classification |
|---|---|---|---|
| `meta-260613T0138Z` | `meta-260613T0138Z-vnstock-device-slot-ledger-converted` | warn | **RESOLVE-candidate** — id says "-converted", evidence `scripts/convert-ledger-to-sidecar.mjs`; verify script shipped + converted the ledger |
| `meta-260618T0558Z` | `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` | warn | **RESOLVE-candidate** — SP2 grounding marker post zod-native migration (plan 260618-0029); verify migration completed + grounding re-established (file-index.jsonl, plan 260702-1933) |
| `meta-260619T2237Z` | `meta-260619T2237Z-the-meta-state-report-mcp-tool-silently-overwrites-an-operat` | warn | **KEEP-OPEN (LIVE)** — red-team verified: `meta-state-report-tool.js:14-25` has no `id` in the destructure; `:28` `generateId(slugify(description))` auto-generates + ignores caller id. Finding's "honor or reject" demand unmet. NOT a resolve candidate. |
| `meta-260623T0223Z` | `meta-260623T0223Z-plan-1b-phase-2-path-b-reverted-plan-1a-s-mastra-task-update` | **escalate** | **KEEP-OPEN (pending journal)** — `evidence_code_ref` is `manifest.json` (symptom-shaped, like .mcp.json/.gitignore — treat consistently); finding tracks a noop-undetection concern likely upstream of this repo. Phase 1 reads journal `docs/journals/260622-phase-d-plan-1b-shipped.md`; default keep-open on symptom-shaped evidence. |
| `meta-260609T1206Z` | `meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect` | warn | **RESOLVE-candidate** — evidence is an *archived* doc `docs/_archive-260703/mcp-server-restart-protocol.md`; archiving likely IS the stale-code cleanup; verify the active handoff-md no longer has the section |
| `meta-260704T1213Z` ⚠️ | `meta-260704T1213Z-close-flow-finding-triage-operational-layer-has-a-structural` | warn | **KEEP-OPEN** — derivation fooled by `.mcp.json` file-existence; transport never promoted to L1; CLI adapter / L1 seam / transport doc never shipped; live architectural debate (see Roadmap) |
| `meta-260709T1017Z` ⚠️ | `meta-260709T1017Z-parallel-prs-that-each-commit-append-only-meta-state-jsonl-c` | warn | **KEEP-OPEN** — derivation fooled by `.gitignore` file-existence; mitigations (post-merge logging / `.gitattributes merge=union` / PR sequencing) are an unresolved M2 debate (finding `meta-260708T0355Z-m2-single-writer-gate`); none shipped |
| `meta-260619T2233Z` | `meta-260619T2233Z-the-meta-state-log-change-mcp-tool-can-return-logged-true-an` | **escalate** | **KEEP-OPEN (LIVE)** — `meta-state-log-change-tool.js:87` ignores `writeEntry` return; L97-104 construct `{logged:true}` unconditionally; idempotency cache caches `logged:true`; no assertion, no regression test |
| `meta-260626T1419Z` | `meta-260626T1419Z-meta-state-supersede-silent-persistence-fail-var` | **escalate** | **KEEP-OPEN (LIVE)** — `applyUpdateAndCheck` (#38) checks return value, not the post-write visibility re-read the finding requires; no `evidence_test`; root cause uninvestigated |
| `meta-260614T1236Z` | `meta-260614T1236Z-no-mcp-path-exists-to-unarchive-a-meta-state-entry-or-transi` | **escalate** | **KEEP-OPEN (LIVE)** — `grep unarchive` across `tools/learning-loop-mastra/` = 0; no first-class `meta_state_unarchive` tool / no audit-safe recovery path. **Correction:** `IMMUTABLE_PATCH_FIELDS` (`meta-state.js:284-294`) does NOT include `archived_*` or `status` — `meta_state_patch({status:"open"})` is NOT deny-listed, so the finding's own premise ("IMMUTABLE blocks archived_*") is stale; the gap is the missing sanctioned tool, not a patch block. |

## Consult-gates (check before any resolve)

- **`rule-no-orphaned-evidence`** — `applies_to_resolution: "*"`, **agent-enforced**, `pattern_type: resolution-evidence-required`. This is a **GLOBAL fingerprint invariant**: every open `mechanism_check=true` finding must have an `evidence_code_ref` whose current hash matches `file-index.jsonl` (the per-record `code_fingerprint` is vestigial). It is NOT a per-resolve "read the file and confirm the mechanism" check — that semantic confirmation is Phase 1's job. Today the invariant holds (no drift), so resolves are not blocked. **Known tension:** if any open grounded finding's cited file drifts mid-closeout (parallel PR), the gate blocks **all** resolves with a `blocking_id` pointing at the *other* finding — and the only satisfaction is `meta_state_refresh_file_index`, which conflicts with this plan's no-re-ground constraint. If that fires, stop and surface it; do not force the resolve or silently re-ground.
- **`rule-cold-session-test-must-pass-before-resolution`** — targets `meta-260606T0443Z-...` only (NOT in our 10). Irrelevant to this closeout.
- **`rule-pr-body-registry-deltas`** — consult-checklist, agent-enforced, `scope_predicate: project_has_learning_loop_mcp`. The closeout PR modifies `meta-state.jsonl`, so the PR body must include the registry-delta table (swept/resolved/new/promoted/superseded/archived). Apply in Phase 4.

## Phases

| # | Phase | Mutates? | Depends on |
|---|---|---|---|
| 1 | [Verify & classify all 10](phase-01-verify-and-classify.md) — analysis gate; `derive_status` + evidence read per finding; produce the resolve-vs-keep-open table | no (read-only) | — |
| 2 | [Resolve confirmed-shipped Group R](phase-02-resolve-confirmed-shipped.md) — `meta_state_resolve` (sequential; batch has no resolve op) for each finding Phase 1 classified RESOLVE | yes | 1 |
| 3 | [Record keep-open set + report derivation-flaw](phase-03-record-keepopen-and-derivation-flaw.md) — `meta_state_report` the `code_ref_exists` derivation-flaw meta-finding; record keep-open reasons | yes | 1 |
| 4 | [Recompute, closeout change-log, roadmap](phase-04-recompute-closeout-and-roadmap.md) — `meta_state_sweep` + `meta_state_list`; one `meta_state_log_change` citing this plan + deltas + transport-L1 roadmap; PR registry-deltas table | yes | 2,3 |

## Acceptance criteria

1. Every finding is classified RESOLVE or KEEP-OPEN **with a code-evidence reason**, not on `derive_status` alone.
2. No finding is resolved blindly: the 7 keep-open findings — 2 surprising (transport-L1, EOF-conflict), 3 live escalates (log_change, supersede, unarchive), report-overwrite (LIVE), taskUpdate-noop (symptom-evidence) — are **kept open** with recorded reasons. supersede is kept open as LIVE (the stub's stale call is corrected, not honored); report-overwrite is kept open as LIVE (the stub's resolve call is corrected).
3. Group-R resolves fire only after Phase 1 manual evidence confirmation; any that fail confirmation move to keep-open. Group R is now 3 candidates (vnstock, SP2, handoff-md), not 5.
4. The `mechanism-shipped` derivation-flaw is reported as a new finding **with an accurate description**: `mechanism-shipped` gates on file-existence (`code_ref_exists` + `test_file_exists` when `evidence_test` set), no content/semantics check → false-positives on symptom files; line-suffixed `evidence_code_ref` false-negatives to `code-missing`. NOT "all 10 / 7/10 false-positive" (only 7/10 derive resolved-by-mechanism at all; the 3 escalates derive correctly non-resolved).
5. One closeout `meta_state_log_change` is filed with **schema-valid `change_diff`** (the strict `{added,removed,changed}` shape strips unknown keys — see Phase 4), citing this plan, the resolve/keep-open counts, the new derivation-flaw finding id, and the transport-L1 roadmap statement.
6. `meta_state_sweep` stale-view shrinks by the resolved count (resolved leave `isOpen`; the new age-0 finding is not stale). **Open-count delta = -(resolved) + new_findings** (the +1 derivation-flaw finding), NOT `-(resolved)` — pre-state both expected values to avoid a false-alarm "investigate" branch.
7. The closeout PR body includes the `rule-pr-body-registry-deltas` table.

## Constraints / risks

- **No code changes** — pure registry hygiene via MCP tools. Any live finding worth fixing (log_change assertion, supersede visibility re-read, unarchive tool, report-overwrite id honoring, transport-L1 L1-seam) becomes a **separate plan**; do not scope-creep the fix.
- **`derive_status` is unreliable here** — do not treat `recommendation: "resolve"`/`"re_verify"` as authority; manual evidence confirmation is the gate. Note also: only 7/10 derive `resolved-by-mechanism`; the 3 escalates derive `active-uncertain`/`active-no-signal` (not fooled).
- **`meta_state_batch` has no `resolve` op** (ops: write/update/delete/archive) — resolves are **sequential** `meta_state_resolve` calls. Batch may still be used for any patch/log ops.
- **`meta_state_resolve` carries the silent-persistence-fail class it is keeping open** — it calls `updateEntry` then returns `resolved:true` with no visibility re-read (same shape as log_change/supersede). Phase 2 re-queries after each resolve to detect a non-persisting resolve; on `resolved:true`-but-re-query-shows-`open`, do NOT retry blindly — record as silent-persistence-fail (link `meta-260619T2233Z`), re-file with `_expected_version` from the re-query, and if still failing leave open with a note.
- **`meta_state_resolve` requires `isOpen`** — all 10 are `open`, eligible. Do not resolve `change-log` entries (tool rejects; they are immutable audit log).
- **Do not fake-re-ground live findings.** For KEEP-OPEN (LIVE) findings, do not stamp `last_verified_at`: it means "passing verification run" (`meta_state_re_verify` stamps it on a pass), and we confirmed a *failing*/live state, not a pass. (Sweep is read-only post-260707-0812, so a stale-but-open finding is NOT auto-closed — the worry is moot; the real reason is semantic.) Record the live-confirmation in the closeout change-log + a `meta_state_patch` to the finding `description` (idempotent append — skip if the closeout-note tag is already present) — never a status or `last_verified_at` flip. Note: a `description` note does NOT stop future `derive_status` re-flagging (it ignores `description`); the derivation-flaw finding is what warns humans.
- **`change_diff` is strict** (`{added,removed,changed}`; zod strips unknown keys) — Phase 4 must map deltas to these keys or rely on `reason`; do not pass `{resolved,kept_open,new_findings}` (silently lost).
- **Rollback** — registry resolutions are append-only status flips; a wrong resolve is reversible via `meta_state_patch` (flip to `open`) or a new finding that `reopens` it. Low risk, but verify before flipping.
- **Token discipline** — `meta_state_list` with `compact:true` and id filters; avoid full-registry dumps.
