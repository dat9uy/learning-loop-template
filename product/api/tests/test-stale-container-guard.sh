#!/usr/bin/env bash
set -euo pipefail

# Test: install-vnstock.sh refuses to proceed on stale .vnstock without --force
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_SCRIPT="${SCRIPT_DIR}/../scripts/install-vnstock.sh"

# Setup: create a temp dir simulating product/api with stale .vnstock
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

# Create minimal structure
mkdir -p "${tmp_dir}/.venv/bin"
cat > "${tmp_dir}/.venv/bin/python" << 'PYEOF'
#!/bin/bash
# Mock python: vnstock_data does NOT import (simulates failed install)
# But requests and pandas DO import (pre-flight checks pass)
if [[ "$*" == *"-c"* ]] && [[ "$*" == *"import vnstock_data"* ]]; then
  exit 1
fi
if [[ "$*" == *"-m"* ]] && [[ "$*" == *"pip"* ]]; then
  exit 0
fi
exit 0
PYEOF
chmod +x "${tmp_dir}/.venv/bin/python"

# Create stale .vnstock directory
mkdir -p "${tmp_dir}/.vnstock"

# Create mock commands
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

# Test 3: No .vnstock -> should proceed (no stale check triggered)
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

echo "PASS: no .vnstock -> stale check not triggered"
echo "All stale-container guard tests passed."
