# LIM-3 Caller-Identity Attestation — Ed25519 Design Report

**Scope:** Node 24 Ed25519 API surface; per-harness SessionStart env-var/file injection; key storage; token shape; `create-loop-tool.js` verification wrapping; fail modes; cold-start strategy.

**Constraints:** Node v24.18.0 verified on repo (`node --version`); LM-3 is the third finding (F1) in `plans/260630-2012-phase-e-plan-4-mastra-code-validation/reports/general-purpose-260630-2027-red-team-security-adversary-plan-4-review.md:21-37` deferred to Plan 5; Lim-3 must replace the spoofable `process.env.RUNTIME_ID === runtimeId` check at `tools/learning-loop-mastra/interface/contract.js:189-203` with non-repudiable attestation.

---

## Section 1: Ed25519 API surface (Node 24)

Empirically verified on Node v24.18.0. Ed25519 raw-public = **32 bytes**, raw-private = **32 bytes** (seed; KeyObject expands to 64 internally), signature = **64 bytes**. Throughput on this host: ~29μs/sign, ~1 keypair generation.

```js
// tools/learning-loop-mastra/core/identity/identity-crypto.js (proposed)
import { generateKeyPair, sign, verify, createPublicKey } from "node:crypto";
import { promisify } from "node:util";
const gkp = promisify(generateKeyPair);

export async function generateRuntimeKeypair() {
  const { publicKey, privateKey } = await gkp("ed25519");
  return {
    publicKey,
    rawPublic: publicKey.export({ format: "raw-public" }),       // 32 bytes
    rawPrivateSeed: privateKey.export({ format: "raw-private" }), // 32 bytes (seed)
  };
}

export function signToken(canonical, privateKey) {
  return sign(null, Buffer.from(canonical, "utf8"), privateKey); // 64-byte Buffer
}

export function verifyToken(canonical, publicKey, sigBuf) {
  // verify returns boolean; throws TypeError on bad key shapes, treat as fail-closed.
  return verify(null, Buffer.from(canonical, "utf8"), publicKey, sigBuf);
}
```

Verified facts:
- `crypto.sign(null, data, key)` requires null algorithm for Ed25519 (`/api/crypto.html`); passing a string throws.
- Raw-public import path: `createPublicKey({ key: buf, format: "raw-public", asymmetricKeyType: "ed25519" })` (Node docs).
- `crypto.subtle.generateKey({name:"Ed25519"}, true, ["sign","verify"])` is also supported but uses `async subtle.sign/verify` returning ArrayBuffers; the **legacy `crypto.sign/verify` API is simpler for the server-side verifier** and aligns with the existing `node:crypto` imports already used in `server.js:6`.

Trade-off: WebCrypto (`crypto.subtle`) gives `ArrayBuffer` outputs but is async; legacy `node:crypto.sign/verify` returns `Buffer`/boolean synchronously — preferable for the per-tool hot path.

---

## Section 2: Per-harness injection mechanism

All three runtimes already have a `SessionStart` hook wired. The token must reach the MCP server child process — verified mechanism differs:

- **Claude Code** (`.claude/settings.json:3-15`):
  - SessionStart hook: `node .claude/coordination/hooks/recurrence-check-on-start.cjs` (delegates to `tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js`).
  - **Env-var mechanism:** `CLAUDE_ENV_FILE` (a path) is injected into the SessionStart hook's process env. Append `export RUNTIME_ID_TOKEN=...` lines to it; the doc says vars become available in "subsequent Bash commands" but is ambiguous on whether stdio MCP children receive them.
  - **Verified-unavailable for stdio MCP:** Only `CLAUDE_PROJECT_DIR` is documented as injected into stdio MCP server child processes; `CLAUDE_ENV_FILE` persistence is **NOT documented into MCP**. Source: docs.mastra.ai reference behavior matches `code.claude.com/docs/en/hooks`.
  - **Safe alternative:** SessionStart hook **writes the token to a known file path** (e.g., `${CLAUDE_PROJECT_DIR}/.claude/coordination/runtime-id-token.json`). MCP server reads it once at startup. This is already the pattern used for discoverability at `tools/learning-loop-mastra/hooks/legacy/session-start-inject-discoverability.cjs:13-22` which writes `.claude/session-context.json` and which the server reads indirectly via loop-describe.
  - **Wire JSON shape on stdin** (verified): `{ session_id, transcript_path, cwd, hook_event_name: "SessionStart", source: "startup", model }` — `session_id` is reliable.

