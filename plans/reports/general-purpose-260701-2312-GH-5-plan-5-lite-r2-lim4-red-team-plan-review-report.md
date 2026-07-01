# Red-Team Review: Plan 5-Lite (R2 + LIM-4; LIM-3 dropped) — SECURITY ADVERSARY Lens

**Reviewer lens:** Security Adversary (hostile reviewer of `/ck:plan`)
**Plan path:** `plans/260701-2250-plan-5-lite-r2-lim4/plan.md`
**Review date:** 2026-07-01
**Reviewer:** general-purpose (security adversary persona)
**Reviewer frame:** assume every input is attacker-controlled; assume the harness, env vars, allowlist file, and operator's environment are all potentially weaponized. Score exploitability, not just theoretical risk.

---

## Acceptance verdict

**APPROVE-WITH-FIXES — 6 must-fix, 4 should-fix, 12 nice-to-have.**

The threat-model reframe is **correct in spirit**: dropping LIM-3 in local-stdio-MCP is defensible because its threat model collapses (conditions 1, 2, 3 collapse — see reframe report §"Why LIM-3's threat model is weak"). Identity pinning via `LOOP_SURFACE` is a real defense-in-depth against cross-runtime surface writes and is the right shape for the local case. The plan is small (~9 files, ~470 LoC), TDD-first structured, and has clear audit-log semantics.

However, the plan has **6 must-fix gaps** that an attacker can exploit the moment the gates ship:

