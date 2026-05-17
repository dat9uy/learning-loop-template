---
phase: 2
title: "Install Script Stale-Container Guard"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Install Script Stale-Container Guard (TDD)

## Overview

Add a stale-container detection guard to `install-vnstock.sh`. The guard prevents the script from proceeding when `.vnstock` exists but `vnstock_data` doesn't import — the signature of a failed/contaminated container. Without `--force`, the script refuses and directs the agent to use a fresh container.

**TDD approach:** Write the test first, verify it fails, implement the guard, verify it passes. Keep the test for regression protection.

## Requirements

- Functional: script refuses to proceed on stale `.vnstock` without `--force`
- Functional: `--force` removes entire `.vnstock` directory (not just `device.id`) and proceeds
- Functional: no `.vnstock` → proceeds normally (fresh container)
- Functional: `.vnstock` + import succeeds → exits 0 (idempotent, existing behavior)
- Non-functional: guard adds ~10 lines to script, no new dependencies

## Architecture

Current flow:
```
idempotency check → vnstock_data imports? → yes: exit 0
                                            no: proceed to installer
```

New flow:
```
idempotency check → vnstock_data imports? → yes: exit 0
                                            no: .vnstock exists?
                                                yes + no --force: FAIL "stale state"
                                                yes + --force: rm -rf .vnstock, proceed
                                                no: proceed to installer
```

## Related Code Files

- Modify: `product/api/scripts/install-vnstock.sh` (add guard after line 178, update `--force` handler)
- Create: `product/api/tests/test-stale-container-guard.sh` (persisted regression test)

## Implementation Steps (TDD)

### Step 1: Write test for stale-container guard

Create `product/api/tests/test-stale-container-guard.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Test: install-vnstock.sh refuses to proceed on stale .vnstock without --force
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_SCRIPT="${SCRIPT_DIR}/../../scripts/install-vnstock.sh"

# Setup: create a temp dir simulating product/api with stale .vnstock
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

# Create minimal structure
mkdir -p "${tmp_dir}/.venv/bin"
cat > "${tmp_dir}/.venv/bin/python" << 'PYEOF'
#!/bin/bash
# Mock python: vnstock_data does NOT import (simulates failed install)
if [[ "$*" == *"-c"* ]] && [[ "$*" == *"import vnstock_data"* ]]; then
  exit 1
fi
exit 0
PYEOF
chmod +x "${tmp_dir}/.venv/bin/python"

# Create stale .vnstock directory
mkdir -p "${tmp_dir}/.vnstock"

# Create mock commands — sha256sum MUST output a matching hash (Finding #10)
export PATH="${tmp_dir}/bin:${PATH}"
mkdir -p "${tmp_dir}/bin"

# Mock curl: create a dummy installer file
cat > "${tmp_dir}/bin/curl" << 'CMDEOF'
#!/bin/bash
# Create dummy installer at the output path
for arg in "$@"; do
  case "$prev" in
    -o) echo "#!/bin/bash" > "$arg"; echo "exit 0" >> "$arg"; break ;;
  esac
  prev="$arg"
done
exit 0
CMDEOF
chmod +x "${tmp_dir}/bin/curl"

# Mock sha256sum: output the expected hash (Finding #10)
cat > "${tmp_dir}/bin/sha256sum" << CMDEOF
#!/bin/bash
echo "${VNSTOCK_INSTALLER_SHA256:-fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2}  \$1"
exit 0
CMDEOF
chmod +x "${tmp_dir}/bin/sha256sum"

# Mock realpath: actually resolve the path (Finding #11)
cat > "${tmp_dir}/bin/realpath" << 'CMDEOF'
#!/bin/bash
readlink -f "$1" 2>/dev/null || echo "$1"
CMDEOF
chmod +x "${tmp_dir}/bin/realpath"

# Mock python3 system command with requests (Finding #12)
cat > "${tmp_dir}/bin/python3" << 'CMDEOF'
#!/bin/bash
if [[ "$*" == *"-c"* ]] && [[ "$*" == *"import requests"* ]]; then
  exit 0
fi
exit 0
CMDEOF
chmod +x "${tmp_dir}/bin/python3"

# Test 1: Without --force, should fail on stale .vnstock
export VNSTOCK_API_KEY="test-key"
cd "${tmp_dir}"
set +e
output=$(bash "${INSTALL_SCRIPT}" --yes-i-know 2>&1)
rc=$?
set -e

if [[ ${rc} -eq 0 ]]; then
  echo "FAIL: script should have failed on stale .vnstock without --force"
  echo "Output: ${output}"
  exit 1
fi

if echo "${output}" | grep -qi "stale"; then
  echo "PASS: script detected stale .vnstock and refused to proceed"
else
  echo "FAIL: script failed but not for stale .vnstock reason"
  echo "Output: ${output}"
  exit 1
fi

# Test 2: With --force, should remove .vnstock and proceed
mkdir -p "${tmp_dir}/.vnstock"
set +e
output2=$(bash "${INSTALL_SCRIPT}" --yes-i-know --force 2>&1)
rc2=$?
set -e

if echo "${output2}" | grep -qi "stale"; then
  echo "FAIL: --force should bypass stale check"
  echo "Output: ${output2}"
  exit 1
fi

if [[ -d "${tmp_dir}/.vnstock" ]]; then
  echo "FAIL: --force should have removed .vnstock directory"
  exit 1
fi

echo "PASS: --force bypasses stale check and removes .vnstock"

# Test 3: No .vnstock → should proceed (no stale check triggered)
rm -rf "${tmp_dir}/.vnstock"
set +e
output3=$(bash "${INSTALL_SCRIPT}" --yes-i-know 2>&1)
rc3=$?
set -e

if echo "${output3}" | grep -qi "stale"; then
  echo "FAIL: no .vnstock should not trigger stale check"
  echo "Output: ${output3}"
  exit 1
fi

echo "PASS: no .vnstock → stale check not triggered"
echo "All stale-container guard tests passed."
```

