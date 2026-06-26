---
phase: 2
title: "E.3 — Parity-pin label + docs/legacy-pins.md (parity-test pin convention)"
status: pending
priority: P2
dependencies: []
---

# Phase 2: E.3 — Parity-pin label + docs/legacy-pins.md

## Overview

Add a 1-line parity-pin comment to `mastra/workflows/workflow-intentional-skip.js` (per scope report Rev 6 § E.3) flagging it as a "parity-test pin (not legacy)." Create `tools/learning-loop-mastra/docs/legacy-pins.md` documenting the parity-pin convention + listing all parity-pinned files (the workflow-intentional-skip.js pin + the 4 actual parity-semantic surfaces: `schema-parity.js`, `create-loop-{tool,workflow,agent}.js`, `build-meta-state-tools.js`). Closes scope report item E.3.

**Risk:** Low — single comment + new doc. No behavioral change.

## Requirements

- Functional:
  1. `mastra/workflows/workflow-intentional-skip.js` has a 1-line parity-pin comment above `export const workflowIntentionalSkip`
  2. `tools/learning-loop-mastra/docs/legacy-pins.md` exists with: title, intro, numbered list of pinned files, do-not-move rule per file
- Non-functional:
  1. The comment must be parseable as Markdown but live in a `.js` file (use `//` line comment)
  2. `docs/legacy-pins.md` lists ≥5 files (workflow-intentional-skip.js + 4 parity surfaces)
  3. `pnpm test` GREEN (no behavioral change)
- TDD gate: visual inspection of the comment + `cat docs/legacy-pins.md | grep -c "^1\."` returns ≥5

## Architecture

The "parity-pin" convention distinguishes two categories:
- **Parity-test pin** (workflow-intentional-skip.js): a workflow pinned because parity tests depend on its exact location/shape. Moving it to `legacy/` would break the parity-test suite.
- **Parity-semantic pin** (schema-parity.js, create-loop-{tool,workflow,agent}.js, build-meta-state-tools.js): a file pinned because it enforces the parity contract for MCP tool schemas. Moving it would break the wire-format parity guarantee.

Both categories belong in `legacy-pins.md`. The scope report's wording was "parity-test pin" for workflow-intentional-skip.js; D3 follows the scope report but D4 documents the broader convention in legacy-pins.md so future readers see the full picture.

