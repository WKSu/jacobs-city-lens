#!/usr/bin/env bash
# File docs/issues/*.md as GitHub issues: ./scripts/create_issues.sh owner/repo
set -euo pipefail
repo="$1"
for f in docs/issues/*.md; do
  title=$(sed -n 's/^title: "\(.*\)"$/\1/p' "$f")
  labels=$(sed -n 's/^labels: \[\(.*\)\]$/\1/p' "$f" | tr -d ' ')
  body=$(awk 'BEGIN{n=0} /^---$/{n++; next} n>=2' "$f")
  for l in ${labels//,/ }; do gh label create "$l" --repo "$repo" --force >/dev/null; done
  gh issue create --repo "$repo" --title "$title" --label "$labels" --body "$body"
done
