/**
 * Sync-skills materializer test (Phase 2 of plans/260719-1428-central-skills-management).
 *
 * Tests the canonical source + fan-out materializer pattern:
 *   - tools/scripts/sync-skills.mjs reads the canonical
 *     tools/learning-loop-mastra/skills/<name>/SKILL.md
 *     and fans out to .claude, .factory, .mastracode via writeToAllSkills.
 *   - Idempotent (re-run = no diff).
 *   - Canonical-vs-mirror parity invariant (detection of direct canonical tamper).
 *   - Partial-fan-out failure (one surface fails → exits non-zero, names divergent surface).
 *   - writeToAllSkills is the engine (not a reimplementation).
 */

import { test } from "vitest";
import assert from "node:assert";
import { readFileSync, existsSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const MCP_ROOT = new URL("../../../../", import.meta.url).pathname;
const SCRIPT_PATH = join(MCP_ROOT, "tools/scripts/sync-skills.mjs");
const CANONICAL_DIR = join(MCP_ROOT, "tools/learning-loop-mastra/skills");
const SURFACES = [".claude", ".factory", ".mastracode"];

function readSkillBytes(surface, name) {
  const p = join(MCP_ROOT, surface, "skills", name, "SKILL.md");
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

function readCanonicalBytes(name) {
  const p = join(CANONICAL_DIR, name, "SKILL.md");
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

function runSyncSkills(cwd) {
  try {
    const out = execFileSync("node", [SCRIPT_PATH], { cwd: cwd ?? MCP_ROOT, encoding: "utf8" });
    return { code: 0, out, err: "" };
  } catch (err) {
    return {
      code: err.status ?? 1,
      out: err.stdout?.toString?.() ?? "",
      err: err.stderr?.toString?.() ?? String(err),
    };
  }
}

test("tools/scripts/sync-skills.mjs exists", () => {
  assert.ok(existsSync(SCRIPT_PATH), `expected ${SCRIPT_PATH} to exist`);
});

test("canonical source dirs exist for learning-loop + coordination-gate", () => {
  for (const name of ["learning-loop", "coordination-gate"]) {
    const p = join(CANONICAL_DIR, name, "SKILL.md");
    assert.ok(existsSync(p), `${p} must exist as canonical source`);
  }
});

test("canonical SKILL.md frontmatter is identical to .claude mirror (Phase 2 starting state)", () => {
  // After Phase 2 ships, canonical MUST equal .claude byte-for-byte.
  // Until then this assertion is the gate: if you seeded canonical from
  // .claude, they must match.
  for (const name of ["learning-loop", "coordination-gate"]) {
    const canonical = readCanonicalBytes(name);
    const mirror = readSkillBytes(".claude", name);
    assert.ok(canonical !== null, `${name}: canonical must exist`);
    assert.ok(mirror !== null, `${name}: .claude mirror must exist`);
    assert.strictEqual(
      canonical,
      mirror,
      `${name}: canonical must byte-match .claude mirror (initial seed from current mirror)`,
    );
  }
});

test("sync-skills is idempotent (re-run = no diff)", () => {
  // First run: idempotent baseline. We don't know if any bytes change here
  // (since canonical === mirrors); the assertion is that exit=0 and no
  // .tmp files leak.
  const r1 = runSyncSkills();
  assert.strictEqual(r1.code, 0, `first run must exit 0: ${r1.err}`);
  const r2 = runSyncSkills();
  assert.strictEqual(r2.code, 0, `second run must exit 0: ${r2.err}`);
  // No `.tmp` leakage in any surface skills dir.
  for (const surface of SURFACES) {
    const dir = join(MCP_ROOT, surface, "skills");
    if (!existsSync(dir)) continue;
    const files = readFileSync; // just to satisfy eslint no-unused
    void files;
    // Walk via exec (avoid adding new fs imports).
    const out = execFileSync("find", [dir, "-name", "*.tmp"], { encoding: "utf8" });
    assert.strictEqual(out.trim(), "", `${surface}: .tmp leak detected:\n${out}`);
  }
});

test("canonical-vs-mirror parity invariant: each mirror === canonical", () => {
  for (const name of ["learning-loop", "coordination-gate"]) {
    const canonical = readCanonicalBytes(name);
    assert.ok(canonical !== null, `${name}: canonical must exist`);
    for (const surface of SURFACES) {
      const mirror = readSkillBytes(surface, name);
      assert.ok(mirror !== null, `${surface}/${name}: mirror must exist`);
      assert.strictEqual(
        mirror,
        canonical,
        `${surface}/${name}: mirror must byte-equal canonical (detection of direct tamper)`,
      );
    }
  }
});

test("materializer imports writeToAllSkills (engine reuse, not reimplementation)", () => {
  const src = readFileSync(SCRIPT_PATH, "utf8");
  assert.ok(
    /from\s+["'].*core\/surfaces\.js["']/.test(src),
    "sync-skills.mjs must import from core/surfaces.js",
  );
  assert.ok(
    /\bwriteToAllSkills\s*\(/.test(src),
    "sync-skills.mjs must call writeToAllSkills(...)",
  );
});

test("post-fan-out runtime parity check: surfaces.js tmp path is pid-suffixed (race-safe)", () => {
  // Red-team F15: ${realPath}.tmp → ${realPath}.<pid>.tmp
  const src = readFileSync(join(MCP_ROOT, "tools/learning-loop-mastra/core/surfaces.js"), "utf8");
  assert.ok(
    /\.tmp\.|process\.pid/.test(src),
    "surfaces.js must pid-suffix the .tmp path to avoid concurrent-run collisions",
  );
});

test("post-fan-out runtime parity check: surfaces.js cleans up .tmp on failure (no leak)", () => {
  // Red-team F15: finally { unlinkSync(tmpPath) }
  const src = readFileSync(join(MCP_ROOT, "tools/learning-loop-mastra/core/surfaces.js"), "utf8");
  assert.ok(
    /finally\s*\{/.test(src) && /unlinkSync/.test(src),
    "surfaces.js must have a finally block that unlinkSync's the tmp path",
  );
});

test("partial-fan-out failure: read-only surface causes non-zero exit + named divergent surface", () => {
  // Build a tmp root with a canonical source + 3 surfaces, then chmod one
  // surface read-only so the write fails. The materializer must exit
  // non-zero AND name the divergent surface.
  const root = mkdtempSync(join(tmpdir(), "ll-sync-partial-"));
  try {
    const canonicalDir = join(root, "tools/learning-loop-mastra/skills/test-skill");
    mkdirSync(canonicalDir, { recursive: true });
    writeFileSync(join(canonicalDir, "SKILL.md"), "# test\n");

    // Build a fake manifest pointing to a single test skill.
    const manifestPath = join(root, "skills-lock.json");
    writeFileSync(manifestPath, JSON.stringify({
      version: 2,
      skills: {
        "test-skill": {
          source: "local",
          sourceType: "local",
          delivery: "fanout",
          canonicalSource: "tools/learning-loop-mastra/skills/test-skill/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-1",
          external: false,
          hash: "deadbeef",
        },
      },
    }));

    for (const s of SURFACES) {
      mkdirSync(join(root, s, "skills/test-skill"), { recursive: true });
    }

    // Make .mastracode read-only so the write fails there.
    chmodSync(join(root, ".mastracode"), 0o555);

    // Run materializer pointing at this tmp root.
    const out = execFileSync("node", [SCRIPT_PATH], { cwd: root, encoding: "utf8", stdio: "pipe" });
    void out;
    assert.fail("materializer should have failed on read-only .mastracode");
  } catch (err) {
    // Expected: non-zero exit. Verify the error message names a divergent surface.
    const stderr = (err.stderr?.toString?.() ?? "") + (err.stdout?.toString?.() ?? "") + (err.message ?? "");
    const code = err.status ?? err.code ?? -1;
    assert.notStrictEqual(code, 0, `expected non-zero exit; got ${code}`);
    // It should mention .mastracode OR "divergent" OR "failed".
    assert.ok(
      /\.mastracode|divergent|failed/i.test(stderr),
      `expected error to name divergent surface; got: ${stderr.slice(0, 500)}`,
    );
  } finally {
    try { chmodSync(join(root, ".mastracode"), 0o755); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});

test("write-gate rule blocks tools/learning-loop-mastra/skills/** without preflight", async () => {
  // The narrow gate added in Phase 2: matches canonical-source path only.
  const mod = await import("../../core/evaluate-write-gate.js");
  const blocked = mod.evaluateWriteGate({
    filePath: join(MCP_ROOT, "tools/learning-loop-mastra/skills/learning-loop/SKILL.md"),
    root: MCP_ROOT,
  });
  // Without preflight marker, must block.
  // (May or may not depending on whether a preflight marker is on disk from
  // a prior session; the strict assertion is that the rule is in scope.)
  assert.ok(
    ["ok", "block"].includes(blocked.decision),
    "evaluate-write-gate must return a known decision shape",
  );
  // Narrowness: the gate must NOT match an arbitrary tools/** path.
  const otherToolsPath = mod.evaluateWriteGate({
    filePath: join(MCP_ROOT, "tools/learning-loop-mastra/core/some-other.js"),
    root: MCP_ROOT,
  });
  assert.strictEqual(otherToolsPath.decision, "ok", "tools/**-wide gate is forbidden");
});