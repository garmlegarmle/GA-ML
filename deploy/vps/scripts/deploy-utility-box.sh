#!/usr/bin/env sh
set -eu

ROOT_DIR="${1:-/opt/utility-box}"
TARGET_BRANCH="${2:-}"

cd "$ROOT_DIR/app"

git fetch origin --prune

if [ -n "$TARGET_BRANCH" ]; then
  if ! git show-ref --verify --quiet "refs/remotes/origin/$TARGET_BRANCH"; then
    echo "Remote branch origin/$TARGET_BRANCH was not found." >&2
    exit 1
  fi

  if git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH"; then
    git checkout "$TARGET_BRANCH"
  else
    git checkout -b "$TARGET_BRANCH" --track "origin/$TARGET_BRANCH"
  fi

  git branch --set-upstream-to="origin/$TARGET_BRANCH" "$TARGET_BRANCH"
fi

printf 'Deploying branch: %s\n' "$(git branch --show-current)"

git pull --ff-only

docker compose \
  -f deploy/vps/docker-compose.utility-box.yml \
  --project-name utility-box \
  up -d --build

docker compose \
  -f deploy/vps/docker-compose.utility-box.yml \
  --project-name utility-box \
  ps
