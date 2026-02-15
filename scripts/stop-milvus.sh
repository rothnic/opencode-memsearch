#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

docker compose -f "$PLUGIN_DIR/milvus-compose.yaml" down -v
