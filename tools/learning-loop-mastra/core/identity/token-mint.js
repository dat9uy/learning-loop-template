import { signRuntimeToken, pubkeyFingerprint } from "./identity-crypto.js";

/**
 * Lexicographic-key canonical JSON serializer. Sorts keys at every depth so
 * the verifier can re-canonicalize uniformly and Ed25519 signature stays
 * deterministic across harness/server boundaries.
 *
 * Per Plan 5 §"Helper contract": canonical JSON, lex key order, no whitespace.
 */
export function canonicalJsonStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJsonStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJsonStringify(value[k])).join(",") + "}";
}

/**
 * Mint a signed runtime capability token.
 *
 * The token envelope schema (v1) is:
 *   { v: 1, runtime_id, session_id, pubkey_fingerprint, iat, exp, signature_alg: "Ed25519", sig: "<hex>" }
 *
 * `sig` is over the canonical JSON of all fields EXCEPT `sig`. The verifier
 * reconstructs the same canonical bytes (the `sig` field is omitted) and
 * runs Ed25519 verify against the cached public key.
 *
 * @param {object} opts
 * @param {import("node:crypto").KeyObject} opts.privateKey
 * @param {import("node:crypto").KeyObject} opts.publicKey
 * @param {Buffer} [opts.rawPublicKey] — pre-computed raw 32-byte public key. If absent, derived from publicKey.
 * @param {string} opts.runtimeId
 * @param {string} opts.sessionId
 * @param {number} [opts.ttlSeconds=3600]
 * @param {number} [opts.now=Math.floor(Date.now()/1000)]
 * @returns {Promise<object>} — the signed envelope (no separate base64 step).
 */
export async function mintRuntimeToken({
  privateKey,
  publicKey,
  rawPublicKey,
  runtimeId,
  sessionId,
  ttlSeconds = 3600,
  now,
}) {
  if (!runtimeId || typeof runtimeId !== "string") {
    throw new Error("runtimeId required");
  }
  if (!sessionId || typeof sessionId !== "string") {
    throw new Error("sessionId required");
  }
  const t = typeof now === "number" ? now : Math.floor(Date.now() / 1000);
  const rawPub = rawPublicKey ?? deriveRawPublicKey(publicKey);
  const fingerprint = pubkeyFingerprint(rawPub);

  const unsigned = {
    v: 1,
    runtime_id: runtimeId,
    session_id: sessionId,
    pubkey_fingerprint: fingerprint,
    iat: t,
    exp: t + ttlSeconds,
    signature_alg: "Ed25519",
  };
  const canonical = canonicalJsonStringify(unsigned);
  const sig = signRuntimeToken(canonical, privateKey);
  return { ...unsigned, sig: sig.toString("hex") };
}

/**
 * Helper: derive the raw 32-byte public key bytes from a KeyObject.
 * @param {import("node:crypto").KeyObject} publicKey
 * @returns {Buffer}
 */
function deriveRawPublicKey(publicKey) {
  const jwk = publicKey.export({ format: "jwk" });
  return Buffer.from(jwk.x, "base64url");
}
