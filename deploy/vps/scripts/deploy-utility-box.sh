#!/usr/bin/env sh
set -eu

ROOT_DIR="${1:-/opt/utility-box}"

cd "$ROOT_DIR/app"

git pull --ff-only

docker compose \
  -f deploy/vps/docker-compose.utility-box.yml \
  --project-name utility-box \
  up -d --build

docker compose \
  -f deploy/vps/docker-compose.utility-box.yml \
  --project-name utility-box \
  ps
