---
phase: 4
title: "SchemaDoc"
status: pending
priority: P2
dependencies: [2]
effort: "0.5h"
---

# Phase 4: Schema Doc — `docs/schemas.md`

## Overview

The user flagged "no schema doc" as concern #2 (per the scope report: "a reader cannot answer 'how many records are there, what fields do they have?' without reading 4 files"). This phase ships the single-source-of-truth schema doc: `tools/learning-loop-mastra/docs/schemas.md`. It enumerates the 4 meta-state entry kinds, the runtime-state shape, the wire envelope format, and the parity contract. Test #3 from Phase 1 (schema doc exists) turns green here.

## Requirements

- Functional: `tools/learning-loop-mastra/docs/schemas.md` exists and answers the questions a reader asks about meta-state, runtime-state, and the wire format.
- Non-functional: the doc is the canonical schema reference. Other docs (AGENTS.md, journal entries) link to it instead of duplicating content.

## Architecture

**What goes in the doc:**
1. **The 4 meta-state entry kinds** (per AGENTS.md §1): `finding`, `change-log`, `rule`, `loop-design`. For each: shape, status lifecycle, fields, when to use.
2. **Runtime-state shape:** the sidecar `runtime-state.jsonl` rows (`ledger-event`, `budget-state`), fields, when to write.
3. **Wire envelope format:** how MCP tools accept/return data (the `envelope-stripper.js` shape).
4. **Parity contract:** the byte-identical schema promise (per `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` finding: `schema-parity.js` ensures MCP client schemas match zod-derived schemas after the z.preprocess/guarded-boolean migration).

**What does NOT go in the doc:**
- The product surface (decisions, experiments, risks, observations, capabilities, vendor records) — the product surface is unbound per AGENTS.md §1 and is NOT a contract.
- Detailed examples of MCP tool calls — those live in the tool manifest + `loop_describe`.
- Historical schema changes — those live in journals.

**Why a doc, not a Zod schema export:** the loop already has `core/meta-state.js` (post-rename) for the 4 meta-state kinds (the `metaStateFindingEntrySchema`, `metaStateChangeEntrySchema`, `metaStateRuleEntrySchema`, `metaStateLoopDesignSchema` definitions at lines 56-225; machine-checkable). The doc is the human-readable layer that explains the WHY (status lifecycle, when to use, what each field means). The Zod schema is the runtime-checked layer; the doc is the design-decisions layer.

**RED-TEAM CORRECTION (2026-06-25):**
- `core/legacy/schemas.js` is a tool-config RE-EXPORT, NOT a schema source. The original plan's pointer was wrong.
- The actual schema source is `core/legacy/meta-state.js` (post-rename: `core/meta-state.js`), lines 56-225.
- `schema-parity.js` lives at TOP-LEVEL `tools/learning-loop-mastra/schema-parity.js`, NOT under `core/legacy/`. The original plan's pointer was wrong.
- `core/legacy/schema-descriptions.yaml` documents PRODUCT-SURFACE record types (`experiment`, `risk`, `decision`, `observation`), NOT meta-state. The original plan's pointer was wrong.
- The `finding` schema has 30 fields, not 5. The doc must enumerate all 30 (or pick a curated subset and link to `core/meta-state.js` for the full list).

## Related Code Files

- Create: `tools/learning-loop-mastra/docs/schemas.md` (~250 LoC; the schema doc)
- Modify: `tools/learning-loop-mastra/__tests__/phase-e-foundation/schema-doc-exists.test.js` (Phase 1's test — verify it's strong enough)
- No other code changes.

## Implementation Steps

