import assert from "node:assert";
import { describe, test } from "node:test";
import {
  matchConstraintPattern,
  makeGateDecision,
  loadPromotedRules,
  applyPromotedRules,
  splitSegments,
  stripMessageFlags,
  isSafeRegexPattern,
} from "../core/gate-logic.js";
import { mkdtempSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("gate promoted rules regression", () => {
  test("existing constraint pattern still matches", () => {
    const result = matchConstraintPattern("pip install numpy");
    assert.strictEqual(result, "package-manager");
  });

  test("makeGateDecision blocks without observation", () => {
    const result = makeGateDecision("docker", { found: false });
    assert.strictEqual(result.decision, "block");
    assert.strictEqual(result.observation_required, true);
  });

  test("makeGateDecision ok with observation", () => {
    const result = makeGateDecision("docker", { found: true, observation: { id: "obs-1" } });
    assert.strictEqual(result.decision, "ok");
  });

  test("loadPromotedRules returns empty when meta-state.jsonl missing", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-"));
    const rules = loadPromotedRules(tempDir);
    assert.deepStrictEqual(rules, []);
  });

  test("loadPromotedRules returns empty when no entry_kind=rule entries", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "meta-test",
        entry_kind: "finding",
        category: "gate-logic-bug",
        status: "active",
      }) + "\n"
    );
    const rules = loadPromotedRules(tempDir);
    assert.deepStrictEqual(rules, []);
  });
});

