#!/usr/bin/env bash
# setup-git-push.sh — Make git push deterministic on a clone that has no
# SSH_AUTH_SOCK (e.g. an autonomous shell spawned by a subagent). Classifies
# the clone's push path by remote URL scheme + health, and — when broken or
# read-only — converts a GitHub remote to HTTPS with an absolute-path `gh`
# credential helper, verifying WRITE capability before declaring success.
#
# Why a setup script at all: the per-clone git config (URL + helper) is not
# committable, and the autonomous-shell session cannot inherit the operator's
# interactive `SSH_AUTH_SOCK`. Without intervention every push from such a
# shell fails with `Permission denied (publickey)`. That pressure once led
# an autonomous shell to bypass the pre-push gate under a transient flake —
# this script restores the legitimate push path so the bypass is no longer
# incentivized.
#
# Usage:
#   tools/scripts/setup-git-push.sh [--force]
#
# Behavior:
#   - SSH remote + probe-ok -> no-op (a working SSH config is never rewritten)
#   - SSH remote + probe-fail + `gh auth status` ok -> CONVERT
#   - SSH remote + probe-fail + no gh session -> exit 1 + hint, NO mutation
#   - HTTPS remote + helper + gh ok -> no-op
#   - HTTPS remote + no helper + gh session -> configure helper only
#     (public repos read OK anonymously; push 403s without a helper)
#   - Non-GitHub remote -> fail closed (exit 1, even with --force)
#   - --force is for non-canonical/wrong values on GitHub remotes; it does
#     not extend reach to non-GitHub hosts.
#
# CONVERT path (flock + ERR trap, full rollback):
#   helper (absolute gh) -> set-url https -> gh api permissions.push == true
#
# Read probes (`git ls-remote`) prove READ access only — on a public repo
# they succeed anonymously, so they cannot prove push capability. The write
# verification is `gh api repos/<owner>/<repo> --jq .permissions.push` and
# gates the success exit. No step in this script reports a read-probe-ok
# state as "push-ready".
#
# Mirrors the contract shape of tools/scripts/setup-git-merge-drivers.sh:
#   - set -euo pipefail
#   - clear exit codes (0 ok / 1 fail-closed / 2 usage)
#   - fail-closed on unexpected states
#   - --force does not change fail-closed semantics for non-GitHub

set -euo pipefail

# ---------------------------------------------------------------- arg parse
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --help|-h)
      cat <<USAGE
Usage: setup-git-push.sh [--force]