### Step 2: Run test, verify it fails

```bash
bash product/api/tests/test-stale-container-guard.sh
```

Expected: FAIL — script doesn't have the stale guard yet.

### Step 3: Implement stale-container guard

In `product/api/scripts/install-vnstock.sh`, after line 178 (after the idempotency/force `fi`), add:

```bash
# Stale-container detection: .vnstock exists but vnstock_data doesn't import.
# This means a prior install attempt left partial state (installer reached step 5
# but failed at step 6). Re-running would consume another slot.
if [[ -d "${API_ROOT}/.vnstock" && "${FORCE}" -eq 0 ]]; then
  fail "stale .vnstock detected but vnstock_data not importable. This container has residual state from a prior install attempt. Use --force to re-register (consumes a slot) or run in a fresh container."
fi
```

Also update the `--force` handler (lines 173-177) to remove the entire `.vnstock` directory, not just `device.id` (Finding #2):

Replace:
```bash
  if [[ -f "${API_ROOT}/.vnstock/device.id" ]]; then
    printf 'WARNING: --force will invalidate the previous device registration.\n' >&2
    rm -f "${API_ROOT}/.vnstock/device.id"
  fi
```

With:
```bash
  if [[ -d "${API_ROOT}/.vnstock" ]]; then
    printf 'WARNING: --force will remove existing .vnstock and invalidate any previous device registration.\n' >&2
    rm -rf "${API_ROOT}/.vnstock"
  fi
```

### Step 4: Run test, verify it passes

```bash
bash product/api/tests/test-stale-container-guard.sh
```

Expected: All 3 tests PASS.

### Step 5: Verify existing idempotency behavior unchanged

Run the existing idempotency path (if vnstock_data already imports, script skips):
```bash
cd product/api && bash scripts/install-vnstock.sh
```
- If vnstock_data is importable: should print "already imports" and exit 0
- If not importable and no `.vnstock`: should proceed to installer

### Step 5b: Real-environment stale guard verification (Finding #7)

Create a temp directory with a real `.vnstock` (not mocks), run the install script from it, and verify the guard triggers:

```bash
tmp_verify="$(mktemp -d)"
mkdir -p "${tmp_verify}/.vnstock"
mkdir -p "${tmp_verify}/.venv/bin"
# Use real python but make vnstock_data not importable
cp "$(which python3)" "${tmp_verify}/.venv/bin/python"
cd "${tmp_verify}"
set +e
out=$(VNSTOCK_API_KEY=test bash "${OLDPWD}/scripts/install-vnstock.sh" --yes-i-know 2>&1)
rc=$?
set -e
rm -rf "${tmp_verify}"
if [[ ${rc} -ne 0 ]] && echo "${out}" | grep -qi "stale"; then
  echo "PASS: real-env stale guard verification"
else
  echo "FAIL: real-env stale guard did not trigger (rc=${rc})"
  echo "Output: ${out}"
  exit 1
fi
```

### Step 6: Keep test for regression protection (Finding #8)

Do NOT delete the test. It lives at `product/api/tests/test-stale-container-guard.sh` and uses mocks (no slot consumption). It can run safely in CI.

## Success Criteria

- [ ] Test script created at `product/api/tests/test-stale-container-guard.sh` (Step 1)
- [ ] Test fails before implementation (Step 2)
- [ ] Stale-container guard implemented in install script after line 178 (Step 3)
- [ ] `--force` handler updated to `rm -rf .vnstock` (Step 3)
- [ ] Test passes after implementation (Step 4)
- [ ] All 3 test cases pass: stale without force → fail, stale with force → remove + proceed, no .vnstock → proceed
- [ ] Existing idempotency behavior unchanged (Step 5)
- [ ] Real-environment stale guard verification passes (Step 5b)
- [ ] Test preserved in `product/api/tests/` (Step 6)

## Risk Assessment

- Low risk: guard is a new `if` block, doesn't modify existing logic
- `--force` now does `rm -rf .vnstock` instead of just `rm device.id` — more destructive but matches intent
- Test preserved for regression; uses mocks, no slot consumption
