---
date: "2026-07-02T19:33:00+07:00"
tags: [brainstorm, meta-state, fingerprint, file-index, grounding, storage, loop-design]
type: brainstorm report
status: proposed — design agreed; awaits /ck:plan
addresses_finding: meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each
aligned_to: plans/reports/mastra-storage-memory-260619-1918-direction-clarification-report.md
---

# Brainstorm: Code-Fingerprint File-Index (per-finding hash → shared path-keyed index)

**Finding addressed:** `meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each` (severity warning, status active, subtype `fan-out-anchor`, `evidence_code_ref: tools/learning-loop-mastra/core/check-grounding.js#computeFileHash`).

## TL;DR

The fingerprint mechanism is a **data-model** problem, not a storage-substrate problem. Each finding materializes its own `(path, hash)` pair; when a cited file changes, all N findings anchored to it must be re-hashed and re-written individually (24 refresh + 11 patch calls in the Phase D incident). The fix is to **centralize the hash on a shared, path-keyed index** so one file change → one index update → all anchored findings re-grounded.

**Agreed design (5 locked decisions):**
1. **Approach:** Frame A — file-index. Substrate (JSONL vs DB) **deferred**; this is a data-model fix, substrate-agnostic.
2. **Deliverable:** this report + a `loop-design` entry + hand to `/ck:plan`.
3. **Index home:** sidecar `file-index.jsonl`, single writer (MCP server), per-root-queued upsert mirroring `writeEntry`.
4. **Migration:** **vestigial** — repoint `checkGrounding` to the index, stop writing per-record `code_fingerprint`, leave the field as dead data, mark `@deprecated`. No mass rewrite of audit-immutable resolved findings; rollback = one-commit revert.
5. **Compute:** include a `(path, mtimeMs)` in-process hash cache to also kill the per-check re-hash cost.

Per-file-change cost goes from **O(findings_per_file)** to **O(1)**; the cold-tier regression test passes unchanged (call signature `checkGrounding(finding,{root})` preserved, drift signal preserved).

---

## Problem-first sections (the finding contained a proposed solution)

### 1. Solution-jumping diagnosis
The finding ships a ready-made fix (a file-index) as a compressed confession of pain: during Phase D Plan-4 test-migration followup, editing `run-pnpm-test-namespaced.mjs` + several `core/legacy/` files invalidated 1–3 finding fingerprints each; resolving the cold-tier regression required **24 `meta_state_refresh_fingerprint` calls + 11 `meta_state_patch` calls**, re-run after each new edit surfaced more drift. The pain is *operator repair cost per code edit*, scaling with findings-per-cited-file.

### 2. Underlying problem (without naming the solution)
The cost of keeping a finding's evidence hash correct **after the cited file changes** grows with the number of findings anchored to that file, and the operator bears it manually, per-finding, every edit.

### 3. Assumption challenges
| Assumption | Risk if wrong | Validation |
|---|---|---|
| Per-finding **write** is the dominant cost | If **compute** (re-hash per call) dominates, an index alone won't help | Verified: `updateEntry` does a **full-file rewrite** per call (meta-state.js:401–461); 24 refreshes = 24 full-file rewrites. Write is the *count* problem; compute is the *per-call* problem. Both real; write is the fan-out. |
| A persistent index is needed now | Over-build at current scale | Measured: 29 `mechanism_check:true` (16 non-terminal), 24 distinct paths, **max 4 findings/file** (`gate-logic.js`). Pain is growth-direction, not current. → YAGNI challenge (Frame B) heard; rejected because the data-model fix is substrate-agnostic and small, and only Frame A closes the finding. |
| Storing the hash on findings is correctly shaped | The whole mechanism is the mistake | Frame C (existence-only + on-demand drift). Heard; rejected — weakens the "code changed since filing" audit signal, which is the point of grounding. |
| A DB would fix this | Substrate migration is the answer | **False.** A DB with a per-row `code_fingerprint` column has the *same* logical fan-out. The fix is the index data model, identical in JSONL or SQLite. |

