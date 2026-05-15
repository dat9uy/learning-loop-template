#!/usr/bin/env bash
set -euo pipefail

INSTALLER_URL="${VNSTOCK_INSTALLER_URL:-https://vnstocks.com/files/vnstock-cli-installer.run}"
INSTALLER_SHA256="${VNSTOCK_INSTALLER_SHA256:-fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2}"

API_ROOT="$(pwd -P)"
API_HOME="$(realpath "${API_ROOT}")"
PYTHON_BIN="${API_ROOT}/.venv/bin/python"

FORCE=0
YES_I_KNOW=0
CHECK_DEVICE=0
INSTALLER_ATTEMPTED=0
INSTALLER_FAILED=0

fail() {
  printf 'vnstock bootstrap failed: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Install or re-register the vnstock_data vendor package.

Options:
  --force           Bypass idempotency check and re-register device.
                    This INVALIDATES any previously registered device.
  --yes-i-know      Skip the interactive slot-consumption warning.
  --check-device    Show local device ID (remote validation unavailable).
  --help            Show this help message and exit.

Environment:
  VNSTOCK_API_KEY          Required. Vendor API key.
  VNSTOCK_INSTALLER_URL    Optional. Override installer URL.
  VNSTOCK_INSTALLER_SHA256 Optional. Override expected SHA-256.
EOF
}