describe("gate promoted rules new behavior", () => {
  test("regex rule matches command and returns escalate", () => {
    const rules = [
      {
        id: "rule-no-docker",
        entry_kind: "rule",
        status: "active",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "docker\\s+run",
      },
    ];
    const result = applyPromotedRules("docker run ubuntu", null, rules);
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.rule_id, "rule-no-docker");
    assert.strictEqual(result.meta_state_id, "rule-no-docker");
    assert.strictEqual(result.pattern_type, "regex");
  });

  test("glob rule matches file path and returns escalate", () => {
    const rules = [
      {
        id: "rule-no-secrets",
        entry_kind: "rule",
        status: "active",
        enforcement: "gate",
        pattern_type: "glob",
        pattern: "product/**/secrets/**",
      },
    ];
    const result = applyPromotedRules(null, "product/api/secrets/config.yaml", rules);
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.rule_id, "rule-no-secrets");
  });

  test("regex rule does not match returns ok", () => {
    const rules = [
      {
        id: "rule-no-docker",
        entry_kind: "rule",
        status: "active",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "docker\\s+run",
      },
    ];
    const result = applyPromotedRules("ls -la", null, rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("glob rule does not match returns ok", () => {
    const rules = [
      {
        id: "rule-no-secrets",
        entry_kind: "rule",
        status: "active",
        enforcement: "gate",
        pattern_type: "glob",
        pattern: "product/**/secrets/**",
      },
    ];
    const result = applyPromotedRules(null, "docs/readme.md", rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("inactive rule status reported is ignored", () => {
    const rules = [
      {
        id: "rule-no-docker",
        entry_kind: "rule",
        status: "reported",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "docker\\s+run",
      },
    ];
    const result = applyPromotedRules("docker run ubuntu", null, rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("non-gate enforcement agent is ignored", () => {
    const rules = [
      {
        id: "rule-no-docker",
        entry_kind: "rule",
        status: "active",
        enforcement: "agent",
        pattern_type: "regex",
        pattern: "docker\\s+run",
      },
    ];
    const result = applyPromotedRules("docker run ubuntu", null, rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("invalid regex is caught and skipped without crash", () => {
    const rules = [
      {
        id: "rule-bad",
        entry_kind: "rule",
        status: "active",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "[invalid(",
      },
    ];
    const result = applyPromotedRules("anything", null, rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("multiple rules returns first match", () => {
    const rules = [
      {
        id: "rule-first",
        entry_kind: "rule",
        status: "active",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: ".*",
      },
      {
        id: "rule-second",
        entry_kind: "rule",
        status: "active",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: ".*",
      },
    ];
    const result = applyPromotedRules("test", null, rules);
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.rule_id, "rule-first");
  });

  test("cache hit returns same reference without re-reading file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-cache-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "rule-test",
        entry_kind: "rule",
        origin: "meta-test-origin",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "test",
        description: "Cache hit test rule for loadPromotedRules regression coverage",
        status: "active",
        promoted_at: new Date().toISOString(),
        promoted_by: "operator",
      }) + "\n"
    );

    const rules1 = loadPromotedRules(tempDir);
    assert.strictEqual(rules1.length, 1);

    // Second call with unchanged file should return the same cached reference
    const rules2 = loadPromotedRules(tempDir);
    assert.strictEqual(rules2.length, 1);
    assert.strictEqual(rules1, rules2, "Cache hit must return the same array reference");
  });

  test("cache miss on mtime+size change triggers re-read", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-cache-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "rule-test",
        entry_kind: "rule",
        origin: "meta-test-origin",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "test",
        description: "Cache miss test rule for loadPromotedRules regression coverage",
        status: "active",
        promoted_at: new Date().toISOString(),
        promoted_by: "operator",
      }) + "\n"
    );

    const rules1 = loadPromotedRules(tempDir);
    assert.strictEqual(rules1.length, 1);

    // Add a new entry (changes file size)
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "rule-test",
        entry_kind: "rule",
        origin: "meta-test-origin",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "test",
        description: "Cache miss test rule for loadPromotedRules regression coverage",
        status: "active",
        promoted_at: new Date().toISOString(),
        promoted_by: "operator",
      }) +
        "\n" +
        JSON.stringify({
          id: "rule-second",
          entry_kind: "rule",
          origin: "meta-test-origin",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "second",
          description: "Second cache miss test rule for loadPromotedRules regression coverage",
          status: "active",
          promoted_at: new Date().toISOString(),
          promoted_by: "operator",
        }) +
        "\n"
    );

    const rules2 = loadPromotedRules(tempDir);
    assert.strictEqual(rules2.length, 2);
  });

  test("high complexity regex pattern is rejected", () => {
    const rules = [
      {
        id: "rule-redos",
        entry_kind: "rule",
        status: "active",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "(a+)+",
      },
    ];
    const result = applyPromotedRules("aaaaaaaaaaaaaaaaaaaaaaaaaaaa!", null, rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("glob outside scope whitelist is rejected", () => {
    const rules = [
      {
        id: "rule-traversal",
        entry_kind: "rule",
        status: "active",
        enforcement: "gate",
        pattern_type: "glob",
        pattern: "**/secrets/**",
      },
    ];
    const result = applyPromotedRules(null, "product/api/secrets/config.yaml", rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("status disabled rules are excluded", () => {
    const rules = [
      {
        id: "rule-disabled",
        entry_kind: "rule",
        status: "disabled",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: ".*",
      },
    ];
    const result = applyPromotedRules("anything", null, rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("loadPromotedRules excludes disabled rules", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-filter-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "rule-active",
        entry_kind: "rule",
        origin: "meta-test-origin",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "active",
        description: "Active rule for loadPromotedRules status filter regression coverage",
        status: "active",
        promoted_at: new Date().toISOString(),
        promoted_by: "operator",
      }) +
        "\n" +
        JSON.stringify({
          id: "rule-disabled",
          entry_kind: "rule",
          origin: "meta-test-origin",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "disabled",
          description: "Disabled rule for loadPromotedRules status filter regression coverage",
          status: "disabled",
          promoted_at: new Date().toISOString(),
          promoted_by: "operator",
        }) +
        "\n" +
        JSON.stringify({
          id: "rule-agent",
          entry_kind: "rule",
          origin: "meta-test-origin",
          enforcement: "agent",
          pattern_type: "regex",
          pattern: "agent",
          description: "Agent rule for loadPromotedRules status filter regression coverage",
          status: "active",
          promoted_at: new Date().toISOString(),
          promoted_by: "operator",
        }) +
        "\n"
    );

    // loadPromotedRules returns all active rules; enforcement filtering
    // happens in applyPromotedRules
    const rules = loadPromotedRules(tempDir);
    assert.strictEqual(rules.length, 2);
    const ids = rules.map((r) => r.id);
    assert.ok(ids.includes("rule-active"));
    assert.ok(ids.includes("rule-agent"));
  });
});

describe("gate promoted rules G8 stripMessageFlags", () => {
  const activeRule = {
    id: "rule-no-new-artifact-types",
    entry_kind: "rule",
    status: "active",
    enforcement: "gate",
    pattern_type: "regex",
    pattern: "propose|design|create|new\\s+(schema|artifact|directory|convention)",
  };

  test("git commit message with create returns ok (G8 fix)", () => {
    const result = applyPromotedRules(
      'git commit -m "create new convention"',
      null,
      [activeRule]
    );
    assert.strictEqual(result.decision, "ok");
  });

  test("message flag value with matching text returns ok (G8 fix)", () => {
    const result = applyPromotedRules(
      'foo --title "propose a new schema"',
      null,
      [activeRule]
    );
    assert.strictEqual(result.decision, "ok");
  });

  test("echo quoted string with create still escalates — known heredoc limitation", () => {
    const result = applyPromotedRules(
      'echo "create new convention"',
      null,
      [activeRule]
    );
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.rule_id, "rule-no-new-artifact-types");
  });

  test("raw command without message flag returns escalate", () => {
    const result = applyPromotedRules(
      "propose a new artifact type",
      null,
      [activeRule]
    );
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.rule_id, "rule-no-new-artifact-types");
  });

  test("multi-segment command with real match in second segment returns escalate", () => {
    const result = applyPromotedRules(
      'git commit -m "add new convention"; propose a new schema',
      null,
      [activeRule]
    );
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.rule_id, "rule-no-new-artifact-types");
  });

  test("splitSegments exports correct segments", () => {
    const segments = splitSegments("a; b & c | d");
    assert.deepStrictEqual(segments, ["a", "b", "c", "d"]);
  });

  test("splitSegments does NOT split on ';' inside single quotes", () => {
    const segments = splitSegments("git commit -m 'a;b;c'");
    assert.deepStrictEqual(segments, ["git commit -m 'a;b;c'"]);
  });

  test("splitSegments does NOT split on ';' inside double quotes", () => {
    const segments = splitSegments('git commit -m "a;b;c"');
    assert.deepStrictEqual(segments, ['git commit -m "a;b;c"']);
  });

  test("splitSegments handles nested quote contexts correctly", () => {
    // A double-quoted string containing a single-quoted substring should
    // not be terminated by the inner single quote.
    const segments = splitSegments(`echo "it's fine; really"`);
    assert.deepStrictEqual(segments, [`echo "it's fine; really"`]);
  });

  test("splitSegments handles backslash escapes outside quotes", () => {
    // The escaped ';' should not be a separator.
    const segments = splitSegments("echo a\\;b");
    assert.deepStrictEqual(segments, ["echo a\\;b"]);
  });

  test("splitSegments handles backslash escapes inside double quotes", () => {
    // Inside double quotes, a backslash escapes the next char; the escaped
    // double-quote is a literal char, not a quote-close.
    const segments = splitSegments('echo "a\\"b;c"');
    assert.deepStrictEqual(segments, ['echo "a\\"b;c"']);
  });

  test("splitSegments still splits on unquoted separators", () => {
    const segments = splitSegments('cmd1; cmd2 "x;y"; cmd3');
    assert.deepStrictEqual(segments, ['cmd1', 'cmd2 "x;y"', "cmd3"]);
  });

  test("splitSegments (regression: splitSegments-quote-unaware bug) — quoted message body with ';' and trigger words stays one segment", () => {
    // Empirical proof 2026-06-06: a git commit message body containing
    // 'create a new schema' (a legit rule trigger) was fragmenting on
    // the ';' in 'false positives; CLI subcommand' and matching the rule.
    const msg = `git commit -m "fix(gate): G8 fix" -m "Some body; create a new schema; still escalate"`;
    const segments = splitSegments(msg);
    assert.strictEqual(segments.length, 1, `Expected 1 segment, got ${segments.length}: ${JSON.stringify(segments)}`);
    assert.strictEqual(segments[0], msg);
  });

  test("applyPromotedRules returns ok for git commit with trigger words in quoted -m body (the P1 latent bug)", () => {
    // The active rule, with the refined pattern, would still match
    // 'create a new schema' inside a -m body — BUT the quote-aware
    // splitSegments keeps the body intact, and stripMessageFlags then
    // strips the -m value, so the regex sees only 'git commit'.
    const result = applyPromotedRules(
      `git commit -m "fix(gate): G8 fix" -m "body; create a new schema; escalate"`,
      null,
      [activeRule],
    );
    assert.strictEqual(result.decision, "ok");
  });

  test("stripMessageFlags strips -m and --title values", () => {
    const stripped = stripMessageFlags('git commit -m "create new convention"');
    assert.ok(!stripped.includes("create"));
    assert.ok(stripped.includes("git"));
    assert.ok(stripped.includes("commit"));
  });

  test("applyPromotedRules: node -e body with trigger phrase → ok (no escalate)", () => {
    // The trigger phrase "create a new schema" is inside the `node -e` body.
    // After Phase 2 ships stripNodeEvalBody, the body is blanked before regex match.
    // Today (RED), the regex sees the trigger and escalates.
    const rules = [
      {
        id: "rule-no-new-artifact-types",
        entry_kind: "rule",
        status: "active",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "(propose|design|create)\\s+(a|an|new|separate|own|the)?\\s*(schema|artifact|directory|convention)|new\\s+(schema|artifact|directory|convention)",
      },
    ];
    const result = applyPromotedRules(
      `node -e "console.log('create a new schema')"`,
      null,
      rules,
      "/tmp",
    );
    assert.strictEqual(result.decision, "ok");
  });
});

describe("gate promoted rules G8 subcommand-class fix (P1)", () => {
  // Active rule with the REFINED pattern (requires context qualifier after
  // create/propose/design — closes the 7 G8 subcommand-class recurrences).
  // The refined pattern is the canonical one shipped by plan
  // 260606-g8-subcommand-class-fix; this test file pins it.
  const activeRule = {
    id: "rule-no-new-artifact-types",
    entry_kind: "rule",
    status: "active",
    enforcement: "gate",
    pattern_type: "regex",
    pattern:
      "(propose|design|create)\\s+(a|an|new|separate|own|the)?\\s*(schema|artifact|directory|convention)|new\\s+(schema|artifact|directory|convention)",
    promoted_at: "2026-06-01T22:00:13.387Z",
    refined_at: "2026-06-06T01:55:00.000Z",
    promoted_by: "operator",
  };

  test("ck plan create subcommand returns ok (G8 subcommand-class false positive fixed)", () => {
    const result = applyPromotedRules(
      "ck plan create --title test --phases P0 --dir 260606-test",
      null,
      [activeRule]
    );
    assert.strictEqual(result.decision, "ok");
  });

  test("record_create_decision function name returns ok (no whitespace after 'create')", () => {
    const result = applyPromotedRules(
      "record_create_decision --input foo",
      null,
      [activeRule]
    );
    assert.strictEqual(result.decision, "ok");
  });

  test("meta_state_log_change subcommand returns ok (function-name class)", () => {
    const result = applyPromotedRules(
      "meta_state_log_change --target foo",
      null,
      [activeRule]
    );
    assert.strictEqual(result.decision, "ok");
  });

  test("propose a new schema still escalates (regression guard for legit triggers)", () => {
    const result = applyPromotedRules("propose a new schema", null, [activeRule]);
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.rule_id, "rule-no-new-artifact-types");
  });

  test("design a new artifact still escalates", () => {
    const result = applyPromotedRules("design a new artifact", null, [activeRule]);
    assert.strictEqual(result.decision, "escalate");
  });

  test("create a new directory still escalates (matches create+article+noun)", () => {
    const result = applyPromotedRules("create a new directory", null, [activeRule]);
    assert.strictEqual(result.decision, "escalate");
  });

  test("new schema still escalates (matches new+noun alternative)", () => {
    const result = applyPromotedRules("new schema", null, [activeRule]);
    assert.strictEqual(result.decision, "escalate");
  });

  test("create schema still escalates (matches create+noun without article)", () => {
    const result = applyPromotedRules("create schema", null, [activeRule]);
    assert.strictEqual(result.decision, "escalate");
  });
});

describe("gate promoted rules status semantics (P1)", () => {
  test("loadPromotedRules loads status='active' rule entries", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-resolved-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "rule-test-active",
        entry_kind: "rule",
        origin: "meta-test-origin",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "test",
        description: "Active rule for status semantics regression coverage",
        status: "active",
        promoted_at: new Date().toISOString(),
        promoted_by: "operator",
      }) + "\n"
    );
    const rules = loadPromotedRules(tempDir);
    assert.strictEqual(rules.length, 1);
    assert.strictEqual(rules[0].id, "rule-test-active");
  });

  test("loadPromotedRules does NOT load status='disabled' (explicit kill switch)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-disabled-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "rule-test-disabled",
        entry_kind: "rule",
        status: "disabled",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "test",
      }) + "\n"
    );
    const rules = loadPromotedRules(tempDir);
    assert.strictEqual(rules.length, 0);
  });

  test("applyPromotedRules accepts status='active' rules", () => {
    const rules = [
      {
        id: "rule-resolved-test",
        entry_kind: "rule",
        status: "active",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "match-me",
      },
    ];
    const result = applyPromotedRules("please match-me here", null, rules);
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.rule_id, "rule-resolved-test");
  });
});

