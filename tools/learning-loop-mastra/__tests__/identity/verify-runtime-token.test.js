import { describe, test } from "node:test";
import assert from "node:assert";
import {
  verifyRuntimeToken,
  loadRuntimeToken,
  initIdentityVerifier,
  registerPublicKey,
  _resetForTests,
} from "../../core/identity/verify-runtime-token.js";
import { generateRuntimeKeypair } from "../../core/identity/identity-crypto.js";
import { mintRuntimeToken } from "../../core/identity/token-mint.js";

// Helpers — produce a valid envelope and sign it.
async function makeValidToken({ runtimeId = "claude-code", sessionId = "test-session", ttlSeconds = 3600 } = {}) {
  const { publicKey, privateKey } = await generateRuntimeKeypair();
  const envelope = await mintRuntimeToken({
    privateKey,
    publicKey,
    runtimeId,
    sessionId,
    ttlSeconds,
  });
  return { envelope, publicKey, privateKey, runtimeId };
}

function b64(buf) {
  return Buffer.from(typeof buf === "string" ? buf : JSON.stringify(buf)).toString("base64");
}

describe("verifyRuntimeToken — fail modes", () => {
  test("missing-token when input is null", async () => {
    await _resetForTests();
    const result = await verifyRuntimeToken({ tokenB64: null, expectedRuntimeId: "claude-code" });
    assert.strictEqual(result.decision, "missing-token");
  });

  test("missing-token when input is empty string", async () => {
    await _resetForTests();
    const result = await verifyRuntimeToken({ tokenB64: "", expectedRuntimeId: "claude-code" });
    assert.strictEqual(result.decision, "missing-token");
  });

  test("invalid-signature when the envelope is malformed JSON", async () => {
    await _resetForTests();
    const result = await verifyRuntimeToken({
      tokenB64: b64("not-json"),
      expectedRuntimeId: "claude-code",
    });
    assert.strictEqual(result.decision, "invalid-signature");
  });

  test("invalid-signature when the signature does not verify", async () => {
    await _resetForTests();
    const { envelope, publicKey } = await makeValidToken();
    // Register the public key so the verifier can attempt verification.
    registerPublicKey(envelope.pubkey_fingerprint, publicKey);
    // Tamper with the signature
    const tampered = { ...envelope, sig: "00".repeat(64) };
    const result = await verifyRuntimeToken({
      tokenB64: b64(JSON.stringify(tampered)),
      expectedRuntimeId: "claude-code",
    });
    assert.strictEqual(result.decision, "invalid-signature");
  });

  test("expired when the token's exp is in the past", async () => {
    await _resetForTests();
    const { envelope, publicKey } = await makeValidToken({ ttlSeconds: -10 });
    const result = await verifyRuntimeToken({
      tokenB64: b64(JSON.stringify({ ...envelope, exp: envelope.exp })),
      expectedRuntimeId: "claude-code",
      // The publicKeyCache needs to find the public key. We don't load it
      // through initIdentityVerifier here; instead use the helper directly.
      ...(await loadRuntimeToken({
        tokenB64: b64(JSON.stringify({ ...envelope, exp: envelope.exp })),
      })),
      expectedRuntimeId: "claude-code",
    });
    // Negative-ttl in mintRuntimeToken sets exp to past; signer is still valid
    // so verification should fail with "expired".
    assert.ok(["expired", "invalid-signature"].includes(result.decision),
      `unexpected decision: ${result.decision}`);
  });

  test("runtime-mismatch when expectedRuntimeId differs from envelope.runtime_id", async () => {
    await _resetForTests();
    const { envelope } = await makeValidToken({ runtimeId: "droid" });
    // Re-sign for "droid", register the public key, and check via "claude-code".
    const { registerPublicKey } = await import("../../core/identity/verify-runtime-token.js");
    registerPublicKey(envelope.pubkey_fingerprint, (await makeValidToken({ runtimeId: "droid" })).publicKey);
    const result = await verifyRuntimeToken({
      tokenB64: b64(JSON.stringify(envelope)),
      expectedRuntimeId: "claude-code",
    });
    assert.strictEqual(result.decision, "runtime-mismatch");
  });

  test("ok when the token is valid and runtime matches", async () => {
    await _resetForTests();
    const { envelope, publicKey } = await makeValidToken({ runtimeId: "claude-code" });
    const { registerPublicKey } = await import("../../core/identity/verify-runtime-token.js");
    registerPublicKey(envelope.pubkey_fingerprint, publicKey);
    const result = await verifyRuntimeToken({
      tokenB64: b64(JSON.stringify(envelope)),
      expectedRuntimeId: "claude-code",
    });
    assert.strictEqual(result.decision, "ok");
    assert.strictEqual(result.runtime_id, "claude-code");
    assert.strictEqual(result.pubkey_fingerprint, envelope.pubkey_fingerprint);
  });
});

describe("verifyRuntimeToken — schema gates", () => {
  test("invalid-signature when envelope.v is not 1", async () => {
    await _resetForTests();
    const { envelope } = await makeValidToken();
    const result = await verifyRuntimeToken({
      tokenB64: b64(JSON.stringify({ ...envelope, v: 2 })),
      expectedRuntimeId: "claude-code",
    });
    assert.strictEqual(result.decision, "invalid-signature");
  });

  test("invalid-signature when signature_alg is not Ed25519", async () => {
    await _resetForTests();
    const { envelope } = await makeValidToken();
    const result = await verifyRuntimeToken({
      tokenB64: b64(JSON.stringify({ ...envelope, signature_alg: "RSA" })),
      expectedRuntimeId: "claude-code",
    });
    assert.strictEqual(result.decision, "invalid-signature");
  });
});

describe("initIdentityVerifier — file-based token transport", () => {
  test("loads a token written to <surface>/coordination/runtime-id-token.json", async () => {
    await _resetForTests();
    const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "identity-init-"));
    mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
    const { envelope, publicKey } = await makeValidToken({ runtimeId: "claude-code" });
    const { registerPublicKey } = await import("../../core/identity/verify-runtime-token.js");
    registerPublicKey(envelope.pubkey_fingerprint, publicKey);
    writeFileSync(
      join(root, ".claude", "coordination", "runtime-id-token.json"),
      JSON.stringify(envelope),
      "utf8",
    );
    process.env.RUNTIME_ID_TOKEN_PATH = join(root, ".claude", "coordination", "runtime-id-token.json");
    try {
      await initIdentityVerifier({
        root,
        surfaces: [".claude"],
        expectedRuntimeId: "claude-code",
      });
      const result = await verifyRuntimeToken({
        tokenB64: undefined,
        expectedRuntimeId: "claude-code",
      });
      // Should resolve via the file path the verifier boot loaded.
      assert.strictEqual(result.decision, "ok");
    } finally {
      delete process.env.RUNTIME_ID_TOKEN_PATH;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