### 4. Problem statement
- **Users/context:** operators running the loop, who edit cited files and must then re-ground findings.
- **Struggle:** after editing a file, N anchored findings go `hash_mismatch`; each must be individually refreshed (orphan refs patched). 24+11 calls in one incident, re-run per new edit.
- **Cause:** each finding stores its own snapshot of the cited file's hash; no shared owner. The hash is the anchor's authoritative state, materialized per-record.
- **Consequence:** repair cost = O(findings_per_file) per edit, growing with registry size; manual, error-prone.
- **Success:** editing a file cited by K findings requires **≤1** operation to re-ground all K, regardless of K.

### 5. Three alternative framings
- **Frame A — shared file-index** (chosen). Index owns the hash; findings hold the path FK. Fixes root cause; meets finding's bar; closes the finding. Cost: new sidecar + repoint `checkGrounding` + 1 new tool + schema deprecation.
- **Frame B — cache + batch tool** (YAGNI stopgap). Keep per-finding fingerprints; add `(path,mtime)` hash cache + a bulk "re-ground all findings on this file" tool. Solves observed pain, no schema change, cold-tier untouched. **Does NOT close the finding** (writes still happen, just batched).
- **Frame C — collapse stored hash**. Stop storing `code_fingerprint`; grounding becomes existence-only, drift on-demand. Eliminates the fan-out class but **weakens the drift invariant**.

### 6. Evidence status
**Medium-weak.** One real incident (strong). Current scale tiny (max 4/file, 374 KB registry). "Growth direction" argument is structural, not yet measured pain. Per problem-first rules, medium evidence → lighter option (B) deserved equal hearing before committing to the full build. B was heard and rejected on: (a) B doesn't close the finding, (b) A is substrate-agnostic and small, (c) the root-cause analysis is verified in code (per-record hash *is* the design).

### 7. Validation plan
- **Data:** registry growth rate (~7 entries/day → ~4–5 MB/yr); `updateEntry` full-rewrite cost; cold-tier test grounding loop.
- **Experiment:** migrate on a feature branch; populate index for all cited paths; run `cold-tier-regression.test.js`; count refresh calls before/after on a representative 4-finding file edit.
- **Killer:** cold-tier test fails, OR a file change still requires >1 operation to re-ground all anchored findings.

### 8. Stakeholder message
*"The fingerprint finding is a data-model issue (where the hash lives), not a storage-engine issue (what file holds it). We'll centralize the hash on a path-keyed index in JSONL now — small, substrate-agnostic, and it's the only option that closes the finding. We defer the JSONL-vs-DB substrate question until there's storage-specific evidence (size/concurrency), documented with explicit triggers so it's not lost."*

---

## The storage-substrate discussion (the pivot)

The brainstorm pivoted to: **is this the time to research a storage engine for meta-state?** Answer: **no — not on the strength of this finding.**

### Data-model vs substrate (the trap)
- **Data model:** where does the cited-file hash live? Per-finding (current) → fan-out. Shared index (Frame A) → O(1).
- **Storage substrate:** what format holds meta-state? JSONL now, DB later.
A DB with a per-row `code_fingerprint` column has the **same** logical fan-out. The index data-model is **identical in JSONL or SQLite.** So the finding motivates the data model, not the engine.

### Substrate evidence (measured)
| Axis | Evidence | Verdict |
|---|---|---|
| Size | 228 entries / 374 KB; ~7 entries/day; ~4–5 MB/yr | JSONL trivial; no pressure |
| Read cost | `readRegistryWithCache` (mtimeMs+size LRU, in-process); writes `invalidateCache` | O(1) after first load; no query pressure |
| Write cost | `updateEntry` = full-file rewrite (tmp+rename); 374 KB = sub-ms; 5 MB = single-digit ms | no pressure for a long time |
| Concurrency | per-root `enqueue` queue (per-process); atomic rename | single-writer assumed; no contention |

Every axis a DB would fix is **already mitigated or years from pressure.** The clarification report deliberately locked "meta-state stays JSONL (or future project DB)"; reopening needs storage-specific evidence, which this finding doesn't provide.

