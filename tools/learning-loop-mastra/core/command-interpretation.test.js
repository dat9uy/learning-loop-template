import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  interpretCommand,
  requestRecurrenceKey,
} from "./command-interpretation.js";
import {
  hashRecurrenceKey,
  normalizePrefixForKey,
} from "./command-recurrence.js";

const VITEST_RULE = {
  id: "rule-no-raw-stdout-vitest",
  pattern_type: "regex",
  pattern: "vitest\\s+run",
};

const VITEST_PIPE_RULE = {
  id: "rule-no-raw-stdout-vitest",
  pattern_type: "regex",
  pattern: "vitest\\s+run.*\\|\\s*tail",
};

describe("Command Interpretation interface", () => {
  test("matches an executable command and returns policy-neutral facts", () => {
    const interpretation = interpretCommand("pnpm exec vitest run suite.test.js | tail -10");
    const result = interpretation.matchRule(VITEST_RULE);

    assert.equal(result.matched, true);
    assert.equal(result.match_origin, "executable");
    assert.equal(result.candidate_kind, "ordinary-rule-fire");
    assert.deepEqual(result.raw_match.text, "vitest run");
    assert.equal(result.decision, undefined);
    assert.equal(result.severity, undefined);
  });

  test("proves inert data without turning the fact into a permission decision", () => {
    const interpretation = interpretCommand("cat <<'EOF'\nvitest run fixture.test.js | tail\nEOF\n");
    const result = interpretation.matchRule(VITEST_RULE);

    assert.equal(result.matched, false);
    assert.equal(result.match_origin, "inert-data");
    assert.equal(result.candidate_kind, "unexpected-match");
    assert.equal(result.raw_match.text, "vitest run");
    assert.equal(result.decision, undefined);
  });

  test("preserves ordered blanking for quote-folded heredoc delimiters", () => {
    const interpretation = interpretCommand("cat <<'E''OF'\nvitest run fixture.test.js | tail\nEOF\n");
    const result = interpretation.matchRule(VITEST_PIPE_RULE);

    assert.equal(result.matched, false);
    assert.equal(result.match_origin, "inert-data");
    assert.equal(result.candidate_kind, "unexpected-match");
    assert.equal(result.raw_match.text, "vitest run fixture.test.js | tail");
  });

  test("blanks inert-sink prose while preserving executable substitutions", () => {
    const prose = interpretCommand('echo "vitest run fixture.test.js | tail"');
    const proseResult = prose.matchRule(VITEST_PIPE_RULE);
    assert.equal(proseResult.matched, false);
    assert.equal(proseResult.match_origin, "inert-data");
    assert.equal(proseResult.candidate_kind, "unexpected-match");

    const substitution = interpretCommand('echo "$(vitest run fixture.test.js | tail)"');
    const substitutionResult = substitution.matchRule(VITEST_PIPE_RULE);
    assert.equal(substitutionResult.matched, true);
    assert.equal(substitutionResult.match_origin, "executable");
    assert.equal(substitutionResult.candidate_kind, "ordinary-rule-fire");
  });

  test("blanks canonical CLI JSON payloads but keeps real sibling pipes visible", () => {
    const cli = interpretCommand(
      `node tools/learning-loop-mastra/bin/loop.mjs meta_state_resolve '{"resolution":"pnpm test 2>&1 | tail"}'`,
    );
    assert.equal(cli.matchRule(VITEST_PIPE_RULE).matched, false);

    const sibling = interpretCommand(
      `node tools/learning-loop-mastra/bin/loop.mjs meta_state_list '{}' ; pnpm test 2>&1 | tail`,
    );
    const result = sibling.matchRule({
      ...VITEST_PIPE_RULE,
      pattern: "pnpm\\s+test.*\\|\\s*tail",
    });
    assert.equal(result.matched, true);
    assert.equal(result.match_origin, "executable");
  });

  test("keeps malformed raw matches visible and unknown", () => {
    const interpretation = interpretCommand('bash -c "unterminated vitest run fixture.test.js');
    const result = interpretation.matchRule(VITEST_RULE);

    assert.equal(result.matched, true);
    assert.equal(result.match_origin, "unknown");
    assert.equal(result.candidate_kind, "unclassified");
    assert.equal(result.raw_match.text, "vitest run");
  });

  test("retains mixed provenance when one raw Rule match spans inert and executable data", () => {
    const interpretation = interpretCommand(
      "cat <<'EOF'\nvitest run fixture.test.js\nEOF\n; vitest run real.test.js | tail",
    );
    const result = interpretation.matchRule(VITEST_RULE);

    assert.equal(result.matched, true);
    assert.equal(result.match_origin, "mixed");
    assert.equal(result.candidate_kind, "unclassified");
    assert.equal(result.raw_match.text, "vitest run");
  });

  test("does not expose parser, blanking, or recurrence normalization details", () => {
    const interpretation = interpretCommand("echo 'vitest run fixture.test.js'");

    assert.deepEqual(Object.keys(interpretation), ["matchRule"]);
    assert.equal("normalized" in interpretation, false);
    assert.equal("segments" in interpretation, false);
    assert.equal("blanked" in interpretation, false);
    assert.equal("raw" in interpretation, false);
  });

  test("requests the existing coarse recurrence key independently", () => {
    const command = "cat <<'EOF'\npnpm test fixture | tail\nEOF\n";
    const interpretation = interpretCommand(command);
    const expected = `rule-no-raw-stdout-vitest::${hashRecurrenceKey(
      "rule-no-raw-stdout-vitest",
      normalizePrefixForKey(command),
    )}`;

    assert.equal(requestRecurrenceKey(interpretation, "rule-no-raw-stdout-vitest"), expected);
  });

  test("returns an explicit unsupported fact for non-regex Rules", () => {
    const interpretation = interpretCommand("pnpm exec vitest run suite.test.js");
    const result = interpretation.matchRule({
      id: "rule-path",
      pattern_type: "glob",
      pattern: "tools/**",
    });

    assert.equal(result.matched, false);
    assert.equal(result.supported, false);
    assert.equal(result.match_origin, "unknown");
    assert.equal(result.candidate_kind, "unclassified");
  });
});
