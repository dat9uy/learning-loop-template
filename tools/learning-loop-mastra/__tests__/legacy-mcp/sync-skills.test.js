/**
 * Sync-skills materializer test (Phase 2 of plans/260719-1428-central-skills-management).
 *
 * Tests the canonical source + fan-out materializer pattern:
 *   - tools/scripts/sync-skills.mjs reads the canonical
 *     tools/learning-loop-mastra/skills/<name>/SKILL.md
 *     and fans out to .claude, .factory, .mastracode via writeToAllSkills.
 *   - Idempotent (re-run = 0 bytes written, no mtime bump).
 *   - Canonical-vs-mirror parity invariant (detection of direct canonical tamper).
 *   - Partial-fan-out failure (one surface fails → exits non-zero, names divergent surface).
 *   - writeToAllSkills is the engine (not a reimplementation).
 *
 * Fixture discipline (review C1/C2): every materializer run targets a tmp
 * root via the script's positional root argument (argv[2]). The script
 * resolves its data root from argv[2] — NOT process.cwd() — so fixtures
 * are real and the live working tree is never written by this suite.
 */

import { test } from "vitest";
import assert from "node:assert";
import { readFileSync, existsSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, chmodSync, statSync, readdirSync, unlinkSync } from "node:fs";
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

// Run the materializer against an explicit data root. Never call without a
// fixture root in this suite — the default root is the live repo.
function runSyncSkills(root) {
  try {
    const out = execFileSync("node", [SCRIPT_PATH, root], { encoding: "utf8" });
    return { code: 0, out, err: "" };
  } catch (err) {
    return {
      code: err.status ?? 1,
      out: err.stdout?.toString?.() ?? "",
      err: err.stderr?.toString?.() ?? String(err),
    };
  }
}

// Build an isolated repo-shaped fixture: skills-lock.json + canonical source
// + (optionally pre-seeded) surface mirrors. Returns the fixture root.
function buildFixture(names, { seedMirrors = false, manifestSkills } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ll-sync-"));
  const skills = {};
  for (const name of names) {
    const canonicalDir = join(root, "tools/learning-loop-mastra/skills", name);
    mkdirSync(canonicalDir, { recursive: true });
    writeFileSync(join(canonicalDir, "SKILL.md"), `# ${name}\n`);
    skills[name] = {
      source: "local",
      sourceType: "local",
      delivery: "fanout",
      canonicalSource: `tools/learning-loop-mastra/skills/${name}/SKILL.md`,
      targets: [".claude", ".factory", ".mastracode"],
      maturity: "state-1",
      external: false,
      hash: "0".repeat(64),
    };
    if (seedMirrors) {
      for (const s of SURFACES) {
        const dir = join(root, s, "skills", name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "SKILL.md"), `# ${name}\n`);
      }
    }
  }
  writeFileSync(
    join(root, "skills-lock.json"),
    JSON.stringify({ version: 2, skills: manifestSkills ?? skills }),
  );
  return root;
}

