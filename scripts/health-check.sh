#!/bin/bash

MAX_RETRIES=60
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if docker exec milvus-standalone curl -s http://localhost:9091/healthz > /dev/null; then
    exit 0
  fi
  
  RETRY_COUNT=$((RETRY_COUNT + 1))
  sleep 1
done

exit 1
