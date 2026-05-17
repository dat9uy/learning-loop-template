---
phase: 2
title: "Hook Script (TDD)"
status: completed
priority: P1
effort: "2h"
dependencies: [0, 1]
---

# Phase 2: Hook Script (TDD)

## Overview

Create the PreToolUse hook script that intercepts Skill tool calls. Reads skill-registry.json, blocks registered skills, allows unregistered ones. Includes a bypass mechanism for coordinator-initiated calls to prevent infinite loops.

**Depends on Phase 0:** The hook protocol field names and Skill tool existence are verified in Phase 0 before implementation. The field names below use the verified protocol from Phase 0 findings.

## Requirements

- Functional: intercept Skill tool calls via PreToolUse hook protocol
- Functional: read skill-registry.json from project `.claude/coordination/`
- Functional: block registered skills with exit 2 + JSON message
- Functional: allow unregistered skills with exit 0
- Functional: allow all non-Skill tool calls with exit 0
- Functional: bypass mechanism for coordinator-initiated calls (prevent infinite loop)
- Non-functional: <50ms execution time (hook runs on every Skill call)
- Non-functional: no external dependencies (pure Node.js)

## Hook Protocol

**Verified in Phase 0.** Field names match existing hooks (`scout-block.cjs:84`, `privacy-block.cjs:107`):

```json
{
  "tool_name": "Skill",
  "tool_input": { "skill": "backend-development", "args": "..." }
}
```

Hook exits:
- Exit 0: allow (no output needed)
- Exit 2: block (stdout JSON with `decision: "block"` and `reason`)

## Red Team Fixes Applied

| Finding | Fix |
|---------|-----|
| #2 Infinite loop | Bypass file mechanism: coordinator writes `.claude/coordination/.bypass-next` before invoking target skill. Hook checks for this file and allows one call. |
| #4 Wrong field names | Use `tool_name` and `tool_input` (verified from existing hooks) |
| #11 Test file extension | Use `.cjs` for test files to match `"type": "module"` in package.json |
| stdin platform | Use `process.stdin` stream reader instead of `/dev/stdin` for cross-platform support |

## Related Code Files

- Create: `.claude/coordination/hooks/skill-coordination-gate.cjs`
- Create: `.claude/coordination/__tests__/skill-coordination-gate.test.cjs`

## Implementation Steps

### Step 1: Write comprehensive tests

Create `.claude/coordination/__tests__/skill-coordination-gate.test.cjs`:

**Test cases:**
1. Non-Skill tool call → exit 0 (allow)
2. Skill tool call with unregistered skill → exit 0 (allow)
3. Skill tool call with registered skill → exit 2 (block) + JSON output
4. Skill tool call when registry doesn't exist → exit 0 (allow)
5. Skill tool call when registry is malformed JSON → exit 0 (allow) + stderr warning
6. Skill tool call with empty skill name → exit 0 (allow)
7. Blocked output JSON has correct shape: `decision`, `reason`, `coordinator`, `target_skill`, `profile`
8. Multiple registered skills all get blocked
9. Bypass file exists → allow registered skill + delete bypass file
10. Bypass file does NOT exist → block registered skill (normal behavior)
11. Performance: execution under 50ms

**Test approach:**
- Mock stdin by writing JSON to a temp file, redirecting stdin
- Capture exit code and stdout/stderr
- Create temp registry files for each test case
- Create/delete bypass file for bypass tests

### Step 2: Implement hook script

Create `.claude/coordination/hooks/skill-coordination-gate.cjs`:

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function findRegistry() {
  const candidates = [
    path.join(process.cwd(), '.claude', 'coordination', 'skill-registry.json'),
    path.join(__dirname, '..', 'skill-registry.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readStdinSync() {
  // Cross-platform stdin read (no /dev/stdin dependency)
  const chunks = [];
  const fd = fs.openSync('/dev/stdin', 'r');
  const buf = Buffer.alloc(65536);
  let bytesRead;
  try {
    while ((bytesRead = fs.readSync(fd, buf)) > 0) {
      chunks.push(Buffer.from(buf.slice(0, bytesRead)));
    }
  } catch {
    // stdin closed or unavailable
  } finally {
    fs.closeSync(fd);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function main() {
  let input;
  try {
    input = JSON.parse(readStdinSync());
  } catch {
    process.exit(0);
  }

  // Use verified field names from existing hooks
  if (input.tool_name !== 'Skill') {
    process.exit(0);
  }

  const skillName = input.tool_input?.skill;
  if (!skillName || typeof skillName !== 'string') {
    process.exit(0);
  }

  const registryPath = findRegistry();
  if (!registryPath) {
    process.exit(0);
  }

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (err) {
    console.error(`skill-coordination-gate: malformed registry: ${err.message}`);
    process.exit(0);
  }

  const registered = registry.registered_skills?.[skillName];
  if (!registered) {
    process.exit(0);
  }

  // Check bypass file (coordinator-initiated call)
  const bypassPath = path.join(path.dirname(registryPath), '.bypass-next');
  if (fs.existsSync(bypassPath)) {
    try { fs.unlinkSync(bypassPath); } catch {}
    process.exit(0); // allow this one call
  }

  // Block — skill must go through coordinator
  const coordinator = registry.coordinator || 'learning-loop';
  const output = {
    decision: 'block',
    reason: `Skill "${skillName}" requires coordination. Invoke /ck:${coordinator} with target=${skillName} and your original intent.`,
    coordinator,
    target_skill: skillName,
    profile: registered.profile
  };

  console.log(JSON.stringify(output));
  process.exit(2);
}

main();
```

### Step 3: Run tests

All test cases must pass. Fix any issues.

### Step 4: Verify hook works with Claude Code

Manual test:
1. Register a test skill in skill-registry.json
2. Invoke that skill via Claude Code
3. Verify hook blocks it with the expected message
4. Create bypass file, invoke again → verify it passes through
5. Invoke an unregistered skill → verify it passes through

## Success Criteria

- [ ] All test cases pass (11 tests)
- [ ] Hook blocks registered skills with exit 2 + correct JSON
- [ ] Hook allows unregistered skills with exit 0
- [ ] Bypass mechanism works (coordinator can invoke target skills)
- [ ] Hook gracefully handles missing/malformed registry
- [ ] Hook execution time < 50ms
- [ ] No external dependencies (pure Node.js)

## TDD Notes

Tests are written FIRST (Step 1). Hook implementation is written to satisfy tests (Step 2). Tests are the specification — the hook must match them exactly.
