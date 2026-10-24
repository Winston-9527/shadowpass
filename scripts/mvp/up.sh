#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
if [[ ! -d node_modules/tsx ]]; then
  npm install
fi
exec node --import tsx scripts/mvp/run.mjs "$@"
