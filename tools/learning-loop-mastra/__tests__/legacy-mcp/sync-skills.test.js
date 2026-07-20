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
import { readFileSync, existsSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, chmodSync, statSync, readdirSync, lstatSync, symlinkSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
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

// ---------------------------------------------------------------------------
// Phase 3 external fan-out tests (red-team F13): the materializer fans out an
// external skill (delivery: "npx-per-runtime+fanout-undetected") from the
// detected npx copy to undetected runtimes. Detected copy is read-only; F6
// hash-verify gates the source; missing detected copy → explicit failure;
// legacy .agents symlinks at undetected surfaces are cleared before writes.
// ---------------------------------------------------------------------------

function sha256hex(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

// Build a fixture with a detected mastra tree on `detectedSurface` (real
// files: SKILL.md + references/foo.md + scripts/bar.mjs) + a manifest entry
// whose hash matches the detected SKILL.md. Other surfaces are undetected
// (empty, or carrying a legacy symlink to a `.agents` source if requested).
function buildExternalFixture({ detectedSurface = ".claude", legacySymlinkOn = [], hashOverride } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ll-ext-"));
  const skillContent = "# mastra\nexternal skill fixture\n";
  const refContent = "# remote-docs\nfixture reference\n";
  const scriptContent = "// provider-registry fixture\nexport default {};\n";
  const detectedDir = join(root, detectedSurface, "skills", "mastra");
  mkdirSync(join(detectedDir, "references"), { recursive: true });
  mkdirSync(join(detectedDir, "scripts"), { recursive: true });
  writeFileSync(join(detectedDir, "SKILL.md"), skillContent);
  writeFileSync(join(detectedDir, "references", "remote-docs.md"), refContent);
  writeFileSync(join(detectedDir, "scripts", "provider-registry.mjs"), scriptContent);
  const hash = hashOverride ?? sha256hex(skillContent);
  const manifest = {
    version: 2,
    skills: {
      mastra: {
        source: "mastra-ai/skills",
        sourceType: "npx-skills-cli",
        delivery: "npx-per-runtime+fanout-undetected",
        skillPath: "skills/mastra/SKILL.md",
        targets: [".claude", ".factory", ".mastracode"],
        maturity: null,
        external: true,
        hash,
      },
    },
  };
  writeFileSync(join(root, "skills-lock.json"), JSON.stringify(manifest));
  // Optional legacy symlink at undetected surfaces (mimics pre-Phase-3
  // .agents mechanism: <surface>/skills/mastra → ../../.agents/skills/mastra).
  for (const surface of legacySymlinkOn) {
    if (surface === detectedSurface) continue;
    const agentsSource = join(root, ".agents", "skills", "mastra");
    mkdirSync(join(agentsSource, "references"), { recursive: true });
    writeFileSync(join(agentsSource, "SKILL.md"), "# stale .agents source\n");
    writeFileSync(join(agentsSource, "references", "stale.md"), "stale\n");
    const linkDir = join(root, surface, "skills");
    mkdirSync(linkDir, { recursive: true });
    symlinkSync(join("..", "..", ".agents", "skills", "mastra"), join(linkDir, "mastra"));
  }
  return { root, skillContent, refContent, scriptContent };
}

function readTree(dir) {
  const out = {};
  (function walk(d, rel) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rp = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory() && !e.isSymbolicLink()) walk(join(d, e.name), rp);
      else if (e.isFile() && !e.isSymbolicLink()) out[rp] = readFileSync(join(d, e.name), "utf8");
    }
  })(dir, "");
  return out;
}

