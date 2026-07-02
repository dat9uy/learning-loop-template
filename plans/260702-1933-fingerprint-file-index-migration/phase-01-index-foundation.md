---
phase: 1
title: "Index Foundation"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Index Foundation

## Overview

Add the sidecar `file-index.jsonl` and its read/write helpers (`readFileIndex`, `upsertFileIndexEntry`) to `core/meta-state.js`, mirroring the existing `readRegistry`/`writeEntry` patterns (per-root `enqueue` queue + tmp+rename). This phase is **additive only** — nothing reads the index yet; existing `checkGrounding` behavior is untouched.

## Requirements

- Functional: a path-keyed sidecar `file-index.jsonl` at repo root, one JSONL line per `{path, code_fingerprint, updated_at}`. `upsertFileIndexEntry(root, path, hash)` writes/overwrites exactly one row per path. `readFileIndex(root)` returns a `Map<strippedPath, hash>`.
- Non-functional: single writer (MCP server), same per-root `enqueue` queue as `writeEntry` (no new race class). Uniqueness is structural (read whole map -> upsert -> write whole map). No schema change to `meta-state.jsonl` findings.

## Architecture

- New file `tools/learning-loop-mastra/core/file-index.js` OR inline helpers in `meta-state.js`. Recommendation: **inline in `meta-state.js`** next to `writeEntry` to keep the write-queue + path-resolution pattern co-located (DRY with `getRegistryPath`/`enqueue`). New const `FILE_INDEX_FILENAME = "file-index.jsonl"`.
- **Canonical key (red-team F3):** the index key is the **stripped relative path** — `stripEvidenceAnchor(evidence_code_ref)` with NO root prefix, NO `absPath`. `evidence_code_ref` values in the registry are relative (verified); `result.grounding.evidence_code_ref` is absolute (`absPath`) and MUST NOT be used as a key. All three interaction sites (refresh tool, auto-populate, lookup) use this exact form. A helper `canonicalIndexKey(evidenceCodeRef)` owns this normalization so it can't diverge.
- `readFileIndex(root)` parses the sidecar into a `Map<strippedPath, hash>`; empty/missing file -> empty Map. **Cached** (red-team F11): wrap with the same mtime+size LRU shape as `readRegistryWithCache` (reuse or mirror `core/read-registry-cache.js`), invalidated on every `upsertFileIndexEntry` write. Avoids a per-`check_grounding` disk read.
- `readFileIndex` **validates each hash against `TERMINAL_HASH_REGEX`** (red-team F6): a line whose hash fails the regex is dropped (treated as absent), mirroring the per-record `code_fingerprint` validation at `check-grounding.js:183`. Malformed JSON lines are skipped with a defensive try-catch — this is **NEW resilience** (the registry reader `_readAndParseRegistry` does NOT do this; it throws on malformed JSON). Document the divergence; do not claim it "matches" the registry.
- `upsertFileIndexEntry(root, path, hash)`: `enqueue(root, () => { map = readFileIndex; map.set(canonicalKey, hash); write atomic; })`. Validate `hash` against `^sha256:[a-f0-9]{64}$` before write (reject corrupt -> return false). `updated_at = new Date().toISOString()`.
- **Write-gate rule (red-team F4):** add a rule to the write gate (`evaluate-write-gate.js`, which protects `meta-state.jsonl`) blocking direct Edit/Write to `file-index.jsonl`, routing all mutations through `upsertFileIndexEntry`. Without this, direct file writes bypass hash validation + the single-writer queue (poisoning / drift masking, zero audit trail).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` (add `FILE_INDEX_FILENAME`, `getFileIndexPath`, `canonicalIndexKey`, cached `readFileIndex`, `upsertFileIndexEntry`).
- Modify: `tools/learning-loop-mastra/hooks/legacy/evaluate-write-gate.js` (or the active write-gate path — verify location) — add a `file-index.jsonl` protected-path rule mirroring `meta-state.jsonl`.
- Reference (read-only): `tools/learning-loop-mastra/core/gate-logic.js#stripEvidenceAnchor` (reuse for key normalization); `tools/learning-loop-mastra/core/read-registry-cache.js` (the mtime+size LRU to mirror); `tools/learning-loop-mastra/core/check-grounding.js#TERMINAL_HASH_REGEX` (export + reuse for index validation).
- Create: `file-index.jsonl` at repo root (created on first upsert; committed as registry state, **not** gitignored — mirrors `meta-state.jsonl`).

## Implementation Steps

1. Add `FILE_INDEX_FILENAME` + `getFileIndexPath(root)` (mirrors `getRegistryPath`).
2. Add `canonicalIndexKey(evidenceCodeRef)` = `stripEvidenceAnchor(evidenceCodeRef)` (relative, no root). Single source of truth for the key form.
3. Implement cached `readFileIndex(root)` -> `Map<canonicalKey, hash>`; reuse/mirror `readRegistryWithCache`; invalidate on upsert. Drop lines with non-`TERMINAL_HASH_REGEX` hashes; skip malformed JSON (try-catch, NEW resilience — document it).
4. Implement `upsertFileIndexEntry(root, evidenceCodeRef, hash)` under `enqueue(root, ...)`, tmp+rename. Validate hash regex; key via `canonicalIndexKey`.
5. Add the `file-index.jsonl` protected-path rule to the write gate.

## Success Criteria (TDD — tests first)

- [ ] **New test** `__tests__/legacy-mcp/file-index.test.js`:
  - `readFileIndex` returns empty Map for missing file.
  - `upsertFileIndexEntry` then `readFileIndex` returns the hash at the canonical (stripped relative) key.
  - Upsert overwrites (one row per path) — uniqueness structural.
  - Two different paths -> two rows; same path twice -> one row.
  - **Key form:** upsert with `evidence_code_ref="tools/.../gate-logic.js:638"` stores key `tools/.../gate-logic.js`; lookup with `tools/.../gate-logic.js#sym` hits (F3).
  - **Abs path rejected as key:** passing an absolute path is normalized to relative (or rejected) — no absPath keys (F3).
  - Corrupt hash input -> upsert returns false, file unchanged.
  - **Corrupt hash on read:** a line with a valid-JSON but invalid-hash value is dropped by `readFileIndex` (F6).
  - **Cached:** second `readFileIndex` (no upsert between) hits the cache; upsert invalidates it (F11).
  - **Write gate:** direct Edit/Write to `file-index.jsonl` is blocked (F4) — test via the gate harness or an assertion on the protected-paths list.
- [ ] **Existing behavior unchanged:** `pnpm test -- check-grounding` and `cold-tier-regression` still green (index is not read by grounding yet).
- [ ] No new race class: upsert runs under the same per-root `enqueue` queue as `writeEntry`.

## Risk Assessment

- **Risk (red-team F3):** key divergence (relative lookup vs absolute auto-populate) -> lookup misses -> drift masked. **Mitigation:** `canonicalIndexKey` is the sole key form; test covers `:line`/`#anchor` and rejects absPath keys.
- **Risk (red-team F4):** direct-write poisoning bypasses validation + queue -> masked drift, no audit trail. **Mitigation:** write-gate rule blocks direct writes; test asserts the gate protects the path.
- **Risk:** sidecar grows unbounded as cited paths accumulate. **Low** — 24 paths today; bounded by distinct cited paths. Revisit only if cited-path set grows 100x.
- **Rollback:** delete the new helpers + sidecar + gate rule; nothing reads it yet -> zero behavior impact.
