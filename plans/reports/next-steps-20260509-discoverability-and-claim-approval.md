---
title: Next Steps — Fact Discoverability Mechanism and Device-Limit Claim Approval
date: 2026-05-09
source: `ck:problem-solving` follow-up after R-Q5 close
status: closed (2026-05-09 — yq tool committed, claim notes added, decisions resolved)
inputs:
  - `plans/reports/next-steps-20260509-r-q5-fact-capability-scope-split.md` (R-Q5 close — facts stay in records/, no separate fact record type)
  - `records/claims/claim-vnstock-device-limit-mechanism.yaml` (status flipped this session: reviewed → approved)
  - `records/claims/claim-vnstock-install-sandbox.yaml` (precedent for editorial-approved claim with no backing decision YAML)
  - `records/evidence/vnstock-data/experiment-install-*.md` (frontmatter vs prose-envelope format split)
  - `tools/validate-records/simple-yaml-parser.js` (zero-dep parser; constrains tool design)
  - `.claude/skills/learning-loop/SKILL.md` (reference for the evidence-MD lane)
---

# Next Steps: Fact Discoverability Mechanism and Device-Limit Claim Approval

## Why This Report Exists

Operator opened `ck:problem-solving` to evaluate "promote claims into facts" for two targets — bronze/1-device and the vnstock_data CLI install mechanism. Inversion check failed the framing: R-Q5 close already settled facts-stay-in-records and rejected separate fact record types. Real underlying need is **discoverability** — operator wants to grep verified claims and supporting evidence quickly. Concrete trigger: editorially approve `claim-vnstock-device-limit-mechanism`.

This report freezes session state before any tool is committed.

## What Was Settled This Session

### Editorial approval of device-limit claim (applied)

`records/claims/claim-vnstock-device-limit-mechanism.yaml`:

- `status: reviewed` → `status: approved`
- `approval.status: reviewed` → `approval.status: approved`
- `pnpm validate:records` passed (12 records).
- No backing decision YAML authored. Precedent: `claim-vnstock-install-sandbox.yaml` is `status: approved` without a decision YAML; editorial promotion is just a record-status flip.

Pre-flip state already carried `verification.static.status: verified` and `verification.install.status: verified` (sandbox), with proof_refs to sandbox-1 and sandbox-2 experiments. Flip records operator confidence in the device-limit-mechanism observation as stated.

### Promotion-to-fact framing rejected

Both target "facts" already live in `records/claims/`:

- bronze/1-device → `claim-vnstock-device-limit-mechanism.yaml` (now approved; bronze tier specifics in `limitations`)
- install mechanism → `claim-vnstock-install-sandbox.yaml` (`verification.install.status: verified` sandbox)

Per R-Q5 close: "Promotion is the existing claim-assurance machinery. Fact files cite `claim_ref`; no extra queue." Re-introducing a fact record type would re-grow the simplified-away O9 queue logic. Inversion + cascade + meta-pattern (PR draft→merge, hypothesis→confirmed) all confirm the existing primitives are correct.

## The Discoverability Question (Open)

Operator wants greppable views of two lanes:

1. **Claims** (`records/claims/*.yaml`) — filter by `approval.status` and `verification.<dim>.status`.
2. **Evidence MDs** (`records/evidence/<capability>/*.md`) — filter by frontmatter fields (`claim_support`, `validation_status`, `dimension`, `scope`, `capability`).

This is tooling/ergonomics, not record-type design.

### Claim predicate options

| ID | Predicate | Matches today | Notes |
|---|---|---|---|
| P1 | `approval.status: approved` AND any `verification.<dim>.status: verified` | both vnstock claims | Most permissive. Sensible default. |
| P2 | `approval.status: approved` AND `verification.install.status: verified` | both vnstock claims | Tighter. Excludes static-only claims (loop allows them). |
| P3 | `approval.status: approved` AND every declared dimension `verified` | neither (both have `runtime: claimed`) | Strict. Only after runtime verification. |

Lean: P1 if any tool is built; revisit at N≥5 approved claims.

### Evidence predicate

Default lean: `claim_support: supports`. **Caveat:** `does-not-support` evidence can corroborate compound claims (sandbox-2 failure supports the device-limit-mechanism claim through corroboration). A supports-only filter risks excluding evidence that supports broader claims via failure-mode capture. Compound-claim corroboration is, however, already captured by the *claim's own* `evidence_refs` listing all relevant experiments — so the filter is acceptable as a shallow projection of "individually supportive" evidence.

## Constraints Discovered

### Tool path: yq (external CLI)

`package.json` has no `dependencies` or `devDependencies`. Rather than add a custom parser dependency or build a zero-dep JS tool, the solution uses `yq` (mikefarah/yq v4.53.2, installed via mise) as an external CLI. This keeps the project build surface zero-dep while leveraging a robust YAML processor.

`pnpm verify:claim` covers `verification.<dim>` blocks only. Editorial `status` and `approval.status` flips remain manual edits; yq's `-i` flag is available if batch edits are needed.

### Evidence MD format split

Two formats coexist in `records/evidence/vnstock-data/experiment-install-*.md`:

- **Frontmatter** (newer; from 20260508T171112Z onward): YAML block with `record_type`, `capability`, `dimension`, `scope`, `validation_status`, `claim_support`. Structurally queryable.
- **Prose envelope** (older; 20260508T101723Z.md): bullet list under `## Envelope`. Per operator-guide "Schema Deferral", documented convention until `runtime_run` schema lands. Not structurally queryable without text scraping.

A frontmatter-only structured grep tool covers all but the prose-envelope file. Options for prose-envelope MDs: accept as `rg`-only, migrate to frontmatter, or build dual-format parser. Lean: accept; revisit if prose-envelope MDs accumulate.

## Decision Points (Resolved 2026-05-09)

| # | Decision | Resolution |
|---|---|---|
| 1 | yq install state | Confirmed: mikefarah/yq v4.53.2 via mise at `~/.local/share/mise/installs/yq/4.53.2/yq`. |
| 2 | Build vs defer | Built. Shell script at `tools/list-verified/list-verified.sh`, wired as `pnpm list:verified`. |
| 3 | Claim predicate | P1 (`approval.status: approved` + any verification dim `verified`). |
| 4 | Evidence predicate | `claim_support: supports` only; caveat on corroborating-failure evidence documented in report body. |
| 5 | Prose-envelope coverage | Accept as skipped; no dual-format parser. |
| 6 | `notes` on device-limit claim | Added citation to `https://vnstocks.com/account?section=devices` (operator-confirmed 2026-05-09). |
| 7 | Decision YAML for editorial approval | Skip — precedent (`claim-vnstock-install-sandbox.yaml`) does not require one. |
| 8 | Tool name | `list-verified` (avoids contested "fact" term post-R-Q5). |

## Committed Changes

- `tools/list-verified/list-verified.sh` — yq-based discoverability tool (claims + evidence + skip list).
- `package.json` — added `list:verified` script.
- `records/claims/claim-vnstock-install-sandbox.yaml` — quoted unquoted colon in `notes` field (YAML 1.2 strictness fix for yq compatibility).
- `records/claims/claim-vnstock-device-limit-mechanism.yaml` — added `notes` with vendor-website confirmation citation.

## Out of Scope (No Change)

- Migration of older prose-envelope MDs to frontmatter. Defer until `runtime_run` schema lands.
- Pack-fact extraction, pack manifest changes, capability publication. R-Q5 close defers all.
- Schema enum hardening for `claim_support`, `validation_status`. Defer per convention-before-schema rule.