1. **A1/A3 (closure immutability not enforced by test):** the plan asserts `pinnedRuntimeId` cannot be mutated, but provides no test. A future refactor that swaps the closure variable for a settable property silently re-opens the spoofability door.
2. **A6 (allowlist self-edit not gated):** `.loop/r2-allowlist.json` is the trust anchor for R2, but the plan does not gate writes to it. A tool that can call `Write` to `.loop/r2-allowlist.json` extends itself full filesystem access. **This is the single biggest gap.**
3. **A10 (path-field detection unspecified):** the plan says R2 checks `pathFields` but does not name the detector or its rules. A tool that smuggles a write path through a non-path-named arg (e.g., `meta_state_log_change({ change_diff: { added: ["../../etc/cron.d/evil"] } })`) bypasses R2 entirely.
4. **A11 (read-then-write composition):** the plan explicitly says reads are not gated (per reframe Open Q #3). A tool that reads another runtime's secrets and crafts a write through a different vector (workflow write, agent tool, MCP tool that escapes `createLoopTool`) is the canonical identity-theft → cross-write chain.
5. **A13/A14 (LIM-4 TOCTOU + hardlink):** the plan says "one `realpath` syscall + one startsWith check" (NF1). If realpath is called once at the gate then the file system races (symlink swap, hardlink replacement) before the actual write — the gate passes on a benign path but the write hits an attacker-controlled target.
6. **A19/A20 (audit-log JSONL injection):** the plan says gate emits `gate_log` JSONL on denials, but does not specify whether the log writes escape newlines or restrict caller-supplied fields. A tool with control over a logged field (e.g., the `path`) can inject fake denial entries or forge override markers.

The other 16 attack vectors surface as **should-fix / nice-to-have** items and are listed for completeness.

---

## Findings (numbered, severity-ordered)

### Finding R1 — CRITICAL: `.loop/r2-allowlist.json` is the trust anchor but not write-gated (Attack A6)
**Severity:** CRITICAL
**Exploitability:** HIGH (no special conditions; works the moment a tool can call `Write` to `.loop/`)
**Location:** Plan §Phase 1 F1 (allowlist file); Plan §Phase 3 C5 (audit-log on edit)
**Attack vector:** A6 (allowlist file write)

**Threat model.** The allowlist `.loop/r2-allowlist.json` is the **trust anchor** of the entire R2 gate — every `checkR2Ownership()` call resolves ownership against this file. The plan does not specify who can write to it or how writes are audited (only Phase 3 C5 adds an `appendGateLog` on edits, which is reactive — the file is already corrupted by the time the log entry lands).

Concrete attack: Claude Code (or any tool with `Write`/`Edit` capability that targets `**.json`) writes `.loop/r2-allowlist.json` with `{ "claude-code": { "own": [".claude/**"], "deny": [], "universal": ["**/*"] } }`. The R2 gate's next call resolves ownership against the corrupted file → all writes are allowed → cross-runtime surface write is open.

The bash-gate (`core/evaluate-bash-gate.js`) is **not** the right defense: it pattern-matches command strings, not file paths of MCP tool arg writes. The MCP tool wrapper itself (R2 inside `createLoopTool`) sees the write **after** it's already going through the legitimate path-resolution flow; R2's `checkR2Ownership` only fails if the allowlist says so.

The plan's Phase 3 C5 ("audit log on every edit") is **reactive, not preventive** — once the file is written, the gate has already been subverted for the lifetime of the cached allowlist (NF1: "Allowlist loaded once at server boot; operator edits require restart"). The audit log entry is appended AFTER the new allowlist has been loaded.

**Recommendation.**

1. **Self-bootstrap rule:** R2 must deny any write whose target path resolves to `.loop/r2-allowlist.json`. This is a hard-coded static rule, not a configurable one. Add to F1: "R2 gate denies ALL writes to `.loop/r2-allowlist.json` regardless of allowlist contents (the allowlist is its own gate's bootstrap, not modifiable through the gate it bootstraps)."
2. **Bootstrap path:** allowlist edits MUST go through an MCP tool (`update_r2_allowlist`) that requires operator preflight (`gate_mark_preflight`). The tool writes to a temp file, validates schema, then renames; the MCP server then re-reads the cached allowlist (NF1 must change from "loaded once at boot" to "re-readable on operator preflight" OR the preflight marker itself triggers a reload).
3. **Audit-log ordering:** write the `appendGateLog` entry **before** the file rename (Phase 3 C5 step reorder). If the rename fails, the log still records the intent.
4. **Test:** add `__tests__/r2/ownership.test.js` cases asserting:
   - `checkR2Ownership({ runtime, path: '.loop/r2-allowlist.json' })` returns `denied` for ALL runtimes including `claude-code`.
   - A tool write to `.loop/r2-allowlist.json` via the MCP wrapper throws `cross_runtime_write_denied` with `hint: "r2-allowlist.json is operator-controlled; use update_r2_allowlist MCP tool"`.

---

### Finding R2 — HIGH: closure variable vs. property pattern not asserted by test (Attacks A1, A3)
**Severity:** HIGH
**Exploitability:** MEDIUM (requires a future refactor to break the closure invariant)
**Location:** Plan §Phase 1 "Identity pinning" (lines 92-114 in the plan stub)
**Attack vector:** A1 (env-var spoofing), A3 (re-pin request)

**Threat model.** The plan asserts `pinnedRuntimeId` is a closure variable and `getPinnedRuntimeId()` reads it without re-reading `process.env.LOOP_SURFACE`. The plan **does not specify** whether this is a `let pinnedRuntimeId = null` reassignable variable or a `const` tuple, and does not provide a test that proves `process.env.LOOP_SURFACE = 'malicious'` mid-process does not flip the pinned value.

Concrete attack: a future refactor swaps the closure variable for an object property (e.g., `const state = { pinnedRuntimeId: null }; ...state.pinnedRuntimeId = SURFACE_TO_RUNTIME[process.env.LOOP_SURFACE]`). A tool that calls a helper exposing `state` (e.g., via a leaked reference or a debug `getState()` export) can flip the pinned value. The plan's defense ("closure variable, not env-derived") is **asserted but not tested**.

A1: even with closure-variable, if `pinRuntimeIdAtBoot()` reads `process.env.LOOP_SURFACE` at process boot and an attacker has **already injected** the env var before the MCP server spawns (via a malicious `.bashrc` or pre-hook), the gate pins to the attacker's surface. The plan does not address boot-time injection — only "freeze for process lifetime" (mid-process).

A3: the plan does not enumerate all re-pin code paths. If a future test helper exposes `setPinnedRuntimeId(newRuntime)`, any test that uses it (and forgets to clean up) bleeds into the next test's `pinnedRuntimeId`.

**Recommendation.**

1. **Test R1 (immutability):** add `__tests__/pin-runtime-id.test.js` with cases:
   - Spawn a fake MCP server with `LOOP_SURFACE=.claude`. Confirm `getPinnedRuntimeId() === 'claude-code'`.
   - From within a tool execute, do `process.env.LOOP_SURFACE = '.factory'`. Confirm `getPinnedRuntimeId()` STILL returns `'claude-code'` (no re-read).
   - Confirm no `setPinnedRuntimeId` export exists in `mastra/server.js` or `create-loop-tool.js`.
2. **Test R2 (boot-time rejection):** confirm the error message for missing `LOOP_SURFACE` is exactly: `"LOOP_SURFACE env var is required at process boot; set by harness .cjs shim"`. If a future refactor shortens this or removes the "set by harness .cjs shim" hint, operators get a confusing error.
3. **Use `Object.freeze`:** wrap the pinned value in a frozen object `{ readonly runtime: string }` (or use a getter-only property on a frozen object) so even accidental assignment throws in strict mode.
4. **Surface registry integrity test:** add `__tests__/surfaces.test.js` case asserting `SURFACES` is `Object.freeze([...])` (already true per `core/surfaces.js:16`, but lock it).

---

### Finding R3 — HIGH: path-field detector unspecified; smuggling through non-path-named args (Attack A10)
**Severity:** HIGH
**Exploitability:** MEDIUM (requires knowing which tools smuggle paths through non-path-named args)
**Location:** Plan §Phase 1 F4 (per-surface mapping); referenced Researcher B audit (`plans/reports/researcher-B-260701-lim4-r2-allowlist-report.md`)
**Attack vector:** A10 (path-bearing argument detection)

**Threat model.** The plan says R2 detects `pathFields` (per-tool list of argument names that carry paths). The plan **does not specify**:
- which detector module checks `pathFields`
- whether the detector covers **all** path-bearing args (including dynamic ones, JSON-stringified paths, base64-encoded paths, paths inside `content` fields)
- what happens when a tool has NO `pathFields` defined (deny by default? allow by default?)

Concrete attacks:

**A. JSON-stringified path:** a tool's arg is `metadata: { file: "/path/to/write" }` — stringified JSON in a `metadata` field. The detector does not look inside `metadata` because it's not in `pathFields`. R2 does not fire. The tool's execute body parses the JSON and writes.

**B. Array of paths:** a tool accepts `targets: ["../../etc/cron.d/x", ".claude/hooks/y"]` where `targets` is not in `pathFields`. R2 does not fire.

**C. Path inside `content`:** `Write`-equivalent tool accepts `content` (a string). The string contains a `#!/bin/bash\nln -s ...` shebang that, when written and chmod'd, becomes an executable. R2 does not fire on `content` because it's not a path. (This is content-injection, not path-spoofing — covered separately.)

**D. Default-allow for unknown tools:** if `pathFields` is undefined for a tool (e.g., new tool added via `agents-manifest.json`), R2 either:
  - Defaults to deny (safe but breaks new tools silently)
  - Defaults to allow (unsafe; bypasses R2 entirely)
  - Throws on missing `pathFields` (loud; breaks process boot)
  The plan does not specify.

**Recommendation.**

1. **Default-deny on missing `pathFields`:** if a tool's `pathFields` is undefined, R2 throws `path_fields_undefined_for_tool` and escalates. The boot-time tool manifest validator (already in `mastra/server.js:31-44`) must require every tool to declare its `pathFields` (or explicitly opt in with `pathFields: []` for tools with no path args).
2. **Recursive scan with allowlist:** path-field detection should recursively scan string-valued args up to depth 3, matching each string against `globMatch(allowlistEntry, str)`. JSON-stringified paths are NOT scanned (the string is opaque until the tool parses it — that's a tool-bug, not a gate-bug). Document this limitation.
3. **Specific case:** `meta_state_log_change` has `change_diff: { added: ["..."], removed: ["..."], changed: ["..."] }` — these ARE paths. Add `pathFields: ['change_diff.added', 'change_diff.removed', 'change_diff.changed']` to the per-tool allowlist map. If a future `change_target` field is added without updating the map, R2 throws.
4. **Test:** `__tests__/r2/path-field-detector.test.js` cases:
   - Tool with `pathFields: ['file_path']`, arg `{ file_path: '.factory/x', extra: '../../etc/y' }` → fires only on `.factory/x` (matches `deny` for claude-code).
   - Tool with NO `pathFields` defined → throws at boot.
   - Tool with `pathFields: []` (explicit no-path) → R2 returns `allowed_no_paths`.
   - Array arg `targets: ['.factory/x', '.claude/y']` → fires on both.

---

### Finding R4 — HIGH: read-then-write composition breaks the "reads not gated" assumption (Attack A11)
**Severity:** HIGH
**Exploitability:** MEDIUM (requires a tool with both read access and write capability)
**Location:** Plan §Phase 1 (no read gating); Reframe Open Q #3 ("reads not gated")
**Attack vector:** A11 (read-then-write)

**Threat model.** The plan explicitly states reads are not gated (per reframe Open Q #3). The threat: a runtime with read access to all surfaces (because the developer grants `meta_state_read` cross-surface) reads another runtime's secrets, then crafts a write through a different vector.

Concrete attack chain:

1. Tool A reads `.factory/coordination/credentials.json` via `meta_state_read` (reads not gated — OK).
2. Tool A reads `.claude/coordination/runtime-private-key.bin` via raw `fs.readFileSync` — the read succeeds because (per reframe) "the harness can read any file the user can read".
3. Tool A writes `.claude/coordination/some-hook.cjs` via R2-bypassing vector (e.g., a workflow write or an agent tool outside `createLoopTool`).

The R2 gate, which only checks writes, does not catch this. The LIM-4 path containment, which only checks user-path joins, does not catch this (the file system call goes through `fs.writeFileSync` directly, not through `resolveSafePath`).

The "reads not gated" decision was made for cost reasons (avoids per-read policy evaluation), but the **attack model must explicitly account for the composition attack** — a read-then-write chain where the read enables a cross-runtime write.

**Recommendation.**

1. **Document the composition attack:** add a "Threats NOT addressed by this plan" section to `docs/security/plan-5-hardening.md`. Explicitly list:
   - Read-then-write composition (covered by R2 only if the write goes through `createLoopTool`).
   - Credential exfiltration via tool stdout (no defense).
   - Identity-spoofing via `meta_state_resolve({resolved_by: 'operator'})` (the other LIM-3 master-tracker row, deferred per reframe §"Unresolved for next session" #2).
2. **Workflow-write coverage:** verify that ALL `run_*` workflow tools also flow through `createLoopTool`. The current `server.js:78-161` defines `convertWorkflowsToTools` which uses `createTool` (NOT `createLoopTool`) — **workflow tools bypass R2 today.** This is a separate gap; flag as P1 follow-up.
3. **Agent-write coverage:** verify `agents-manifest.json` agents do not expose write-capable tools outside `createLoopTool`. (Same gap.)
4. **Test:** `__tests__/r2/ownership.test.js` workflow-coverage case: register a workflow with a write-bearing step, confirm it flows through R2 OR is documented as out-of-scope.

---

### Finding R5 — HIGH: LIM-4 NF1 (one realpath + one startsWith) has TOCTOU window and hardlink gaps (Attacks A13, A14)
**Severity:** HIGH
**Exploitability:** MEDIUM (TOCTOU: tight timing; hardlink: filesystem-dependent)
**Location:** Plan §Phase 2 NF1; LIM-4 audit sites (`refresh-fingerprint`, `check-grounding`, `derive-status`, `gate-logic#resolveEvidence`, 2 test-runner tools)
**Attack vector:** A13 (symlink TOCTOU), A14 (hardlink escape)

**Threat model.** The plan says `resolveSafePath(root, userPath)` performs "one `realpath` syscall + one startsWith check" (NF1). This is fast but has two gaps:

**A13 (TOCTOU).** If the gate calls `realpath(userPath)` (which resolves symlinks) and then the tool's execute body calls `fs.writeFile(userPath, content)` (which does NOT re-resolve), an attacker who can race the filesystem (e.g., a watcher process) can:
1. Place a benign file at `userPath` (gate realpath resolves to `/tmp/benign`).
2. Gate passes (startsWith `/tmp/benign` matches root).
3. Attacker replaces `userPath` with a symlink to `/etc/cron.d/evil`.
4. Tool writes to `/etc/cron.d/evil` via the symlink.

Linux is permissive enough for this race to be reproducible under tight timing (e.g., another thread or a recurring cron).

**A14 (hardlink).** On Linux ext4/xfs, hardlinks share inodes. If `userPath` is a hardlink inside the root pointing to `/etc/passwd` (inode 12345), `realpath(userPath)` returns the path inside the root (e.g., `/project/.claude/x`), NOT `/etc/passwd`. `realpath` does NOT resolve hardlinks — only symlinks. So the gate passes; the tool writes to the inode 12345 which IS `/etc/passwd`. **Hardlink escape is silent.**

(Linux behavior: `realpath(3)` returns the path with all symlinks resolved but does NOT resolve hardlinks because hardlinks have no canonical path. `readlink -f` is identical. The only defense is `stat().ino` + compare against the root's `stat().ino` — but a file can have multiple hardlinks to different paths.)

**Recommendation.**

1. **TOCTOU defense:** use `realpath` + `O_NOFOLLOW` + write-to-fd pattern:
   ```js
   const realRoot = realpath(root);
   const realUser = realpath(userPath);  // resolves symlinks; NOT hardlinks
   if (!realUser.startsWith(realRoot + path.sep) && realUser !== realRoot) throw new PathContainmentError();
   const fd = open(realUser, O_WRONLY | O_CREAT | O_NOFOLLOW, mode);
   // O_NOFOLLOW fails if the path is a symlink (NOT a hardlink; O_NOFOLLOW does not catch hardlinks).
   ```
   This narrows but does not close the window. To fully close, write through the `fd` (avoid `fs.writeFile(realUser, ...)`).
2. **Hardlink defense:** explicitly reject hardlinks by comparing `statSync(realUser).nlink`:
   ```js
   const stats = lstatSync(realUser);
   if (stats.nlink > 1) throw new PathContainmentError("hardlink rejected");
   ```
   But this rejects legitimate multi-link files (e.g., `node_modules/.bin/foo` symlinks). Document the trade-off; consider a `pathAllowHardlink: boolean` per-call option.
3. **Re-realpath before write:** the `resolveSafePath` helper should be invoked **inside the tool's execute body**, not in the gate. The gate's role is pre-flight; the tool's execute body is the actual write. The current plan (NF1) suggests gate-side; verify the tool-execute path also calls `resolveSafePath`.
4. **Test:** `__tests__/path-containment.test.js` cases:
   - Symlink race: spawn a watcher that swaps the symlink target mid-check; confirm `resolveSafePath` catches it on second realpath call (within the tool execute).
   - Hardlink escape: create a hardlink to `/etc/passwd` inside the root; confirm `resolveSafePath` rejects (nlink > 1).
   - TOCTOU window documented in the test's docstring.

---

### Finding R6 — HIGH: audit-log JSONL injection lets tools forge denial entries or override markers (Attacks A19, A20)
**Severity:** HIGH
**Exploitability:** MEDIUM (requires control of a logged field)
**Location:** Plan §Phase 1 F6 (gate_log on denial); Phase 3 C5 (audit-log on allowlist edit)
**Attack vector:** A19 (audit log injection), A20 (override audit gap)

**Threat model.** The plan says the gate emits a `gate_log` row on every denial: `{ error: "cross_runtime_write_denied", runtime, tool, path, hint, denied_at }`. The `path` field comes from caller-supplied tool args (the tool call's pathField value). If the path contains a newline (`\n`), the JSONL appender writes:
```jsonl
{"error":"cross_runtime_write_denied","path":"foo\n{\"forged\":\"override_marker\"}\n"}
```
The next line is now a forged entry. If `gate_log` is later read by `gate-override.js` (which iterates `.claude/coordination/.gate-override`) or by `surfaces.readJsonlFromAllSurfaces`, the forged entry is parsed as a legitimate log row.

A20 (override audit gap): per reframe Open Q #2, override is "silent-allow + audit log". If a tool can mutate `runtime-state.jsonl` (the override audit log location per `gate-override.js:88`), it can delete its own override entries post-hoc. The audit log is append-only IF the gate enforces append-only, but `gate-override.js` uses `appendFileSync` which IS append-only — except the gate-override itself is a regular file write (via `readModifyWriteOnAllSurfaces`), and a tool can `fs.writeFileSync('runtime-state.jsonl', '')` to truncate it. **The audit log is not protected by an immutability mechanism.**

**Recommendation.**

1. **JSON escape on log fields:** every field written to `gate_log` JSONL must be JSON.stringify'd (already the case in `gate-decision-log.js` per existing patterns) AND the resulting line must NOT contain raw `\n` or `\r`. Add an assertion: `if (serialized.includes('\n')) throw new Error('gate_log entry contains unescaped newline')`.
2. **Path validation:** the `path` field in the denial entry should be realpath-resolved before logging. If the path is malicious (e.g., `foo\nFORGED`), the `realpath` call fails OR returns a benign path. Document this.
3. **Audit log integrity:** the override audit log (`runtime-state.jsonl`) should be append-only via:
   - `chmod 0600` on the file (prevents other users from writing).
   - A `fs.writeFileSync` (truncate) attempt should be denied by R2 if the target is `runtime-state.jsonl` (similar to Finding R1's allowlist self-bootstrap rule).
4. **Override via marker, not log:** the override marker is `.claude/coordination/.gate-override` (a per-surface JSON file). Its edit path is `readModifyWriteOnAllSurfaces` which is atomic. But a tool with `fs.writeFileSync('.claude/coordination/.gate-override', ...)` can replace the marker. Add to R2: deny writes to `**/.gate-override` and `**/runtime-state.jsonl`.
5. **Test:** `__tests__/gate-log.test.js` cases:
   - Denial with `path: 'foo\n{"forged":"override_marker"}'` produces exactly ONE line in the log (no forgery).
   - Serialized entry contains no raw newlines or carriage returns.
   - Tool write to `.gate-override` is denied by R2 with hint `gate-override is operator-controlled`.

---

### Finding R7 — MEDIUM: subprocess spawn inherits env, but re-pin policy not enforced (Attack A2)
**Severity:** MEDIUM
**Exploitability:** LOW (requires a tool to inner-spawn an MCP child; unusual but possible)
**Location:** Plan §Phase 1 (no subprocess spawn policy); Plan §"Identity pinning"
**Attack vector:** A2 (subprocess spawn)

**Threat model.** The plan pins `pinnedRuntimeId` in the parent MCP server process. If a tool inside the MCP server spawns a child process (e.g., via `child_process.spawn('node', ['child-mcp-server.js'])`), the child inherits `process.env.LOOP_SURFACE` from the parent. The child's `pinRuntimeIdAtBoot()` would read the SAME env var, so it pins to the SAME runtime. **This is correct behavior.**

BUT: the plan does not enforce that the child's pinned value matches the parent's. A buggy or malicious tool could spawn a child with `env: { LOOP_SURFACE: '.factory' }` (override the inherited env). The child pins to `.factory`. The child can now perform R2-checked writes that the parent (Claude) cannot. **Cross-runtime write via child MCP server.**

This is the exact attack LIM-3 was designed to catch (per reframe report §"Why LIM-3's threat model is weak"), and the plan defers it. For local stdio MCP, this is theoretical; for a future where tools inner-spawn MCP servers, it's a real gap.

**Recommendation.**

1. **Document the threat:** add to Phase 1 risks: "If a tool spawns a child process with overridden env, the child can re-pin to a different surface. R2 does not detect this; defense is upstream (gate the spawn itself via the bash-gate). The bash-gate already pattern-matches `child_process.spawn` invocations — verify it covers `node child-mcp-server.js`."
2. **Defense:** add a runtime check in `pinRuntimeIdAtBoot()` that asserts `process.env.LOOP_SURFACE === process.env.__LOOP_SURFACE_PARENT || process.env.__LOOP_SURFACE_PARENT === undefined`. If `__LOOP_SURFACE_PARENT` is set (meaning this process was spawned by a parent MCP), the child's surface must match the parent's. This is opt-in defense; ship in Phase 1 as documentation, not implementation.
3. **Test:** `__tests__/pin-runtime-id.test.js` subprocess-spawn case: spawn a child with `env: { LOOP_SURFACE: '.factory' }` from a parent pinned to `.claude`; assert child pins to `.factory` AND assert a warning is emitted (if the parent-detection logic is implemented).

---

### Finding R8 — MEDIUM: surface registry spoofing via path-collision (Attack A5)
**Severity:** MEDIUM
**Exploitability:** LOW (requires env var control at boot, which already requires code execution)
**Location:** Plan §Phase 1 F7 (SURFACES extension); Plan §"Identity pinning" (line 99-106)
**Attack vector:** A5 (surface registry spoofing)

**Threat model.** The plan extends `SURFACES = [".claude", ".factory", ".mastracode"]`. The pinning logic validates `process.env.LOOP_SURFACE` is in `SURFACES`. If an attacker sets `LOOP_SURFACE=.git` at boot (requires boot-time env injection, which is the same threat class as A1), the gate throws because `.git` is not in `SURFACES`. **This is correct.**

But what if the attacker sets `LOOP_SURFACE=.claude` (a legitimate surface) for a Droid CLI process? The plan says "Droid's shim sets `LOOP_SURFACE=.factory`". If the Droid shim is replaced or bypassed, the attacker pins to `.claude` and writes to `.claude/hooks/`. **The gate does not detect this — it's a legitimate surface for a non-Droid process.**

This is the original LIM-3 threat (caller-process identity spoofing) and the plan explicitly defers it per reframe §"The one attack LIM-3 catches that R2 misses".

**Recommendation.**

1. **Defense in depth via process inspection:** add a runtime check that `process.argv[0]` and `process.argv[1]` correspond to the expected harness for the surface (e.g., `.factory` must come from a Droid CLI process). This is fragile (argv can be spoofed) but adds a layer. Document as opt-in.
2. **Accept the gap:** the reframe correctly notes this is the one gap R2 cannot close without LIM-3. Document in `docs/security/plan-5-hardening.md` §"Out of scope" so future sessions know when to re-evaluate.
3. **Test:** `__tests__/pin-runtime-id.test.js` case: spawn with `LOOP_SURFACE=.claude` from a process whose `process.argv[0]` is `node` (not `claude-code` binary). Currently the gate pins to `.claude` without complaint. This is the documented gap.

---

### Finding R9 — MEDIUM: path normalization gaps in R2 (Attack A9)
**Severity:** MEDIUM
**Exploitability:** MEDIUM (requires the gate to skip normalization)
**Location:** Plan §Phase 1 F4 (allowlist); referenced `core/gate-logic.js:47-58` `globMatch`
**Attack vector:** A9 (path normalization)

**Threat model.** The plan's `checkR2Ownership({ runtime, pathFields, tool: id })` resolves the path against the allowlist's glob patterns. If the path is not normalized before the glob match:
- `pathFields: './/.factory/x'` (double slash) — does `globMatch('.factory/**', './/.factory/x')` match?
- `pathFields: './.factory/x'` (dot-slash prefix) — does the glob match?
- `pathFields: 'foo/../.factory/x'` (dot-dot inside) — does the glob match?
- Symlink: `pathFields: '/path/to/symlink'` where the symlink points to `.factory/x` — does R2 resolve the symlink before the match?

The existing `globMatch` in `core/gate-logic.js:47-58` does NOT normalize the path; it just regex-matches. So `./.factory/x` would not match `^\\.factory\\/.*$` because the regex expects the literal `.factory/` prefix, not `./.factory/`.

Concrete attack: a tool passes `pathFields: './/./.factory/x'` to evade R2's pattern match, then the tool's execute body normalizes internally and writes to `.factory/x`.

**Recommendation.**

1. **Normalize at the gate:** before `globMatch`, call `path.resolve(root, userPath)` then `path.normalize(...)` (resolves `./` and `..`). Strip leading slashes.
2. **Symlink resolution:** add `realpath(userPath)` to the normalization step. If the realpath resolves outside the root, deny before the glob match (LIM-4 covers this).
3. **Test:** `__tests__/r2/ownership.test.js` cases:
   - Path `.//.factory/x` → matches `deny` for claude-code (after normalization).
   - Path `./.factory/x` → matches `deny` for claude-code.
   - Path `.claude/../.factory/x` → resolved to `.factory/x` → matches `deny`.
   - Path `/absolute/path/to/.factory/x` → resolved against root → matches `deny` if inside project root, else out-of-scope.

---

### Finding R10 — MEDIUM: glob bypass edge cases (Attack A8)
**Severity:** MEDIUM
**Exploitability:** LOW (requires crafting a path that defeats the glob)
**Location:** Plan §Phase 1 NF2 ("in-memory glob match per call via `RegExp` translation"); existing `globMatch` in `core/gate-logic.js:47-58`
**Attack vector:** A8 (glob bypass)

**Threat model.** The existing `globMatch` in `gate-logic.js:47-58` translates glob to regex:
```js
p.replace(/\./g, '\\.')     // escape dots
 .replace(/\*\*/g, '⟨GLOBSTAR⟩')
 .replace(/\*/g, '[^/]*')    // single star
 .replace(/⟨GLOBSTAR⟩/g, '.*');
```

Edge cases:
- **Empty pattern:** `globMatch('', 'foo')` → regex `^$` → never matches. Safe (deny by default).
- **Pattern with `.` in middle:** `globMatch('docs.foo.js', 'docs.foo.js')` → after dot escape: `^docs\\.foo\\.js$` → matches. Safe.
- **`**` collision:** `globMatch('.claude/**', '.claude/foo/bar')` → regex `^\\.claude\\/.*$` → matches. But `globMatch('.claude/**', '.claudeFoo')` → regex `^\\.claude\\/.*$` → does NOT match (because of `\\/`). But `globMatch('.claude**', '.claudeFoo')` (no slash) → regex `^\\.claude.*$` → matches `.claudeFoo`! **Pattern `.claude**` (no slash before `**`) is overly permissive — matches `.claudeFoo` but not `.claude/Foo`.** This is the inverse of the typical glob convention where `**` requires a path separator.
- **Globstar semantics:** git's globstar requires `**/` for cross-directory matches; `**` alone matches any string including no chars. The existing implementation treats `**` as `.*` which matches empty string. So `globMatch('.claude/**', '.claude/')` matches (trailing slash + `.*` matching empty). Safe.

**Recommendation.**

1. **Lock the glob semantics:** add tests asserting the exact behavior of `globMatch` for edge cases. The current `core/gate-logic.js:47-58` lacks test coverage (only `core/evaluate-bash-gate.test.js` indirectly tests it).
2. **Explicit glob syntax:** define the glob grammar in `docs/security/plan-5-hardening.md` §"Allowlist format" so operators know `**` matches any chars including none, and `*` matches non-`/` chars.
3. **Reject ambiguous patterns:** at allowlist load time, warn (or deny) on patterns like `.claude**` (no slash) which may surprise operators. Specifically: if a pattern ends with `**` and the preceding char is not `/`, warn.
4. **Test:** `__tests__/r2/glob-match.test.js` cases:
   - Empty pattern → no match.
   - `.claude/**` matches `.claude/foo/bar` but NOT `.claudeFoo`.
   - `.claude**` matches `.claudeFoo` (document the semantics).
   - `docs/foo.{js,cjs}` expands to `docs/foo.js` and `docs/foo.cjs` (brace expansion already works per `expandBraces`).

---

### Finding R11 — MEDIUM: boot-time bypass via manual MCP server start (Attack A4)
**Severity:** MEDIUM
**Exploitability:** LOW (requires operator to bypass the harness shim)
**Location:** Plan §Phase 1 "Identity pinning" line 99-104; Plan §Dependencies "Identity prerequisite"
**Attack vector:** A4 (boot-time env injection)

**Threat model.** The plan says "If `LOOP_SURFACE` is unset, the MCP server fails to start with a clear error." This is the right defense. But:

1. **Error message clarity:** the plan shows the error message as `"LOOP_SURFACE env var is required at process boot; set by harness .cjs shim"`. The plan does NOT specify whether this error is fatal (uncaught throw that kills the process) or warning (logs but continues). Per NF3 ("fail-closed: any gate exception → deny + log + escalate"), the missing-env case should throw and kill.
2. **Manual start path:** an operator (or attacker with code execution) can `node tools/learning-loop-mastra/mastra/server.js` without the harness shim. The env var is missing → throw → process exits. **This is correct.** But the operator may not realize they needed the shim. The error message must point to docs.
3. **Mastra Code shim wiring:** the plan says Phase 3 must add `.mastracode/coordination/hooks/session-start-shim.cjs` that sets `LOOP_SURFACE=.mastracode` and re-points `.mastracode/hooks.json:SessionStart` at it. This shim is the ONLY way Mastra Code gets a valid `LOOP_SURFACE`. If the shim fails (Mastra Code's declarative hook system may not invoke a `SessionStart` hook before MCP starts), the env var is missing and MCP exits. **This is silent failure if the error is not surfaced to the user.**

**Recommendation.**

1. **Error message canonicalization:** define the exact error strings in a constants file (`mastra/identity-errors.js`) and assert in tests:
   - `MISSING_LOOP_SURFACE: "LOOP_SURFACE env var is required at process boot. Set it via the harness .cjs shim (see docs/security/plan-5-hardening.md#identity-pinning)."`
   - `INVALID_LOOP_SURFACE: "LOOP_SURFACE=<value> is not in SURFACES registry [<list>]. Update core/surfaces.js or use a registered surface."`
2. **Test:** `__tests__/pin-runtime-id.test.js` cases:
   - Spawn without env var → throws `MISSING_LOOP_SURFACE`.
   - Spawn with `LOOP_SURFACE=../etc` → throws `INVALID_LOOP_SURFACE`.
   - Spawn with `LOOP_SURFACE=.mastracode` → succeeds, pins to `mastra-code`.
3. **Operator runbook:** add to `docs/security/plan-5-hardening.md` §"Troubleshooting" the exact commands to verify the shim is wired (e.g., `node -e "console.log(process.env.LOOP_SURFACE)"` from the harness's session-start hook context).
4. **Mastra Code hook wiring probe:** add a `scripts/probe-mastracode-session-start.cjs` that verifies the shim is invoked before MCP starts. If not, fail the probe (similar to Plan 4 Finding 8's hook-latency assertion).

---

### Finding R12 — MEDIUM: race condition between allowlist edit and runtime cache (Attack A12)
**Severity:** MEDIUM
**Exploitability:** LOW (requires operator to edit the allowlist mid-runtime)
**Location:** Plan §Phase 1 NF1 ("Allowlist loaded once at server boot; operator edits require restart")
**Attack vector:** A12 (race conditions)

**Threat model.** NF1 says allowlist is cached for process lifetime. Operator edits require restart. But:
1. **No audit of the staleness:** if the operator edits the allowlist mid-runtime, the new file is on disk but the running MCP server uses the cached old version. The operator may not realize the running server is using stale data.
2. **No reload trigger:** the plan does not specify any signal that triggers allowlist reload. An operator who edits mid-runtime expects changes to take effect; the plan says they don't.
3. **Lock-step with override:** the existing `gate-override.js` uses mtime/size invalidation (1-second cache). R2 could use the same pattern (file-watching) for the allowlist.

**Recommendation.**

1. **Document the staleness window:** in `docs/security/plan-5-hardening.md` §"Operational notes" add: "Editing `.loop/r2-allowlist.json` mid-runtime has no effect until MCP server restart. To re-read, restart the harness session."
2. **Optional: mtime-based reload:** if the operator wants live reload, add a `R2_ALLOWLIST_RELOAD=1` env var that enables file-watching with mtime invalidation (similar to `gate-override.js:42-49`). Default OFF for predictability.
3. **Audit log on edit:** Phase 3 C5 already adds audit-log on edit. Add a `read_at` field to the log entry so the operator can correlate edits with restarts.
4. **Test:** `__tests__/r2/allowlist-cache.test.js` cases:
   - Load allowlist, modify file on disk, verify cached version is used.
   - With `R2_ALLOWLIST_RELOAD=1`, modify file, verify new version is loaded within 2 seconds.

---

### Finding R13 — MEDIUM: pre-commit hook bypass — allowlist file not in `.fallow` audit list (Attack A21)
**Severity:** MEDIUM
**Exploitability:** LOW (requires bypassing the pre-commit hook, which is operator-controlled)
**Location:** Plan §Phase 1 F1 (`.loop/r2-allowlist.json`); Reframe §"Verification status" line 127 (no `--no-verify` needed)
**Attack vector:** A21 (pre-commit hook bypass)

**Threat model.** The reframe report notes the original PR #27 used `--no-verify` to bypass the pre-commit hook. The plan says "Plan 5-Lite should not need `--no-verify` — the LIM-3-related fixture changes that triggered the pre-commit warning are not present."

But the plan introduces a NEW file (`.loop/r2-allowlist.json`) that needs to be committed. The pre-commit hook (`tools/learning-loop-mastra/.fallow/`) checks for fallow audit markers. If `.loop/` is not in the fallow scope, the file is committed silently. If it IS in the scope, the file may need audit markers.

Concrete attack: operator (or attacker with shell access) writes `.loop/r2-allowlist.json` with a permissive config and commits with `--no-verify`. The pre-commit hook never fires. The allowlist is now in git. R2 uses it.

**Recommendation.**

1. **Verify pre-commit hook scope:** confirm that `.loop/r2-allowlist.json` is in the pre-commit hook's audit list (or add it). Run `pnpm precommit` locally and verify the hook fires on the file.
2. **Lock the allowlist file path:** Phase 1 F1 should state: "`.loop/r2-allowlist.json` MUST be in `.fallow/` scope; if the pre-commit hook does not include it, add it before shipping."
3. **Test:** add `__tests__/r2/precommit-hook.test.js` that runs the hook against a stub `.loop/r2-allowlist.json` and asserts the hook fires.
4. **Operator runbook:** document the pre-commit behavior in `docs/security/plan-5-hardening.md` §"Allowlist file management".

---

### Finding R14 — MEDIUM: MCP server restart loses pin if env is not re-injected (Attack A22)
**Severity:** MEDIUM
**Exploitability:** LOW (requires MCP server crash and restart with missing env)
**Location:** Plan §Phase 1 "Identity pinning"
**Attack vector:** A22 (MCP server restart)

**Threat model.** The MCP server reads `LOOP_SURFACE` at process boot. If the server crashes and restarts (e.g., via a process supervisor), the new process must re-inherit `LOOP_SURFACE` from the harness shim. If the shim is not re-invoked on restart (depends on how Mastra Code / Claude Code / Droid CLI restart MCP servers), the new process has no env var → throws → dies.

The plan assumes the harness re-injects on restart. This is a process-supervisor assumption that may not hold for all harness configurations.

Concrete attack: an attacker who can crash the MCP server (e.g., via an OOM-triggering tool call) and replace the restart mechanism with a custom supervisor that does NOT re-inject `LOOP_SURFACE` can cause the MCP to fail closed (deny all writes). This is a **DoS**, not an auth bypass — but it changes the availability profile.

**Recommendation.**

1. **Document the restart behavior:** add to `docs/security/plan-5-hardening.md` §"Restart semantics" the assumption that the harness re-injects `LOOP_SURFACE` on MCP restart.
2. **Defensive default:** if the MCP server fails to start due to missing `LOOP_SURFACE`, the harness should fall back to a "deny all writes" mode (vs. crashing entirely). The plan currently throws (crash). Consider: the user is not running; the harness itself decides what to do.
3. **Test:** `__tests__/pin-runtime-id.test.js` restart-simulation case: simulate MCP crash + restart without env → assert process exits with `MISSING_LOOP_SURFACE` error.

---

### Finding R15 — MEDIUM: `evidence_code_ref` format smuggling through `:` + line (Attack A15)
**Severity:** MEDIUM
**Exploitability:** LOW (requires `evidence_code_ref` to be a path with a malicious `:line` suffix)
**Location:** Plan §Phase 2 LIM-4 (audit sites); existing `stripEvidenceAnchor` in `core/gate-logic.js:634-647`
**Attack vector:** A15 (path-arg smuggling)

**Threat model.** The existing `stripEvidenceAnchor` (in `core/gate-logic.js:634-647`) handles three suffix forms: `:line`, `:start-end`, `#anchor`, and `:key.path`. It does NOT handle:
- `:` followed by non-digit non-key chars (e.g., `tools/foo.js:../../etc/passwd`).
- Unicode lookalikes (e.g., fullwidth colon `：` U+FF1A).
- URL-encoded colons (e.g., `tools/foo.js%3A12`).

Concrete attack: a meta-state entry has `evidence_code_ref: "tools/refresh-fingerprint.js:../../etc/cron.d/evil"`. The `stripEvidenceAnchor` regex `/:\d+(?:-\d+)?$/` does NOT match (line is not digits). The full string is passed to `resolveSafePath`. `path.join(root, 'tools/refresh-fingerprint.js:../../etc/cron.d/evil')` resolves to `root/tools/cron.d/evil` (because `tools/refresh-fingerprint.js:..` is one segment due to the colon being a regular char on Linux). **Wait — `:` is a regular char on Linux filesystems. So this attack doesn't escape.**

But on **Windows**, `C:` is a drive letter. `tools/refresh-fingerprint.js:../../etc/cron.d/evil` on Windows... actually `:` is forbidden in Windows filenames. So this attack is platform-dependent.

**Recommendation.**

1. **Verify platform-specific behavior:** the plan's LIM-4 helper should explicitly test on Linux AND Windows. Add `__tests__/path-containment.test.js` cross-platform case (skipped on macOS/Linux if not portable).
2. **Defensive reject:** in `resolveSafePath`, reject any user path containing `:` (on any platform) — the only legitimate use of `:` in `evidence_code_ref` is the `:line` suffix, which `stripEvidenceAnchor` handles BEFORE the path-resolution step. So the join step should never see a `:`.
3. **Test:** `__tests__/path-containment.test.js` cases:
   - `evidence_code_ref: 'tools/refresh-fingerprint.js:../../etc/cron.d/evil'` → stripped to `tools/refresh-fingerprint.js` (no `:` after strip) → `resolveSafePath(root, 'tools/refresh-fingerprint.js')` → inside root → allowed.
   - `evidence_code_ref: 'tools/refresh-fingerprint.js#anchor'` → stripped to `tools/refresh-fingerprint.js` → allowed.

---

### Finding R16 — LOW: cross-cutting LIM-4 (UNC, null-byte, case-insensitive) gaps (Attacks A16, A17, A18)
**Severity:** LOW
**Exploitability:** LOW (platform-specific; partially mitigated by `realpath`)
**Location:** Plan §Phase 2 LIM-4 helper
**Attack vector:** A16 (UNC / device paths), A17 (null-byte injection), A18 (case sensitivity)

**Threat model.**

**A16 (UNC / device paths on Windows):** `\\?\C:\Windows\System32\config\SAM` and `\\.\COM1` are Windows-specific paths. `realpath` on Linux does not handle them; on Windows, `realpath` resolves them but may return surprising paths. The plan does not specify cross-platform behavior. **Out of scope for now** (the project is Linux/macOS-centric per existing tests), but document.

**A17 (null-byte injection):** a path containing `\0` (e.g., `tools/foo.js\0../../etc/passwd`). Node.js `fs.realpath` throws on null-byte paths (per Node's security policy). So `resolveSafePath` would throw, which is fail-closed. **Already covered by Node's behavior — no gap.**

**A18 (case sensitivity):** macOS (HFS+ default) and Windows (NTFS) are case-insensitive by default. Linux is case-sensitive. A user path `.CLAUDE/hooks/x.cjs` on macOS resolves to `.claude/hooks/x.cjs` via `realpath`. The containment check passes. **Already covered by `realpath`.**

**Recommendation.**

1. **Document the cross-platform behavior:** `docs/security/plan-5-hardening.md` §"Cross-platform notes" — confirm `realpath` handles null-byte (Node throws), case-insensitivity (realpath resolves), and Windows UNC paths (defer to future plan).
2. **No code change required for null-byte / case-sensitivity** — covered by Node's `realpath` semantics.
3. **Test:** skip Windows-specific tests on Linux runners; document in test file.

---

### Finding R17 — LOW: operator override silently allows + audit gap (Attack A20b)
**Severity:** LOW
**Exploitability:** LOW (requires operator to set override + tool to exploit)
**Location:** Plan §Phase 1 F3 ("Operator sets `deny: []` per runtime"); Reframe Open Q #2 (silent-allow + log)
**Attack vector:** A20 (override audit gap)

**Threat model.** Per reframe Open Q #2, override is silent-allow + audit-log. The audit log entry is written AFTER the override is used (per `gate-override.js:86-104`). A tool that has access to the audit log (via R2 if the audit log is in a universal surface, or via `fs.writeFileSync` if R2 is bypassed) can delete its own override entries post-hoc.

Concrete attack: tool A is denied by R2 → operator sets override → tool A's execute body runs → tool A writes `''` to `runtime-state.jsonl` → next audit query returns no entries → silent override with no trace.

**Recommendation.**

1. **Lock the audit log:** add to R2 (Finding R1's pattern): deny writes to `runtime-state.jsonl` for all runtimes. Override audits append via `appendFileSync` only; truncating requires an operator-preflight tool.
2. **Operator preflight for audit edits:** add `update_runtime_state_audit` MCP tool that requires preflight.
3. **Test:** `__tests__/gate-override.test.js` case: tool write to `runtime-state.jsonl` is denied by R2 with hint `runtime-state.jsonl is operator-controlled; use update_runtime_state_audit MCP tool`.

---

### Finding R18 — LOW: path-field detection limited to depth-3 (Attack A10b)
**Severity:** LOW
**Exploitability:** LOW (requires deeply-nested JSON structure)
**Location:** Plan §Phase 1 R3 (path-field detector); Finding R3 above
**Attack vector:** A10 (path-bearing argument detection)

**Threat model.** The recommendation in Finding R3 is depth-3 recursive scan. An attacker who can construct a JSON arg with `metadata.nested.deep.path = '../../etc/passwd'` (depth 4) evades detection. The plan's depth limit is a defensive choice (avoid false positives on unrelated strings), but it leaves a gap.

**Recommendation.**

1. **Document the depth limit:** `docs/security/plan-5-hardening.md` §"Path-field detection" specifies the recursion depth and warns operators that paths deeper than 3 are not gated by R2.
2. **Operator override for deep paths:** if an operator's tool has deep paths, the tool can declare `pathFields: ['metadata.nested.deep.path']` explicitly.
3. **No code change required** — the trade-off is documented and operators can opt in.

---

### Finding R19 — LOW: read-then-write composition via workflow tools (Attack R4 sub-case)
**Severity:** LOW
**Exploitability:** LOW (workflows are run inside `convertWorkflowsToTools` which uses `createTool`, NOT `createLoopTool`)
**Location:** `mastra/server.js:78-161` (workflow registration); Plan §Phase 1 R3 (coverage)
**Attack vector:** R4 (read-then-write composition)

**Threat model.** Per Finding R4's recommendation #2: workflow tools bypass `createLoopTool` because `convertWorkflowsToTools` uses `createTool` directly. A workflow that writes files (e.g., `workflow_storage_round_trip` writes to Mastra storage) does not flow through R2.

This is a **pre-existing gap** that Plan 5-Lite does not introduce — but the plan should explicitly document it. Workflows are a write vector that R2 does not cover.

**Recommendation.**

1. **Document the gap:** `docs/security/plan-5-hardening.md` §"Out of scope" — workflow tools (and agent tools) are not gated by R2. Plan 5-Lite covers MCP tools only.
2. **Optional: extend R2 to workflow tools:** Phase 1 F2 could be expanded to require `createLoopTool` for workflow tools too. This is a small change (`server.js:105-137` swaps `createTool` for `createLoopTool`). Recommend doing it in Plan 5-Lite to close the gap.
3. **Test:** `__tests__/r2/workflow-coverage.test.js` case: register a workflow with a write step, confirm it flows through R2.

---

### Finding R20 — LOW: race condition in pin-time vs. tool-time env mutation (Attack A1b)
**Severity:** LOW
**Exploitability:** LOW (requires sub-millisecond timing)
**Location:** Plan §Phase 1 "Identity pinning" (closure variable)
**Attack vector:** A1 (env-var spoofing)

**Threat model.** The plan says `pinRuntimeIdAtBoot()` reads `process.env.LOOP_SURFACE` at process boot and the value is frozen. If `pinRuntimeIdAtBoot()` reads the env var ASYNCHRONOUSLY (e.g., in a `setImmediate` callback), an attacker who can mutate the env between the call and the read can flip the value. The plan does not specify whether the read is sync.

Concrete attack: an attacker injects a `process.on('beforeExit')` hook that mutates `process.env.LOOP_SURFACE = '.factory'` before `pinRuntimeIdAtBoot()` actually reads it. If the pin is async, the read sees the mutated value.

**Recommendation.**

1. **Synchronous pin at module load:** `pinRuntimeIdAtBoot()` must be called at the TOP of `server.js` (or `create-loop-tool.js`) BEFORE any other module loads. The current plan shows the pin in `server.js` (line 95-114 of the stub); verify the call is at line 0 of the file (or as early as possible).
2. **Test:** `__tests__/pin-runtime-id.test.js` case: monkey-patch `process.on` to fire a hook that mutates env; assert pin value is still `.claude` (or whatever was set before import).

---

## Out-of-scope observations (not findings; noted for context)

1. **Re-pin request (Attack A3b):** the plan does not enumerate all re-pin code paths. If a future test helper exposes `setPinnedRuntimeId(newRuntime)`, any test that uses it bleeds into other tests. Recommend: `pinnedRuntimeId` is a private closure variable, NEVER exported. Use `Object.freeze` to enforce. (Covered in Finding R2.)
2. **Read-then-write via tool stdout (Attack A11b):** if a tool prints another runtime's secrets to its output, the harness (Claude Code / Droid) displays it. This is a credential-leak vector, not an R2 bypass. Out of scope; document in `docs/security/plan-5-hardening.md` §"Operational notes".
3. **Audit-log JSONL injection (Attack A19b):** the existing `gate-decision-log.js` may already escape JSON. Verify by reading its source. If yes, Finding R6 is partially covered. (Need to confirm during cook.)
4. **MCP server restart (Attack A22b):** the harness re-injects `LOOP_SURFACE` on restart. This is a harness-level concern, not R2. Out of scope; document.
5. **Pre-commit hook bypass (Attack A21b):** the plan introduces `.loop/r2-allowlist.json` which may not be in the fallow scope. Confirm during Phase 1. (Covered in Finding R13.)

---

## Hardening recommendations explicitly deferred to a future plan

The following defenses are **required for a fully hardened MCP** but are NOT in scope for Plan 5-Lite. They must be tracked as explicit follow-up items in the master tracker.

| ID | Defense | Why deferred | Trigger condition |
|----|---------|--------------|-------------------|
| D1 | Ed25519 caller identity (the original LIM-3) | Local-stdio-MCP collapses the threat (per reframe report) | MCP becomes network-accessible (multi-session, multi-tenant) |
| D2 | Workflow + agent tool coverage by R2 | Plan 5-Lite covers MCP tools only (`createLoopTool`) | When a workflow demonstrates a cross-runtime write |
| D3 | Tool stdout credential-leak guard | Requires harness-level cooperation (Claude Code / Droid) | When a tool demonstrates a leak |
| D4 | Cross-platform LIM-4 (Windows UNC, device paths) | Project is Linux/macOS-centric | When Windows is added to the test matrix |
| D5 | Subprocess-spawn re-pin detection | Local stdio MCP rarely inner-spawns | When an agent demonstrates child MCP server use |

---

## Top 5 Must-Fix Before Cook

Each finding has a concrete fix (file path + function name) and a test that proves it works.

### Finding R1 — CRITICAL: `.loop/r2-allowlist.json` not write-gated
- **One-sentence summary:** The trust anchor of R2 (`.loop/r2-allowlist.json`) can be overwritten by any tool with write capability, silently disabling cross-runtime protection.
- **Concrete fix:** In `tools/learning-loop-mastra/core/r2/ownership.js#checkR2Ownership`, hard-deny writes to `.loop/r2-allowlist.json` BEFORE the allowlist lookup; the deny message names `update_r2_allowlist` MCP tool as the legitimate path. Also add `RUNTIME_STATE_JSONL` and `.gate-override` to the deny list (per Finding R17).
- **Test that proves fix:** `__tests__/r2/ownership.test.js` case `allowlist_self_write_denied`: tool write to `.loop/r2-allowlist.json` (any runtime, including claude-code) → throws `cross_runtime_write_denied` with hint `r2-allowlist.json is operator-controlled; use update_r2_allowlist MCP tool`.

### Finding R2 — HIGH: closure-variable immutability not asserted by test
- **One-sentence summary:** The plan asserts `pinnedRuntimeId` is a closure variable but provides no test that proves it cannot be mutated by tool calls or env var changes mid-process.
- **Concrete fix:** In `tools/learning-loop-mastra/mastra/server.js#pinRuntimeIdAtBoot`, wrap `pinnedRuntimeId` in `Object.freeze({ readonly runtime })` so accidental assignment throws in strict mode. Verify the closure-variable shape by inspection + test.
- **Test that proves fix:** `__tests__/pin-runtime-id.test.js` case `closure_immutability`: spawn with `LOOP_SURFACE=.claude`, then mid-test set `process.env.LOOP_SURFACE = '.factory'` and `pinnedRuntimeId = 'droid'` (try both) → assert `getPinnedRuntimeId()` STILL returns `'claude-code'`. Also assert the frozen object throws on assignment.

### Finding R3 — HIGH: path-field detector unspecified; smuggling through non-path-named args
- **One-sentence summary:** The plan says R2 checks `pathFields` but does not specify which detector covers dynamic args, JSON-stringified paths, or array-typed paths — and what happens when `pathFields` is undefined.
- **Concrete fix:** In `tools/learning-loop-mastra/core/r2/path-field-detector.js` (new file), implement: (a) default-deny on missing `pathFields`, (b) recursive scan up to depth 3, (c) explicit `pathFields: []` to opt in to "no path args". In `mastra/server.js` tool registration, throw at boot if any tool in `MANIFEST` does not declare `pathFields`.
- **Test that proves fix:** `__tests__/r2/path-field-detector.test.js` cases: (a) tool with `pathFields: ['file_path']`, arg with `metadata.file = '.factory/x'` → fires on `metadata.file` after recursion; (b) tool with no `pathFields` → throws at boot; (c) tool with `pathFields: []` → returns `allowed_no_paths`.

### Finding R4 — HIGH: read-then-write composition breaks "reads not gated" assumption
- **One-sentence summary:** The plan gates writes but not reads; a tool that reads another runtime's secrets via raw `fs.readFileSync` can craft a write through a workflow or agent tool that bypasses R2.
- **Concrete fix:** In `tools/learning-loop-mastra/mastra/server.js#convertWorkflowsToTools`, swap `createTool` for `createLoopTool` so workflow tools also flow through R2. Add to `docs/security/plan-5-hardening.md` §"Out of scope" the documented composition-attack residual: tool-stdout leak + agent-tool coverage.
- **Test that proves fix:** `__tests__/r2/workflow-coverage.test.js` case: register a workflow with a write step that targets `.factory/**` from a Claude session → throws `cross_runtime_write_denied`. Also verify agent tools (loaded via `loadAgentsManifest`) are covered.

### Finding R5 — HIGH: LIM-4 NF1 (one realpath + one startsWith) has TOCTOU window and hardlink gaps
- **One-sentence summary:** `resolveSafePath` calls `realpath` once in the gate and trusts the result; a symlink swap or hardlink race between check and write silently bypasses containment.
- **Concrete fix:** In `tools/learning-loop-mastra/core/path-containment.js#resolveSafePath`, (a) reject hardlinks via `lstat(realUser).nlink > 1`, (b) document that the tool's execute body MUST call `resolveSafePath` again before the actual `fs.writeFileSync` (TOCTOU closure), (c) use `O_NOFOLLOW` on the open-fd path. Add `__tests__/path-containment.test.js` cases for symlink race + hardlink escape.
- **Test that proves fix:** `__tests__/path-containment.test.js` cases: (a) hardlink `root/.claude/x → /etc/passwd` → `resolveSafePath` throws `hardlink_rejected`; (b) symlink swap race (simulated by two calls in sequence) → second call sees the swapped target and rejects.

### Finding R6 — HIGH: audit-log JSONL injection lets tools forge denial entries or override markers
- **One-sentence summary:** The plan's gate emits `gate_log` JSONL with caller-supplied fields (path) but does not specify JSON-escape or newline-validation — a malicious `path` containing `\n` injects forged entries.
- **Concrete fix:** In `tools/learning-loop-mastra/core/gate-decision-log.js#appendGateLog`, (a) `JSON.stringify` each entry (already done), (b) assert the serialized line contains no raw `\n` or `\r`, (c) reject writes to `runtime-state.jsonl` via R2 (per Finding R17). Add to allowlist deny-list: `**/.gate-override`, `**/runtime-state.jsonl`.
- **Test that proves fix:** `__tests__/gate-log.test.js` cases: (a) denial with `path: 'foo\n{"forged":"override_marker"}'` → serialized line contains no raw newlines; (b) tool write to `runtime-state.jsonl` → R2 denies.

---

## Status

**Status:** DONE_WITH_CONCERNS

**Summary:** Plan 5-Lite is sound in scope and threat model. The 6 must-fix findings (R1-R6) must be addressed before cook: R1 (allowlist self-bootstrap) is the single biggest gap and is the only blocker; R2-R5 are addressable in Phase 1 with the planned infrastructure; R6 (audit-log injection) is addressable in Phase 3. The 12 should-fix / nice-to-have items can ship as documented gaps or follow-up plans.

**Concerns/Blockers (must address before cook):**

1. Fix Finding R1 (allowlist self-write-deny) in Phase 1 — single highest-priority blocker.
2. Fix Finding R2 (closure-immutability test) in Phase 1 — add tests + `Object.freeze` the pin.
3. Fix Finding R3 (path-field detector + default-deny on missing) in Phase 1 — define the detector module + boot-time validation.
4. Fix Finding R4 (workflow + agent tool R2 coverage) in Phase 1 — swap `createTool` for `createLoopTool` in `convertWorkflowsToTools`.
5. Fix Finding R5 (hardlink rejection + TOCTOU closure) in Phase 2 — extend `resolveSafePath` with `lstat.nlink` check.
6. Fix Finding R6 (audit-log JSON escape + audit-log deny-list) in Phase 3 — extend `gate-decision-log.js` and R2 deny list.

**Nice-to-have (not blockers):** Findings R7-R20 — address as scope allows; document residual gaps in `docs/security/plan-5-hardening.md` §"Out of scope".

Status: DONE