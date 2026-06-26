---
phase: 1
title: "E.2 — AGENTS.md §11 Runtime interface ownership (R2 process norm)"
status: pending
priority: P2
dependencies: []
---

# Phase 1: E.2 — AGENTS.md §11 Runtime interface ownership

## Overview

Add a new `AGENTS.md §11 "Runtime interface ownership"` codifying R2 ownership: each runtime agent owns its coordination directory (`.claude/coordination/hooks/`, `.factory/coordination/hooks/`, future `.mastracode/coordination/hooks/`); cross-runtime edits require operator approval. Renumber the existing §11 ("What changed in this rewrite (2026-06-12)") to §12 to make room — architectural contract comes before historical log per D1.

**Risk:** Low — single doc edit + 2-section renumber. No behavioral change to runtime hooks or MCP servers.

## Requirements

- Functional: AGENTS.md has a new §11 documenting R2 ownership convention
- Non-functional: existing §11 ("rewrite change log") preserved as §12; no external links broken; section count goes 11 → 12
- TDD gate: `grep -c "^## " AGENTS.md` returns 12; `grep -n "^## " AGENTS.md` shows §11 = "Runtime interface ownership" and §12 = "What changed in this rewrite"

## Architecture

Insertion follows Plan 1's `AGENTS.md §1.1` precedent (architectural contracts come first, then infrastructure, then operational rules, then trajectory, then history). The new §11 lands between §10 ("Where This Project Is Heading") and the existing historical §11. Convention: §11 = "second-most-stable architectural contract" (R2 ownership is operational but touches coordination-gate behavior); §12 = historical log.

**Content of new §11 (R2 ownership, ~15 LoC):**

```markdown
## 11. Runtime Interface Ownership (R2)

Runtime interface code (`.claude/coordination/hooks/`, `.factory/coordination/hooks/`, future `.mastracode/coordination/hooks/`) is owned by the corresponding runtime agent. **Cross-runtime edits require operator approval.**

**Convention:**
- Each runtime agent works on its own branch (e.g., `claude-code/interface-v2`, `mastra-code/interface-v1`).
- Cross-runtime edits (e.g., a Claude Code session editing `.factory/`) require an operator-approved PR.
- The `interface/CONTRACT.md` 5-requirement contract is the loop's concern; the runtime's coordination directory is the runtime's concern.

**Enforcement:** Git branch protection + PR review. The bundled hardening plan (`hardening-r2-lim3-lim4`) ships the write-gate (LIM-3 caller identity + R2 write-gate + LIM-4 path traversal) for security-critical enforcement.
```

## Related Code Files

- Modify: `AGENTS.md` (insert new §11 between §10 and existing §11; renumber existing §11 to §12)
- No file creation
- No file deletion

## File Inventory (deep mode)

| File | Operation | Lines affected | Notes |
|------|-----------|----------------|-------|
| `AGENTS.md` | Modify | insert at line 354 (before existing §11); renumber header at line 355 | Section count goes 11 → 12; existing §11's `## 11.` becomes `## 12.` |

## Test Scenario Matrix (deep mode)

| # | Scenario | Expected | Verification |
|---|----------|----------|--------------|
| 1 | `grep -c "^## " AGENTS.md` returns 12 | After phase 1 | Section count check |
| 2 | `grep -n "^## 11\." AGENTS.md` returns "Runtime interface ownership" | After phase 1 | §11 title check |
| 3 | `grep -n "^## 12\." AGENTS.md` returns "What changed in this rewrite" | After phase 1 | §12 renumber check |
| 4 | `grep -rn "§11" .` (excluding `.git/`) returns 0 stale references to "What changed in this rewrite" | Before + after phase 1 | External-link audit |
| 5 | `pnpm test` GREEN (no code change; just doc) | After phase 1 | No regression |
| 6 | `git diff AGENTS.md` shows ONLY the insert + renumber (no other changes) | After phase 1 | Diff scope check |

## Function/Interface Checklist (deep mode)

- [ ] New `AGENTS.md §11` content drafted (above) and reviewed
- [ ] Existing §11 content preserved verbatim in §12 (only the header changes)
- [ ] Sections §1–§10 unchanged (verified via diff)

