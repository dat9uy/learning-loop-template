const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const SCRIPT = path.resolve(__dirname, "..", "..", "scripts", "ci-registry-deltas.sh");

function runParser(diffContent) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-deltas-"));
  const diffFile = path.join(tmpDir, "registry.diff");
  fs.writeFileSync(diffFile, diffContent);

  const summaryFile = path.join(tmpDir, "summary.md");
  const env = { ...process.env, GITHUB_STEP_SUMMARY: summaryFile };

  try {
    execFileSync("bash", [SCRIPT, diffFile], { env, encoding: "utf8" });
  } catch (err) {
    // Script should exit 0; rethrow if it doesn't
    throw new Error(`Script exited ${err.status}: ${err.stderr}`);
  }

  const summary = fs.readFileSync(summaryFile, "utf8");
  fs.rmSync(tmpDir, { recursive: true });
  return summary;
}

describe("ci-registry-deltas.sh", () => {
  test("emits added entry ids from + lines (Swept category)", () => {
    const diff = "@@ -169,1 +169,0 @@\n" +
      '-{"id":"meta-old-entry","entry_kind":"finding","status":"active"}\n' +
      "@@ -170,0 +170,1 @@\n" +
      '+{"id":"meta-new-entry","entry_kind":"finding","status":"reported"}\n';
    const summary = runParser(diff);
    assert.ok(summary.includes("meta-new-entry"), "should include added entry id");
    assert.ok(summary.includes("+1 entries") || summary.includes("+1 entry"), "should report added count");
  });

  test("emits removed entry ids from - lines (Resolved category)", () => {
    const diff = "@@ -169,1 +169,0 @@\n" +
      '-{"id":"meta-resolved-entry","entry_kind":"finding","status":"resolved"}\n';
    const summary = runParser(diff);
    assert.ok(summary.includes("meta-resolved-entry"), "should include removed entry id");
    assert.ok(summary.includes("-1 entries") || summary.includes("-1 entry"), "should report removed count");
  });

  test("emits both added and removed ids (New + Swept)", () => {
    const diff = "@@ -169,1 +169,0 @@\n" +
      '-{"id":"meta-swept-entry","entry_kind":"finding","status":"stale"}\n' +
      "@@ -170,0 +170,1 @@\n" +
      '+{"id":"meta-brand-new","entry_kind":"finding","status":"reported"}\n';
    const summary = runParser(diff);
    assert.ok(summary.includes("meta-swept-entry"), "should include removed id");
    assert.ok(summary.includes("meta-brand-new"), "should include added id");
  });

  test("reports no deltas when diff is empty", () => {
    const diff = "";
    const summary = runParser(diff);
    assert.ok(summary.includes("No deltas") || summary.includes("no deltas"), "should report no deltas");
  });

  test("escape_md escapes special chars in ids (XSS prevention)", () => {
    // If an id contained < or >, escape_md should convert to &lt; / &gt;
    const diff = "@@ -170,0 +170,1 @@\n" +
      '+{"id":"meta-<script>-test","entry_kind":"finding","status":"reported"}\n';
    const summary = runParser(diff);
    assert.ok(!summary.includes("meta-<script>"), "should not contain raw <script> in output");
    assert.ok(
      summary.includes("&lt;script&gt;") || summary.includes("meta-\\u003cscript"),
      "should escape angle brackets in id",
    );
  });
});
