# MCP Workflow Layer Planning — Red-Team Hardened Plan Delivered

**Date**: 2026-05-21
**Severity**: Medium
**Component**: Coordination hooks, MCP server, plan system
**Status**: Resolved

## What Happened

Brainstormed how to route artifact writes through the MCP server so they generate audit trails and trigger downstream workflow steps (e.g., re-check after a schema edit). Evaluated two approaches. Chose Approach 2: an MCP workflow layer backed by a minimal hard-blocking write hook. Drafted full plan under `plans/260521-0200-mcp-workflow-layer/`. Ran red-team review with three reviewers (Security Adversary, Assumption Destroyer, Failure Mode Analyst). Accepted and integrated 15 findings into the plan. User reviewed the revised plan and ended the session.

## The Brutal Truth

The first plan draft was softer than it should have been. We nearly shipped a design that would have allowed unrestricted writes if the MCP server ever went down or mis-reported. The catch-all block was almost removed in favor of a purely advisory path. The red team caught it, but it was a genuinely close call. The session ran long because fixing the F12 race prerequisite cascaded into updating three dependency chains in the plan. The exhaustion came from re-validating every dependency after each red-team edit, not from the edits themselves.

## Technical Details

- **Approach 2** selected over Approach 1 because it keeps the hard-blocking hook minimal while putting audit/workflow logic in the MCP server where it belongs.
- **Key revisions after red-team**:
  - Retained catch-all block in the write hook so a down MCP server defaults to deny, not allow.
  - Added stdio isolation between MCP server and the write gate to prevent hang-based bypass.
  - Added log rotation and size caps to prevent the audit log from becoming a DoS vector.
  - Added explicit command allowlist for the `record_observation` / `update_observation` MCP tools.
  - Prohibited raw prompt PII from audit logs — log only tool name, file path hash, and success/failure.
  - Fixed F12 race prerequisite: added explicit ordering constraint so the observation DB migration finishes before the hook starts referencing new tables.
  - Documented rollback procedure: if the MCP server is misconfigured, operator can drop a `.disable-mcp-workflow` marker file to revert to hook-only mode.

## What We Tried

- Drafted Approach 1 (heavier hook logic) and discarded it after reviewing complexity vs. audit quality trade-off.
- Ran parallel red-team review with 3 reviewers. One reviewer flagged a theoretical bypass via stdio back-pressure; we accepted it and added isolation.
- Attempted to remove catch-all block as an "optimization." Reverted after Security Adversary demonstrated that a 500 ms MCP timeout would silently allow a write. Lesson: never optimize away the fail-closed default.

## Root Cause Analysis

The initial draft optimistically trusted the MCP server as a reliable upstream authority. The root mistake was treating the server as a trusted component rather than a fallible dependency. The design should have started with the assumption that the server is unavailable and only relaxed constraints where explicitly justified.

## Lessons Learned

- Fail-closed defaults survive red-team; fail-open ones do not. Every relaxation must be justified, not assumed.
- Dependency races in plans (like F12) are easy to miss until someone explicitly traces execution order. Add a dedicated "prerequisite ordering" check to plan review checklist.
- Audit logs that capture raw prompts are a privacy and size liability. Decide what to log at design time, not during implementation.

## Next Steps

1. Implement phase 01 (MCP server audit endpoint + log rotation) — owner: whoever picks up this plan.
2. Add integration test for "MCP server unavailable" path to verify catch-all block behavior — owner: tester.
3. Run another red-team pass after implementation completes, before merging — owner: security reviewer.
4. Document the `.disable-mcp-workflow` rollback procedure in `docs/deployment-guide.md` — owner: docs manager.

---

**Unresolved questions**
- Should the command allowlist be a runtime config file, or baked into the hook binary?
- What is the exact log retention policy (days vs. size)? Need product/ops input.
- Rollback marker file name: `.disable-mcp-workflow` is descriptive but discoverable. Should it be less obvious to avoid accidental creation?