test("F13: external fan-out propagates the detected tree byte-identically to undetected surfaces", () => {
  const { root, skillContent, refContent, scriptContent } = buildExternalFixture();
  try {
    const r = runSyncSkills(root);
    assert.strictEqual(r.code, 0, `fan-out must exit 0: ${r.err}`);
    assert.match(r.out, /external fan-out from \.claude/, `log must name the detected source: ${r.out}`);
    for (const surface of [".factory", ".mastracode"]) {
      const tree = readTree(join(root, surface, "skills", "mastra"));
      assert.deepStrictEqual(
        Object.keys(tree).sort(),
        ["SKILL.md", "references/remote-docs.md", "scripts/provider-registry.mjs"],
        `${surface}: fanned-out tree must match the detected file set`,
      );
      assert.strictEqual(tree["SKILL.md"], skillContent, `${surface}: SKILL.md must match`);
      assert.strictEqual(tree["references/remote-docs.md"], refContent, `${surface}: references must match`);
      assert.strictEqual(tree["scripts/provider-registry.mjs"], scriptContent, `${surface}: scripts must match`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("F13: external fan-out is idempotent (second run writes nothing, source untouched)", () => {
  const { root } = buildExternalFixture();
  try {
    const r1 = runSyncSkills(root);
    assert.strictEqual(r1.code, 0, `first run must exit 0: ${r1.err}`);
    const sourceSkillMd = join(root, ".claude", "skills", "mastra", "SKILL.md");
    const sourceMtime = statSync(sourceSkillMd).mtimeMs;
    const factorySkillMd = join(root, ".factory", "skills", "mastra", "SKILL.md");
    const factoryMtime = statSync(factorySkillMd).mtimeMs;
    const r2 = runSyncSkills(root);
    assert.strictEqual(r2.code, 0, `second run must exit 0: ${r2.err}`);
    // Source is read-only (never rewritten): mtime unchanged.
    assert.strictEqual(statSync(sourceSkillMd).mtimeMs, sourceMtime, "detected copy must be read-only (no mtime bump on re-run)");
    // Fanned-out surfaces are skipUnchanged on re-run: mtime unchanged.
    assert.strictEqual(statSync(factorySkillMd).mtimeMs, factoryMtime, ".factory mirror must not be touched on idempotent re-run");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("F13: detected copy is read-only (materializer never writes back to the source surface)", () => {
  const { root, skillContent } = buildExternalFixture();
  try {
    // Seed .factory + .mastracode with a STALE mastra tree so the materializer
    // has a pending write on every surface except the source.
    for (const surface of [".factory", ".mastracode"]) {
      const dir = join(root, surface, "skills", "mastra");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), "# stale\n");
    }
    const sourceSkillMd = join(root, ".claude", "skills", "mastra", "SKILL.md");
    // Post-Phase-2 self-heal: normalize re-derives hash from the highest-mtime
    // SKILL.md (mtime = "most-recently-written"). In real npx flows the detected
    // runtime IS the freshly-written surface. To keep .claude as the source for
    // this test we re-touch it LAST (mimics npx's write order: detected runtimes
    // get content after the undetected ones).
    writeFileSync(sourceSkillMd, readFileSync(sourceSkillMd, "utf8"));
    const sourceMtime = statSync(sourceSkillMd).mtimeMs;
    const r = runSyncSkills(root);
    assert.strictEqual(r.code, 0, `fan-out must exit 0: ${r.err}`);
    assert.strictEqual(statSync(sourceSkillMd).mtimeMs, sourceMtime, "source surface must be untouched (read-only)");
    assert.strictEqual(readFileSync(join(root, ".claude", "skills", "mastra", "SKILL.md"), "utf8"), skillContent, "source content must be unchanged");
    // Stale surfaces were overwritten with the source tree.
    for (const surface of [".factory", ".mastracode"]) {
      assert.strictEqual(
        readFileSync(join(root, surface, "skills", "mastra", "SKILL.md"), "utf8"),
        skillContent,
        `${surface}: stale content must be replaced with the detected tree`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("F13: missing detected copy → explicit failure (not a silent skip)", () => {
  // Post-Phase-2 (self-healing normalize): the manifest hash alone is no
  // longer a hard barrier — normalize re-derives it from the detected
  // surface's SKILL.md. To exercise "truly nothing to fan out from",
  // we build the fixture AND delete the source surface so normalize
  // also has no real-dir SKILL.md to read → exits 2 with the same
  // "no-detected-copy" / "no real-dir SKILL.md" failure mode.
  const { root } = buildExternalFixture({ hashOverride: "0".repeat(64) });
  // Wipe ALL surfaces' mastra trees so neither normalize nor fan-out
  // can find any real-dir source.
  for (const s of [".claude", ".factory", ".mastracode"]) {
    rmSync(join(root, s, "skills", "mastra"), { recursive: true, force: true });
  }
  try {
    const r = runSyncSkills(root);
    assert.strictEqual(r.code, 2, `missing detected copy must exit 2 (normalize fails closed): ${JSON.stringify(r)}`);
    assert.match(r.err, /no real-dir SKILL\.md|normalize mastra/, `error must name the failure: ${r.err}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("F13/F6: detected copy whose SKILL.md hash does NOT match manifest → normalize re-derives + fan-out succeeds", () => {
  // Phase-2 self-heal: a stale manifest hash (e.g. from before an upstream
  // skill update) is no longer a hard failure — normalize reads the
  // detected surface's actual SKILL.md and re-derives the manifest hash
  // before fan-out. Fan-out then succeeds against the freshly-hashed source.
  // F6 (defense-in-depth against a tampered detected copy) shifts from
  // "manifest hash gates fan-out" to "normalize checks the source tree
  // exists" — the mtime-tiebreaker picks the freshly-installed .claude
  // surface and writes its real hash into the manifest.
  const { root } = buildExternalFixture({ hashOverride: "1".repeat(64) });
  try {
    const r = runSyncSkills(root);
    assert.strictEqual(r.code, 0, `normalize-then-fan-out must exit 0: ${JSON.stringify(r)}`);
    assert.match(r.out, /normalized skills-lock\.json/, `sync must auto-normalize before fan-out: ${r.out}`);
    // Manifest's mastra.hash is now the real sha256 of the detected SKILL.md,
    // not the original "1".repeat(64) override.
    const m = JSON.parse(readFileSync(join(root, "skills-lock.json"), "utf8"));
    assert.notStrictEqual(m.skills.mastra.hash, "1".repeat(64), "manifest hash must be re-derived, not the stale override");
    assert.strictEqual(m.skills.mastra.external, true, "manifest hash fix preserves external:true (loop policy)");
    assert.strictEqual(m.skills.mastra.delivery, "npx-per-runtime+fanout-undetected", "loop-policy delivery must be restored");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("F13: legacy .agents symlink at an undetected surface is replaced with real files (no write-through)", () => {
  const { root, skillContent } = buildExternalFixture({ legacySymlinkOn: [".factory"] });
  try {
    // Pre-condition: .factory/skills/mastra is a symlink to .agents/skills/mastra.
    const factoryLink = join(root, ".factory", "skills", "mastra");
    assert.ok(lstatSync(factoryLink).isSymbolicLink(), "precondition: .factory mastra is a legacy symlink");
    const agentsSourceSkillMd = join(root, ".agents", "skills", "mastra", "SKILL.md");
    const agentsContentBefore = readFileSync(agentsSourceSkillMd, "utf8");
    const r = runSyncSkills(root);
    assert.strictEqual(r.code, 0, `fan-out must exit 0: ${r.err}`);
    // The symlink was replaced with a real dir.
    assert.ok(!lstatSync(factoryLink).isSymbolicLink(), ".factory mastra must now be a real dir, not a symlink");
    assert.strictEqual(
      readFileSync(join(factoryLink, "SKILL.md"), "utf8"),
      skillContent,
      ".factory must hold the fanned-out real files",
    );
    // No write-through to .agents (the retired source is untouched).
    assert.strictEqual(readFileSync(agentsSourceSkillMd, "utf8"), agentsContentBefore, ".agents source must not be modified via write-through");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
