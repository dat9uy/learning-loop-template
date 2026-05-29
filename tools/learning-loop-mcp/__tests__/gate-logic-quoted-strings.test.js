import assert from "node:assert";
import { test } from "node:test";
import { matchConstraintPattern } from "../core/gate-logic.js";

// ─── False-positive cases (message flags) ───

await test("matchConstraintPattern: git commit -m with pnpm add inside → null", () => {
  const result = matchConstraintPattern('git commit -m "fix pnpm add issue"');
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: git commit -m with docker inside → null", () => {
  const result = matchConstraintPattern('git commit -m "test docker setup"');
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: git commit -m with sudo inside → null", () => {
  const result = matchConstraintPattern('git commit -m "fix sudo permission"');
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: gh pr create --title with npm install inside → null", () => {
  const result = matchConstraintPattern('gh pr create --title "npm install fix"');
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: git commit --message with pnpm add inside → null", () => {
  const result = matchConstraintPattern('git commit --message "fix pnpm add issue"');
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: git commit --description with docker inside → null", () => {
  const result = matchConstraintPattern('git commit --description "fix docker run"');
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: git commit --body with pnpm add inside → null", () => {
  const result = matchConstraintPattern('git commit --body "fix pnpm add issue"');
  assert.strictEqual(result, null);
});

// ─── Wrapper-command cases (must still match) ───

await test("matchConstraintPattern: bash -c with docker inside → docker", () => {
  const result = matchConstraintPattern('bash -c "docker run ubuntu"');
  assert.strictEqual(result, "docker");
});

await test("matchConstraintPattern: python -c with import docker inside → docker", () => {
  const result = matchConstraintPattern('python -c "import docker"');
  assert.strictEqual(result, "docker");
});

await test("matchConstraintPattern: bash -c with npm install inside → package-manager", () => {
  const result = matchConstraintPattern('bash -c "npm install"');
  assert.strictEqual(result, "package-manager");
});

// ─── -t collision: skipNext consumed by user@host, string still checked ───

await test("matchConstraintPattern: ssh -t user@host with npm install inside → package-manager", () => {
  const result = matchConstraintPattern('ssh -t user@host "npm install"');
  assert.strictEqual(result, "package-manager");
});

// ─── Normal constraint cases (must still match) ───

await test("matchConstraintPattern: docker run ubuntu → docker", () => {
  const result = matchConstraintPattern("docker run ubuntu");
  assert.strictEqual(result, "docker");
});

await test("matchConstraintPattern: sudo apt update → sudo", () => {
  const result = matchConstraintPattern("sudo apt update");
  assert.strictEqual(result, "sudo");
});

await test("matchConstraintPattern: npm install react → package-manager", () => {
  const result = matchConstraintPattern("npm install react");
  assert.strictEqual(result, "package-manager");
});

await test("matchConstraintPattern: pnpm add react → package-manager", () => {
  const result = matchConstraintPattern("pnpm add react");
  assert.strictEqual(result, "package-manager");
});

await test("matchConstraintPattern: ls -la → null", () => {
  const result = matchConstraintPattern("ls -la");
  assert.strictEqual(result, null);
});

// ─── Unquoted multi-word message edge case ───

await test("matchConstraintPattern: unquoted multi-word message → package-manager (expected behavior)", () => {
  const result = matchConstraintPattern("git commit -m fix pnpm add issue");
  assert.strictEqual(result, "package-manager");
});
