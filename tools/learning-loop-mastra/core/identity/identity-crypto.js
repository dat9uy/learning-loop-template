import { generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from "node:crypto";

/**
 * Ed25519 primitives — pure (no I/O).
 *
 * Keypairs are returned as raw 32-byte private seeds and 32-byte public keys.
 * The runtime key store persists the raw seed; this module imports it back
 * into a KeyObject for sign/verify via `crypto.createPrivateKey({ key: seedBuffer, format: "der", type: "pkcs8" })`
 * is overkill — Node's Ed25519 supports direct 32-byte seeds via KeyObject.
 */

/**
 * Generate a fresh Ed25519 keypair. Returns raw 32-byte seed + public key.
 * @returns {{ privateKey: import("node:crypto").KeyObject, publicKey: import("node:crypto").KeyObject, rawPrivateSeed: Buffer, rawPublicKey: Buffer }}
 */
export function generateRuntimeKeypair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  // For Ed25519, Node's JWK export always populates `.d` with the raw seed
  // (base64url-encoded). The non-JWK fallback is intentionally absent —
  // round-tripping the seed is the only supported path for runtime identity.
  const jwkPriv = privateKey.export({ format: "jwk", type: "pkcs8" });
  const rawPrivateSeed = Buffer.from(jwkPriv.d, "base64url");
  // Public key as raw 32 bytes: use export jwk x.
  const jwkPub = publicKey.export({ format: "jwk" });
  const rawPublicKey = Buffer.from(jwkPub.x, "base64url");
  return { privateKey, publicKey, rawPrivateSeed, rawPublicKey };
}

/**
 * Reconstruct a KeyObject private key from the raw 32-byte seed.
 * @param {Buffer} rawPrivateSeed
 * @returns {import("node:crypto").KeyObject}
 */
export function importPrivateKeyFromSeed(rawPrivateSeed) {
  const seed = Buffer.isBuffer(rawPrivateSeed) ? rawPrivateSeed : Buffer.from(rawPrivateSeed);
  if (seed.length !== 32) {
    throw new Error(`Ed25519 seed must be 32 bytes; got ${seed.length}`);
  }
  // Construct DER-encoded PKCS8 private key from the 32-byte seed.
  // OpenSSL prefix for Ed25519 PKCS8:
  //   30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20 <32-byte seed>
  // Then wrap as PEM for crypto.createPrivateKey.
  const PKCS8_ED25519_PREFIX = Buffer.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  const der = Buffer.concat([PKCS8_ED25519_PREFIX, seed]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.toString("base64")}\n-----END PRIVATE KEY-----`;
  return createPrivateKey(pem);
}

/**
 * Reconstruct a KeyObject public key from raw 32 bytes.
 * @param {Buffer} rawPublicKey
 * @returns {import("node:crypto").KeyObject}
 */
export function importPublicKeyFromRaw(rawPublicKey) {
  const pkcs8Prefix = Buffer.from([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
    0x70, 0x03, 0x21, 0x00,
  ]);
  const der = Buffer.concat([pkcs8Prefix, rawPublicKey]);
  const pem = `-----BEGIN PUBLIC KEY-----\n${der.toString("base64")}\n-----END PUBLIC KEY-----`;
  return createPublicKey(pem);
}

/**
 * Sign canonical bytes with a private key.
 * @param {Buffer|string} data
 * @param {import("node:crypto").KeyObject} privateKey
 * @returns {Buffer} — 64-byte Ed25519 signature.
 */
export function signRuntimeToken(data, privateKey) {
  return sign(null, Buffer.from(data), privateKey);
}

/**
 * Verify a signature against canonical bytes + public key.
 * @param {Buffer|string} data
 * @param {Buffer} signature
 * @param {import("node:crypto").KeyObject} publicKey
 * @returns {boolean}
 */
export function verifyRuntimeTokenSignature(data, signature, publicKey) {
  return verify(null, Buffer.from(data), publicKey, signature);
}

/**
 * Compute the SHA-256 fingerprint of a public key (hex).
 * Used as the cache key for the verifier.
 * @param {Buffer} rawPublicKey
 * @returns {string} — sha256:<hex>
 */
import { createHash } from "node:crypto";
export function pubkeyFingerprint(rawPublicKey) {
  const hex = createHash("sha256").update(rawPublicKey).digest("hex");
  return `sha256:${hex}`;
}