### The seductive argument, rebutted
*"If we had a DB, the file-index would be free."* True but backwards: you still design the index (hash location, FK, update trigger), and that design ports JSONL→SQLite unchanged. Do the data model now; it's what *makes* a future substrate migration cheap.

### Decision: defer substrate, with explicit triggers
The report records the deferral and the thresholds that reopen it: **registry > ~50 MB, OR > 1 concurrent writer process, OR write latency > ~50 ms.** The single-writer assumption is already the loop's contract (meta-state.js:657 comment: a second writer needs `flock`).

---

## Final design — Frame A, file-index sidecar

### Core invariant
The cited-file hash lives on a shared path-keyed index; findings carry `evidence_code_ref` as the FK. A legitimate edit to a cited file requires **one** index update to re-ground every anchored finding.

### Grounding semantics (A1 — must be exactly right)
- `index[path]` = baseline hash = H(file) at last accepted refresh.
- `checkGrounding(finding, {root})`: resolve `evidence_code_ref` → path (via existing `stripEvidenceAnchor`); compute H(file) now; compare to `index[path]`; equal ⇒ `grounded`, else ⇒ `drifted/hash_mismatch`. **The sidecar is read inside `checkGrounding`** → the cold-tier test's existing call is unchanged → "semantically equivalent."
- **Drift still surfaces until explicitly accepted** (no auto-write of the baseline on a mismatch) — preserves the audit invariant; this is why file-watcher/auto-update was rejected.

### Side-benefit (verified in code)
Today `checkGrounding` returns `grounded` when `hash_match === null` (a finding with no stored fingerprint passes as long as the file exists) — so the per-record drift signal only exists for findings auto-recorded at least once. The index makes the hash-comparison drift signal **uniform across every cited path**. A strengthening, not just an optimization.

### The sidecar: `file-index.jsonl`
- One line per cited path: `{ "path": "...", "code_fingerprint": "sha256:...", "updated_at": "..." }`.
- Written by **one writer** (the MCP server) via a new `upsertFileIndexEntry(root, path, hash)` that mirrors `writeEntry` (per-root `enqueue` queue + tmp+rename). **No new race class** vs the existing registry (same single-writer contract).
- **Uniqueness is structural, not a guard:** upsert = read whole map → `map[path]=hash` → write whole map atomically. Duplicates impossible by construction. Residual cross-process risk (only if a 2nd writer is ever added) = lost update → *stale* hash (never duplicate, never corruption) → self-healing drift; the `flock` the code already anticipates covers it.

### Migration: vestigial
1. Populate index for all distinct cited paths among `mechanism_check:true` findings (24 paths; compute H once each).
2. Repoint `checkGrounding` to read `index[path]` instead of `entry.code_fingerprint`.
3. **Stop writing** per-record `code_fingerprint` (the auto-record path in `meta-state-check-grounding-tool.js:108–133` and `meta_state_refresh_fingerprint` stop touching it).
4. Leave `code_fingerprint` on existing findings as dead data; mark `@deprecated` in `metaStateEntrySchema` (meta-state.js:89).
5. **Auto-populate on first `checkGrounding`** if no index row exists and the file is grounded — mirrors existing auto-record; keeps migration transparent, no finding rewrite needed.

Rollback = revert `checkGrounding` to read `entry.code_fingerprint`; the vestigial field is still present → one-commit revert, zero data loss. **This is the vestigial approach's big win** over the finding's literal "rewrite in place, drop field" wording (which would rewrite audit-immutable resolved findings and foreclose rollback).

### Compute cache
`(absPath, mtimeMs)` in-process Map memoizing H(file) inside the check-grounding tool layer (same shape as the existing `testRunCache`). Repeated `checkGrounding` calls on an unchanged file skip re-hashing. Speeds the cold-tier test (one `checkGrounding` per finding); closes the finding's "compute is O(n) per check" sentence. Invalidated by mtime change (same invalidation key the read cache already uses).

### Refresh tool (default, stated)
New path-keyed `meta_state_refresh_file_index({ path })` → `upsertFileIndexEntry` in one write; re-grounds all findings on that path. Keep `meta_state_refresh_fingerprint` as a thin alias for back-compat (deprecate in docs). One call per file change = the O(1) bar.

