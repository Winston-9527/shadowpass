#!/usr/bin/env bash
# Publish browser artifacts for one circuit artifact version. Generated zkeys are not committed.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=${1:-v2}
DEST=../apps/wallet/public/zk/circuits-$VERSION
mkdir -p "$DEST"
for c in main_d1 main_d2 main_d3 main_reg main_revoke budget_transfer budget_mint; do
  cp "build/$c/${c}_js/$c.wasm" "$DEST/$c.wasm"
  cp "build/zk/$c.zkey" "$DEST/$c.zkey"
  cp "zk/vk_$c.json" "$DEST/vk_$c.json"
done
(cd "$DEST" && shasum -a 256 *.wasm *.zkey vk_*.json > MANIFEST.sha256)
echo "published artifacts to $DEST"
