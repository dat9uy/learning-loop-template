# Phase 1 Spike — shell-quote parse() output for plan bypass shapes

Date: 2026-08-07
Branch: 260807-1349-meta-state-resolve-and-cli-argv-scope-drift-finding
Owner: shell-quote adoption (parse-only classify-only flow, CVE-2026-9277 mitigation)

## Outcome

shell-quote@1.10.0 installed as a direct dep (`^1.10.0`); parse-only
shim at `tools/learning-loop-mastra/core/shell-parse.js` re-exports
`parse` only and never `quote`. Guard tests at
`tools/learning-loop-mastra/__tests__/legacy-mcp/shell-quote-guard.test.js`
all 13 green.

## Side-effect discipline (recorded)

- `gate_check "pnpm add shell-quote@>=1.10.0"` → ok
- `runtime_state_record shell-quote-1.10.0-adopt-2026-08-07` (after
  `gate_mark_preflight({surface:"runtime-state"})`)
- `meta_state_report category:"budget-check"`
  → `meta-260807T1704Z-adopt-shell-quote-1-10-0-as-parse-only-dep-behind-bash-gate`

## Guard tests (13/13 green)

Three groups, each guarding one mitigation:

- **Version pin:** installed shell-quote meets the `>=1.10.0` floor; root
  package.json declares a `^1.10.0`-or-higher range. Asserted by reading
  `node_modules/shell-quote/package.json` + the root `dependencies` block.
- **`quote` not importable:** the shim exports `parse` only (no `quote`);
  the path-wide grep guard rejects any direct `import { quote } from
  "shell-quote"` (or `require("shell-quote").quote` or
  `from "shell-quote" ... quote(`) anywhere in
  `tools/learning-loop-mastra/core/` or `hooks/`. Catches a future bypass
  where a different module imports `quote` without going through the
  shim.
- **Parse-does-not-interpret:** `parse("echo $(echo evil)")` returns
  `["echo","$",{op:"("},"echo","evil",{op:")"}]` — the substitution is
  tokenized as `$ / ( / echo / evil / )`, not evaluated. If parse() ever
  executed the inner command, the resolved output would replace the
  tokens. Same for backticks — preserved with backtick characters in
  the token stream.

## Spike output (parse for the 6 bypass shapes)

```text
echo-concat:           ["echo","widgetctl run evil",{op:"|"},"bash"]
printf-v:              ["printf","-v","x","evi",{op:";"},"bash"]
bash-here-string:      ["bash",{op:"<<<"},"$(echo ev)$(il)"]
eval-quoted-var:       ["eval",""]
node-e:                ["node","-e","console.log(\"hi\")"]
pnpm-pipe-tail:        ["pnpm","test:one","foo.test.js","2",{op:">&"},"1",{op:"|"},"tail"]
```

Key observations (for Phase 2 shim):

- **Adjacent-quote concat collapses into one string token.**
  `"widgetctl"" run evil"` parses as the single string `"widgetctl run
  evil"` (with a space). The two quoted contexts are concatenated by
  the tokenizer. The shim records this as `quotedDataArgs` for the
  `echo` segment — the verb + pipe-target are still visible.
- **`eval "$x"` collapses to `["eval",""]`.** shell-quote drops the
  variable reference entirely (it has no content to tokenize). The
  shim still recognizes `eval` as the verb; the body is empty, which
  matches the policy view's invariant.
- **Here-string `<<<` is a single op token** (`{op:"<<<"}`) — the
  shim can detect it as a redirect.
- **`2>&1` parses as `[{op:">&"},1]`** — fd duplication is an op +
  fd-number pair. The shim treats this as a redirect-flag (used by
  the redirect/exec withholds).
- **Logical ops vs pipes:** `{op:";"}`, `{op:"|"}`, `{op:"<<<"}`,
  `{op:">&"}` are all `op` tokens the shim distinguishes from string
  tokens. Real pipes (`|`) set `pipeTarget`; logical ops (`;`, `&&`,
  `||`) do not.

## Files changed

- `package.json` — `"shell-quote": "^1.10.0"` in `dependencies`.
- `tools/learning-loop-mastra/core/shell-parse.js` (new) — parse-only
  re-export of `parse`; comments explain the security boundary
  (CVE-2026-9277 mitigation).
- `tools/learning-loop-mastra/__tests__/legacy-mcp/shell-quote-guard.test.js`
  (new) — version + import + parse-only invariant guards.

## Phase 1 success criteria

- [x] shell-quote >=1.10.0 in package.json; installed version asserted by test.
- [x] `quote` not importable from shell-quote anywhere in core/+hooks/
      (grep-based test guard green).
- [x] `parse()` does not evaluate `$(...)` (test guard green).
- [x] Spike output confirms verb + pipe-target + quoted-data are
      identifiable for all 6 brainstorm shapes.
- [x] Side-effect discipline recorded (gate_check + ledger +
      budget-check report).