#!/usr/bin/env sh
set -eu

ROOT_DIR="${1:-/opt/utility-box}"
WEB_PORT="${WEB_PORT:-3100}"

echo "[1/5] Checking target directory"
if [ "$ROOT_DIR" = "/opt/hse" ]; then
  echo "Refusing to use /opt/hse. Utility Box must stay isolated."
  exit 1
fi

echo "[2/5] Checking required files"
for path in \
  "$ROOT_DIR/app/deploy/vps/docker-compose.utility-box.yml" \
  "$ROOT_DIR/app/deploy/vps/env/utility-box.web.env" \
  "$ROOT_DIR/app/deploy/vps/nginx/utility-box.host.nginx.conf"
do
  if [ ! -f "$path" ]; then
    echo "Missing required file: $path"
    exit 1
  fi
done

echo "[3/5] Checking port availability"
if command -v lsof >/dev/null 2>&1; then
  if lsof -iTCP:"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $WEB_PORT is already in use."
    exit 1
  fi
fi

echo "[4/5] Checking docker"
docker --version >/dev/null 2>&1
docker compose version >/dev/null 2>&1

echo "[5/5] Checking compose config"
docker compose \
  -f "$ROOT_DIR/app/deploy/vps/docker-compose.utility-box.yml" \
  --project-name utility-box \
  config >/dev/null

echo "Preflight OK"
