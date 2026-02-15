#!/usr/bin/env bash
set -euo pipefail

# Create a compressed tarball of the memsearch plugin directory.
# Usage: ./publish.sh [output.tar.gz]
# Excludes node_modules, bun.lock, .memsearch, .git

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DEFAULT="memsearch-plugin.tar.gz"
OUT_PATH="${1:-$OUT_DEFAULT}"

echo "Packing plugin from: $PLUGIN_DIR"
echo "Output file: $OUT_PATH"

tar -czf "$OUT_PATH" \
  -C "$PLUGIN_DIR" \
  --exclude='node_modules' \
  --exclude='bun.lock' \
  --exclude='.memsearch' \
  --exclude='.git' \
  .

echo "Created $OUT_PATH"
