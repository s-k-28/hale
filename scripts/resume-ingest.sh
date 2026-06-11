#!/bin/bash
# Resume RAG corpus ingestion after the Gemini free-tier daily embed quota
# (1000 requests/day, resets midnight PT) blocked the 2026-06-10 run partway.
# Requires `npx convex dev` to be running. Sources 0-24 are already in.
set -e
cd "$(dirname "$0")/.."
for s in 25 50 75 100; do
  echo "=== batch start=$s ==="
  npx convex run rag:ingestAll "{\"start\": $s, \"count\": 25}"
done
echo "=== retrieval eval ==="
npx convex run sageKnowledge:runEval