---

## Implementation considerations & touchpoints

| File | Change |
|---|---|
| `tools/learning-loop-mastra/core/check-grounding.js` | `checkGrounding` reads the sidecar (new `readFileIndex(root)`); compare `index[path]` not `entry.code_fingerprint`; hash cache added. `computeFileHash` unchanged. |
| `tools/learning-loop-mastra/core/meta-state.js` | add `upsertFileIndexEntry` + `readFileIndex` (mirror `writeEntry`/`readRegistry`); `@deprecated` on `code_fingerprint` (line 89). |
| `tools/learning-loop-mastra/tools/legacy/meta-state-check-grounding-tool.js` | auto-record path (108–133) now auto-populates the **index**, not the finding field. |
| `tools/learning-loop-mastra/tools/legacy/meta-state-refresh-fingerprint-tool.js` | repoint to index (or add sibling `meta_state_refresh_file_index`). |
| `file-index.jsonl` (new) | created at repo root beside `meta-state.jsonl`; path in a new `FILE_INDEX_FILENAME` const. |
| `__tests__/legacy-mcp/cold-tier-regression.test.js` | **unchanged** (the win); add an assertion that the index covers every cited path if desired. |
| `.gitignore` | the index is committable state (like `meta-state.jsonl`), **not** ignored. |

---

## Risks & rollback
- **Index drift (stale baseline):** `index[path]` older than intended current file → false drift. Same failure mode as today; fixed by 1 refresh instead of N. Acceptable.
- **Sidecar orphan (cited path, no index row):** `checkGrounding` returns `unknown` OR auto-populates on first grounded check (chose auto-populate). Self-healing.
- **Single-writer assumption:** safe today; if a 2nd writer is added, add `flock` (meta-state.js:657 already anticipates). Documented as a substrate trigger.
- **Rollback:** one-commit revert of `checkGrounding`; vestigial `code_fingerprint` still present on findings → no data loss.

## Success metrics & validation (the finding's bar)
- ✅ `loop-design` entry exists (filed by this brainstorm, see below).
- ✅ Migration moves **all** `mechanism_check:true` findings off per-record fingerprints at once (≥10 trivially; 16 non-terminal + resolved the test checks) — *without* rewriting them (vestigial).
- ✅ `cold-tier-regression.test.js` passes (call signature unchanged; drift signal preserved/strengthened).
- ✅ Per-file-change cost O(findings_per_file) → O(1): one `meta_state_refresh_file_index` call re-grounds all anchored findings.
- **Measured experiment (plan):** on a representative 4-finding file (`gate-logic.js`), edit + re-ground should drop from 4 refresh calls to 1.

## Next steps & dependencies
1. **Loop-design filed** (this brainstorm): `loop-design-fingerprint-file-index` — see registry.
2. **Hand to `/ck:plan`** (default mode): produces the phase-by-phase migration plan (populate index → repoint checkGrounding → add tool + cache → deprecate field → verify cold-tier). `/ck:plan --tdd` is the better fit: refactors existing `checkGrounding` behavior with strong existing test coverage (cold-tier + check-grounding.test.js) to lock in current behavior first.
3. **Dependencies:** none blocking; the design is self-contained within `tools/learning-loop-mastra/`.

## Unresolved questions
- **Q — deprecate vs remove `code_fingerprint`:** vestigial leaves it as dead data forever (until compaction drops terminal findings). Acceptable, or does the user want a later cleanup pass that strips it once all writers are migrated? (Default: leave; revisit after one release cycle.)
- **Q — index entry for resolved/superseded findings' cited paths:** the cold-tier test grounds `mechanism_check:true` findings *regardless of status*, so the index must cover resolved findings' paths too. Migration must index all `mechanism_check:true` paths, not just non-terminal ones. (Stated as a requirement, not open.)
- **Q — `meta_state_refresh_fingerprint` back-compat surface:** keep as alias indefinitely, or sunset after N releases? (Default: keep as thin alias; document deprecation.)
