#!/usr/bin/env bash
# Add all users in gh_users.json as collaborators to this repo.
# Run from repo root after: gh auth login

set -e
REPO="Fan-Pier-Labs/ai-auto-label-emails-two"

for user in $(jq -r '.[]' gh_users.json); do
  echo "Adding $user..."
  gh api -X PUT "repos/$REPO/collaborators/$user" -f permission=push
done
echo "Done."