1. **Draft the doc skeleton.**
   - **Section 1: Overview** — "This document is the canonical schema reference for the meta-state registry, the runtime-state sidecar, the wire envelope, and the parity contract. Other docs link here instead of duplicating."
   - **Section 2: Meta-state — the 4-kind discriminated union** — table of the 4 kinds, then one subsection per kind with shape + status lifecycle + when-to-use.
   - **Section 3: Runtime-state — the sidecar** — `runtime-state.jsonl` rows (`ledger-event`, `budget-state`); fields, when to write. Source-of-truth: `schemas/runtime-state.schema.json` (top-level, post-validate Q2).
   - **Section 4: Wire envelope** — how MCP tools accept/return data (input envelope from MCP clients, output envelope from Mastra tools). Pointer to `core/legacy/envelope-stripper.js` for the implementation.
   - **Section 5: Parity contract** — `tools/learning-loop-mastra/schema-parity.js` (TOP-LEVEL) ensures MCP client schemas match zod-derived schemas. Parity-clean guarantee (byte-identical when both schemas carry matching metadata). Pointer to `meta-260618T0558Z-...` finding for the audit trail.
   - **Section 6: Cross-references** — link to AGENTS.md §1, `loop_describe({tier: warm})`, `core/legacy/schemas.js`.

2. **Fill in Section 2 (meta-state — 4 kinds).**
   - **Source of truth:** `tools/learning-loop-mastra/core/meta-state.js` (post-rename from `core/legacy/meta-state.js`), lines 56-225. The doc cites this file as the runtime-checked schema; the doc itself is the design-decisions layer.
   - For each of the 4 kinds (`finding`, `change-log`, `rule`, `loop-design`), document:
     - **Purpose:** what the kind represents in the loop's self-model.
     - **Shape:** the discriminating field + required fields + optional fields (a small TypeScript-ish shape, NOT a full Zod schema — link to `core/meta-state.js` for the runtime schema).
     - **Status lifecycle:** the 6 statuses (`reported`, `active`, `stale`, `resolved`, `superseded`, `auto-resolved`) and what triggers each transition.
     - **When to use:** which MCP tool creates it (`meta_state_report`, `meta_state_log_change`, `meta_state_promote_rule`, `meta_state_propose_design`).
     - **Cross-references:** which other kinds it typically references (`reopens`, `promoted_to_rule`, `consolidated_into`, etc.).
   - **Special note for `finding`:** 30 fields are defined in `metaStateFindingEntrySchema`. The doc enumerates the most-used (id, created_at, category, severity, affected_system, description, status, evidence_code_ref, code_fingerprint, expires_at, acked_at, resolved_at, etc.) and links to the source for the rest.

3. **Fill in Section 3 (runtime-state).**
   - **Source of truth (post-validate):** `schemas/runtime-state.schema.json` (top-level, project root). Verified 2026-06-25: this is the JSON Schema that validates `runtime-state.jsonl` rows.
   - Document the 2 kinds (`ledger-event`, `budget-state`) by linking to `schemas/runtime-state.schema.json` and summarizing the discriminated union inline.
   - Note: runtime-state is the sidecar; meta-state is the canonical registry. Per the 2026-06-19 direction-clarification report §3, meta-state stays at `meta-state.jsonl` and runtime-state stays at `runtime-state.jsonl`.

4. **Fill in Section 4 (wire envelope).**
   - Document BOTH envelope forms: `stripEnvelope` (SDK `{item: X}`) and `stripMcpContentEnvelope` (MCP tool-result `{content: [{type: "text", text: ...}]}`).
   - Reference `core/envelope-stripper.js` (post-rename from `core/legacy/envelope-stripper.js`) for the implementation; the doc describes the shape, not the implementation.

5. **Fill in Section 5 (parity contract).**
   - **Source of truth:** `tools/learning-loop-mastra/schema-parity.js` (TOP-LEVEL — NOT under `core/`).
   - Document the parity guarantee: an MCP client that introspects a tool's input schema sees a parity-clean JSON Schema after `schema-parity.js` rebuilds it.
   - **Soften the claim (red-team Q7):** the parity guarantee is "byte-identical when both schemas carry matching metadata; metadata-asymmetric cases produce a parity-clean rebuild that may add or drop `.describe()` strings." Read lines 1-126 of `schema-parity.js` to verify the exact behavior.
   - Reference the `meta-260618T0558Z-...` finding (verify the ID exists in `meta-state.jsonl` first) for the audit trail and the migration history.

