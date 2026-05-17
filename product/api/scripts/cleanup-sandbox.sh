#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONFIRM=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [--confirm]

Remove root-owned Docker artifacts from product/api/.

Default: dry-run (lists targets without removing).
Options:
  --confirm   Actually remove the artifacts.
  --help      Show this help message.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm) CONFIRM=1; shift ;;
    --help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 1 ;;
  esac
done

# Sudo check: need root or sudo for root-owned files
RM_CMD="rm -rf"
if [[ $(id -u) -ne 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    printf 'Error: sudo required for root-owned cleanup (not running as root).\n' >&2
    exit 1
  fi
  RM_CMD="sudo rm -rf"
fi

# Allowlist: only these paths are cleanup targets
TARGETS=()
REASONS=()

if [[ -d "${API_ROOT}/.cache" ]]; then
  TARGETS+=("${API_ROOT}/.cache")
  REASONS+=("transient cache directory")
fi

if [[ -d "${API_ROOT}/.config" ]]; then
  TARGETS+=("${API_ROOT}/.config")
  REASONS+=("transient config directory")
fi

if [[ -d "${API_ROOT}/product" ]]; then
  TARGETS+=("${API_ROOT}/product")
  REASONS+=("Docker HOME leak artifact (nested product/api/product/)")
fi

# Conditional .venv removal: only if .vnstock does NOT exist
if [[ -d "${API_ROOT}/.venv" && ! -d "${API_ROOT}/.vnstock" ]]; then
  TARGETS+=("${API_ROOT}/.venv")
  REASONS+=(".venv (safe to remove: no .vnstock present)")
elif [[ -d "${API_ROOT}/.venv" && -d "${API_ROOT}/.vnstock" ]]; then
  printf 'SKIP: .venv (preserving — .vnstock exists; removing would cause stale-container deadlock)\n'
fi

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  printf 'Nothing to clean.\n'
  exit 0
fi

# Dry-run: list targets
printf '=== Cleanup targets ===\n'
for i in "${!TARGETS[@]}"; do
  printf '  %s — %s\n' "${TARGETS[$i]}" "${REASONS[$i]}"
done
printf '\n'

if [[ "${CONFIRM}" -eq 0 ]]; then
  printf 'Dry-run mode. Re-run with --confirm to remove.\n'
  exit 0
fi

# Actual removal
for target in "${TARGETS[@]}"; do
  printf 'Removing %s...\n' "${target}"
  ${RM_CMD} "${target}"
done

# Verify: check no unexpected root-owned artifacts remain
printf '\n=== Verification ===\n'
remaining=0
while IFS= read -r -d '' path; do
  owner="$(stat -c '%U' "${path}" 2>/dev/null || true)"
  if [[ "${owner}" == "root" ]]; then
    basename="$(basename "${path}")"
    # .vnstock and .venv (when .vnstock exists) are expected to be root-owned
    if [[ "${basename}" == ".vnstock" ]]; then
      continue
    fi
    if [[ "${basename}" == ".venv" && -d "${API_ROOT}/.vnstock" ]]; then
      continue
    fi
    printf 'WARNING: unexpected root-owned artifact: %s\n' "${path}"
    remaining=$((remaining + 1))
  fi
done < <(find "${API_ROOT}" -maxdepth 1 -print0)

if [[ "${remaining}" -eq 0 ]]; then
  printf 'Cleanup complete. No unexpected root-owned artifacts remain.\n'
else
  printf 'WARNING: %d unexpected root-owned artifact(s) remain.\n' "${remaining}"
  exit 1
fi
