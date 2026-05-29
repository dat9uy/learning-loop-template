---
date: "2026-05-29T00:00:00Z"
tags: [brainstorm, gate, pattern-matching, false-positive, quoted-strings]
---

# Pattern Matching False Positives in Quoted Strings

## Problem Statement

The bash gate's `matchConstraintPattern` function checks command strings against regex patterns without distinguishing between actual commands and text inside quoted strings. The `package-manager` pattern `\b(pip|npm|yarn|pnpm|uv)\s+(install|add|sync|bootstrap|setup)\b` matches `pnpm add` inside a `git commit -m "fix pnpm add issue"` message, causing the gate to block the commit as a package-manager command.

This is a pre-existing issue separate from the budget escalation fix (see `docs/journals/260529-budget-escalation-scoped-fix.md`). It affects all constraint patterns, not just `package-manager`.

## False Positive Risk Analysis

| Pattern | Example false positive | Risk |
|---------|------------------------|------|
| `docker` | `git commit -m "test docker setup"` | High |
| `sudo` | `git commit -m "fix sudo permission"` | High |
| `package-manager` | `git commit -m "fix pnpm add issue"` | **Hit** |
| `vendor-api` | `git commit -m "test curl api integration"` | Medium |
| `side-effect-import` | `git commit -m "refactor import vnstock_data"` | Low |

## Critical Trade-Off: False Negatives

Stripping ALL quoted strings creates false negatives for wrapper commands like `bash -c "docker run ubuntu"`, where the quoted content IS an executable command. The gate must strip only message arguments (non-executable text) while preserving executable quoted content.

## Evaluated Approaches

### Approach A: Strip All Quoted Strings

```javascript
function stripQuotedStrings(segment) {
  return segment
    .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, "")   // "..." and '...'
    .replace(/<<\w+\n[\s\S]*?\n\w+/g, "");          // <<EOF ... EOF
}
```

**Pros:** Simple, fixes all false positives.
**Cons:** False negatives for `bash -c "docker run ubuntu"`, `python -c "import docker"`, `eval "npm install"` — wrapper commands become invisible.
**Verdict:** Rejected — weakens gate for wrapper commands.

### Approach B: Strip Only Message Flags (Recommended)

```javascript
const MESSAGE_FLAGS = new Set(["-m", "--message", "--title", "-t", "--description", "--body", "-body"]);

function stripMessageFlags(segment) {
  const tokens = segment.split(/\s+/);
  const result = [];
  let skipNext = false;
  
  for (const token of tokens) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (MESSAGE_FLAGS.has(token)) {
      skipNext = true;
      continue;
    }
    result.push(token);
  }
  
  return result.join(" ");
}
```

**Pros:** Zero false negatives for wrapper commands, targeted fix, generic for any tool that uses message flags.
**Cons:** Requires maintaining a flag list; may miss new message flags (e.g., `gh pr create --title "..."`).
**Verdict:** Recommended — preserves safety while fixing the false positive.

### Approach C: Whitelist Safe Commands

```javascript
const SAFE_COMMANDS = new Set(["git", "echo", "printf", "logger", "wall"]);
```

**Pros:** Conservative, no risk of false negatives.
**Cons:** Requires knowing which commands are safe, may miss new cases (e.g., `gh pr create --title "npm install fix"`).
**Verdict:** Not recommended — too brittle, requires continuous updates.

## Final Recommendation: Approach B

Strip only message flags (`-m`, `--message`, `--title`, `--description`, etc.) from command segments before pattern matching. This preserves the gate's ability to catch wrapper commands (`bash -c "docker run"`) while removing the false positive for commands that embed non-executable text in messages.

### Implementation Design

```javascript
const MESSAGE_FLAGS = new Set(["-m", "--message", "--title", "-t", "--description", "--body"]);

function stripMessageFlags(segment) {
  const tokens = segment.split(/\s+/);
  const result = [];
  let skipNext = false;
  
  for (const token of tokens) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (MESSAGE_FLAGS.has(token)) {
      skipNext = true;
      continue;
    }
    result.push(token);
  }
  
  return result.join(" ");
}

export function matchConstraintPattern(command) {
  if (!command || typeof command !== "string") return null;

  const segments = command.split(SEGMENT_SEPARATORS);
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const stripped = stripMessageFlags(trimmed);
    for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
      if (pattern.test(stripped)) return type;
    }
  }
  return null;
}
```

### Test Cases

```javascript
// Should NOT match (false positives)
assert.strictEqual(matchConstraintPattern('git commit -m "fix pnpm add issue"'), null);
assert.strictEqual(matchConstraintPattern('git commit -m "test docker setup"'), null);
assert.strictEqual(matchConstraintPattern('git commit -m "fix sudo permission"'), null);
assert.strictEqual(matchConstraintPattern('gh pr create --title "npm install fix"'), null);

// SHOULD still match (wrapper commands)
assert.strictEqual(matchConstraintPattern('bash -c "docker run ubuntu"'), "docker");
assert.strictEqual(matchConstraintPattern('python -c "import docker"'), "docker");
assert.strictEqual(matchConstraintPattern('bash -c "npm install"'), "package-manager");
```

## Implementation Plan

### Phase 1: Add `stripMessageFlags` to `gate-logic.js`
- Add `MESSAGE_FLAGS` constant
- Add `stripMessageFlags` function
- Modify `matchConstraintPattern` to call `stripMessageFlags` before pattern matching

### Phase 2: Add tests
- Add test file: `__tests__/gate-logic-quoted-strings.test.js`
- Cover false positive cases (git commit, gh pr create, etc.)
- Cover wrapper command cases (bash -c, python -c, etc.)
- Ensure no regression on existing tests

### Phase 3: Update documentation
- Add note to `docs/observation-vs-meta-state.md` or `docs/charter.md` about quote stripping

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| New message flag not in list | Medium | Review periodically; add flags as discovered |
| Flag collision (e.g., `-t` for timeout vs title) | Low | Test with real commands; flag list is conservative |
| Wrapper command regression | Low | Test cases explicitly cover `bash -c`, `python -c` |

## Success Metrics

- `git commit -m "fix pnpm add issue"` → `ok` (not blocked)
- `bash -c "docker run ubuntu"` → `block` (still matches docker)
- `python -c "import docker"` → `block` (still matches docker)
- All 259+ tests pass
- No new false negatives introduced

## Next Steps

1. Implement `stripMessageFlags` in `gate-logic.js`
2. Add `__tests__/gate-logic-quoted-strings.test.js`
3. Run full test suite to verify no regressions
4. Update documentation

## Unresolved Questions

- Should the flag list include `-c` for `bash -c`? No — `bash -c` is executable, should NOT be stripped.
- What about `echo "npm install"`? `echo` is not a message flag, so the quotes are stripped. This is correct — `echo` is not a real command.
- What about heredoc (`<<EOF`)? Out of scope for this round — heredoc is a separate issue.
