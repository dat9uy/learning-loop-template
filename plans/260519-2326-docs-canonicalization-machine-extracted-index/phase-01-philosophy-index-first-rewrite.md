---
phase: 1
title: "Philosophy Index-First Rewrite"
status: pending
priority: P2
effort: "30m"
dependencies: []
---

# Phase 1: Philosophy Index-First Rewrite

## Overview

Rewrite `docs/philosophy.md` to replace claim-first epistemology with index-first language. The philosophical pillars (verification is dimensional, decisions are boundaries, evidence is source) remain intact. Only the “where does truth status live?” answer changes — from claims to machine-extracted index entries. The adversarial-mindset section must also acknowledge index entries as the new challenged entity.

## Context Links

- Brainstorm Plan 4: `plans/reports/brainstorm-20260518-machine-extracted-index.md` § Plan 4
- Current doc: `docs/philosophy.md`
- Record-system architecture: `docs/record-system-architecture.md` (contains one remaining stale reference at line 102 to be fixed in this phase)
- Decision record: `records/decisions/decision-260519T1400Z-claim-deprecation.yaml`
- Frozen-legacy claims: `records/claims/`

## Key Insights

1. The core philosophical shift is minimal: “claims hold truth status” → “index entries hold truth status; claims are frozen-legacy audit trail.”
2. The adversarial mindset paragraph (line 109–114) lists challenged entities. Claims must be replaced with index entries, but experiments still challenge assertions, and evidence still challenges older evidence.
3. The governance model (line 72–79) references “claim → experiment → decision” workflow. This is historical truth for frozen-legacy claims; new work follows “evidence → index → experiment → decision.”
4. Do not introduce new philosophical pillars. The three existing pillars are sufficient.

## Requirements

- Functional: All claim-first sentences rewritten to index-first; frozen-legacy claims noted where historical context is needed.
- Non-functional: Tone preserved (adversarial, concise, boundary-focused); no new sections unless necessary.

## Related Code Files

- Modify: `docs/philosophy.md`
- Read for context: `docs/record-system-architecture.md`

## Implementation Steps

1. **Line 38–40 rewrite — Truth status paragraph:**
   - Old: `Truth status lives in claims, not in evidence. A claim's verification block says which dimensions are proved and by which experiments. Evidence is referenced by claims; claims are never inferred from evidence.`
   - New: `Truth status lives in the machine-extracted index, not in evidence. An index entry is an atomic assertion derived from evidence ## Findings; it carries dimension, scope, and status. Evidence is referenced by index entries; index entries are never inferred from evidence directly.`
   - Old: `Always read claims first. Evidence second. Never the other way around.`
   - New: `Always read the index first. Evidence second. Never the other way around. The index is the single top-level artifact for state queries.`

2. **Line 44 rewrite — Knowledge vs state paragraph:**
   - Old: `Claims, experiments, and decisions answer "what do we know?"`
   - New: `Index entries, experiments, and decisions answer "what do we know?"`

3. **Line 109–114 rewrite — Adversarial mindset:**
   - Old: `Claims are challenged by experiments.`
   - New: `Index entries are challenged by newer evidence (and the experiments that produce it).`
   - Keep the experiment/cleanup/supersession lines unchanged.

4. **Line 72–79 governance model — Historical note:**
   - The table row for “External boundary” currently says “Learning loop: claim → experiment → decision”.
   - Change to: `Learning loop: evidence → index → experiment → decision (frozen-legacy claims remain in records/claims/ as read-only audit trail).`

5. **Section “How to Reason With the Loop” (line 83–104):**
   - Line 85: `Convert each uncertainty into a claim (what you believe) and a risk` → `Convert each uncertainty into an index entry candidate (what you believe) and a risk`
   - Line 89: `A capability script proves a library returns usable data. An experiment proves a hypothesis. A decision approves a scope.` — this sentence is fine, keep it.
   - Line 91: `If you find yourself writing product code before a claim is verified` → `If you find yourself writing product code before an assertion is indexed and verified`

6. **Also edit `docs/record-system-architecture.md` line 102:**
   - Old: `| Authority | Claims-first scanning | Operator-managed; agent-readable |`
   - New: `| Authority | Index-first scanning | Operator-managed; agent-readable |`

7. **Section “What the Loop Is Not” — no changes needed; generic enough.**

8. **Run `pnpm check` after save. Note:** `pnpm check` does not include `pnpm extract:index`; run that separately after evidence edits.

## Success Criteria

- [ ] `docs/philosophy.md` contains zero instances of “claim-first”, “claims first”, or “read claims first”.
- [ ] `docs/philosophy.md` contains zero unqualified assertions that truth status lives in claims.
- [ ] Frozen-legacy claims are referenced only with the “frozen-legacy (read-only audit trail)” qualifier.
- [ ] `pnpm check` passes.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Rewrite loses concision or adversarial tone | Keep edits surgical; replace nouns, do not rewrite whole paragraphs unless necessary |
| Over-correction removes useful historical context about claims | Only replace epistemology sentences; keep governance table history note |

## Next Steps

- Phase 2 (Operator-Guide rewrite) depends on this phase for philosophical terminology alignment.