migrate_stale_vnstock_backups() {
  local config_dir="${API_ROOT}/.vnstock"
  shopt -s nullglob
  local backup_dirs=("${config_dir}"/user-json-dir.backup.*)
  if (( ${#backup_dirs[@]} == 0 )); then
    shopt -u nullglob
    return
  fi

  local latest_backup="${backup_dirs[${#backup_dirs[@]}-1]}"
  local filename
  for filename in api_key.json device.id; do
    if [[ ! -f "${config_dir}/${filename}" && -f "${latest_backup}/${filename}" ]]; then
      cp "${latest_backup}/${filename}" "${config_dir}/${filename}"
      chmod 600 "${config_dir}/${filename}"
    fi
  done
  shopt -u nullglob
}

print_next_steps() {
  cat <<'EOF' >&2

=== Next Steps ===
1. Check vendor device list: https://vnstocks.com/account?section=devices
2. If device limit exceeded, ask the operator to clear devices before retrying.
3. Inspect venv for partial packages:
     uv pip list | grep vnstock
4. If SHA-256 mismatched, check https://vnstocks.com for the latest installer.
5. For timeout issues, try running in a fresh clone or check network connectivity.
EOF
}

analyze_installer_output() {
  local log_file="$1"
  if grep -q "Vượt quá giới hạn thiết bị" "${log_file}" 2>/dev/null; then
    printf '\n[ERROR] Device limit exceeded (actual limit: 1 Bronze device).\n' >&2
    printf '        Clear devices at https://vnstocks.com/account?section=devices\n' >&2
  elif grep -qi "timeout\|timed out" "${log_file}" 2>/dev/null; then
    printf '\n[ERROR] Vendor installer timed out. This often happens in existing venvs. Try in a fresh clone.\n' >&2
  fi
}

run_installer() {
  local output_file="$1"
  set +e
  (
    cd "${tmp_dir}"
    export HOME="${API_HOME}"
    export PATH="${API_HOME}/.venv/bin:${PATH}"
    export VIRTUAL_ENV="${API_HOME}/.venv"
    export VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock"
    export VNSTOCK_VENV_TYPE="venv"
    export VNSTOCK_LANGUAGE="python"
    bash "${installer_path}"
  ) 2>&1 | tee "${output_file}"
  local pipestatus=("${PIPESTATUS[@]}")
  set -e
  return "${pipestatus[0]}"
}

# --- Argument parsing ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --yes-i-know) YES_I_KNOW=1; shift ;;
    --check-device) CHECK_DEVICE=1; shift ;;
    --help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 1 ;;
  esac
done

# --- Early pre-flight checks ---
if [[ -z "${VNSTOCK_API_KEY:-}" ]]; then
  fail "VNSTOCK_API_KEY is required"
fi

require_command curl
require_command sha256sum
require_command realpath

# System Python requests check (vendor wrapper may fall back to system Python)
SYSTEM_PYTHON=""
if command -v python3 >/dev/null 2>&1; then
  SYSTEM_PYTHON="python3"
elif command -v python >/dev/null 2>&1; then
  SYSTEM_PYTHON="python"
fi

if [[ -z "${SYSTEM_PYTHON}" ]]; then
  fail "system Python not found (tried python3, python)"
fi

if ! "${SYSTEM_PYTHON}" -c "import requests" >/dev/null 2>&1; then
  fail "system Python '${SYSTEM_PYTHON}' is missing the 'requests' module; install it before running the vendor installer"
fi

# Venv Python requests check (run_installer puts venv first in PATH, so wrapper may use venv Python)
if ! "${PYTHON_BIN}" -c "import requests" >/dev/null 2>&1; then
  fail "venv Python '${PYTHON_BIN}' is missing the 'requests' module; run uv sync in product/api first"
fi

# --- Venv-dependent checks ---
if [[ ! -x "${PYTHON_BIN}" ]]; then
  fail "missing ${PYTHON_BIN}; run uv sync from product/api first"
fi

migrate_stale_vnstock_backups

# --check-device stub
if [[ "${CHECK_DEVICE}" -eq 1 ]]; then
  device_id_file="${API_ROOT}/.vnstock/device.id"
  if [[ -f "${device_id_file}" ]]; then
    printf 'Local device ID: %s\n' "$(cat "${device_id_file}")"
  else
    printf 'No local device ID found at %s\n' "${device_id_file}"
  fi
  printf 'NOTE: Vendor does not expose a device-query API. Log into https://vnstocks.com/account?section=devices to verify status.\n'
  exit 0
fi

# Idempotency / force
if [[ "${FORCE}" -eq 0 ]]; then
  if HOME="${API_HOME}" VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock" "${PYTHON_BIN}" -c "import vnstock_data" >/dev/null 2>&1; then
    printf 'vnstock_data already imports from product/api/.venv; skipping installer.\n'
    exit 0
  fi
else
  if [[ -f "${API_ROOT}/.vnstock/device.id" ]]; then
    printf 'WARNING: --force will invalidate the previous device registration.\n' >&2
    rm -f "${API_ROOT}/.vnstock/device.id"
  fi
fi

# Slot-aware warning
if [[ "${YES_I_KNOW}" -eq 0 ]]; then
  cat <<EOF >&2

WARNING: This will register a new device with the vendor.
Actual device limit: 1 (Bronze tier).
If a device is already registered, this install will FAIL
and still consume your only device slot.

EOF
  if [[ ! -t 0 ]]; then
    printf 'Non-interactive shell detected. Use --yes-i-know to proceed.\n' >&2
    exit 1
  fi
  read -rp "Proceed? [y/N] " response
  if [[ ! "${response}" =~ ^[Yy]$ ]]; then
    printf 'Aborted.\n' >&2
    exit 1
  fi
fi

# Pre-flight: pandas in venv
"${PYTHON_BIN}" -c "import pandas" >/dev/null 2>&1 || fail "pandas is not importable; run uv sync before vendor bootstrap"

# --- Atomicity guard ---
tmp_dir="$(mktemp -d)"
sentinel="${API_ROOT}/.vnstock-install-in-progress"
pre_packages="${tmp_dir}/pre-packages.txt"
pre_vnstock="${tmp_dir}/pre-vnstock.txt"
installer_output="${tmp_dir}/installer.log"

cleanup() {
  local rc=$?
  if [[ "${INSTALLER_ATTEMPTED}" -eq 1 && "${INSTALLER_FAILED}" -eq 1 ]]; then
    local post_packages="${tmp_dir}/post-packages.txt"
    "${PYTHON_BIN}" -m pip freeze > "${post_packages}" 2>/dev/null || true
    if [[ -f "${pre_packages}" && -f "${post_packages}" ]]; then
      local added
      added=$(comm -23 <(sort "${post_packages}") <(sort "${pre_packages}") || true)
      if [[ -n "${added}" ]]; then
        printf '\n=== Packages added during failed install ===\n%s\n' "${added}" >&2
      fi
    fi
    printf '\nNOTE: Vendor packages may be partially installed. Manual inspection recommended.\n' >&2
    print_next_steps
  fi
  rm -f "${sentinel}" 2>/dev/null || true
  rm -rf "${tmp_dir}" || true
  return $rc
}
trap cleanup EXIT

# Snapshot venv state before installer
"${PYTHON_BIN}" -m pip freeze > "${pre_packages}" 2>/dev/null || true
if [[ -d "${API_ROOT}/.vnstock" ]]; then
  ls -laR "${API_ROOT}/.vnstock" > "${pre_vnstock}" 2>/dev/null || true
else
  touch "${pre_vnstock}"
fi

touch "${sentinel}"

# --- Download and verify ---
installer_path="${tmp_dir}/vnstock-cli-installer.run"

printf 'Downloading vnstock installer...\n'
curl -fsSL "${INSTALLER_URL}" -o "${installer_path}"

observed_sha="$(sha256sum "${installer_path}" | awk '{print $1}')"
if [[ "${observed_sha}" != "${INSTALLER_SHA256}" ]]; then
  printf '\n[ERROR] Installer SHA-256 mismatch.\n' >&2
  printf '        Expected: %s\n' "${INSTALLER_SHA256}" >&2
  printf '        Observed: %s\n' "${observed_sha}" >&2
  printf '        The vendor may have updated the installer. Check https://vnstocks.com for the latest version.\n' >&2
  printf '        To bypass this check, set VNSTOCK_INSTALLER_SHA256 to the observed hash.\n' >&2
  exit 1
fi

chmod +x "${installer_path}"

printf 'Installer SHA-256 verified. Running vendor installer with product/api as HOME.\n'

# --- Run installer with output capture ---
INSTALLER_ATTEMPTED=1
installer_rc=0
run_installer "${installer_output}" || installer_rc=$?

if [[ "${installer_rc}" -ne 0 ]]; then
  INSTALLER_FAILED=1
  printf '\n=== Installer output ===\n' >&2
  cat "${installer_output}" >&2
  analyze_installer_output "${installer_output}"
  fail "vendor installer exited with code ${installer_rc}"
fi

# --- Post-flight verification ---
if ! HOME="${API_HOME}" VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock" "${PYTHON_BIN}" -c "import vnstock_data" >/dev/null 2>&1; then
  fail "vnstock_data did not import successfully after installer run"
fi

printf 'vnstock_data import check passed.\n'

printf 'Running API ping test...\n'
if ! HOME="${API_HOME}" VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock" "${PYTHON_BIN}" -c "
import vnstock_data
try:
    vnstock_data.listing.all_symbols()
except Exception as e:
    print(f'API ping failed: {e}', flush=True)
    raise SystemExit(1)
" >/dev/null 2>&1; then
  printf 'WARNING: vnstock_data imports but API ping failed. The device ID may be stale or unauthorized.\n' >&2
else
  printf 'API ping test passed.\n'
fi

printf 'vnstock bootstrap completed successfully.\n'
