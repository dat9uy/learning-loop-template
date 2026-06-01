---
phase: 2
title: "Gate Reads Promoted Rules"
status: completed
priority: P2
effort: 6h
dependencies: [1]
---

# Phase 2: Gate Reads Promoted Rules

## Overview

Add `loadPromotedRules` and `applyPromotedRules` to `core/gate-logic.js`. Gate reads `meta-state.jsonl` for active promoted rules and applies their patterns to commands (regex) and file paths (glob). On match, gate returns `escalate` with rule provenance. In-memory cache with mtime-based invalidation.

## Requirements

**Functional:**
- Gate reads `meta-state.jsonl` for entries with `status: "active"` AND `promoted_to_rule.enforcement: "gate"`
- `pattern_type: "regex"` matches against command string
- `pattern_type: "glob"` matches against file path
- On match: `escalate` decision with `rule_id`, `meta_state_id`, `pattern_type`
- Inactive rules (`status: "reported"`, `"resolved"`, etc.) ignored
- Non-gate rules (`enforcement: "agent"` or `"tool"`) ignored
- Invalid regex caught, log warning, rule skipped (no crash)

**Non-functional:**
- Cache hit: < 1ms per gate check
- Cache miss (first call or mtime change): < 10ms for 50 rules
- No regression in existing constraint pattern matching

## Architecture

**Hook point:** Add as a post-check in `makeGateDecision` (after existing constraint/observation checks) or in `matchConstraintPattern` (as an additional pattern). The promoted rules are an **additional pattern layer**, not a replacement.

**Caching strategy:**
- `loadPromotedRules(root)` reads `meta-state.jsonl` once, returns filtered rules
- Cache key: file mtime (in-memory)
- On each gate call: stat file, compare mtime, reload if changed
- Cache invalidates on `updateEntry` to `meta-state.jsonl` (operator acks/promotes)

**Pattern matching:**
- Reuse existing `globMatch(pattern, filePath)` for glob
- `new RegExp(pattern).test(command)` for regex (try/catch for invalid)

## Related Code Files

**Modify:**
- `tools/learning-loop-mcp/core/gate-logic.js` — add `loadPromotedRules`, `applyPromotedRules`
- `tools/learning-loop-mcp/hooks/bash-gate.js` — call `applyPromotedRules` after `matchConstraintPattern`
- `tools/learning-loop-mcp/hooks/write-gate.js` — call `applyPromotedRules` after `evaluateWritePath`

**Create:**
- `tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js`

## TDD Structure

### Tests Before (regression — current gate behavior)

1. Existing constraint patterns still match (`pip install` → `package-manager`)
2. Existing observation check unchanged (no observation → still block)
3. `makeGateDecision` decision unchanged when no promoted rules exist
4. `meta-state.jsonl` missing or empty → `loadPromotedRules` returns `[]`
5. `meta-state.jsonl` exists but no `loop-anti-pattern` entries → `[]`

### Refactor (code changes those tests protect)

1. Add `loadPromotedRules(root)`:
   ```js
   let cachedRules = null;
   let cachedMtime = 0;
   export function loadPromotedRules(root) {
     const path = join(root, "meta-state.jsonl");
     if (!existsSync(path)) return [];
     const mtime = statSync(path).mtime.getTime();
     if (mtime === cachedMtime && cachedRules) return cachedRules;
     const entries = readRegistry(root);
     cachedRules = entries.filter(e =>
       e.status === "active" &&
       e.promoted_to_rule?.enforcement === "gate"
     );
     cachedMtime = mtime;
     return cachedRules;
   }
   ```

2. Add `applyPromotedRules(command, filePath, rules)`:
   ```js
   export function applyPromotedRules(command, filePath, rules) {
     for (const rule of rules) {
       const { pattern_type, pattern, rule_id } = rule.promoted_to_rule;
       let matched = false;
       try {
         if (pattern_type === "regex" && command) {
           matched = new RegExp(pattern).test(command);
         } else if (pattern_type === "glob" && filePath) {
           matched = globMatch(pattern, filePath);
         }
       } catch (err) {
         console.warn(`Invalid pattern in rule ${rule_id}: ${err.message}`);
         continue;
       }
       if (matched) {
         return {
           decision: "escalate",
           reason: `Promoted rule "${rule_id}" matched: ${pattern}`,
           rule_id, meta_state_id: rule.id, pattern_type,
         };
       }
     }
     return { decision: "ok" };
   }
   ```

3. Wire into `makeGateDecision` (final check before return):
   ```js
   // After existing checks
   const promotedRules = loadPromotedRules(root);
   const promotedCheck = applyPromotedRules(command, filePath, promotedRules);
   if (promotedCheck.decision !== "ok") return promotedCheck;
   ```

### Tests After (new behavior)

1. Regex rule matches command → `escalate` with `rule_id` and `meta_state_id`
2. Glob rule matches file path → `escalate`
3. Regex rule does NOT match → `ok`
4. Glob rule does NOT match → `ok`
5. Inactive rule (`status: "reported"`) → not loaded → no escalation
6. Rule with `enforcement: "agent"` → not loaded
7. Invalid regex → caught, rule skipped, no crash, warning logged
8. Multiple rules; first match returns that rule's escalation
9. Cache hit: second call within same mtime does not re-read file
10. Cache miss: file mtime change triggers re-read
11. Missing `meta-state.jsonl` → `loadPromotedRules` returns `[]`; no error

### Regression Gate

```bash
cd tools/learning-loop-mcp && pnpm test __tests__/gate-promoted-rules.test.js
```

## Implementation Steps