Classifies the clone's git-push path and, when broken or read-only,
converts a GitHub remote to HTTPS with an absolute-path \`gh\` credential
helper, verifying WRITE capability.

If a non-GitHub remote is configured, exits 1 even with --force.
USAGE
      exit 0
      ;;
    *)
      echo "setup-git-push.sh: unknown argument: $arg" >&2
      echo "  hint: pass --force only to overwrite a non-canonical value" >&2
      exit 2
      ;;
  esac
done

# ----------------------------------------------------- locate git directory
# Resolve the work tree's .git path. Bail with a clear hint when run outside
# a clone (the script is meaningless there).
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "setup-git-push.sh: not inside a git working tree" >&2
  exit 1
fi

GIT_DIR_REL=$(git rev-parse --git-dir)
# `git rev-parse --git-dir` may be relative; resolve to absolute so the
# lock and config writes below work regardless of cwd.
GIT_DIR=$(cd "$GIT_DIR_REL" && pwd)
WORK_TREE=$(git rev-parse --show-toplevel)

# ----------------------------------------------------- read current state
ORIGIN_URL=$(git config --get remote.origin.url || true)
if [[ -z "$ORIGIN_URL" ]]; then
  echo "setup-git-push.sh: no remote.origin.url configured" >&2
  echo "  hint: this script only fixes existing GitHub-origin clones" >&2
  exit 1
fi

# Helper values can be multi-valued; collect all into a newline-separated
# blob. The convert path preserves the entire value via --replace-all so a
# later run of this script remains a no-op. Use --local so the operator's
# global gitconfig (which often carries a helper value) does not make this
# script think the clone is already configured — the contract is on the
# per-clone config, not the global one.
HELPER_NOW=$(git config --local --get-all credential.https://github.com.helper || true)

# ---------------------------------------------------------------- classify
is_github_https='^https://github\.com/([^/]+)/([^/]+)\.git$'
is_github_ssh='^git@github\.com:([^/]+)/([^/]+)\.git$'

scheme="" owner="" repo=""
if [[ "$ORIGIN_URL" =~ $is_github_https ]]; then
  scheme="https"; owner="${BASH_REMATCH[1]}"; repo="${BASH_REMATCH[2]}"
elif [[ "$ORIGIN_URL" =~ $is_github_ssh ]]; then
  scheme="ssh"; owner="${BASH_REMATCH[1]}"; repo="${BASH_REMATCH[2]}"
else
  echo "setup-git-push.sh: non-GitHub remote is out of scope: $ORIGIN_URL" >&2
  echo "  hint: this script rewrites only github.com remotes" >&2
  exit 1
fi

# ----------------------------------------------------- helpers
# Resolve the absolute path of the gh binary. If gh is not on PATH, attempt
# to recover it from the existing helper value (operators commonly store
# the absolute path in there) or from the well-known mise install path.
resolve_gh_bin() {
  if command -v gh >/dev/null 2>&1; then
    command -v gh
    return 0
  fi
  # Try to lift the binary path out of the existing helper string. The
  # helper is `!ABS_PATH auth git-credential`.
  if [[ "$HELPER_NOW" == "!/"* ]]; then
    local candidate
    candidate=$(echo "$HELPER_NOW" | sed -E 's/^!([^ ]+).*/\1/')
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  fi
  # Try the well-known mise install prefix. Default HOME to /tmp defensively
  # so this script can run in minimal test envs that do not set HOME.
  local mise_gh="${HOME:-/tmp}/.local/share/mise/installs/gh/latest/bin/gh"
  if [[ -x "$mise_gh" ]]; then
    echo "$mise_gh"
    return 0
  fi
  return 1
}

# True iff `gh auth status -h github.com` exits 0 with "logged in" output.
gh_auth_ok() {
  local gh_bin="$1"
  "$gh_bin" auth status -h github.com >/dev/null 2>&1
}

# Probe the SSH origin with a hard 3s cap. Returns 0 iff the probe
# succeeded (read access). Uses BatchMode so an absent agent does not hang
# on a passphrase prompt.
ssh_probe_ok() {
  local url="$1"
  GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-} -o BatchMode=yes -o ConnectTimeout=2" \
    timeout 3 git ls-remote "$url" HEAD >/dev/null 2>&1
}

# Verify WRITE capability: `gh api repos/<owner>/<repo>` returns a
# permissions object; the body must contain `"push":true`. Reads cannot
# prove write; on a public repo, `ls-remote` succeeds anonymously, so a
# read-probe-ok is not a push verification. This check uses the same auth
# path that `git push` will use, so a green check means a subsequent push
# will not 403. We grep the raw body rather than piping through --jq so
# the test shim does not need to implement a jq parser.
gh_write_ok() {
  local gh_bin="$1" own="$2" rep="$3"
  "$gh_bin" api "repos/${own}/${rep}" 2>/dev/null | grep -q '"push":true'
}

# ----------------------------------------------------- read-probe health
# For an SSH remote: probe first. A working probe means the agent socket
# is reachable — leave the remote alone.
if [[ "$scheme" == "ssh" ]]; then
  if ssh_probe_ok "$ORIGIN_URL"; then
    echo "setup-git-push.sh: ssh remote probes ok; leaving as-is"
    exit 0
  fi
fi

# ----------------------------------------------------- gh session check
# If gh is unusable we cannot perform the convert, so the script must not
# mutate. For SSH-broken state the right outcome is a clear exit-1 hint.
GH_BIN=""
if ! GH_BIN=$(resolve_gh_bin); then
  if [[ "$scheme" == "ssh" ]]; then
    cat >&2 <<EOF
setup-git-push.sh: SSH push is broken AND no 'gh' is on PATH (autonomous shells typically lack \`gh\`).

  hint: run 'gh auth login -h github.com' on a machine with gh installed, then
        re-run this script. The convert path requires a working gh session to
        prove WRITE capability (read probes cannot prove push).
EOF
    exit 1
  fi
  # HTTPS-without-helper + no gh: also exit 1 — the read-only trap cannot
  # be fixed without a credential provider.
  cat >&2 <<EOF
setup-git-push.sh: HTTPS remote with no credential helper AND no 'gh' on PATH.

  hint: install gh and run 'gh auth login -h github.com', then re-run.
EOF
  exit 1
fi

if ! gh_auth_ok "$GH_BIN"; then
  cat >&2 <<EOF
setup-git-push.sh: 'gh auth status' did not report a github.com session.

  hint: run 'gh auth login -h github.com' on a machine with gh installed, then
        re-run this script. The convert path requires a working gh session.
EOF
  exit 1
fi

# ----------------------------------------------------- HTTPS already-configured?
if [[ "$scheme" == "https" ]] && [[ -n "$HELPER_NOW" ]]; then
  echo "setup-git-push.sh: https remote + helper already configured; no-op"
  exit 0
fi

# ----------------------------------------------------- HTTPS no-helper fix-up
# Public repos read OK anonymously; push 403s without a helper. Configure
# one and exit (URL is already https).
if [[ "$scheme" == "https" ]]; then
  HELPER_VAL="!${GH_BIN} auth git-credential"
  git config --local --replace-all credential.https://github.com.helper "$HELPER_VAL"
  echo "setup-git-push.sh: configured credential helper for existing https remote (read-only-trap fix-up)"
  exit 0
fi

# ----------------------------------------------------- CONVERT (SSH -> HTTPS)
# At this point: scheme=ssh, probe-fail, gh session present. The mutation
# region is wrapped in flock + ERR trap with FULL rollback (URL + helper).
# The helper is set FIRST because it is inert under SSH: a partial mutation
# of the helper alone still pushes via SSH; a partial mutation of the URL
# alone would lose the helper chain. The order minimizes the worst-case
# half-configured state.

LOCK="$GIT_DIR/setup-git-push.lock"
LOCK_FD=9

# flock is the mutual-exclusion primitive for the mutation region; without
# it the script cannot guarantee the rollback contract, so refuse to run
# rather than proceed unguarded (a missing flock must never be read as
# "another run in progress" — that would silently no-op a broken clone).
if ! command -v flock >/dev/null 2>&1; then
  echo "setup-git-push.sh: flock is required but not installed" >&2
  echo "  hint: install util-linux (or run the conversion steps from AGENTS.md manually)" >&2
  exit 1
fi

# `flock -w N` waits up to N seconds. We wait briefly so a concurrent run
# can finish; if the lock is held past the wait we exit 0 because the other
# run is doing the work.
if ! flock -w 5 "$LOCK_FD" 9>"$LOCK"; then
  echo "setup-git-push.sh: another setup run is in progress; exiting ok (no-op)"
  exit 0
fi

# Idempotency check inside the lock: if a previous run already rewrote
# remote + helper correctly, this is a no-op. --local: same reason as
# HELPER_NOW above.
CURRENT_URL=$(git config --local --get remote.origin.url || true)
CURRENT_HELPER=$(git config --local --get credential.https://github.com.helper || true)
if [[ "$CURRENT_URL" == "https://github.com/${owner}/${repo}.git" ]] \
   && [[ -n "$CURRENT_HELPER" ]] \
   && [[ "$CURRENT_HELPER" == *"gh auth git-credential"* ]]; then
  echo "setup-git-push.sh: already converted to https + helper (idempotent no-op)"
  exit 0
fi

# Snapshot prior values for rollback. Both are read inside the lock so a
# concurrent run cannot have shifted them between the snapshot and the
# mutation region. The helper can be multi-valued; snapshot ALL values so
# rollback restores the full chain instead of collapsing it to one entry.
PRIOR_URL="$CURRENT_URL"
mapfile -t PRIOR_HELPERS < <(git config --local --get-all credential.https://github.com.helper || true)

# ERR trap: any failure inside the mutation region restores BOTH the prior
# URL and the prior helper value, then exits 1. A failed convert must leave
# zero config drift. All rollback writes are explicit --local so a global
# config value (operator's environment) is never clobbered by the rollback.
rollback() {
  local rc=$?
  set +e
  if [[ -n "$PRIOR_URL" ]]; then
    git config --local remote.origin.url "$PRIOR_URL"
  else
    git config --local --unset remote.origin.url
  fi
  # Clear whatever the mutation region wrote, then replay the full prior
  # chain (--unset-all also handles the multi-valued case that plain
  # --unset refuses with exit 5).
  git config --local --unset-all credential.https://github.com.helper
  if ((${#PRIOR_HELPERS[@]} > 0)); then
    local hv
    for hv in "${PRIOR_HELPERS[@]}"; do
      git config --local --add credential.https://github.com.helper "$hv"
    done
  fi
  echo "setup-git-push.sh: rollback complete (rc=$rc)" >&2
  exit 1
}
trap rollback ERR

# Mutation region: helper FIRST, then URL, then write-verify. The helper
# write is the high-risk call (the partial-mutation window, red-team F4);
# pre-creating .git/config.lock on disk makes `git config` refuse to write
# and the ERR trap catches it for a full rollback.
HELPER_VAL="!${GH_BIN} auth git-credential"
git config --local --replace-all credential.https://github.com.helper "$HELPER_VAL"
git remote set-url origin "https://github.com/${owner}/${repo}.git"

# Write verification: `gh api repos/<owner>/<repo>` .permissions.push must
# be `true`. On a public repo, `ls-remote` is anonymous and cannot prove
# push capability, so we do not consult it here.
if ! gh_write_ok "$GH_BIN" "$owner" "$repo"; then
  echo "setup-git-push.sh: write verification failed (gh api permissions.push != true)" >&2
  # Force the ERR trap to fire by returning non-zero in a context set -e
  # catches. Trap restores prior URL + helper, then exits 1.
  false
fi

# Success: clear the trap, release the lock, exit 0.
trap - ERR
echo "setup-git-push.sh: converted origin to https + gh credential helper (write-verified)"
exit 0
