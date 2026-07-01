# Plan 5: Bundled Hardening — Operator Summary

**Ship date:** 2026-07-01
**Plan dir:** `plans/260701-1730-plan-5-hardening-r2-lim3-lim4/`
**Resolves:** LIM-3 (caller identity), LIM-4 (path traversal), R2 (runtime-interface ownership)

## What this ships

Three security-critical items bundled into a single PR:

1. **LIM-3 caller identity** — Ed25519 signed capability tokens replace the
   spoofable `RUNTIME_ID` env var. Each runtime signs a 60-min token; the MCP
   server verifies signature + expiry + runtime_id match before honoring any
   tool call. The token is written to `<surface>/coordination/runtime-id-token.json`
   by the SessionStart hook; the MCP server reads it from disk on each call.

2. **R2 write-gate** — per-runtime allowlist (`.loop/r2-allowlist.json`) enforces
   that each runtime can only write to its own surface + universal patterns.
   Cross-runtime writes are denied with a structured error and a gate-log
   entry. `protected_paths` are immutable for every runtime (no operator
   override in v1).

3. **LIM-4 path containment** — `core/path-containment.js` `resolveInsideRoot`
   helper replaces the `isAbsolute(s) ? s : join(root, s)` pattern at 7 audit
   sites. Symlink-aware; refuses paths outside project root with
   `path_containment: "outside_root"`. Closes the test-runner RCE vector
   (the test runner is now denied any `evidence_test` path that escapes the
   project root).

## How to verify

### LIM-3

```bash
# After opening a Claude Code / Droid / Mastra Code session:
ls -la ~/.claude/runtime-private-key.bin
# Expected: -rw------- 1 user user 32 ... (0600 perms, 32 bytes)

cat .claude/coordination/runtime-id-token.json
# Expected: valid JSON envelope with v, runtime_id, sig, etc.

node tools/learning-loop-mastra/interface/contract.js claude-code
# Expected: {ok: true, missing: [], notes: [...]}
```

### R2

```bash
# Edit `.loop/r2-allowlist.json` to add a deny pattern for a runtime.
# Try a meta_state_report call from that runtime to the denied path.
# Expected: { error: "cross_runtime_write_denied:..." }

tail -3 .claude/coordination/hooks/.loop-gate-log.jsonl
# Expected: cross_runtime_write_denied entry with hint to .loop/r2-allowlist.json
```

### LIM-4

```bash
# Try meta_state_refresh_fingerprint against an entry with /etc/passwd as evidence_code_ref.
# Expected: { error: "code_missing", path_containment: "outside_root" }
```

## How to rotate a runtime key

```bash
# 1. Delete the runtime's private key (forces regeneration on next SessionStart).
rm ~/.claude/runtime-private-key.bin

# 2. Open a new session; SessionStart regenerates and writes a fresh key + token.

# 3. Server detects fingerprint change; refreshes pubkey cache; logs rotation.
```

## Deny-edit window

Operator edits to `.loop/r2-allowlist.json` are honored on the **next MCP
server restart**, not on the next request. The deny-edit window is bounded
by MCP server restart latency (typically <2s in CI; up to 60s on long-lived
local dev). Pending denies are visible in
`.claude/coordination/hooks/.loop-gate-log.jsonl` (look for
`r2_allowlist_reloaded` rows).

Restart procedure:

```bash
# Stop the MCP server (Claude Code / Droid / Mastra Code does this on session-end).
# Edit .loop/r2-allowlist.json to remove the deny.
# Start a new session.
```

Hot-reload via a tool is deferred to a follow-up plan; until then, restart.

## Rollback

If a critical regression is found post-ship:

1. Revert the PR (`git revert <merge-commit>`).
2. Restore `core/legacy/runtime-agnostic-checklist.js` from git history.
3. Re-open LIM-3, LIM-4, R2 in meta-state; status back to `active`.

## See also

- `interface/CONTRACT.md` Reqs #4, #9, #10.
- `interface/RUNTIME_ONBOARDING.md` (updated with key gen + allowlist).
- `AGENTS.md §11` (updated with new enforcement line).
- `docs/agents/mastra-code.md` (updated with MASTRA_RESOURCE_ID advisory note).