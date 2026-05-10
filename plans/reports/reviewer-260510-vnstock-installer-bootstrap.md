## Code Review Summary

### Scope
- Files: `product/api/pyproject.toml`, `product/api/scripts/install-vnstock.sh`, `package.json`, `docs/operator-guide.md`, `product/README.md`, `product/api/capabilities/vnstock-data/README.md`, `plans/260510-1744-vnstock-installer-bootstrap/*`
- LOC reviewed: 837
- Focus: vnstock installer bootstrap correctness, security, plan compliance
- Scout findings: post-install success path can mask import failure; no implicit install hook found; package command path matches plan

### Overall Assessment
One blocking correctness/plan-compliance issue. The bootstrap is otherwise explicit, SHA-pinned, temp-cleaned, and does not print `VNSTOCK_API_KEY`.

### Critical Issues
None.

### High Priority
- [product/api/scripts/install-vnstock.sh:69] Script exits `0` when `import vnstock_data` fails but `importlib.util.find_spec("vnstock_data")` succeeds. This lets `pnpm bootstrap:api` report success for a broken runtime import, contradicting the plan's fail-closed/import-proof contract at [plans/260510-1744-vnstock-installer-bootstrap/plan.md:52] and the Phase 2 post-flight requirement at [plans/260510-1744-vnstock-installer-bootstrap/phase-02-bootstrap-script-and-manifest-wiring.md:63]. Trigger: installer leaves a package directory on disk but import fails due missing dependency, syntax/runtime import error, or config-time exception. Impact: runtime evidence and operator decision can be built on a false successful bootstrap. Fix: make this branch non-zero unless it detects a documented, recoverable vendor config condition with a narrowly matched error shape; otherwise require successful `import vnstock_data` for bootstrap success.

### Medium Priority
None.

### Low Priority
None.

### Edge Cases Found by Scout
- Broken import after package extraction: accepted as high priority above.
- Wrong working directory: root `package.json` runs `cd product/api && uv sync && bash scripts/install-vnstock.sh`, so `API_ROOT="$(pwd -P)"` resolves to `product/api` for the documented command.
- Missing commands or venv: script fails before network on missing `.venv/bin/python`, `curl`, `sha256sum`, `realpath`, or missing `VNSTOCK_API_KEY`.

### No-Issue Statements
- Secret leakage: script checks `VNSTOCK_API_KEY` presence but does not print the value; validation/reporting docs also exclude credentials, config contents, installer logs, and raw vendor data.
- Idempotency: successful import short-circuits before requiring `VNSTOCK_API_KEY`.
- Path handling: `bootstrap:api` command uses the planned `cd product/api && uv sync && bash scripts/install-vnstock.sh` path.
- Implicit hooks: `package.json` contains no `preinstall`, `install`, `postinstall`, or `prepare` script that would run the vendor installer implicitly.
- Docs accuracy: living docs point to `pnpm bootstrap:api`, name `VNSTOCK_API_KEY`, and warn about explicit vendor stage/device slot risk.
- Pyproject dependency contract: `[project.optional-dependencies] vendor` and `vnstock_data==3.1.7` are removed; public dependencies match the plan.

### Positive Observations
- Installer uses `set -euo pipefail`, `mktemp -d`, cleanup trap, SHA-256 verification, and a pinned default installer hash.
- Runtime bootstrap proof remains gated in Phase 4; no credentials or `.vnstock` contents were read during review.

### Recommended Actions
1. Change the post-install fallback at [product/api/scripts/install-vnstock.sh:69] to fail closed unless it can prove a known safe config-only warning.
2. Re-run `bash -n product/api/scripts/install-vnstock.sh`, `pnpm validate:records`, and `pnpm check`.
3. Do not run `pnpm bootstrap:api` until operator approval and `VNSTOCK_API_KEY` handling are in place.

### Resolution Update

Resolved after review: `product/api/scripts/install-vnstock.sh` now requires successful `import vnstock_data` after the vendor installer runs. The old `find_spec("vnstock_data")` success path was removed, so a broken import exits non-zero through `fail`. Follow-up `bash -n product/api/scripts/install-vnstock.sh` passed.

### Metrics
- Type Coverage: N/A
- Test Coverage: N/A
- Linting Issues: 0 syntax issues from `bash -n`

### Validation Run
- `bash -n product/api/scripts/install-vnstock.sh`: pass
- `pnpm validate:records`: pass, 19 records
- `pnpm check`: pass, 19 records
- `pnpm bootstrap:api`: not run by request

### Unresolved Questions
None.
