#!/usr/bin/env bash
set -euo pipefail

INSTALLER_URL="${VNSTOCK_INSTALLER_URL:-https://vnstocks.com/files/vnstock-cli-installer.run}"
INSTALLER_SHA256="${VNSTOCK_INSTALLER_SHA256:-1982f7f93386daa57e1a1c0b18a87c8a299b9ad1d331f4123ab534656fa4c7ed}"

API_ROOT="$(pwd -P)"
PYTHON_BIN="${API_ROOT}/.venv/bin/python"

fail() {
  printf 'vnstock bootstrap failed: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

normalize_vnstock_config() {
  local config_file="${API_ROOT}/.vnstock/user.json"
  if [[ -d "${config_file}" && -f "${config_file}/user.json" ]]; then
    local backup_dir="${API_ROOT}/.vnstock/user-json-dir.backup.$(date +%Y%m%d%H%M%S)"
    mv "${config_file}" "${backup_dir}"
    cp "${backup_dir}/user.json" "${config_file}"
    printf 'Normalized vnstock user config from nested installer directory.\n'
  fi
}

if [[ ! -x "${PYTHON_BIN}" ]]; then
  fail "missing ${PYTHON_BIN}; run uv sync from product/api first"
fi

normalize_vnstock_config

if "${PYTHON_BIN}" -c "import vnstock_data" >/dev/null 2>&1; then
  printf 'vnstock_data already imports from product/api/.venv; skipping installer.\n'
  exit 0
fi

if [[ -z "${VNSTOCK_API_KEY:-}" ]]; then
  fail "VNSTOCK_API_KEY is required for the explicit vendor installer stage"
fi

require_command curl
require_command sha256sum
require_command realpath

"${PYTHON_BIN}" -c "import pandas" >/dev/null 2>&1 || fail "pandas is not importable; run uv sync before vendor bootstrap"

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

installer_path="${tmp_dir}/vnstock-cli-installer.run"

printf 'Downloading vnstock installer...\n'
curl -fsSL "${INSTALLER_URL}" -o "${installer_path}"

observed_sha="$(sha256sum "${installer_path}" | awk '{print $1}')"
if [[ "${observed_sha}" != "${INSTALLER_SHA256}" ]]; then
  fail "installer SHA-256 mismatch; expected ${INSTALLER_SHA256}, observed ${observed_sha}"
fi

chmod +x "${installer_path}"

API_HOME="$(realpath "${API_ROOT}")"
printf 'Installer SHA-256 verified. Running vendor installer with product/api as HOME.\n'
(
  cd "${tmp_dir}"
  HOME="${API_HOME}" \
  PATH="${API_HOME}/.venv/bin:${PATH}" \
  VIRTUAL_ENV="${API_HOME}/.venv" \
  VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock/user.json" \
  VNSTOCK_VENV_TYPE="venv" \
  VNSTOCK_LANGUAGE="python" \
  bash "${installer_path}"
)

normalize_vnstock_config

if "${PYTHON_BIN}" -c "import vnstock_data" >/dev/null 2>&1; then
  printf 'vnstock_data import check passed.\n'
  exit 0
fi

fail "vnstock_data did not import successfully after installer run"
