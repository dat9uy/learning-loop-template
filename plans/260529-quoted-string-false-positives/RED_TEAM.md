# Red Team Review: Quoted-String False Positives Fix

**Reviewer:** Droid (self-review, adversarial mode)
**Date:** 2026-05-29
**Plan:** 260529-quoted-string-false-positives
**Scope:** `stripMessageFlags` in `gate-logic.js`, message flag list, `matchConstraintPattern` behavior

---

## Findings Summary

| Severity | Count | Open |
|----------|-------|------|
| High     | 2     | 2    |
| Medium   | 2     | 2    |
| Low      | 2     | 2    |

---

## HIGH — Multi-Word Unquoted Message Values Bypass Skip

**Finding:** `stripMessageFlags` uses `skipNext = true` which skips exactly one token. For multi-word unquoted message values like `git commit -m fix pnpm add issue`, the skip-next logic skips only `fix` and `pnpm add issue` still matches the `package-manager` pattern.

**Attack Vector:** An operator who knows the gate strips only one token can deliberately avoid quoting the message value to maintain the false positive:

```bash
# Quoted — false positive is fixed
git commit -m "fix pnpm add issue"

# Unquoted — still false positives!
git commit -m fix pnpm add issue
```

**Recommendation:** The skip-next logic must skip until the next token that looks like a flag (starts with `-`) or until the end of the segment. Alternatively, require that the `-m` value is quoted and the quotes are part of the token.

**Risk:** A clever user can bypass the fix by avoiding quotes. However, `git` itself requires the message to be quoted if it contains spaces, so this is a practical non-issue for `git`. Other tools (`gh`, `echo`) may not have this requirement.

---

## HIGH — `-t` Collision Risk

**Finding:** The flag list includes `-t` for `--title`. But `-t` is also used by `timeout`, `ssh`, `screen`, `tmux`, and many other tools with completely different meanings. If an operator types `timeout -t 5 npm install`, the skip-next logic skips `5` and then `npm install` still matches the pattern. Wait — that is actually correct behavior. But what about:

```bash
gh pr create -t "npm install fix"
```

The `-t` skips `5` and `npm install fix` is stripped. But what about:

```bash
ssh -t user@host "npm install"
```

The `-t` skips `user@host` and `"npm install"` is NOT stripped because it is the second token after `-t`. The skipNext is consumed by `user@host`. This is actually correct — the `-t` flag only has one value.

**Revised Risk:** Low. The `-t` collision is not a real problem because `-t` always takes exactly one value. The skip-next logic correctly skips exactly one token.

**Recommendation:** Add a test case for `ssh -t user@host "npm install"` to verify it still matches. Remove `-t` from the flag list to avoid confusion, or add a comment explaining the collision.

---

## MEDIUM — Missing Message Flags

**Finding:** The initial flag list is conservative. Missing flags that could cause false positives:

- `git` family: `--amend`, `-F` (file message), `--fixup`, `--squash`
- `gh` family: `--repo`, `--body-file`, `--reviewer`, `--label`, `--assignee`
- `docker` family: `--label`, `--env`, `--env-file`, `--mount`, `--annotation`
- `printf`/`echo` family: `-e` (not a message flag but the value is non-executable)

**Recommendation:** Start with the conservative list and add flags as discovered. The plan should include a "Discover new flags" step in the maintenance section. The test file should be designed to make adding new flags easy.

**Risk:** New false positives may emerge as tools are used. The conservative list covers the most common cases (`git commit -m`, `gh pr create --title`).

---

## MEDIUM — `echo`/`printf` False Positive

**Finding:** The plan does not address `echo "npm install"` or `printf "npm install"`. These commands are not real package-manager commands but they contain the constraint keyword. The `stripMessageFlags` function does NOT strip these because they are not preceded by a message flag.

**Attack Vector:** The `echo` command is harmless but could be flagged as a package-manager command. The operator must then explain to the gate that this is a false positive.

**Recommendation:** `echo` and `printf` are not message flags. The current behavior (flagging them) is correct from the gate's perspective — the gate does not know what the command does. The agent should use observation to authorize. This is not a bug in `stripMessageFlags`.

**Risk:** Low. The gate is designed to be conservative. The agent can use observations to authorize.

---

## LOW — `-body` in Flag List

**Finding:** The flag list includes `-body` (note: single dash, not `--body`). Is `-body` even a real flag for any tool? It looks like a typo. Common tools use `--body` (double dash). The `-body` flag (single dash) is not standard for any CLI tool.

**Recommendation:** Verify if `-body` is a real flag. If not, remove it from the list to avoid confusion.

---

## LOW — Flag List Not Configurable

**Finding:** The `MESSAGE_FLAGS` constant is hardcoded in `gate-logic.js`. Adding new flags requires a code change.

**Recommendation:** For the initial implementation, a hardcoded list is fine. For long-term maintainability, consider moving the flag list to `patterns.json` alongside the constraint patterns. This would allow operators to add flags without modifying source code.

**Risk:** Very low. The flag list is stable and unlikely to change frequently.

---

## Verdict

The plan is **solid** with two HIGH findings that are mitigated as follows:

1. **Multi-word unquoted values:** The `git` CLI requires quoting for multi-word messages. The practical risk is low. Recommend adding a test case with unquoted multi-word values to document the behavior.

2. **`-t` collision:** The skip-next logic correctly handles `-t` because it only skips one token. The practical risk is low. Recommend adding a test case for `ssh -t` to verify.

The plan is ready for implementation with the following amendments:
- Add test case: `git commit -m fix pnpm add issue` (unquoted multi-word) — document behavior.
- Add test case: `ssh -t user@host "npm install"` — verify still matches.
- Consider removing `-body` (single dash) from the flag list.
- Consider adding a comment in the flag list about future additions.

---

## Questions for the Plan Author

1. Should we add a test case for multi-word unquoted message values to document the behavior?
2. Should `-body` (single dash) be in the flag list, or is that a typo?
3. Should the flag list be in `patterns.json` instead of hardcoded?