1. Read `core/gate-logic.js` to find `makeGateDecision` integration point
2. Read `hooks/bash-gate.js` and `hooks/write-gate.js` to understand call sites
3. Write 5 regression tests (Tests Before); run; pass
4. Implement `loadPromotedRules` with mtime cache
5. Implement `applyPromotedRules` with try/catch on invalid regex
6. Wire into `makeGateDecision` as post-check
7. Write 11 new behavior tests (Tests After); run; pass
8. Run full test suite: `pnpm test`

## Success Criteria

- [ ] Active promoted rules loaded and applied
- [ ] Regex matches commands; glob matches file paths
- [ ] Inactive / non-gate rules ignored
- [ ] Invalid regex doesn't crash; warning logged
- [ ] Cache works; mtime change triggers re-read
- [ ] All 16 tests pass (5 before + 11 after)
- [ ] No regression in existing gate behavior
- [ ] Bash and write gate hooks invoke `applyPromotedRules`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Invalid regex crashes gate | Try/catch in `applyPromotedRules`; log warning; skip rule |
| Cache returns stale rules | mtime check on each gate call; cheap (~10us) |
| False positive pattern | Operator reviews pattern before promotion (Decision 2); 2+ occurrences required |
| Performance with 100+ rules | Regex match is microseconds; 100 * 10us = 1ms; acceptable |
| Mtime race with concurrent writes | `updateEntry` uses temp file + rename; mtime updates atomically |
| Regex DoS via catastrophic backtracking (RT Finding 3) | Use `safe-regex` package; reject patterns with high complexity score |
| Path traversal in glob patterns (RT Finding 5) | Glob scope whitelist: pattern must start with `product/`, `docs/`, `plans/`, or `tools/` |
| mtime granularity race (RT Finding 6) | Cache key is `(mtime, size)` tuple, not mtime alone |
| Runaway rule blocks all work (RT Finding 7) | Add `status: "disabled"` mechanism; operator can disable without resolving |

## Red Team Findings Applied

**RT Finding 3 (Regex DoS) — Medium:** Wrap `new RegExp(pattern).test(command)` in a complexity check. Use the `safe-regex` npm package (or equivalent): reject patterns with `starHeight > 1` or repeated groups. Additionally, wrap the test in a `Promise.race` with a 50ms timeout. The `applyPromotedRules` function rejects the pattern (with a warning) if it fails the complexity check.

**RT Finding 5 (Path Traversal in Glob) — Medium:** Add a glob scope whitelist in `applyPromotedRules`. The `pattern` must start with one of: `product/`, `docs/`, `plans/`, `tools/`, `meta-state.jsonl`. Patterns not matching the whitelist are rejected with a warning. This prevents `**/secrets/**` or `**/../../etc/**` style patterns.

**RT Finding 6 (mtime Granularity Race) — High:** The cache key is `(mtime, size)` tuple, not `mtime` alone. The `loadPromotedRules` function reads `statSync(path)` for both `mtime.getTime()` and `size`. If either changes, the cache invalidates. This addresses the 1-second mtime granularity issue on ext4 and most CI runners.

**RT Finding 7 (No Circuit Breaker) — High:** Add `status: "disabled"` mechanism. The `loadPromotedRules` filter excludes both `"resolved"` and `"disabled"`. Recovery flow: operator runs `meta_state_update_entry({id, status: "disabled"})` to short-circuit a runaway rule. The entry stays in the registry (audit trail) but is not loaded by the gate.

**RT Finding 15 (Operator Review Workflow) — Medium:** The new `meta_state_promote_rule` tool (added in this phase) requires operator role AND accepts an optional `preview: true` parameter. When `preview: true`, the tool returns `{ pattern, sample_matches: [...] }` without activating the rule. The operator can test the pattern against sample commands before promoting.

**Updated Implementation Steps:**

1. Read `core/gate-logic.js` to find `makeGateDecision` integration point
2. Read `hooks/bash-gate.js` and `hooks/write-gate.js` to understand call sites
3. Write 5 regression tests (Tests Before); run; pass
4. Implement `loadPromotedRules` with `(mtime, size)` cache key (RT Finding 6)
5. Implement `applyPromotedRules` with:
   - `safe-regex` complexity check + 50ms timeout (RT Finding 3)
   - Glob scope whitelist (RT Finding 5)
   - `status: "disabled"` filter exclusion (RT Finding 7)
6. Create new `meta_state_promote_rule` tool (operator role required, supports `preview: true`; RT Findings 1, 15)
7. Wire `applyPromotedRules` into `makeGateDecision` as post-check
8. Add `meta-state.jsonl` to bash gate PATH_WRITE_PATTERNS (RT Finding 2)
9. Write 11 new behavior tests (Tests After); run; pass
10. Run full test suite: `pnpm test`

**Updated Success Criteria:**

- [ ] Active promoted rules loaded and applied
- [ ] Regex matches commands; glob matches file paths
- [ ] Inactive / non-gate / **`disabled`** rules ignored (RT Finding 7)
- [ ] Invalid regex doesn't crash; warning logged
- [ ] **Patterns with high complexity score rejected** (RT Finding 3)
- [ ] **Globs outside scope whitelist rejected** (RT Finding 5)
- [ ] Cache works; **(mtime, size)** change triggers re-read (RT Finding 6)
- [ ] **`meta_state_promote_rule` tool requires operator role; supports `preview: true`** (RT Findings 1, 15)
- [ ] **`meta-state.jsonl` direct writes blocked by bash gate** (RT Finding 2)
- [ ] All 16 tests pass (5 before + 11 after)
- [ ] No regression in existing gate behavior
- [ ] Bash and write gate hooks invoke `applyPromotedRules`
