---
title: "MCP wire budget plan: restore + semantics-based glossary-extend"
date: 2026-08-11
summary: "Planned the finding's wire-budget fix; red-team caught a name-collision trap that forced a semantics-based Phase 2 rewrite"
---

# MCP wire budget plan: restore + semantics-based glossary-extend

Context: finding meta-260811T0805Z (MCP manifest wire budget raised 2x to 55,750). Analysis report reframed the 55 KB as a test-only boundary guard — production runs LOOP_RECORDS_VIA_CLI=1 (8 tools / 4,563 B); the budget test measures 44 tools / 55,247 B without the flag. So optimizing the wire is insurance vs a forgotten flag, not a production context win.

Plan created (ak plan, --deep --tdd): plans/260811-0914-mcp-wire-budget-restore-and-glossary-extend. Three phases: P1 restore 55,000 via ~247 B tool-desc trim; P2 structural glossary-extend; P3 re-anchor ceiling to measured wire + headroom.

Validation decisions: A-first-then-B; existing 19 glossary entries only (no cold-tier change); success = below 55,000; single PR.

Red-team (sonnet; kongming/fable inaccessible this session) returned NO-GO with a critical catch: the 19 glossary keys (id, status, affected_system, ...) are reused as FILTER params in read tools (meta_state_list's 400-B id filter desc) with divergent semantics. A name-based ref swap would delete exact-match/prefix-hint/excluded_ids hints. Also: real convertible set is ~3% of top targets (~100 B), not ~1,500 B — the ~50,110 floor assumed name+semantic alignment that doesn't hold. .describe() aliasing verified SAFE (zod 3.25.76 + 4.4.3 immutable).

Revisions applied: Phase 2 coverage rule -> semantics-based + explicit allowlist; filter fields excluded; audit-first step measures the real convertible set and sets the gate ("wire drops >= audited bytes"); Phase 1 deprioritized meta_state_list desc (dense behavioral prose); cli-context-savings-script snapshot re-snapshot made certain (not conditional); Phase 3 headroom re-sized vs realistic ~1-2 KB shrink (not ~5 KB), with a flag-if-not-tight-enough escape hatch back to the glossary-scope decision.

User chose proceed (semantics-based + audit gate) over drop/expand-glossary, then end-session-to-review. Plan consistency-gated clean; format valid; active via `ak plan use`. Not yet cooked.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
