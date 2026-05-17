---
phase: 5
title: "Document"
status: complete
priority: P2
effort: "20m"
dependencies: [4]
---

# Phase 5: Document

## Overview

Document the inbound state gate workflow: what it does, how it works, how to test it, and how to maintain it.

## Documentation Updates

### 1. Create `docs/system-architecture.md` (F13: file does not exist — create, not update)
- Add inbound gate to the constraint gate architecture section
- Document the full flow: operator → UserPromptSubmit hook → marker file → PreToolUse hook → escalation
- Document the two staleness algorithms (F2): inbound (30min threshold) vs outbound (marker-based)
- Document the phantom escalation behavior (F1): marker written before staleness check
- Document the MCP server divergence (F3): staleness check only runs when `decision === "ok"`

### 2. Create `.claude/coordination/hooks/README.md`
- Document all hooks (existing + new)
- Hook lifecycle and execution order
- Input/output formats
- How to add new hooks

### 3. Update brainstorm report
- Mark findings as implemented
- Link to test file and plan

### 4. Update CLAUDE.md
- Add note about UserPromptSubmit hook
- Document the inbound gate pattern for future reference

### 5. Document known limitations (from red-team review)
- **Data leak risk (F4):** Marker file stores raw prompt content (first 200 chars) in plaintext. Flag as risk — should store boolean or hash instead.
- **Marker TTL (F8):** Marker never expires. Operator's state-change message causes permanent escalation until observation is manually updated. Recommend adding a TTL (e.g., 2 hours).
- **False positive rate (F11):** State-change patterns are broad. "the build is broken", "the test is done" all trigger detection. Questions ending with `?` should be filtered. Document expected false positive rate and mitigation strategies.
- **Race condition (F12):** `fs.writeFileSync` is non-atomic. Partial reads during concurrent write → missed escalation. Acceptable for soft gate, but documented.
- **Multi-session isolation:** Marker file has no session ID. Multiple Claude Code sessions sharing a project directory share the same marker file. Document as known limitation.

## Implementation Steps

1. Update system-architecture.md with inbound gate section
2. Create hooks README.md
3. Update brainstorm report with implementation status
4. Update CLAUDE.md if needed

## Success Criteria

- [ ] `docs/system-architecture.md` CREATED (not updated — F13) with inbound gate section
- [ ] Architecture docs reflect both staleness algorithms (F2)
- [ ] Phantom escalation behavior documented (F1)
- [ ] Hook documentation is complete and accurate
- [ ] Brainstorm report updated with status
- [ ] All docs are consistent with actual implementation
- [ ] Known limitations documented: data leak (F4), marker TTL (F8), false positive rate (F11), race condition (F12), multi-session isolation