function withFixture(names, opts, fn) {
  const root = buildFixture(names, opts);
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function mirrorPath(root, surface, name) {
  return join(root, surface, "skills", name, "SKILL.md");
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

test("sync-skills is idempotent (second run writes 0 bytes, no mtime bump)", () => {
  withFixture(["test-skill"], {}, (root) => {
    const r1 = runSyncSkills(root);
    assert.strictEqual(r1.code, 0, `first run must exit 0: ${r1.err}`);
    assert.match(r1.out, /3 wrote, 0 unchanged/, `first run must write all 3 mirrors: ${r1.out}`);
    const mirror = mirrorPath(root, ".claude", "test-skill");
    const mtimeAfterFirst = statSync(mirror).mtimeMs;

    const r2 = runSyncSkills(root);
    assert.strictEqual(r2.code, 0, `second run must exit 0: ${r2.err}`);
    assert.match(r2.out, /0 wrote, 3 unchanged/, `second run must write nothing: ${r2.out}`);
    assert.strictEqual(
      statSync(mirror).mtimeMs,
      mtimeAfterFirst,
      "content-equal re-run must not touch the mirror (no mtime bump)",
    );

    // No temp debris in any fixture surface.
    for (const surface of SURFACES) {
      const dir = join(root, surface, "skills", "test-skill");
      const debris = readdirSync(dir).filter((f) => f.includes(".tmp"));
      assert.deepStrictEqual(debris, [], `${surface}: .tmp leak detected: ${debris}`);
    }
  });
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

test("fan-out correctness: canonical edit propagates byte-identically to all mirrors", () => {
  // Phase-02 step 2 sentinel test: mutate canonical → mirrors gain the
  // sentinel byte-identically; revert canonical → mirrors revert.
  withFixture(["test-skill"], {}, (root) => {
    const canonical = join(root, "tools/learning-loop-mastra/skills/test-skill/SKILL.md");
    let r = runSyncSkills(root);
    assert.strictEqual(r.code, 0, `seed run must exit 0: ${r.err}`);

    writeFileSync(canonical, "# test-skill\n<!-- sentinel-260719 -->\n");
    r = runSyncSkills(root);
    assert.strictEqual(r.code, 0, `sentinel run must exit 0: ${r.err}`);
    for (const surface of SURFACES) {
      assert.strictEqual(
        readFileSync(mirrorPath(root, surface, "test-skill"), "utf8"),
        "# test-skill\n<!-- sentinel-260719 -->\n",
        `${surface}: mirror must gain the sentinel byte-identically`,
      );
    }

    writeFileSync(canonical, "# test-skill\n");
    r = runSyncSkills(root);
    assert.strictEqual(r.code, 0, `revert run must exit 0: ${r.err}`);
    for (const surface of SURFACES) {
      assert.strictEqual(
        readFileSync(mirrorPath(root, surface, "test-skill"), "utf8"),
        "# test-skill\n",
        `${surface}: mirror must revert byte-identically`,
      );
    }
  });
});

test("self-heal: deleted mirror is restored byte-identically on next sync", () => {
  // Phase-02 step 13.
  withFixture(["test-skill"], { seedMirrors: true }, (root) => {
    unlinkSync(mirrorPath(root, ".factory", "test-skill"));
    const r = runSyncSkills(root);
    assert.strictEqual(r.code, 0, `heal run must exit 0: ${r.err}`);
    assert.strictEqual(
      readFileSync(mirrorPath(root, ".factory", "test-skill"), "utf8"),
      "# test-skill\n",
      ".factory mirror must be restored byte-identically from canonical",
    );
  });
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

test("surfaces.js tmp path is pid-suffixed (race-safe, red-team F15)", () => {
  // Anchored to the exact assignment line — a loose regex would match the
  // JSDoc comment and pass even if the code regressed.
  const src = readFileSync(join(MCP_ROOT, "tools/learning-loop-mastra/core/surfaces.js"), "utf8");
  assert.ok(
    src.includes("const tmpPath = `${realPath}.${process.pid}.tmp`;"),
    "surfaces.js must pid-suffix the .tmp path to avoid concurrent-run collisions",
  );
});

test("partial-fan-out failure: read-only surface → exit 1, names surface, no tmp debris", () => {
  // Red-team F5: one surface write fails → the materializer must fail loudly
  // and name the divergent surface. Root ignores permission bits, so skip
  // when running as uid 0 (writes would succeed and the test can't simulate).
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    return;
  }
  // Seed up-to-date mirrors, then mutate canonical so ALL surfaces have a
  // pending write (skipUnchanged would otherwise skip the read-only surface
  // and there would be no failure to surface).
  withFixture(["test-skill"], { seedMirrors: true }, (root) => {
    const canonical = join(root, "tools/learning-loop-mastra/skills/test-skill/SKILL.md");
    writeFileSync(canonical, "# test-skill\nchanged\n");
    // Read-only must be applied to the LEAF dir (where writeFileSync(tmp)
    // happens) — chmod on the surface root alone does not block writes into
    // an already-writable subdir.
    const leafDir = join(root, ".mastracode", "skills", "test-skill");
    chmodSync(leafDir, 0o555);
    let r;
    try {
      r = runSyncSkills(root);
    } finally {
      chmodSync(leafDir, 0o755);
    }
    assert.strictEqual(r.code, 1, `materializer must exit 1 on partial fan-out: ${JSON.stringify(r)}`);
    assert.match(r.err, /\.mastracode/, `error must name the divergent surface: ${r.err}`);

    // The two writable surfaces received the update (failure is isolated).
    for (const surface of [".claude", ".factory"]) {
      assert.strictEqual(
        readFileSync(mirrorPath(root, surface, "test-skill"), "utf8"),
        "# test-skill\nchanged\n",
        `${surface}: writable surface must still receive the update`,
      );
    }
    // The failed surface kept its stale content (visible divergence, not silent).
    assert.strictEqual(
      readFileSync(mirrorPath(root, ".mastracode", "test-skill"), "utf8"),
      "# test-skill\n",
      ".mastracode: failed surface must retain its prior content",
    );
    // No temp debris anywhere (finally-cleanup, red-team F15 behavioral check).
    for (const surface of SURFACES) {
      const dir = join(root, surface);
      const debris = execFileSync("find", [dir, "-name", "*.tmp"], { encoding: "utf8" });
      assert.strictEqual(debris.trim(), "", `${surface}: .tmp leak detected:\n${debris}`);
    }
  });
});

test("malformed manifest.skills fails closed (exit 2, not a silent no-op)", () => {
  // Review M1: Object.entries("string") would iterate garbage and exit 0.
  withFixture(["test-skill"], { manifestSkills: "not-an-object" }, (root) => {
    const r = runSyncSkills(root);
    assert.strictEqual(r.code, 2, `malformed manifest.skills must exit 2: ${JSON.stringify(r)}`);
    assert.match(r.err, /malformed/i, `error must name the malformed manifest: ${r.err}`);
  });
});

test("null manifest entry fails closed (exit 2, no TypeError stack)", () => {
  // Re-review: {"rogue": null} would crash entry.external with a TypeError.
  withFixture(["test-skill"], { manifestSkills: { "rogue-skill": null } }, (root) => {
    const r = runSyncSkills(root);
    assert.strictEqual(r.code, 2, `null manifest entry must exit 2: ${JSON.stringify(r)}`);
    assert.match(r.err, /rogue-skill/, `error must name the offending key: ${r.err}`);
    assert.doesNotMatch(r.err, /TypeError/, `must fail with a clean message, not a stack: ${r.err}`);
  });
});

test("write-gate: canonical dir blocked without preflight, allowed with marker", async () => {
  const root = mkdtempSync(join(tmpdir(), "ll-gate-"));
  try {
    const mod = await import("../../core/evaluate-write-gate.js");
    const canonicalPath = join(root, "tools/learning-loop-mastra/skills/learning-loop/SKILL.md");

    // 1. Canonical path blocked without marker.
    const blocked = mod.evaluateWriteGate({ filePath: canonicalPath, root });
    assert.strictEqual(blocked.decision, "block", "canonical write must be blocked without preflight");

    // 2. Mirror path also blocked without marker (existing skills rule).
    const mirrorPathAbs = join(root, ".claude/skills/learning-loop/SKILL.md");
    const blockedMirror = mod.evaluateWriteGate({ filePath: mirrorPathAbs, root });
    assert.strictEqual(blockedMirror.decision, "block", "mirror write must be blocked without preflight");

    // 3. Narrowness: other tools/** paths are NOT gated (Decision 5).
    for (const p of [
      "tools/learning-loop-mastra/core/some-other.js",
      "tools/learning-loop-mastra/hooks/universal/x.js",
    ]) {
      const res = mod.evaluateWriteGate({ filePath: join(root, p), root });
      assert.strictEqual(res.decision, "ok", `tools/**-wide gate is forbidden (${p})`);
    }

    // 4. With a fresh .loop-preflight-skills marker, the same write is allowed.
    const markerDir = join(root, ".claude/coordination");
    mkdirSync(markerDir, { recursive: true });
    writeFileSync(
      join(markerDir, ".loop-preflight-skills"),
      JSON.stringify({ surface: "skills", completed_at: new Date().toISOString() }),
    );
    const allowed = mod.evaluateWriteGate({ filePath: canonicalPath, root });
    assert.strictEqual(allowed.decision, "ok", "canonical write must be allowed with skills preflight marker");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