- **Droid CLI** (`.factory/hooks.json:1-13` + `.factory/settings.json:3-43`):
  - `SessionStart` matcher `"startup"` hooks `"$FACTORY_PROJECT_DIR"/.factory/hooks/loop-surface-inject.cjs`.
  - **No `FACTORY_ENV_FILE` equivalent documented.** Existing code reads `env.FACTORY_PROJECT_DIR` and `env?.DROID_SESSION_ID` (`.factory/hooks/loop-surface-inject.cjs:~`) — both are read-only.
  - **Same file-write pattern applies:** SessionStart writes the token to `${FACTORY_PROJECT_DIR}/.factory/coordination/runtime-id-token.json`. Pattern already established (`.factory/hooks/loop-surface-inject.cjs` shells out to MCP and writes via stdout `format_block` to model context).
  - **Wire JSON shape on stdin:** Droid follows the Claude-compatible hook shape (`{ tool_name, tool_input, hook_event_name, session_id, ... }`); `session_id` field verified by `loop-surface-inject.cjs` `input.hook_event_name === "SessionStart"` guard.

- **Mastra Code** (`.mastracode/hooks.json:40-47`):
  - `SessionStart` declarative hook: `node tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js`.
  - **Mastra Code does not document a session-level env-var-injection mechanism into MCP child processes.** Cannot verify via `docs.mastra.ai` (multi-page reference, links 404 today). **Recommendation: same file-write pattern** — SessionStart hook writes to `${cwd}/.mastracode/coordination/runtime-id-token.json`; MCP server reads at startup. cwd comes from session JSON (`{ cwd }` field, also referenced in red-team Finding 11 context at `plans/260630-2012-phase-e-plan-4-mastra-code-validation/reports/general-purpose-260630-2027-red-team-security-adversary-plan-4-review.md:239`).

**File-write is the only mechanism confirmed to work uniformly across all three runtimes.** Token file path: `<surface>/coordination/runtime-id-token.json` — `<surface>` matches each runtime's coordination dir already used by hooks.

---

## Section 3: Key storage recommendation

**Recommendation: per-runtime private key at `<runtime-home>/runtime-private-key.bin`**, a `0600`-permissioned raw 32-byte Ed25519 seed file (raw-private format). For each runtime:

- Claude Code: `~/.claude/runtime-private-key.bin` (or `${XDG_CONFIG_HOME:-$HOME/.config}/claude/runtime-private-key.bin`).
- Droid CLI: `~/.factory/runtime-private-key.bin`.
- Mastra Code: `~/.mastracode/runtime-private-key.bin` (or vendor-resolved equivalent).