6. **Cross-link from AGENTS.md.**
   - Add a one-line reference in AGENTS.md §3 (meta-surface tools) pointing at the new doc. (This is a small change; Phase 5 will make the bigger §1 update.)
   - Do NOT duplicate the schema content in AGENTS.md.

7. **Verify Test #3 turns green.**
   - `node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/schema-doc-exists.test.js`
   - Asserts the doc exists, is > 500 bytes, contains the strings "finding", "change-log", "rule", "loop-design", and "envelope-stripper" or "schema-parity".
   - Expected: passes.

8. **Run the full test suite.**
   - `pnpm test`
   - Expected: all tests pass.

9. **Commit.**
   - One commit: `docs(phase-e): add docs/schemas.md (4 meta-state kinds + runtime-state + wire envelope + parity)`
   - Body: `Answers the user's #2 concern (no schema doc). Test #3 (schema doc exists) now passes. Cross-linked from AGENTS.md §3.`

## Success Criteria

- [ ] `tools/learning-loop-mastra/docs/schemas.md` exists; size > 500 bytes
- [ ] Doc contains the strings "finding", "change-log", "rule", "loop-design" (4 kinds)
- [ ] Doc contains "envelope-stripper" or "schema-parity" (wire + parity reference)
- [ ] AGENTS.md §3 has a one-line cross-reference to the new doc
- [ ] Test #3 (schema doc exists) passes
- [ ] All 1189+ existing tests still pass

## Risk Assessment

- **R1 (doc drifts from `core/legacy/schemas.js`):** the doc describes the shape; `schemas.js` enforces it. They can drift if the doc is hand-edited and `schemas.js` is not. Mitigation: the doc points to `schemas.js` as the source of truth for the runtime shape; future maintainers are expected to update the doc when `schemas.js` changes. No automatic drift detection in this plan (would be a Phase 5 enhancement).
- **R2 (doc is too long, becomes unreadable):** target ≤ 400 LoC. If the doc grows beyond, split into `docs/schemas/{meta-state,runtime-state,wire,parity}.md` and link from an index.
- **R3 (doc includes historical schema changes that should be in journals):** the doc is current-state only. Historical changes go in journals (per `docs/journals/`).
- **R4 (Test #3 false positive on a doc that mentions "finding" but doesn't document it):** the test checks for the string presence, not the semantic content. Mitigation: the test also asserts doc size > 500 bytes and cross-reference presence. A doc that just lists "finding, change-log, rule, loop-design" without describing them would pass the test; a future enhancement could add semantic assertions (regex match for "purpose:..." sections).

## Doc Skeleton Reference (target structure)

```markdown
# Schemas — Canonical Reference

> Single source of truth for meta-state, runtime-state, wire envelope, and parity.
> Other docs (AGENTS.md, journals) link here instead of duplicating.

## 1. Overview
## 2. Meta-state — the 4-kind discriminated union
### 2.1 finding
### 2.2 change-log
### 2.3 rule
### 2.4 loop-design
## 3. Runtime-state — the sidecar
### 3.1 ledger-event
### 3.2 budget-state
## 4. Wire envelope
## 5. Parity contract
## 6. Cross-references
```

## Test Output Reference (expected green state, post-Phase 4)

```text
$ node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/schema-doc-exists.test.js
# Subtest: schema doc exists and is non-trivial
# File: tools/learning-loop-mastra/docs/schemas.md
# Size: 12.4 KB
# Contains: finding, change-log, rule, loop-design, envelope-stripper, schema-parity
ok 1 - schema doc exists and is non-trivial
```