describe("loadPromotedRules schema validation (F-3 fix)", () => {
  // F-3 fix: a malformed rule entry (typo, missing field, invalid
  // pattern_type) was previously passed through unvalidated and would
  // crash applyPromotedRules. loadPromotedRules now calls
  // metaStateRuleEntrySchema.safeParse and warn-and-skips invalid entries.
  // This closes the gap that direct file appends (bypassing writeEntry's
  // safeParse) would otherwise create.
  test("warn-and-skips a rule entry with invalid pattern_type", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-schema-bad-pattern-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "rule-bad-pattern-type",
        entry_kind: "rule",
        status: "active",
        enforcement: "gate",
        pattern_type: "this-is-not-a-valid-pattern-type",
        pattern: ".*",
      }) + "\n",
    );
    // Capture stderr to verify the warning
    const origWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
      const rules = loadPromotedRules(tempDir);
      assert.deepStrictEqual(rules, [], "malformed rule must be skipped");
      assert.ok(
        warnings.some((w) => w.includes("rule-bad-pattern-type") && w.includes("schema validation failed")),
        `expected warn-and-skip; warnings: ${JSON.stringify(warnings)}`,
      );
    } finally {
      console.warn = origWarn;
    }
  });

  test("warn-and-skips a rule entry missing required enforcement field", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-schema-missing-enforcement-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "rule-missing-enforcement",
        entry_kind: "rule",
        status: "active",
        // enforcement: missing — required by metaStateRuleEntrySchema
        pattern_type: "regex",
        pattern: ".*",
      }) + "\n",
    );
    const origWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
      const rules = loadPromotedRules(tempDir);
      assert.deepStrictEqual(rules, []);
      assert.ok(
        warnings.some((w) => w.includes("rule-missing-enforcement") && w.includes("schema validation failed")),
      );
    } finally {
      console.warn = origWarn;
    }
  });

  test("loads valid rules and skips invalid ones in the same registry", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-schema-mixed-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    const validRule = {
      id: "rule-valid",
      entry_kind: "rule",
      origin: "meta-test-origin",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "valid-pattern",
      description: "Valid test rule for F-3 mixed-registry regression test",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "operator",
    };
    const invalidRule = {
      id: "rule-invalid",
      entry_kind: "rule",
      origin: "meta-test-origin",
      enforcement: "gate",
      pattern_type: "totally-bogus",
      pattern: ".*",
      description: "Invalid test rule for F-3 mixed-registry regression test",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "operator",
    };
    writeFileSync(metaPath, JSON.stringify(validRule) + "\n" + JSON.stringify(invalidRule) + "\n");
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      const rules = loadPromotedRules(tempDir);
      assert.strictEqual(rules.length, 1, "only the valid rule is loaded");
      assert.strictEqual(rules[0].id, "rule-valid");
    } finally {
      console.warn = origWarn;
    }
  });
});

