---
phase: 1
title: "Design Validation & Gap Closure"
status: pending
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Design Validation & Gap Closure

## Overview

Validate the journal analysis (`docs/journals/260520-coordination-gate-misfire-docs-refactor.md`) against the actual codebase. Confirm zero gaps and produce the final domain-rules design. This phase is short because the journal already performed the root-cause analysis.

## Requirements

- Functional: Every profile-model check has an observation-model equivalent or is explicitly declared unnecessary.
- Functional: The `external-system` profile is acknowledged and confirmed unused.
- Non-functional: No standalone `gap-analysis.md` document — the journal is the authoritative analysis.

## Architecture

### Verified: Zero Gaps

| Profile-Model Check | Observation-Model Equivalent | Status |
|---------------------|------------------------------|--------|
| `code-generation` forbidlist (`records/**`, `evidence/**`, `docs/**`, `plans/**`) | Domain rules explicitly allow these paths (git-tracked, reversible) | Verified |
| `plan-execution` allowlist (`product/**`, `tools/**`, `records/**`, `evidence/**`) | Domain rules explicitly allow these paths | Verified |
| `plan-execution` gate_signals (`validation_window`) | Bash gate checks `validation_window.active` on ALL budgets for ALL constraint-matching commands. **Behavioral change:** file writes (Edit/Write) are NOT gated by validation windows. This is intentional — validation windows constrain external system state, not local file edits. | Verified, documented |
| `external-system` profile | Unused — no skill in `skill-registry.json` references it. Its `gate_signals` (budget_check, validation_window, staleness_check) are already covered by universal bash-gate checks. | Verified |
| `read_requirelist` | **Unenforced** — no hook or server reads this field. No equivalent needed. | Verified, declared unnecessary |

### Domain Rules Design (Final)

```javascript
const DOMAIN_RULES = [
  // Documentation & plans — always safe
  { pattern: 'docs/**',           decision: 'allow', reason: 'Documentation path' },
  { pattern: 'plans/**',          decision: 'allow', reason: 'Plan path' },

  // System configuration — safe, self-modifying
  { pattern: '.claude/**',        decision: 'allow', reason: 'Claude system config' },

  // Records & evidence — safe for general records, but NOT observations
  { pattern: 'records/observations/**', decision: 'block', reason: 'Observation files affect bash gate decisions. Explicit approval required.' },
  { pattern: 'records/evidence/**',     decision: 'block', reason: 'Evidence files affect validation. Explicit approval required.' },
  { pattern: 'records/**',        decision: 'allow', reason: 'General record path' },
  { pattern: 'evidence/**',       decision: 'allow', reason: 'Evidence path' },

  // Product & tools — safe source code, but NOT build artifacts
  { pattern: '**/node_modules/**', decision: 'block', reason: 'Build artifacts are not git-tracked' },
  { pattern: '**/dist/**',         decision: 'block', reason: 'Build artifacts are not git-tracked' },
  { pattern: '**/build/**',        decision: 'block', reason: 'Build artifacts are not git-tracked' },
  { pattern: 'product/**',        decision: 'allow', reason: 'Product source code' },
  { pattern: 'tools/**',          decision: 'allow', reason: 'Tool source code' },

  // Schemas — require validation
  { pattern: 'schemas/**',        decision: 'block', reason: 'Schema changes require validation. Run pnpm validate:records first, then approve.' },

  // Root project files
  { pattern: '*',                 decision: 'allow', reason: 'Root project file (e.g., README.md, package.json, CLAUDE.md)' },

  // Default: block unknown paths
  { pattern: '**',                decision: 'block', reason: 'Unknown path. Only write to known domains.' },
];
```

Rules are evaluated in order. First match wins.

### Behavioral Changes Explicitly Acknowledged

1. **Validation windows no longer block file writes.** Under the old system, the coordinator blocked all skill work during validation windows. The new system only blocks Bash commands matching constraint patterns. File writes via Edit/Write are not constrained by validation windows because they do not affect external system state.
2. **`records/observations/**` and `records/evidence/**` are now blocked.** Under the old `code-generation` profile, these were forbidden. Under the new system, they remain forbidden for the same reason: they affect the observation-based safety layer.
3. **`.claude/**` and root files are now explicitly allowed.** Under the old system, they were neither in allowlist nor forbidlist, so they were allowed by default. The new system makes this explicit.

## Related Code Files

- Read: `docs/journals/260520-coordination-gate-misfire-docs-refactor.md`
- Read: `.claude/coordination/coordination-config.json`
- Read: `.claude/coordination/skill-registry.json`
- Read: `.claude/coordination/hooks/bash-coordination-gate.cjs`
- Read: `.claude/coordination/hooks/write-coordination-gate.cjs`
- Read: `.claude/coordination/hooks/lib/gate-utils.cjs`

## Implementation Steps

1. Read the journal entry to confirm analysis is still current.
2. Verify `external-system` profile is unused: `grep -n external-system .claude/coordination/skill-registry.json` must return zero hits.
3. Verify `read_requirelist` is unenforced: `grep -r "read_requirelist" .claude/coordination/hooks/ tools/constraint-gate/` must return zero hits.
4. Confirm the domain rules above with user sign-off.
5. No standalone gap-analysis document is produced — the journal is the authoritative analysis.

## Success Criteria

- [ ] `external-system` profile confirmed unused.
- [ ] `read_requirelist` confirmed unenforced.
- [ ] Domain rules user-approved.
- [ ] No `gap-analysis.md` document created.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `external-system` profile referenced outside skill-registry | Low | Low | Grep across entire repo; add note if found. |

## Next Steps

- Phase 2 deletes Model A and rewrites the write gate.