## Dependency Map (deep mode)

**Depends on:**
- Plan 1 (`plans/260624-2335-phase-e-foundation/plan.md` DONE) — established the 3-layer architecture that §11 references

**Does not depend on:**
- Plan 2 (interface spec) — §11 codifies R2 ownership independently
- Plan 6 (shell restructure) — §11 references `interface/CONTRACT.md` but does not require the contract to exist first

**Does not block:**
- Plan 4 (Mastra Code validation) — Plan 4 can run in parallel
- Plan 5 (hardening) — Plan 3 ships the process norm; Plan 5 ships the gate

## Implementation Steps

### Step 1: Audit external links to §11 before editing

```bash
cd /home/datguy/codingProjects/learning-loop-template

# Symbol-style §11 references (e.g., "AGENTS.md §11")
grep -rn "§11" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.cache 2>/dev/null
# Expected: 0 matches OR matches only in docs/journals/ (historical references that don't need updating)

# Prose-style references (e.g., "see AGENTS.md §11 (rewrite log)")
grep -rnE "AGENTS\.md.*§11|§11.*AGENTS\.md|§11.*rewrite|§11.*change.?log" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.cache 2>/dev/null
# Expected: 0 matches OR matches only in docs/journals/
```

**If matches exist:** note them in the journal entry. If a match references "§11 What changed in this rewrite", update the link to "§12" in that file (rare — §11 is a section number, not commonly linked).

### Step 2: Insert new §11 before existing §11

Open `AGENTS.md`. The existing §11 starts at line 355 with `## 11. What changed in this rewrite (2026-06-12)`.

Insert before line 355 (between §10's last paragraph and §11's header):

```markdown

---

## 11. Runtime Interface Ownership (R2)

[content from "Architecture" section above]

---

---

Result: `AGENTS.md` has §1–§10 unchanged, new §11 inserted, existing §11 renumbered to §12.

### Step 3: Renumber existing §11 to §12

Change the header on line 355 from `## 11. What changed in this rewrite (2026-06-12)` to `## 12. What changed in this rewrite (2026-06-12)`. Body unchanged.

### Step 4: Verify the edit

```bash
cd /home/datguy/codingProjects/learning-loop-template

grep -c "^## " AGENTS.md
# Expected: 12

grep -n "^## 11\." AGENTS.md
# Expected: 355:## 11. Runtime Interface Ownership (R2)
# (line number will shift based on insertion length)

grep -n "^## 12\." AGENTS.md
# Expected: (line of former §11):## 12. What changed in this rewrite (2026-06-12)
```

### Step 5: Run `pnpm test` (expect GREEN — doc-only change)

```bash
pnpm test 2>&1 | tail -10
# Expected: all 13 namespaces GREEN
```

### Step 6: Diff scope check

```bash
git diff AGENTS.md
# Expected: ONLY the §11 insert + §11 → §12 header renumber
# Expected line count: +~17 (insert) + 1 (renumber) = +18 lines net
```

## Success Criteria

- [ ] Step 1 audit completed; 0 stale external links OR noted in journal
- [ ] Step 2 insert applied; new §11 in place
- [ ] Step 3 renumber applied; existing §11 → §12
- [ ] Step 4 verification passes; section count = 12; §11 + §12 titles correct
- [ ] Step 5 `pnpm test` GREEN
- [ ] Step 6 diff scope clean (only the 2 changes)

## Risk Assessment

- **R-Phase1-A:** External link breaks if a doc references "§11 What changed in this rewrite". **Mitigation:** Step 1 audit catches this; manual fix if needed.
- **R-Phase1-B:** Existing §11 content accidentally modified during renumber. **Mitigation:** Step 6 diff scope check (only header change in §12); preserve body verbatim.
- **R-Phase1-C:** New §11 content drifts from scope report's wording (e.g., operator adds "hard requirement" language). **Mitigation:** Use the exact wording from the "Architecture" section above; do NOT add enforcement language beyond what the report specifies (gate ships in Plan 5).