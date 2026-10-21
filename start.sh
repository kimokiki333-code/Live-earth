#!/usr/bin/env bash
# ARGUS GMI — one-step start (macOS / Linux)
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required — https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js $NODE_MAJOR detected; ARGUS needs 20 or newer."
  exit 1
fi

[ -d node_modules ] || npm install --no-audit --no-fund
echo
echo "ARGUS GMI starting on http://localhost:3000  (Ctrl+C to stop)"
exec npm run dev
