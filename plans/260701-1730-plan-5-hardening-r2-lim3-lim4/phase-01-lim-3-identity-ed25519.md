---
phase: 1
title: "LIM-3 Identity (Ed25519)"
status: pending
priority: P1
dependencies: []
effort: "2.5d"  # Updated: Validation Session 1 - +1d for workflow step wrapping (Critical Finding 1)
---

# Phase 1: LIM-3 Identity (Ed25519)

## Overview

Replace the spoofable `process.env.RUNTIME_ID === runtimeId` check (and the additive `MASTRA_RESOURCE_ID` Plan 4 amendment) with a non-repudiable Ed25519 signed capability token. Each runtime harness generates an Ed25519 keypair on first boot, persists the private key in `<runtime-home>/runtime-private-key.bin` (0600 perms), and signs a fresh token every hour. The MCP server verifies the signature against the runtime's public key before honoring any tool call. **TDD-first**: write the failing regression test BEFORE implementing the verifier.

## Requirements

### Functional

- **F1.** Each harness (Claude Code, Droid, Mastra Code) MUST publish a signed token to `<surface>/coordination/runtime-id-token.json` on SessionStart.
- **F2.** Token schema v1: `{v:1, runtime_id, session_id, pubkey_fingerprint, iat, exp, signature_alg:"Ed25519", sig:"<hex>"}`. The signature payload is canonical JSON of all fields EXCEPT `sig` (lexicographic key order, no whitespace).
- **F3.** Token expiry is 3600s (60min) from `iat`. After expiry, the harness MUST re-sign (auto-recover; next call's verifier detects expiry + logs + denies + emits failure for SessionStart re-trigger).
- **F4.** The MCP server MUST refuse any tool call whose token is missing / has invalid Ed25519 signature / is expired / claims a different `runtime_id` than the configured `expectedRuntimeId`. **File-only transport** (red-team Finding 7): token MUST be read from `<surface>/coordination/runtime-id-token.json`. `RUNTIME_ID_TOKEN` env var is NOT supported in v1 — no harness sets it; env-first priority would defeat the contract closure from Plan 4 red-team F1.
- **F5.** The verifier MUST be wrapped into `createLoopTool` so every tool registered via the manifest inherits the gate. **Workflow gate coverage gap** (red-team Finding 1): the inline workflow `createTool` at `server.js:105-137` AND the workflow's step `execute` bodies (after `workflow.createRun().start()` at `server.js:121-126`) MUST be wrapped. Refactor option: (a) wrap step `execute` bodies in `createLoopWorkflow` factory, OR (b) deny all workflow invocations from non-allowlisted runtimes via outer wrap only + flag workflows as IN-SCOPE for Phase 1/2 R2. **Agents are OUT OF SCOPE for v1** (red-team Finding 4): `server.js:62-72` imports agents directly via `import()` without `createLoopTool`. Document agent exclusion in Phase 4 docs; defer to follow-up plan. Tool counts use programmatic `Object.keys(MANIFEST).length` (red-team Finding 10), not hardcoded 41.
- **F6.** Private keys stored at `~/.claude/runtime-private-key.bin`, `~/.factory/runtime-private-key.bin`, `~/.mastracode/runtime-private-key.bin` (raw 32-byte Ed25519 seed, mode 0600). NOT in git (explicit `.gitignore` entries per Phase 1 Step 5; red-team Finding 6). NOT readable by other runtimes.

### Non-functional

- **NF1.** Token verification adds ≤ 1ms per tool call (Ed25519 verify is ~29μs on Node 24 per Researcher A benchmark).
- **NF2.** Cold-start race: server starts BEFORE SessionStart writes the token. Verifier falls back to lazy-load from `<surface>/coordination/runtime-id-token.json` on first call; missing → `missing-token` fail mode (deny + log + recover on next SessionStart).
- **NF3.** Fail-closed semantics: ANY verify failure (false return, thrown exception, missing token, expired) → deny + log entry to `.claude/coordination/hooks/.loop-gate-log.jsonl` (or runtime equivalent).

## Architecture

### Data flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  HARNESS (Claude Code / Droid / Mastra Code)                          │
│  ────────────────────────────────────────                            │
│  1. SessionStart fires                                                │
│  2. Hook loads ~/.claude/runtime-private-key.bin (or generate)        │
│  3. Mint fresh token: {v:1, runtime_id, session_id,                   │
│     pubkey_fingerprint, iat, exp} (canonical JSON)                    │
│  4. Sign with Ed25519 → sig                                           │
│  5. Write to .claude/coordination/runtime-id-token.json (0600)        │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ reads token file on first call
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MCP SERVER (tools/learning-loop-mastra/mastra/server.js)             │
│  ──────────────────────────────────────────                           │
│  1. server.js:165 — initIdentityVerifier()                            │
│     • Lazy-loads each <surface>/coordination/runtime-id-token.json   │
│     • Caches public keys by pubkey_fingerprint                        │
│  2. createLoopTool wraps each tool's execute() with:                  │
│     • read RUNTIME_ID_TOKEN from process.env (set by transport)      │
│     • Fallback: readFileSync(<surface>/coordination/...)            │
│     • verifyRuntimeToken({tokenB64, expectedRuntimeId})               │
│  3. Refactor server.js:109-136 workflow branch to use createLoopTool  │
└──────────────────────────────────────────────────────────────────────┘
```

### Module layout

```
tools/learning-loop-mastra/core/identity/
├── identity-crypto.js          # Ed25519 sign/verify/keygen (pure)
├── runtime-key-store.js        # 0600 perms + path resolution
├── token-mint.js               # harness-side: SessionStart hook calls this
├── verify-runtime-token.js     # server-side: createLoopTool calls this
└── token-loader.js             # server startup + lazy-load fallback

tests in: tools/learning-loop-mastra/__tests__/identity/
├── identity-crypto.test.js
├── verify-runtime-token.test.js  # TDD-first (red before impl)
├── runtime-key-store.test.js
└── token-mint.test.js
```

### Verification contract

```js
// core/identity/verify-runtime-token.js
//
// INPUTS:
//   tokenB64: string (base64url-encoded JSON envelope from RUNTIME_ID_TOKEN env)
//   expectedRuntimeId: string (the runtime_id this server expects, e.g., "claude-code")
//
// OUTPUT:
//   { decision: "ok", runtime_id, pubkey_fingerprint, exp }
//   | { decision: "missing-token" | "invalid-signature" | "expired" | "runtime-mismatch", reason }
//
// PROCESS:
//   1. Parse tokenB64 → JSON envelope.
//   2. Verify envelope.v === 1 (schema gate).
//   3. Look up public key in pubkey_cache by envelope.pubkey_fingerprint.
//   4. Reconstruct canonical payload (lex sort, no sig).
//   5. crypto.verify(null, Buffer.from(canonical), publicKey, Buffer.from(sig, "hex")).
//   6. Check envelope.exp > Math.floor(Date.now() / 1000).
//   7. Check envelope.runtime_id === expectedRuntimeId.
//   8. Return decision.
```

### createLoopTool wrapping

```js
// tools/learning-loop-mastra/mastra/create-loop-tool.js (after)
import { verifyRuntimeToken } from "../core/identity/verify-runtime-token.js";

export function createLoopTool({ id, description, inputSchema, execute }) {
  const normalized = attachParityJSONSchema(normalizeInputSchema(inputSchema));
  return createTool({
    id,
    description,
    inputSchema: normalized,
    execute: async (args, context) => {
      const tokenB64 = context?.requestContext?.get?.("runtime_id_token")
                       ?? process.env.RUNTIME_ID_TOKEN;
      const expectedRuntimeId = process.env.RUNTIME_ID ?? context?.requestContext?.get?.("runtime_id");
      const decision = await verifyRuntimeToken({ tokenB64, expectedRuntimeId });
      if (decision.decision !== "ok") {
        throw new Error(`caller-identity:${decision.decision}:${decision.reason ?? "no-reason"}`);
      }
      return execute(args, context);
    },
  });
}
```

### Per-harness SessionStart hook additions

Each harness gets an additional step in its SessionStart hook (universal-script reuse):

- **Claude Code:** extend `tools/learning-loop-mastra/hooks/legacy/session-start-inject-discoverability.cjs` (already wired to `.claude/settings.json:3-15`) to call `token-mint.js` and write the token file.
- **Droid CLI:** extend `tools/learning-loop-mastra/hooks/legacy/session-start-inject-discoverability.cjs` analog (or `.factory/hooks/loop-surface-inject.cjs`) for the same behavior under `.factory/`.
- **Mastra Code:** extend the SessionStart entry in `.mastracode/hooks.json` (already wired) to invoke the same token-mint script.

The token-mint script is a single shared module invoked by all 3 harness-specific wrappers — DRY.

## Related Code Files

### Create

- `tools/learning-loop-mastra/core/identity/identity-crypto.js` (~50 LoC: Ed25519 keygen + sign + verify helpers)
- `tools/learning-loop-mastra/core/identity/runtime-key-store.js` (~40 LoC: 0600 perms + path resolution + generate-on-first-call)
- `tools/learning-loop-mastra/core/identity/token-mint.js` (~80 LoC: harness-side mint+sign+write; canonical-JSON serializer)
- `tools/learning-loop-mastra/core/identity/verify-runtime-token.js` (~120 LoC: server-side verify; canonical payload; pubkey cache lookup)
- `tools/learning-loop-mastra/core/identity/token-loader.js` (~50 LoC: server-boot lazy-load; per-surface fallback)
- `tools/learning-loop-mastra/__tests__/identity/identity-crypto.test.js` (~120 LoC: keygen shape + sign/verify round-trip + bad-key TypeError handling)
- `tools/learning-loop-mastra/__tests__/identity/verify-runtime-token.test.js` (~250 LoC: TDD-first; covers all 4 fail modes + happy path + canonicalization edge cases)
- `tools/learning-loop-mastra/__tests__/identity/runtime-key-store.test.js` (~80 LoC: 0600 perms + generate-if-missing + cross-runtime isolation)
- `tools/learning-loop-mastra/__tests__/identity/token-mint.test.js` (~100 LoC: mint + sign + write round-trip)
- `tools/learning-loop-mastra/__tests__/phase-5-hardening/gitignore-runtime-keys.test.cjs` (NEW per red-team Finding 6: lock-step test asserting `git check-ignore` excludes runtime keys)
- `tools/learning-loop-mastra/__tests__/fallowrc-dynamic-load.test.cjs` (NEW per red-team Finding 15: asserts `.fallowrc.json` `dynamicallyLoaded` includes the new `core/identity/**`, `core/r2/**`, `core/path-containment.js`)

### Modify

- `tools/learning-loop-mastra/mastra/create-loop-tool.js` (add `verifyRuntimeToken` wrap; lines 56-64)
- `tools/learning-loop-mastra/mastra/server.js` (refactor workflow branch 105-137 to use `createLoopTool`; add `initIdentityVerifier()` to startup sequence ~line 165; **TDD refactor**: must preserve existing test parity)
- `tools/learning-loop-mastra/hooks/legacy/session-start-inject-discoverability.cjs` (add token-mint call for Claude + Droid + Mastra paths)
- `tools/learning-loop-mastra/interface/contract.js` (replace lines 189-203 `checkIdentityMarker` advisory check with strict verify call; **TDD**: write negative tests first)
- `.claude/settings.local.json` (no schema change; hook stays wired)
- `.mastracode/hooks.json` (no schema change; hook stays wired)

### Delete

- None.

## Implementation Steps

### Step 1: Write failing regression tests (TDD red)

Write the 4 tests that prove the gap exists today:

1. `__tests__/identity/verify-runtime-token.test.js`:
   - Test: missing `RUNTIME_ID_TOKEN` env → verifier returns `{decision: "missing-token"}`. (RED today: today's code never checks tokens.)
   - Test: token with invalid signature → verifier returns `{decision: "invalid-signature"}`.
   - Test: expired token → verifier returns `{decision: "expired"}`.
   - Test: token claims `runtime_id: "droid"` but expected is `"claude-code"` → `{decision: "runtime-mismatch"}`.
   - Test: valid token → verifier returns `{decision: "ok"}`.

2. `__tests__/identity/integration-mcp-tool-wrapper.test.js`:
   - Test: synthetic call to `meta_state_log_change` without `RUNTIME_ID_TOKEN` → returns `{ error: "caller-identity:missing-token" }`. (RED today: tool calls succeed without any identity check.)

Run tests; both fail. Commit "Phase 1 Step 1: TDD red — identity gap regression tests added".

### Step 2: Implement Ed25519 primitives (TDD green)

- Implement `core/identity/identity-crypto.js` per Researcher A Section 1.
- Implement `core/identity/runtime-key-store.js` per Researcher A Section 3.
- Implement `core/identity/token-mint.js` per Researcher A Section 4 + canonical-JSON serializer.
- Implement `core/identity/verify-runtime-token.js` per Researcher A Section 5 + fail mode table (Section 6).
- Implement `core/identity/token-loader.js` per Researcher A Section 7.
- Re-run Step 1 tests; they pass.

### Step 3: Wrap createLoopTool (TDD green)

- Modify `tools/learning-loop-mastra/mastra/create-loop-tool.js` per the wrapping diff.
- Run the integration test from Step 1; passes.
- Run the existing `mcp-tools-list-parity.test.js` to confirm 41 tools still expose valid inputSchemas (no schema regression).

### Step 4: Refactor server.js workflow branch + wrap workflow step bodies (REVISED per Validation Session 1 D1)

- Move the inline `createTool({...})` at `tools/learning-loop-mastra/mastra/server.js:109-137` through `createLoopTool`. The workflow's `execute` body stays the same; only the wrapping factory changes.
- **NEW (Validation D1) Step 4.5: Wrap workflow step `execute` bodies** in a new `createLoopWorkflow` factory. Each step's `execute` body must go through the same identity + R2 + path-containment gate chain. This closes Critical Finding 1's bypass (workflow internals were unguarded). Implementation:
  - New module `mastra/create-loop-workflow.js` (per existing `mastra/create-loop-workflow.js` pattern); add `verifyRuntimeToken` + `checkR2Ownership` + `resolveInsideRoot` calls inside each step's `execute` body.
  - Or, if the step schema is invisible from the outer schema, extend `collectPathFields` to walk into workflow step schemas during the outer factory call (requires re-walking the workflow at registration time).
  - TDD: write failing test for a tool invocation that hits a workflow step's path-bearing input; assert the gate fires.
- Add `await initIdentityVerifier()` to startup sequence between `await initStorage()` (line 167) and `new LoopMCPServer({...})` (line 169).
- Run all 41 legacy tool tests + workflow tests + parity harness; all pass.

### Step 4.6: Add cold-start backoff + warm-up (REVISED per Validation Session 1 D2)

- In `core/identity/verify-runtime-token.js`: when decision is `missing-token`, retry up to 3 times with 100ms backoff (`setTimeout`-based; sync code; total ≤ 300ms). Each retry re-reads the token file (handles the race where SessionStart is mid-write).
- In each SessionStart hook (Claude / Droid / Mastra): after writing the token file, call `loop_describe` once (the existing MCP warm-up pattern) to confirm the MCP server is ready and the token is read. Failure to connect → log + continue (SessionStart is non-blocking per Mastra docs).
- Lock-step test: simulate "SessionStart writes token 50ms after MCP server boot"; assert first call succeeds without manual intervention.

### Step 5: Wire harness SessionStart hooks (CORRECTED per red-team Findings 7 + 9)

- **Claude Code:** extend `.claude/coordination/hooks/recurrence-check-on-start.cjs` (the Claude shim — verified `.claude/settings.json:3-15` runs this) to also call `execFileSync('node', ['tools/learning-loop-mastra/core/identity/token-mint.js', '--surface', '.claude', '--runtime-id', 'claude-code', '--key', path.join(os.homedir(), '.claude', 'runtime-private-key.bin')])`. **Array argv, NOT shell string** (red-team Finding 19; shell-injection safe).
- **Droid CLI:** extend `.factory/coordination/hooks/recurrence-check-on-start.cjs` (the Droid shim — verified `.factory/settings.json:5-9` wires this; **NOT** `.factory/hooks/loop-surface-inject.cjs` which is the discoverability script, not SessionStart). Same `execFileSync` pattern with `--surface .factory --runtime-id droid --key ~/.factory/runtime-private-key.bin`.
- **Mastra Code:** extend `tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js` (the universal hook — Mastra Code has no `.cjs` shim layer; `.mastracode/hooks.json:57-64` calls the universal directly). Same `execFileSync` pattern with `--surface .mastracode --runtime-id mastra-code --key ~/.mastracode/runtime-private-key.bin`.
- **`.gitignore` entries added** (red-team Finding 6):
  ```gitignore
  # Runtime private keys (Ed25519 seed, 0600 perms; outside project but lock in case of accidental repo-local key)
  **/runtime-private-key.bin
  **/runtime-id-token.json
  # Lock-step test asserts these are ignored
  ```
- **Lock-step test:** `tools/learning-loop-mastra/__tests__/phase-5-hardening/gitignore-runtime-keys.test.cjs` runs `git check-ignore` on each of the 3 paths and asserts return code 0 (ignored).
- Smoke test: open a Claude Code session; verify `.claude/coordination/runtime-id-token.json` exists, has 0600 perms, parses to a valid envelope. Repeat for Droid + Mastra Code.

### Step 6: Tighten interface/contract.js

- Replace `checkIdentityMarker` (lines 189-203) with a call to `verifyRuntimeToken` from the contract's runtime context.
- Update `interface/__tests__/contract.test.js` — add tests asserting the contract validator fails the existing runtimes (Claude Code, Droid, Mastra Code) when their token file is missing/expired/invalid-signed.
- Run `node tools/learning-loop-mastra/interface/contract.js claude-code` — should return `{ok: false, missing: ["identity-marker"], notes: [...]}` until the SessionStart has fired.

### Step 7: Lock regression guards

- Add `verify-runtime-token.test.js` to `run-pnpm-test-namespaced.mjs` test GLOB (new namespace: `phase-5-hardening`).
- Confirm cold-tier regression test (`cold-tier-regression.test.js`) covers the boot-time verifier initialization.

## Success Criteria

- [ ] All 4 fail-mode tests pass (missing, invalid-signature, expired, runtime-mismatch).
- [ ] Valid token → tool call succeeds; invalid/missing → tool call returns `{error: "caller-identity:<decision>"}` envelope.
- [ ] `node tools/learning-loop-mastra/interface/contract.js claude-code` returns `{ok: true}` after SessionStart fires; returns `{ok: false, missing: ["identity-marker"]}` before.
- [ ] All 41 legacy tools + 10 workflows + 3 agents inherit the gate via `createLoopTool` wrap.
- [ ] `pnpm test` passes with no regressions (all 10+ namespaces green).
- [ ] Ed25519 token verification latency: median ≤ 1ms per call (Researcher A benchmark).
- [ ] Private keys NOT in git (`.gitignore` already excludes `.claude/runtime-private-key.bin` etc.; verify after commit).

## Risk Assessment

- **R1 (HIGH):** Workflow refactor (`server.js:105-137` → `createLoopTool`) is mechanical but touches every workflow's execute path. Mitigation: TDD-first; run all workflow tests + parity harness at Step 4.
- **R2 (MED):** Canonical-JSON serializer is a known footgun (Node's `JSON.stringify` is non-deterministic for object key order; we need lex sort + no whitespace). Mitigation: pin a tiny hand-rolled canonicalizer with a unit test asserting deterministic output for nested objects.
- **R3 (MED):** Mastra Code's hook stdin JSON shape is INFERRED (Researcher A Open Question 1; `docs.mastra.ai` 404). Mitigation: file-write pattern works regardless of shape — only SessionStart firing matters. If shape drift breaks token-mint, the verifier detects via `missing-token` fail mode and surfaces a clear log.
- **R4 (MED, REVISED — red-team Finding 8):** Cross-process env propagation (`CLAUDE_ENV_FILE` → MCP stdio child) is ambiguous per docs. **File-only transport adopted in v1** (red-team Finding 7); env var support dropped; R5 re-rated from LOW to ACCEPT (red-team Finding 8 also covers cold-start race; re-rated per below).
- **R5 (MED, REVISED — red-team Finding 3 token expiry during long calls):** A tool call starting at t=0 (token fresh) running for >60min completes after expiry. Verifier checks once at entry. **Mitigation:** document the TOCTOU-vs-TOU gap (Phase 4 operator docs); for known long-running tools, re-verify `exp` at completion before committing writes (add per-tool opt-in). Default behavior: deny-on-completion if expired.
- **R6 (MED, REVISED — red-team Finding 8):** Cold-start race is a real failure mode. **Mitigation:** (a) `verifyRuntimeToken` returns `missing-token` on first call if token file not yet written; (b) `token-loader.js` uses 100ms backoff retry up to 3 attempts before permanent fail; (c) SessionStart hook fires BEFORE `agent.emit()` so the token is typically written before the first user-prompt; (d) `loop_describe` warm-up call recommended in operator docs (Phase 4).