**The convention works because:**
- `tools/legacy/` is a substrate-layer directory (per Plan 1's rename); files there are "old but kept for parity."
- Files in `legacy-pins.md` are NOT in `tools/legacy/`; they live in `mastra/` (shell layer) and must stay there to preserve their contract.
- A future operator who sees `tools/legacy/` and thinks "should I move parity-related files there?" reads `legacy-pins.md` first and finds the explicit "do not move" rule.

## Related Code Files

- Modify: `tools/learning-loop-mastra/mastra/workflows/workflow-intentional-skip.js` (add 1-line comment above line 47)
- Create: `tools/learning-loop-mastra/docs/legacy-pins.md` (~30-50 LoC)
- No file deletion

## File Inventory (deep mode)

| File | Operation | Lines affected | Notes |
|------|-----------|----------------|-------|
| `tools/learning-loop-mastra/mastra/workflows/workflow-intentional-skip.js` | Modify | insert 1 line at line 47 (above `export const workflowIntentionalSkip`) | Comment uses `//` syntax; no import or function change |
| `tools/learning-loop-mastra/docs/legacy-pins.md` | Create | full file (~30-50 LoC) | New file in existing `tools/learning-loop-mastra/docs/` dir (sibling to `schemas.md`) |

## Test Scenario Matrix (deep mode)

| # | Scenario | Expected | Verification |
|---|----------|----------|--------------|
| 1 | `head -50 tools/learning-loop-mastra/mastra/workflows/workflow-intentional-skip.js \| grep "parity-pin"` returns the comment | After phase 2 | Comment present |
| 2 | `ls tools/learning-loop-mastra/docs/legacy-pins.md` exists | After phase 2 | File created |
| 3 | `cat tools/learning-loop-mastra/docs/legacy-pins.md \| grep -cE "^- \`.*\.js\`"` returns ≥5 | After phase 2 | List has ≥5 pinned files |
| 4 | `pnpm test` GREEN | After phase 2 | No regression |
| 5 | `git diff tools/learning-loop-mastra/mastra/workflows/workflow-intentional-skip.js` shows ONLY the comment insert | After phase 2 | Diff scope clean |
| 6 | `node tools/learning-loop-mastra/interface/contract.js claude-code` still returns `{ok: true}` | After phase 2 | Contract unaffected |

## Function/Interface Checklist (deep mode)

- [ ] Comment wording matches scope report's "parity-test pin (not legacy)" phrase
- [ ] `legacy-pins.md` intro explains the convention in 1-2 sentences
- [ ] `legacy-pins.md` lists at minimum:
  - `mastra/workflows/workflow-intentional-skip.js` (parity-test pin)
  - `mastra/schema-parity.js` (parity-semantic pin)
  - `mastra/create-loop-tool.js` (parity-semantic pin)
  - `mastra/create-loop-workflow.js` (parity-semantic pin)
  - `mastra/create-loop-agent.js` (parity-semantic pin)
  - `mastra/agents/build-meta-state-tools.js` (parity-semantic pin)
- [ ] Each entry has a "Do not move to `legacy/`" rule + 1-line rationale

## Dependency Map (deep mode)

**Depends on:**
- Plan 1 (DONE) — rename of `tools/legacy/` to `legacy/` layer (where the convention applies)
- Plan 2 (DONE) — `interface/CONTRACT.md` 5-requirement contract that the parity-pinned files help enforce
- Plan 6 (DONE) — files now live at `mastra/` paths (the legacy-pins.md paths reference post-Plan-6 locations)

**Does not depend on:**
- Phase 1 of this plan — R2 ownership is orthogonal
- Phase 3/4/5 of this plan — E.3 ships independently

**Does not block:**
- Plan 4 — Plan 4 reads `legacy-pins.md` but does not require it
- Plan 5 — hardening is parallel

## Implementation Steps

### Step 1: Add the parity-pin comment to workflow-intentional-skip.js

Open `tools/learning-loop-mastra/mastra/workflows/workflow-intentional-skip.js`. Insert before line 47 (`export const workflowIntentionalSkip = createLoopWorkflow({`):

```javascript
// PARITY-TEST PIN: not legacy. Moving this file breaks the parity-test suite that depends on its location. See docs/legacy-pins.md.
```

Result: lines 1–46 unchanged; line 47 is the comment; line 48 is the `export const` line (was 47).

### Step 2: Create docs/legacy-pins.md

```bash
cat > tools/learning-loop-mastra/docs/legacy-pins.md << 'EOF'
# Legacy Pins (Parity-Test + Parity-Semantic)

Files that must NOT be moved to `tools/learning-loop-mastra/tools/legacy/` (or any other "legacy" location), because they enforce parity contracts that the loop's wire-format correctness depends on.

## Convention

There are two categories of parity-pinned files:

1. **Parity-test pins** — workflows/files that the parity-test suite depends on for its assertions. Moving them breaks the tests.
2. **Parity-semantic pins** — files that implement the parity contract (wire-format guarantees for MCP tool schemas). Moving them breaks the loop's runtime correctness.

Both categories are listed here. Future operators should consult this file before considering any move-to-legacy action.

## Pinned Files

### Parity-test pins

- `mastra/workflows/workflow-intentional-skip.js` — exercised by the parity-test suite that validates skip-decision behavior. Moving it breaks the suite. **Do not move to `legacy/`.**

### Parity-semantic pins

The 5 files below implement or apply parity guarantees for MCP tool schemas. The canonical contract lives in `mastra/schema-parity.js`; the other 4 files are factories that attach the schema-parity shim to every tool/workflow/agent. See `mastra/schema-parity.js` for the wire-format contract details.

- `mastra/schema-parity.js` — implements the wire-format parity contract for MCP tool schemas. Moving it breaks the contract. **Do not move to `legacy/`.**
- `mastra/create-loop-tool.js` — factory that attaches the schema-parity shim to every tool. Moving it breaks every tool's wire format. **Do not move to `legacy/`.**
- `mastra/create-loop-workflow.js` — factory that attaches the schema-parity shim to every workflow. Same as above. **Do not move to `legacy/`.**
- `mastra/create-loop-agent.js` — factory that attaches the schema-parity shim to every agent. Same as above. **Do not move to `legacy/`.**
- `mastra/agents/build-meta-state-tools.js` — applies the parity shim to meta-state tools. Moving it breaks meta-state wire format. **Do not move to `legacy/`.**

## Rule

**If a file is listed here, it does not move to `legacy/` without an explicit operator-approved PR that updates this document first.**
EOF
```

### Step 3: Verify the comment

```bash
head -50 tools/learning-loop-mastra/mastra/workflows/workflow-intentional-skip.js | grep "parity-pin"
# Expected: 1 match
```

### Step 4: Verify the legacy-pins.md content

```bash
cat tools/learning-loop-mastra/docs/legacy-pins.md | grep -cE "^- \`.*\.js\`"
# Expected: ≥5

cat tools/learning-loop-mastra/docs/legacy-pins.md | grep "^# "
# Expected: 1 (title only — no extra sections)
```

### Step 5: Run `pnpm test` (expect GREEN — no behavior change)

```bash
pnpm test 2>&1 | tail -10
# Expected: all 13 namespaces GREEN
```

### Step 6: Diff scope check

```bash
git diff tools/learning-loop-mastra/mastra/workflows/workflow-intentional-skip.js
# Expected: +1 line (the comment); no other changes

git status --short tools/learning-loop-mastra/docs/
# Expected: "?? tools/learning-loop-mastra/docs/legacy-pins.md" (untracked)
```

## Success Criteria

- [ ] Step 1 comment applied; line 47 = `// PARITY-TEST PIN: not legacy. Moving this file breaks the parity-test suite that depends on its location. See docs/legacy-pins.md.`
- [ ] Step 2 `docs/legacy-pins.md` created with title + intro + 6 entries (1 parity-test pin + 5 parity-semantic pins)
- [ ] Step 3 verification: `grep "parity-pin"` returns the comment
- [ ] Step 4 verification: `grep -cE "^- \`.*\.js\`"` returns ≥5
- [ ] Step 5 `pnpm test` GREEN
- [ ] Step 6 diff scope clean (workflow-intentional-skip.js: +1 line only; legacy-pins.md: new file)

## Risk Assessment

- **R-Phase2-A:** The comment breaks a JS linter or formatter. **Mitigation:** Use a `//` line comment (standard JS); the linter (if any) accepts comments above exports.
- **R-Phase2-B:** `legacy-pins.md` lists a path that drifts from the actual file location. **Mitigation:** All listed paths are post-Plan-6 locations (verified by scout); grep audit before commit to confirm paths exist.
- **R-Phase2-C:** Future operator ignores `legacy-pins.md` and moves a pinned file to `legacy/`. **Mitigation:** This is a doc-only convention; the actual enforcement ships in the hardening plan (LIM-3 caller identity + R2 write-gate + LIM-4 path traversal).
- **R-Phase2-D:** `legacy-pins.md` becomes stale as parity surfaces evolve. **Mitigation:** The doc's "Rule" section requires an explicit operator-approved PR for any move; future edits update the doc atomically.