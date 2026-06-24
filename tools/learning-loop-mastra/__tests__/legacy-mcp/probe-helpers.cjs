// Probe helpers for cold-session discoverability tests.
//
// Extracted as importable pure functions that accept a `root` parameter so
// regression-guard tests can run against a tempRoot without polluting the
// real project's meta-state.jsonl.
//
// Conditional-emission invariant (enforced by regression-guard tests):
//   - Pass path (gapOpen=false, no prior finding): writes NOTHING.
//   - Pass path (gapOpen=false, prior active finding): resolves it (1 write).
//   - Fail path (gapOpen=true): dedup-write via tryClaimSessionId (1 write on
//     first novel failure; 0 writes on duplicate).

const { tryClaimSessionId, readRegistry, updateEntry, generateId } = require("../../core/legacy/meta-state");

async function defaultWriteFn(root, id, patch) {
  return updateEntry(root, id, patch);
}

/**
 * L1 probe: checks CLI catalog layer. Writes a finding only on novel failure.
 *
 * @param {string} root — project root containing meta-state.jsonl
 * @param {object} opts
 * @param {string} opts.sessionId — idempotency key
 * @param {string} opts.runtime — CLI name (droid, claude, etc.)
 * @param {boolean} opts.gapOpen — true if the L1 gap is open
 * @param {function} [opts.writeFn] — async (root, id, patch) => result; defaults to updateEntry
 * @param {function} [opts.entryBuilder] — () => entry object for tryClaimSessionId; uses default if omitted
 * @returns {Promise<{claimed: boolean, id?: string, existing?: object} | undefined>}
 */
async function probeL1(root, { sessionId, runtime, gapOpen, writeFn = defaultWriteFn, entryBuilder } = {}) {
  if (!gapOpen) {
    // Gap-close branch: resolve any active finding for this layer.
    // On a passing run with no prior finding, this is a no-op (no write).
    const existing = readRegistry(root).find((e) =>
      e.entry_kind === "finding"
      && e.session_id === sessionId
      && e.subtype === "mcp-client-loading"
      && (e.status === "active" || e.status === "reported")
      && e.description.includes(`runtime: ${runtime}`)
      && e.description.includes("layer: L1"),
    );
    if (existing) {
      await writeFn(root, existing.id, {
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: "auto-cold-session-test",
        resolution: "gap closed in subsequent run; conditional emission",
        _expected_version: existing.version ?? 0,
      });
    }
    return;
  }

  // Gap-open branch: atomic dedup via tryClaimSessionId.
  const builder = entryBuilder ?? (() => {
    const id = generateId("mcp-client-loading-missing");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    return {
      id,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description:
        `${runtime} exec --list-tools does not expose mcp__learning_loop_mcp__* tools in this environment. ` +
        "The MCP server is reachable (server-side probe works), " +
        `but the ${runtime} agent runtime is not loading project-local MCP servers into its tool list. ` +
        "This is the client-side gap described in meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list. " +
        "Detected by cold-session-discoverability.test.cjs#agent runtime exposes mcp__learning_loop_mcp__* tools to the AI (L2 probe). " +
        `runtime: ${runtime}; layer: L1;`,
      evidence_code_ref: "tools/learning-loop-mcp/server.js",
      session_id: sessionId,
      status: "reported",
      auto_resolve: null,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      acked_at: null,
      resolved_at: null,
      resolved_by: null,
      version: 0,
    };
  });

  return tryClaimSessionId(root, {
    sessionId,
    subtype: "mcp-client-loading",
    runtime,
    layer: "L1",
  }, builder);
}

/**
 * L2 probe: checks agent-runtime layer. Writes a finding only on novel failure.
 *
 * @param {string} root — project root containing meta-state.jsonl
 * @param {object} opts
 * @param {string} opts.sessionId — idempotency key
 * @param {string} opts.runtime — CLI name (droid, claude, etc.)
 * @param {boolean} opts.gapOpen — true if the L2 gap is open
 * @param {function} [opts.writeFn] — async (root, id, patch) => result; defaults to updateEntry
 * @param {function} [opts.entryBuilder] — () => entry object for tryClaimSessionId; uses default if omitted
 * @returns {Promise<{claimed: boolean, id?: string, existing?: object} | undefined>}
 */
async function probeL2(root, { sessionId, runtime, gapOpen, writeFn = defaultWriteFn, entryBuilder } = {}) {
  if (!gapOpen) {
    // Gap-close branch: resolve any active finding for this layer.
    // On a passing run with no prior finding, this is a no-op (no write).
    const existing = readRegistry(root).find((e) =>
      e.entry_kind === "finding"
      && e.session_id === sessionId
      && e.subtype === "mcp-client-loading"
      && (e.status === "active" || e.status === "reported")
      && e.description.includes(`runtime: ${runtime}`)
      && e.description.includes("layer: L2"),
    );
    if (existing) {
      await writeFn(root, existing.id, {
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: "auto-cold-session-test-l2",
        resolution: "gap closed in subsequent run; conditional emission",
        _expected_version: existing.version ?? 0,
      });
    }
    return;
  }

  // Gap-open branch: atomic dedup via tryClaimSessionId.
  const builder = entryBuilder ?? (() => {
    const id = generateId("mcp-client-loading-missing");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    return {
      id,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description:
        `L2 probe: ${runtime} exec cannot call mcp__learning_loop_mcp__loop_describe in this environment. ` +
        `The MCP server is reachable and the ${runtime} CLI catalog may show the tools (see test 3 / L1 probe), ` +
        `but the ${runtime} agent runtime is not surfacing MCP tools to the AI's callable list. ` +
        "This is the agent-runtime layer gap described in meta-260608T1410Z-finding-meta-260606t0443z-mcp-tools-not-loaded-into-agent-to. " +
        "Detected by cold-session-discoverability.test.cjs#agent runtime exposes mcp__learning_loop_mcp__* tools to the AI (L2 probe). " +
        `runtime: ${runtime}; layer: L2;`,
      evidence_code_ref: "tools/learning-loop-mcp/server.js",
      session_id: sessionId,
      status: "reported",
      auto_resolve: null,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      acked_at: null,
      resolved_at: null,
      resolved_by: null,
      version: 0,
    };
  });

  return tryClaimSessionId(root, {
    sessionId,
    subtype: "mcp-client-loading",
    runtime,
    layer: "L2",
  }, builder);
}

module.exports = { probeL1, probeL2 };
