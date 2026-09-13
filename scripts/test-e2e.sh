#!/usr/bin/env bash
# Runs the Playwright E2E suite against a real, ephemeral backend:
# 1. Start Mongo + RustFS test containers (docker-compose.test.yml).
# 2. Build and start Next.js with .env.test config on a dedicated port.
# 3. Run Playwright.
# 4. Always tear down the server and the containers, even on failure.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3100
BASE_URL="http://localhost:${PORT}"
SERVER_PID=""

cleanup() {
  local status=$?
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  echo "==> Tearing down E2E test stack"
  docker compose -f docker-compose.test.yml down -v
  exit "$status"
}
trap cleanup EXIT

echo "==> Starting ephemeral Mongo + RustFS for E2E"
docker compose -f docker-compose.test.yml up -d --wait

echo "==> Building app against .env.test"
npx dotenv -e .env.test -- next build

echo "==> Starting Next.js on ${BASE_URL}"
npx dotenv -e .env.test -- next start -p "$PORT" &
SERVER_PID=$!

echo "==> Waiting for ${BASE_URL} to respond"
for i in $(seq 1 60); do
  if curl -sf "$BASE_URL" >/dev/null; then
    echo "Server is up."
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "Server did not start within 60s." >&2
    exit 1
  fi
  sleep 1
done

echo "==> Running Playwright"
PLAYWRIGHT_BASE_URL="$BASE_URL" npx playwright test "$@"