**Rationale:**
1. Outside the git repo (one of the task's hard constraints; existing `.gitignore:2` shows `.env` is already excluded as a model).
2. Per-runtime isolation: Claude Code cannot read Droid's seed and vice-versa. Multiple runtimes on one machine get independent identities.
3. Persists across sessions — no per-session keygen overhead and no first-call latency penalty.
4. Node's `crypto.sign(null, data, privateKey)` accepts a `KeyObject`; `createPrivateKey({ key: buf, format: "raw-private", asymmetricKeyType: "ed25519" })` reconstructs it from the seed in <1ms (no fs stat hit per call after startup).
5. OS keychain integration is overkill for a development-tooling identity; in-memory-only forces re-handshake every session and complicates cold-start; project-local is forbidden by the "must NOT be in git" constraint and risks leaking via tarball/.env-export.

**Three alternative rejections:**
- **OS keychain (`keytar`/DPAPI/Credential Manager):** introduces a native dep per OS; the loop's existing dep surface (`@mastra/*`, `@libsql/client`, `zod`) is pure JS (verified at `tools/learning-loop-mastra/package.json`). Native deps break the universal-hook install footprint (the entire `tools/learning-loop-mastra/hooks/legacy/` tree is zero-install — `recurrence-check-on-start.cjs` only depends on `child_process`).
- **In-memory only:** forces every harness to re-handshake on every tool call, adding ~1ms × N-tool-calls per session; also defeats purpose if harness is long-lived (Claude Code sessions span hours; Droid even longer).
- **Project-local `.claude/runtime-private-key` / equivalent inside `<surface>/`:** still inside the repo tree unless explicitly gitignored; risks accidental commit; break "must NOT be readable by other runtimes" since `<surface>` dirs sit side-by-side and one runtime can `readFileSync` another runtime's key (no OS-level isolation between sibling project-local files).

---

## Section 4: Token shape

```jsonc
// Runtime-generated; server-verified. JSON-encode canonical sort order (lexicographic key order).
// Canonical form MUST be deterministic — see Section 5.
{
  "v": 1,                                              // schema version
  "runtime_id": "claude-code" | "droid" | "mastra-code",
  "session_id": "<harness-provided-uuid>",
  "pubkey_fingerprint": "<lowercase-hex sha-256 of raw public key, first 16 bytes>",
  "iat": 1719825600,                                   // unix seconds
  "exp": 1719829200,                                   // unix seconds (iat + 3600)
  "signature_alg": "Ed25519"                           // always "Ed25519" for v1
}
```

The signature payload is the canonical JSON of all fields EXCEPT the signature itself; the harness appends `"sig": "<hex>"` to the final wire form.

**Freshness window rationale — 3600s (60min):**

- Claude Code and Droid sessions routinely span 30min-2h+. A shorter window (e.g., 5min) would force the hook to re-sign on every long-form investigation.
- Rotation cost is one Ed25519 sign + one write to the token file (~0.1ms + ~3ms fsync). Cheap; could rotate every 15min with no measurable overhead.
- 60min is a deliberate middle ground: long enough that no real session triggers rotation, short enough that a stolen token's blast radius is bounded to one hour of activity after token theft.
- Server rejects expired tokens with **deny + auto-recover** (Section 6): the next tool call from the harness fails, triggering the hook to re-sign and rewrite the token file. No operator intervention.

`pubkey_fingerprint` is included so the verifier can pin to a specific keypair across re-handshakes (the harness can regenerate `RUNTIME_ID_TOKEN` every hour with the SAME keypair — only re-keying on operator-initiated rotation, which is rare). Server caches the public-key + fingerprint pair on first attestation and refuses attestations from a different fingerprint for the same `runtime_id` unless flagged as a rotation event.

---

## Section 5: Verification code path

**Plan:** wrap `createLoopTool` in `tools/learning-loop-mastra/mastra/create-loop-tool.js:56-64` so every tool registered via the manifest (currently 41 tools: `ls tools/learning-loop-mastra/tools/legacy | wc -l`) gets the same pre-execute gate. The MCP server already routes all `meta_state_*` and other gated tools through this factory at `tools/learning-loop-mastra/mastra/server.js:39-44`.

Diff shape for `create-loop-tool.js`:

```js
// add import near line 3
import { verifyRuntimeToken } from "../core/identity/verify-runtime-token.js";

export function createLoopTool({ id, description, inputSchema, execute }) {
  const normalized = attachParityJSONSchema(normalizeInputSchema(inputSchema));
  return createTool({
    id,
    description,
    inputSchema: normalized,
    execute: async (args, context) => {
      // NEW: pre-execute attestation check. Reads RUNTIME_ID_TOKEN from env (set by
      // .claude/coordination/runtime-id-token.json loader, similar pattern to .claude/session-context.json).
      const ctx = context?.requestContext ?? {};
      const env = ctx.env ?? process.env; // MCP clients may pass env via requestContext
      const tokenB64 = env.RUNTIME_ID_TOKEN;
      const decision = await verifyRuntimeToken({ id, tokenB64, expectedRuntimeId: env.RUNTIME_ID });
      if (decision.decision !== "ok") {
        throw new Error(`caller-identity:${decision.decision}:${decision.reason}`);
      }
      return execute(args, context);
    },
  });
}
```

The verification module `core/identity/verify-runtime-token.js`:

1. Parse `tokenB64` → JSON envelope.
2. Reconstruct the **canonical string** (lexicographic-key JSON of fields v..signature_alg; deterministic serializer, NOT `JSON.stringify` of an object literal).
3. Look up the public key — by `pubkey_fingerprint` against a runtime-scoped cache populated at server startup from `./<surface>/coordination/runtime-id-token.json` (cold-start fallback, see Section 7). On first-sighting, cache the fingerprint → public-key mapping.
4. `verify(null, Buffer.from(canonical), publicKey, signature)` — must return `true`; any `false` or thrown exception → "invalid-signature".
5. Check `exp > now` (unix seconds) and `runtime_id === expectedRuntimeId`.
6. Return `{ decision: "ok" }` or `{ decision, reason, log }`.

The **importable `verifyRuntimeToken()`** is also directly callable from the legacy hook adapters (`tools/learning-loop-mastra/tools/legacy/*.js`) for tools like `meta_state_report` that should refuse to accept findings via direct invocation without a valid caller-identity context — those legacy tools are already wired through `createLoopTool`, so a single wrap covers them.

**Drill-down into `createLoopTool`'s call sites:** `server.js:39` (manifest-loop branch) and the workflow branch at `server.js:105-137` (`createTool({...})` direct — currently bypasses `createLoopTool`). **The workflow branch will need a parallel `verifyRuntimeToken` call inside the inline `execute` at `server.js:109-136`** OR refactor to use `createLoopTool` (DRY win; recommended).

---

## Section 6: Fail mode table

| Cause | Surface (user/operator-visible) | Action | Log entry |
|---|---|---|---|
| Missing `RUNTIME_ID_TOKEN` (cold-start race) | Tool returns `{ error: "caller-identity:missing-token" }`; logs request_id; no operator-visible noise | Deny + auto-recover (Section 7 bootstrap) | `gate-decision-log.jsonl` entry: `{kind:"identity",decision:"missing-token",request_id,tool_id,runtime_id,reason:"token-file-not-yet-written-by-SessionStart"}` |
| Invalid signature (Ed25519 verify returns false OR throws) | Same `{ error: "caller-identity:invalid-signature" }` envelope | Deny + escalate (single failure: log + continue; persistent across calls: GATE_RESPONSE_MODE=escalate path) | Entry: `{kind:"identity",decision:"invalid-signature",request_id,tool_id,pubkey_fingerprint,reason:"verify-returned-false-or-threw"}` |
| Expired (`exp < now`) | `{ error: "caller-identity:expired" }` | Deny + auto-recover (next call's SessionStart-equivalent re-signs; or: harness-side timer refreshes token; or: bootstrap fallback reads token file) | Entry: `{kind:"identity",decision:"expired",request_id,tool_id,exp,now,delta_seconds}` |
| Mismatched `runtime_id` (e.g., session claims `claude-code` but expected `droid`) | `{ error: "caller-identity:runtime-mismatch" }` | Deny + escalate (cannot auto-recover; could be a credential substitution attack per red-team F1 context) | Entry: `{kind:"identity",decision:"runtime-mismatch",request_id,tool_id,claimed,expected}` |

All four share the same envelope: `{ error: "caller-identity:<decision>:<reason>" }`. **Auto-recover** = either the next call to the loop's `verifyRuntimeToken` succeeds (because the harness re-signed after the prior failure triggered re-handshake), OR the operator runs the same command in a fresh session. **Escalate** = the gate (in `escalate` mode per `GATE_RESPONSE_MODE` env var) emits a stderr block the operator is expected to see in the agent UI.

---

## Section 7: Cold-start strategy

**Bootstrap fallback: the loop server reads the token file at startup, NOT mid-call.** Concrete path:

1. Each harness SessionStart hook (universal `tools/learning-loop-mastra/hooks/legacy/session-start-inject-discoverability.cjs` and the `recurrence-check-on-start.cjs` shim analog for Claude/Droid) is extended to ALSO: load (or generate) the runtime's private key from `<runtime-home>/runtime-private-key.bin`, mint a fresh token, sign it, and write `runtime-id-token.json` to `<surface>/coordination/`.
2. The MCP server's `server.js:165-185` startup sequence runs **before** `await server.startStdio()`, an `initIdentityVerifier()` step that walks ALL three runtime token files (`.claude/coordination/runtime-id-token.json`, `.factory/coordination/runtime-id-token.json`, `.mastracode/coordination/runtime-id-token.json`) and populates an in-memory `pubkey_cache[surface] = { publicKey, fingerprint, runtime_id }`. Missing files → cache slot is empty; the slot is filled LAZILY on first tool-call's verify attempt (single `existsSync` + read; <5ms cold).
3. First-request-from-runtime race resolution: if `verifyRuntimeToken` reads `RUNTIME_ID_TOKEN` from `process.env` (which is what the MCP transport sets at spawn time) AND finds no token there, it tries `readFileSync('<surface>/coordination/runtime-id-token.json')` and warns. If still missing → missing-token fail mode per Section 6.
4. Operator-action recovery from missing-token: re-trigger SessionStart (e.g., `/compact` in Claude Code, restart session in Droid) which rewrites the token file. No code change required.

**Key constraint:** since `server.js` is forked via `child_process.spawn(node, [server.js])` from the harness — `node:crypto` keys are forked along with the OS file cache; the harness's private key never crosses a process boundary to the MCP server. Only the **signed token + public key** cross, via the token file.

---

## Section 8: Constraints / risks

- **Cross-process env propagation is not documented for `CLAUDE_ENV_FILE`** into stdio MCP children; the file-write pattern side-steps this entirely.
- **Mastra Code session JSON wire shape is inferred** from red-team Finding 8's commentary ("Mastra Code's hook stdin/stdout JSON shape is documented as `{session_id, cwd, hook_event_name, tool_name, tool_input}`") but not directly verified against current docs (`docs.mastra.ai` returned 404 on multiple reference URLs during research; the file-write pattern does not depend on the shape details, only on the SessionStart event firing).
- **Per-host key isolation only**: `runtime-private-key.bin` is local; a fresh checkout on a new machine triggers fresh keygen and fingerprint mismatch with any cached server state — but the server cache is rebuilt at startup, so no real issue.
- **No revocation path in v1**: a compromised token is valid until `exp`. Mitigated by short (60min) window and by fingerprint-pinning the server to one public key per `runtime_id` (key compromise requires both the seed AND fingerprint pinning to the new key).
- **`legacy-handler-adapter.js:13-26`** wraps `legacy.handler(args)` from `tools/learning-loop-mastra/tools/legacy/*.js` — the identity check happens in `createLoopTool.execute` BEFORE `adaptLegacyHandler` is called, so legacy tools inherit the gate for free.
- **`server.js:115-122`** passes `context?.mcp?.extra` into a `RequestContext`; `RUNTIME_ID_TOKEN` should be set on this extra by clients OR read from `process.env` (the MCP server's env at spawn time). Both paths must be supported.
- **Workflow tools (server.js:105-137) bypass `createLoopTool`**; must be hardened separately (recommend: extract `verifyRuntimeToken` from the inner execute) to avoid an un-gated escape hatch.
- **`createPrivateKey({ key: 32-byte-seed, format: "raw-private", asymmetricKeyType: "ed25519" })`** is the supported import path for the seed; per Node 24 docs `crypto.createPrivateKey` will internally expand to the 64-byte form. Verify empirically before final ship.

---

## Section 9: Open questions

1. **`RUNTIME_ID_TOKEN` transport: env var vs token file.** `CLAUDE_ENV_FILE` mechanism may or may not propagate to MCP stdio children (confirmed ambiguous in Claude Code docs). Should LIM-3 prefer **token file** exclusively (uniform across runtimes; eliminates ambiguity) and reserve env-var support for future-proofing? Current recommendation: file-only.
2. **Should the server's `<surface>/coordination/runtime-id-token.json` lookup be cache-warmed at startup**, or purely lazy? Startup-warming makes the first tool call's latency consistent; lazy-load keeps startup faster and avoids the server reading `RUNTIME_ID` env from an unset source on cold starts.
3. **Token rotation policy: harness-initiated or server-initiated?** Harness-initiated (current plan) is simpler but relies on the harness writing on time. A server-side check at 75% of `exp` could request re-sign via a side-channel; for v1 keep harness-only.
4. **Fingerprint cache eviction** when a key rotates (e.g., operator deletes `runtime-private-key.bin`): keep last-known fingerprint for a grace window, or hard-fail until restart? Hard-fail is safer per "verified decisions" rule; recommend hard-fail.
5. **What happens when `legacy-handler-adapter.js` is called from inside a workflow** (i.e., `server.js:109-136` workflow `execute` invokes legacy handlers)? The workflow `execute` already runs under Mastra's tool-execute path, so `verifyRuntimeToken` wrapping at the tool-create level covers it — but confirm this against `mastra/core` `@mastra/core` `0.10.0`-era behavior.
6. **Red-team Finding F1 explicitly lists LIM-3 as Plan 5 blocker**: confirm this report's scope aligns with the journal entry's expected Plan 5 ticket before adoption.
