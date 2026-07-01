import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "./token-mint.js";
import { verifyRuntimeTokenSignature, importPublicKeyFromRaw } from "./identity-crypto.js";

/**
 * LIM-3 runtime-identity verifier (Ed25519).
 *
 * Inputs: a base64-encoded JSON envelope OR an explicit envelope object.
 * Outputs: a decision object with `decision` (one of "ok" | "missing-token"
 * | "invalid-signature" | "expired" | "runtime-mismatch") and the parsed
 * envelope (for downstream R2 gate).
 *
 * File-only transport: when `tokenB64` is null/undefined, the verifier
 * reads from <root>/<surface>/coordination/runtime-id-token.json (configured
 * via `initIdentityVerifier`).
 */

const _pubkeyCache = new Map(); // fingerprint → KeyObject

let _bootConfig = null; // { root, surfaces, expectedRuntimeId }

/**
 * Test-only: clear all in-memory state.
 */
export async function _resetForTests() {
  _pubkeyCache.clear();
  _bootConfig = null;
}

/**
 * Register a public key (KeyObject) in the verifier cache.
 * @param {string} fingerprint — `pubkey_fingerprint` from the envelope.
 * @param {import("node:crypto").KeyObject} publicKey
 */
export function registerPublicKey(fingerprint, publicKey) {
  _pubkeyCache.set(fingerprint, publicKey);
}

/**
 * Boot the verifier: pin the project root, expected runtime id, and the
 * surfaces whose coordination directories should be searched for the token
 * file. Triggers lazy-load of any pre-existing token.
 *
 * @param {object} opts
 * @param {string} opts.root
 * @param {string[]} opts.surfaces
 * @param {string} opts.expectedRuntimeId
 */
export async function initIdentityVerifier({ root, surfaces, expectedRuntimeId }) {
  _bootConfig = { root, surfaces, expectedRuntimeId };
  // Warm the cache: scan for any pre-existing token file and register its
  // embedded public key. The file is reused for the entire process lifetime;
  // rotation (mint of a new envelope) updates the file path's mtime and the
  // token-loader picks it up on the next call.
  for (const surface of surfaces) {
    const path = join(root, surface, "coordination", "runtime-id-token.json");
    if (!existsSync(path)) continue;
    const envelope = await loadRuntimeToken({ tokenFilePath: path });
    if (envelope) {
      // Public keys embedded as raw bytes are not currently in the envelope
      // (only fingerprint). The orchestrator MUST register via
      // registerPublicKey after SessionStart hooks mint a fresh token.
    }
  }
}

/**
 * Load the token envelope from an explicit file path or from the boot-pinned
 * surfaces. Returns the parsed envelope or null.
 *
 * @param {object} [opts]
 * @param {string} [opts.tokenFilePath]
 * @param {string} [opts.tokenB64]
 * @returns {Promise<object|null>}
 */
export async function loadRuntimeToken({ tokenFilePath, tokenB64 } = {}) {
  if (typeof tokenB64 === "string" && tokenB64.length > 0) {
    return decodeEnvelope(tokenB64);
  }
  const candidates = [];
  if (typeof tokenFilePath === "string") candidates.push(tokenFilePath);
  if (process.env.RUNTIME_ID_TOKEN_PATH) candidates.push(process.env.RUNTIME_ID_TOKEN_PATH);
  if (_bootConfig) {
    for (const surface of _bootConfig.surfaces) {
      candidates.push(
        join(_bootConfig.root, surface, "coordination", "runtime-id-token.json")
      );
    }
  }
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    let raw;
    try {
      raw = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    const envelope = parseEnvelope(raw);
    if (envelope) return envelope;
  }
  return null;
}

/**
 * Main verifier entrypoint.
 *
 * Cold-start backoff (per plan Phase 1 R6/D2): up to 3 retries with 100ms
 * backoff when the token file is not yet present (race against SessionStart).
 *
 * @param {object} opts
 * @param {string} [opts.tokenB64] — base64 envelope (set by transport).
 * @param {string} [opts.expectedRuntimeId] — overrides bootConfig default.
 * @param {object} [opts.envelope] — pre-parsed envelope (skips base64 step).
 * @returns {Promise<object>} — decision object.
 */
// fallow-ignore-next-line complexity
export async function verifyRuntimeToken({ tokenB64, expectedRuntimeId, envelope: providedEnvelope } = {}) {
  const expId = expectedRuntimeId ?? _bootConfig?.expectedRuntimeId ?? process.env.RUNTIME_ID ?? null;
  const MAX_RETRIES = 3;
  const BACKOFF_MS = 100;

  let envelope = providedEnvelope ?? null;

  // Case 1: explicit base64 envelope provided — that source is authoritative;
  // a malformed envelope is an "invalid-signature" decision (transport present
  // but content bad), NOT a "missing-token" miss.
  if (!envelope && typeof tokenB64 === "string" && tokenB64.length > 0) {
    const decoded = decodeEnvelope(tokenB64);
    if (!decoded) {
      return { decision: "invalid-signature", reason: "envelope is not valid JSON" };
    }
    envelope = decoded;
  }

  // Case 2: no explicit envelope — fall back to file-based transport with
  // cold-start backoff retry.
  if (!envelope) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      envelope = await loadRuntimeToken();
      if (envelope) break;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BACKOFF_MS);
      }
    }
  }

  if (!envelope) {
    return { decision: "missing-token", reason: "no envelope after retries" };
  }

  // Schema gates
  if (envelope.v !== 1) {
    return { decision: "invalid-signature", reason: "unsupported envelope version" };
  }
  if (envelope.signature_alg !== "Ed25519") {
    return { decision: "invalid-signature", reason: "unsupported signature algorithm" };
  }

  // Runtime id match
  if (expId !== null && envelope.runtime_id !== expId) {
    return {
      decision: "runtime-mismatch",
      reason: `envelope claims ${envelope.runtime_id}; expected ${expId}`,
      envelope_runtime_id: envelope.runtime_id,
      expected_runtime_id: expId,
    };
  }

  // Expiry
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof envelope.exp !== "number" || envelope.exp <= nowSec) {
    return {
      decision: "expired",
      reason: `token expired (exp=${envelope.exp}, now=${nowSec})`,
      exp: envelope.exp,
      now: nowSec,
    };
  }

  // Signature verification
  const { sig, ...rest } = envelope;
  if (typeof sig !== "string") {
    return { decision: "invalid-signature", reason: "missing sig field" };
  }
  const canonical = canonicalJsonStringify(rest);
  const sigBuf = Buffer.from(sig, "hex");
  if (sigBuf.length === 0 || sigBuf.length !== 64) {
    return { decision: "invalid-signature", reason: "signature is not 64 bytes" };
  }
  const pub = _pubkeyCache.get(envelope.pubkey_fingerprint);
  if (!pub) {
    return {
      decision: "missing-token",
      reason: "public key not cached; orchestrator must register after mint",
    };
  }
  let valid = false;
  try {
    valid = verifyRuntimeTokenSignature(canonical, sigBuf, pub);
  } catch (err) {
    return { decision: "invalid-signature", reason: err.message };
  }
  if (!valid) {
    return { decision: "invalid-signature", reason: "Ed25519 verify failed" };
  }

  return {
    decision: "ok",
    runtime_id: envelope.runtime_id,
    pubkey_fingerprint: envelope.pubkey_fingerprint,
    exp: envelope.exp,
  };
}

function decodeEnvelope(b64) {
  let raw;
  try {
    raw = Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return null;
  }
  return parseEnvelope(raw);
}

function parseEnvelope(raw) {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return obj;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