describe("isSafeRegexPattern (P1: relaxed top-level quantifier check)", () => {
  test("rejects ReDoS pattern (a+)+ (star height 2)", () => {
    assert.strictEqual(isSafeRegexPattern("(a+)+"), false);
  });

  test("accepts the G8 refined pattern (multiple top-level quantifiers, no nested groups with quantifiers)", () => {
    const refined =
      "(propose|design|create)\\s+(a|an|new|separate|own|the)?\\s*(schema|artifact|directory|convention)|new\\s+(schema|artifact|directory|convention)";
    assert.strictEqual(isSafeRegexPattern(refined), true);
  });

  test("accepts multiple top-level \\s+ quantifiers in different alternatives", () => {
    assert.strictEqual(
      isSafeRegexPattern("(verb)\\s+(noun)|other\\s+(noun)"),
      true
    );
  });

  test("rejects nested groups where an inner group with a quantifier is itself quantified", () => {
    // (a+)+ style: inner group with quantifier, then outer quantifier on that group
    assert.strictEqual(isSafeRegexPattern("((a+)+)"), false);
  });

  test("accepts the original G8 pattern (single top-level quantifier)", () => {
    assert.strictEqual(
      isSafeRegexPattern("propose|design|create|new\\s+(schema|artifact|directory|convention)"),
      true
    );
  });
});
