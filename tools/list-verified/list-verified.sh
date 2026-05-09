#!/usr/bin/env bash
# List verified claims and supporting evidence using yq.
# Claims: approval.status=approved + any verification dim has status=verified (P1).
# Evidence: parseable YAML frontmatter with claim_support=supports.

set -euo pipefail

YQ="${YQ:-yq}"
CLAIMS_DIR="records/claims"
EVIDENCE_DIR="records/evidence"

# ---- Claims ----
echo "=== Verified Claims ==="
for f in "$CLAIMS_DIR"/*.yaml; do
  [ -f "$f" ] || continue
  approved=$($YQ '.approval.status == "approved"' "$f")
  [ "$approved" = "true" ] || continue
  has_verified=$($YQ '[.verification | .[] | select(has("status")) | .status] | contains(["verified"])' "$f")
  [ "$has_verified" = "true" ] || continue

  id=$($YQ '.id' "$f")
  subject=$($YQ '.subject' "$f")
  dims=$($YQ '[.verification | to_entries[] | select(.value | type == "!!map") | select(.value.status == "verified") | .key] | join(",")' "$f")
  echo "$id | $subject | [$dims]"
done

# ---- Evidence ----
echo ""
echo "=== Supporting Evidence ==="
skipped=()
for f in $(find "$EVIDENCE_DIR" -name '*.md' -type f | sort); do
  # Check if file has parseable frontmatter with claim_support
  frontmatter=$($YQ --front-matter=extract '.' "$f" 2>/dev/null) || {
    skipped+=("$f")
    continue
  }
  [ -n "$frontmatter" ] || {
    skipped+=("$f")
    continue
  }
  has_field=$($YQ --front-matter=extract 'has("claim_support")' "$f" 2>/dev/null || echo "false")
  [ "$has_field" = "true" ] || {
    skipped+=("$f")
    continue
  }
  supports=$($YQ --front-matter=extract '.claim_support == "supports"' "$f")
  [ "$supports" = "true" ] || continue

  rel=${f#./}
  cap=$($YQ --front-matter=extract '.capability // "?"' "$f")
  dim=$($YQ --front-matter=extract '.dimension // "?"' "$f")
  scope=$($YQ --front-matter=extract '.scope // "?"' "$f")
  status=$($YQ --front-matter=extract '.validation_status // "?"' "$f")
  echo "$rel | $cap/$dim/$scope | $status"
done

# ---- Skipped ----
if [ ${#skipped[@]} -gt 0 ]; then
  echo ""
  echo "# Skipped (no parseable frontmatter or no claim_support field):"
  for s in "${skipped[@]}"; do
    echo "#   $s"
  done
fi
