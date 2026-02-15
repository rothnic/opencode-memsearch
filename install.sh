#!/usr/bin/env bash
set -euo pipefail

# Install the memsearch OpenCode plugin by copying this directory to the
# user's OpenCode config plugins directory. Usage: ./install.sh [dest_root]

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_ROOT="${1:-$HOME/.config/opencode/plugin}"
DEST_DIR="$DEST_ROOT/memsearch"

echo "Installing memsearch plugin"
echo "Source: $SRC_DIR"
echo "Destination: $DEST_DIR"

# Ensure destination parent exists, then replace any existing plugin dir
mkdir -p "$DEST_ROOT"
if [ -d "$DEST_DIR" ]; then
  echo "Removing existing installation at $DEST_DIR"
  rm -rf "$DEST_DIR"
fi

echo "Copying files..."
cp -a "$SRC_DIR" "$DEST_DIR"

echo "Setting executable bits for scripts"
if [ -f "$DEST_DIR/publish.sh" ]; then
  chmod +x "$DEST_DIR/publish.sh"
fi
if [ -f "$DEST_DIR/install.sh" ]; then
  chmod +x "$DEST_DIR/install.sh"
fi

echo "Installed plugin to $DEST_DIR"
